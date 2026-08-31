-- Dividir un gasto de agencia entre oficinas, en una sola transaccion.
--
-- QUE RESUELVE
-- ------------
-- Un gasto compartido (la pauta de Facebook, el contador, un sistema) se paga
-- una vez pero le corresponde a mas de una oficina. Cargado entero, no habia
-- forma de repartirlo: el gasto no se puede editar ni de monto ni de oficina, y
-- la unica salida era borrarlo y cargarlo dos veces -- borrar un egreso que
-- realmente ocurrio. En Lozada esto se venia haciendo a mano al momento de
-- cargar (dos filas creadas con 100 ms de diferencia), y cuando entraba entero
-- quedaba mal imputado.
--
-- POR QUE UNA FUNCION Y NO VARIOS PostgREST
-- -----------------------------------------
-- Dividir toca tres tablas: baja el importe del movimiento de caja original,
-- baja el de su movimiento del mayor, y crea las partes nuevas en las dos. Si
-- eso se hiciera en llamadas sueltas, un fallo a mitad de camino dejaria el
-- total distinto del original: plata inventada (si alcanzo a crear las partes)
-- o desaparecida (si alcanzo a bajar el original). Aca es una transaccion: o
-- queda el reparto completo o no queda nada.
--
-- EL INVARIANTE
-- -------------
-- Dividir NO mueve plata. El egreso ya ocurrio, salio de la misma cuenta, el
-- mismo dia, por el mismo importe. La suma de las partes tiene que dar
-- EXACTAMENTE el total, al centavo -- se valida en centavos enteros porque en
-- flotante 33,33 x 3 no da 100. Como el importe total no cambia, el saldo de la
-- cuenta financiera tampoco: no hace falta revalidar saldo.
--
-- El importe en pesos del mayor (amount_ars_equivalent) y el del asiento se
-- reparten en la MISMA proporcion que el importe de caja, y la primera parte
-- absorbe el resto del redondeo. Asi ninguna de las tres capas cambia de total.
--
-- SECURITY DEFINER
-- ----------------
-- A diferencia de replace_quotation_structure, aca si corre como owner: el alta
-- y el borrado de gastos ya usan service role porque los triggers de
-- cash_movements / ledger_movements lo necesitan. La proteccion de tenant no se
-- delega a RLS: p_org_id lo pasa la ruta desde la sesion (nunca desde el body)
-- y todo lo que se lee o escribe se acota a esa org, incluidas las oficinas
-- destino. Un p_movement_id de otro tenant devuelve "no encontrado".
--
-- QUE NO SE PUEDE DIVIDIR
-- -----------------------
-- Un gasto atado a una operacion o a un pago toma su oficina de ahi, asi que
-- repartirlo dejaria la caja diciendo una cosa y la operacion otra. Un
-- movimiento revertido, o que es la reversion de otro, ya no es un gasto vivo.
-- Uno conciliado contra el banco quedaria sin coincidir con la linea del
-- extracto. En todos esos casos la funcion corta antes de escribir.

CREATE OR REPLACE FUNCTION split_agency_expense(
  p_movement_id UUID,
  p_org_id UUID,
  p_shares JSONB,
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mov             cash_movements%ROWTYPE;
  v_ledger          ledger_movements%ROWTYPE;
  v_has_ledger      BOOLEAN := FALSE;
  v_n               INT;
  v_i               INT;
  v_share           JSONB;
  v_amount          NUMERIC;
  v_agency          UUID;
  v_total_cents     BIGINT;
  v_sum_cents       BIGINT := 0;
  v_agencies        UUID[] := ARRAY[]::UUID[];
  v_ledger_part     NUMERIC;
  v_ars_part        NUMERIC;
  v_ledger_asignado NUMERIC := 0;
  v_ars_asignado    NUMERIC := 0;
  v_entry_id        UUID;
  v_ratio           NUMERIC;
  v_new_ledger      UUID;
  v_new_cash        UUID;
  v_creados         JSONB := '[]'::JSONB;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Falta la organizacion' USING ERRCODE = 'P0001';
  END IF;

  v_n := jsonb_array_length(p_shares);
  IF v_n IS NULL OR v_n < 2 THEN
    RAISE EXCEPTION 'Hay que repartir el gasto entre al menos dos oficinas'
      USING ERRCODE = 'P0001';
  END IF;

  -- FOR UPDATE: dos divisiones simultaneas del mismo gasto se serializan, y la
  -- segunda falla la validacion de suma contra el importe ya reducido.
  SELECT * INTO v_mov
    FROM cash_movements
   WHERE id = p_movement_id AND org_id = p_org_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gasto no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_mov.type <> 'EXPENSE' THEN
    RAISE EXCEPTION 'Solo se pueden dividir gastos, no ingresos'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_mov.operation_id IS NOT NULL OR v_mov.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este gasto pertenece a una operacion: su oficina es la de la operacion'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_mov.reversed_at IS NOT NULL OR v_mov.reverses_movement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un movimiento revertido no se puede dividir'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_mov.reconciliation_status = 'RECONCILED' THEN
    RAISE EXCEPTION 'Este gasto ya esta conciliado con el banco: desconcilialo antes de dividirlo'
      USING ERRCODE = 'P0001';
  END IF;

  v_total_cents := ROUND(v_mov.amount * 100);
  IF v_total_cents <= 0 THEN
    RAISE EXCEPTION 'El gasto no tiene importe para repartir' USING ERRCODE = 'P0001';
  END IF;

  -- Validar TODO antes de escribir nada.
  FOR v_i IN 0..v_n - 1 LOOP
    v_share  := p_shares -> v_i;
    v_amount := (v_share ->> 'amount')::NUMERIC;
    v_agency := (v_share ->> 'agency_id')::UUID;

    IF v_agency IS NULL THEN
      RAISE EXCEPTION 'Falta elegir la oficina de una de las partes' USING ERRCODE = 'P0001';
    END IF;

    IF v_amount IS NULL OR ROUND(v_amount * 100) <= 0 THEN
      RAISE EXCEPTION 'Cada parte tiene que tener un importe mayor a 0' USING ERRCODE = 'P0001';
    END IF;

    IF v_agency = ANY (v_agencies) THEN
      RAISE EXCEPTION 'No se puede repartir dos veces a la misma oficina' USING ERRCODE = 'P0001';
    END IF;

    -- La oficina destino tiene que ser del mismo tenant.
    PERFORM 1 FROM agencies WHERE id = v_agency AND org_id = p_org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La oficina seleccionada no es valida' USING ERRCODE = 'P0001';
    END IF;

    v_agencies  := v_agencies || v_agency;
    v_sum_cents := v_sum_cents + ROUND(v_amount * 100);
  END LOOP;

  IF v_sum_cents <> v_total_cents THEN
    RAISE EXCEPTION 'Las partes tienen que sumar exactamente el total del gasto'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_mov.ledger_movement_id IS NOT NULL THEN
    SELECT * INTO v_ledger
      FROM ledger_movements
     WHERE id = v_mov.ledger_movement_id AND org_id = p_org_id
       FOR UPDATE;
    v_has_ledger := FOUND;
  END IF;

  -- Partes 2..N: filas nuevas, clonadas del original. Se copia todo lo que
  -- define QUE gasto es (cuenta, fecha, categoria, clasificacion, grupo de
  -- tarjeta) y solo cambian el importe y la oficina. No se copian la
  -- conciliacion ni la reversion: son estados del movimiento original.
  FOR v_i IN 1..v_n - 1 LOOP
    v_share  := p_shares -> v_i;
    v_amount := (v_share ->> 'amount')::NUMERIC;
    v_agency := (v_share ->> 'agency_id')::UUID;

    v_new_ledger := NULL;

    IF v_has_ledger THEN
      -- Proporcion tomada sobre el importe de CAJA: si el mayor tuviera un
      -- importe distinto (drift historico), igual se reparte entero y no se
      -- inventa ni se pierde nada.
      v_ledger_part := ROUND(v_ledger.amount_original * v_amount / v_mov.amount, 2);
      v_ars_part    := ROUND(v_ledger.amount_ars_equivalent * v_amount / v_mov.amount, 2);
      v_ledger_asignado := v_ledger_asignado + v_ledger_part;
      v_ars_asignado    := v_ars_asignado + v_ars_part;

      INSERT INTO ledger_movements (
        operation_id, lead_id, type, concept, notes, currency, amount_original,
        exchange_rate, amount_ars_equivalent, method, account_id, seller_id,
        operator_id, receipt_number, created_by, movement_date, affects_balance,
        org_id, category_id
      ) VALUES (
        v_ledger.operation_id, v_ledger.lead_id, v_ledger.type, v_ledger.concept,
        v_ledger.notes, v_ledger.currency, v_ledger_part, v_ledger.exchange_rate,
        v_ars_part, v_ledger.method, v_ledger.account_id, v_ledger.seller_id,
        v_ledger.operator_id, v_ledger.receipt_number,
        COALESCE(v_ledger.created_by, p_actor), v_ledger.movement_date,
        v_ledger.affects_balance, v_ledger.org_id, v_ledger.category_id
      ) RETURNING id INTO v_new_ledger;
    END IF;

    INSERT INTO cash_movements (
      operation_id, user_id, type, category, amount, currency, movement_date,
      notes, cash_box_id, is_touristic, movement_category, ledger_movement_id,
      payment_id, financial_account_id, category_id, expense_classification,
      cc_payment_group_id, org_id, agency_id, is_agency_expense
    ) VALUES (
      v_mov.operation_id, v_mov.user_id, v_mov.type, v_mov.category, v_amount,
      v_mov.currency, v_mov.movement_date, v_mov.notes, v_mov.cash_box_id,
      v_mov.is_touristic, v_mov.movement_category, v_new_ledger,
      v_mov.payment_id, v_mov.financial_account_id, v_mov.category_id,
      v_mov.expense_classification, v_mov.cc_payment_group_id, v_mov.org_id,
      v_agency, v_mov.is_agency_expense
    ) RETURNING id INTO v_new_cash;

    v_creados := v_creados || jsonb_build_object(
      'cash_movement_id', v_new_cash,
      'ledger_movement_id', v_new_ledger,
      'agency_id', v_agency,
      'amount', v_amount
    );
  END LOOP;

  -- Parte 1: se queda en el movimiento original, con el resto del redondeo. Que
  -- absorba el resto es lo que garantiza que las tres capas cierren exacto.
  v_share  := p_shares -> 0;
  v_amount := (v_share ->> 'amount')::NUMERIC;
  v_agency := (v_share ->> 'agency_id')::UUID;

  IF v_has_ledger THEN
    v_ledger_part := v_ledger.amount_original - v_ledger_asignado;
    v_ars_part    := v_ledger.amount_ars_equivalent - v_ars_asignado;

    UPDATE ledger_movements
       SET amount_original = v_ledger_part,
           amount_ars_equivalent = v_ars_part
     WHERE id = v_ledger.id;

    -- El asiento es un espejo (affects_balance = false), asi que se ajusta en
    -- la misma transaccion y conserva su numero: corregir un asiento existente
    -- es preferible a anularlo y emitir uno nuevo por un cambio de imputacion.
    IF v_ledger.amount_original <> 0 THEN
      v_ratio := v_ledger_part / v_ledger.amount_original;

      UPDATE journal_entries
         SET total_amount = ROUND(total_amount * v_ratio, 2),
             agency_id = v_agency
       WHERE source_movement_id = v_ledger.id
       RETURNING id INTO v_entry_id;

      IF v_entry_id IS NOT NULL THEN
        UPDATE ledger_movements
           SET debit_amount  = ROUND(debit_amount * v_ratio, 2),
               credit_amount = ROUND(credit_amount * v_ratio, 2)
         WHERE journal_entry_id = v_entry_id;
      END IF;
    END IF;
  END IF;

  UPDATE cash_movements
     SET amount = v_amount,
         agency_id = v_agency
   WHERE id = v_mov.id;

  RETURN jsonb_build_object(
    'movement_id', v_mov.id,
    'amount_original', v_mov.amount,
    'kept', jsonb_build_object('agency_id', v_agency, 'amount', v_amount),
    'created', v_creados
  );
END;
$fn$;

COMMENT ON FUNCTION split_agency_expense(UUID, UUID, JSONB, UUID) IS
  'Reparte un gasto de agencia entre oficinas sin cambiar el total. p_shares[0] queda en el movimiento original.';

REVOKE ALL ON FUNCTION split_agency_expense(UUID, UUID, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION split_agency_expense(UUID, UUID, JSONB, UUID) TO authenticated, service_role;
