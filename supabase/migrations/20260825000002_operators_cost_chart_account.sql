-- VIB-144/I1 — Cuenta de costo propia por operador
--
-- QUÉ RESUELVE
-- ------------
-- Hoy la cuenta contable donde cae el costo de una pata se deriva SOLO del tipo
-- de producto: HOTEL va a Costo de Hotelería, FLIGHT a Costo de Aéreos, y todo
-- lo demás a Costo de Operadores. No hay forma de decir "lo de este operador
-- imputalo siempre a tal cuenta", que es lo que pide una agencia cuando quiere
-- ver por separado la asistencia al viajero, los cruceros o un proveedor grande.
--
-- POR QUÉ NO ROMPE NADA
-- ---------------------
-- La columna es nullable y sin default. Un operador que no la tenga cargada se
-- comporta EXACTAMENTE igual que hoy: se sigue derivando por tipo de producto.
-- El override solo aplica a los asientos que se generen DESPUÉS de que alguien
-- lo configure, operador por operador. No toca ningún asiento existente ni
-- ningún saldo.
--
-- Se llama cost_chart_account_id y no expense_chart_account_id (como decía el
-- documento) porque lo que reemplaza son las cuentas de COSTO 4.2.x, no las de
-- gasto 4.3.x. El costo de un operador es costo de venta, no gasto operativo.
--
-- ON DELETE SET NULL: si se borra la cuenta del plan, el operador vuelve al
-- comportamiento por defecto en vez de quedar apuntando a la nada.

ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS cost_chart_account_id uuid;

ALTER TABLE operators
  DROP CONSTRAINT IF EXISTS operators_cost_chart_account_id_fkey;

ALTER TABLE operators
  ADD CONSTRAINT operators_cost_chart_account_id_fkey
  FOREIGN KEY (cost_chart_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN operators.cost_chart_account_id IS
  'Cuenta del plan donde imputar el costo de este operador (VIB-144/I1). NULL = derivar del tipo de producto, que es el comportamiento por defecto. Solo afecta asientos nuevos.';

CREATE INDEX IF NOT EXISTS operators_cost_chart_account_id_idx
  ON operators (cost_chart_account_id)
  WHERE cost_chart_account_id IS NOT NULL;
