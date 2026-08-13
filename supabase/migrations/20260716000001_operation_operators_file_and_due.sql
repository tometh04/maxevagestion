-- =====================================================
-- Migración: código de file interno y fecha máxima de pago por operador/servicio
--
-- Pedido de agencia (Lozada VG): poder cargar, por cada línea de operador/
-- servicio de una operación:
--   1. un "número de file" interno (código de referencia propio de la agencia,
--      distinto del operations.file_code que es a nivel operación), y
--   2. una fecha máxima de pago al operador.
--
-- Diseño:
--   - file_code / payment_due_date viven en operation_operators (la fila que el
--     formulario de la operación edita, para que hagan round-trip al reeditar).
--   - payment_due_date NO crea un concepto nuevo: alimenta operator_payments.due_date
--     (que ya existe y ya se muestra como "Vencimiento" en Pagos a Operadores).
--     Si se deja vacío, se mantiene el autocálculo por calculateDueDate().
--   - file_code se propaga a operator_payments.file_code para mostrarlo en la
--     vista de Pagos a Operadores (esa vista no joinea operation_operators; el
--     vínculo op_operator↔operator_payment no tiene FK directa).
-- =====================================================

ALTER TABLE operation_operators
  ADD COLUMN IF NOT EXISTS file_code TEXT;

ALTER TABLE operation_operators
  ADD COLUMN IF NOT EXISTS payment_due_date DATE;

COMMENT ON COLUMN operation_operators.file_code IS
  'Código de file interno de la agencia para este servicio/operador (referencia propia, opcional). Distinto de operations.file_code (nivel operación).';

COMMENT ON COLUMN operation_operators.payment_due_date IS
  'Fecha máxima de pago al operador para este servicio (opcional). Si se setea, se usa como due_date del operator_payment generado; si es NULL, se autocalcula.';

ALTER TABLE operator_payments
  ADD COLUMN IF NOT EXISTS file_code TEXT;

COMMENT ON COLUMN operator_payments.file_code IS
  'Copia del código de file interno del servicio (operation_operators.file_code) al momento de generar el pago, para mostrarlo en Pagos a Operadores sin join.';

-- ---------------------------------------------------------------------------
-- RPC: replace_operation_operators — ahora persiste file_code y payment_due_date.
-- La RPC hace DELETE + INSERT atómico; si no insertáramos estas columnas acá,
-- se perderían en cada edición de la operación.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION replace_operation_operators(
  p_operation_id UUID,
  p_operators JSONB  -- [{operator_id, cost, cost_currency, product_type, notes, passenger_detail, file_code, payment_due_date}]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator JSONB;
BEGIN
  DELETE FROM operation_operators
  WHERE operation_id = p_operation_id;

  IF p_operators IS NOT NULL AND jsonb_array_length(p_operators) > 0 THEN
    FOR v_operator IN SELECT * FROM jsonb_array_elements(p_operators)
    LOOP
      INSERT INTO operation_operators (
        operation_id,
        operator_id,
        cost,
        cost_currency,
        product_type,
        notes,
        passenger_detail,
        file_code,
        payment_due_date
      ) VALUES (
        p_operation_id,
        (v_operator->>'operator_id')::UUID,
        COALESCE((v_operator->>'cost')::NUMERIC, 0),
        COALESCE(v_operator->>'cost_currency', 'USD'),
        NULLIF(v_operator->>'product_type', ''),
        NULLIF(v_operator->>'notes', ''),
        (v_operator->'passenger_detail')::jsonb,
        NULLIF(v_operator->>'file_code', ''),
        NULLIF(v_operator->>'payment_due_date', '')::DATE
      );
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION replace_operation_operators(UUID, JSONB) IS
'Reemplaza atómicamente los operadores de una operación (DELETE + INSERT). Persiste passenger_detail, file_code y payment_due_date. Usado por PATCH/POST de /api/operations.';

GRANT EXECUTE ON FUNCTION replace_operation_operators(UUID, JSONB) TO authenticated, service_role;
