-- =====================================================
-- Migración: "salida de caja que no es gasto de agencia"
-- =====================================================
-- Contexto (pedido de Lozada, 2026-08-13): el Reporte de Gastos y la pantalla
-- de Gastos cuentan TODO egreso de caja (`cash_movements` type=EXPENSE) salvo
-- unas pocas categorías reservadas (pago a operador/cliente, devolución). Pero
-- hay egresos reales que NO son gasto de agencia: comisiones pagadas por fuera
-- del sistema, retiros/bajas financieras, pagos de aéreos que se cargaron mal,
-- vueltos, etc. Hoy no hay forma de registrarlos como "salió plata pero no es
-- gasto", así que terminan cargados como gasto y distorsionan el reporte.
--
-- Esta columna es ese registro faltante: marca un egreso como salida de caja
-- que NO debe contar como gasto de agencia. La plata SÍ sale (el movimiento
-- sigue afectando el saldo y generando su ledger_movement como cualquier
-- egreso); lo único que cambia es que se excluye de la pantalla de Gastos y del
-- Reporte de Gastos.
--
--   is_agency_expense = true  (default) → egreso normal, cuenta como gasto.
--   is_agency_expense = false           → salida de caja puntual, NO es gasto.
--
-- Default true + NOT NULL: todos los movimientos históricos quedan como gasto
-- (comportamiento actual intacto). Solo los que el usuario marque explícitamente
-- salen del reporte. La trazabilidad ("de dónde surgió esta salida") se apoya en
-- `notes`, que la UI vuelve obligatorio cuando se marca la salida como no-gasto.
--
-- Solo aplica a egresos; para INCOME el valor es irrelevante (los ingresos no
-- entran al reporte de gastos) y se deja en true.
-- =====================================================

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS is_agency_expense BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN cash_movements.is_agency_expense IS
  'false = salida de caja que NO es gasto de agencia (comisión por fuera, baja financiera, vuelto, etc.): afecta el saldo como cualquier egreso pero se excluye de la pantalla de Gastos y del Reporte de Gastos. true (default) = egreso normal que cuenta como gasto.';

-- Índice parcial chico: las consultas del reporte filtran por is_agency_expense
-- y los no-gasto son una minoría, así que un índice parcial sobre los false
-- ayuda a listarlos/verificarlos sin pesar sobre la tabla.
CREATE INDEX IF NOT EXISTS idx_cash_movements_non_agency_expense
  ON cash_movements (org_id, movement_date)
  WHERE is_agency_expense = false;
