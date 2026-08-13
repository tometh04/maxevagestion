-- ============================================================================
-- Saldado administrativo de comisiones (VIB-94)
-- ============================================================================
--
-- Problema: una agencia arranca a usar el módulo con años de comisiones viejas
-- calculadas por el sistema que, en la realidad, ya no se deben. Aparecen como
-- deuda con los vendedores y ensucian todo lo que muestra "por pagar".
--
-- Por qué no se borran:
--   1. Las que figuran pagadas tienen un `ledger_movements` tipo COMMISSION
--      atrás (plata que salió de una cuenta). Borrar la comisión deja esa salida
--      de caja sin respaldo.
--   2. Las pendientes se vuelven a crear solas: `applyCommissionPlan()` inserta
--      la comisión faltante cada vez que se edita la operación, así que el
--      borrado no sobrevive a la primera edición de una operación vieja.
--
-- Por qué no se marcan como PAID: no se pagaron. Ponerlas en PAID inventa
-- historia, infla el total pagado del período y descuadra contra el ledger.
--
-- Solución: un cierre administrativo explícito. `settled_at IS NOT NULL`
-- significa "esto no se debe y no se va a pagar", sin plata de por medio y sin
-- perder el registro. Una comisión saldada:
--   - no cuenta como deuda en ninguna pantalla ni reporte;
--   - no se puede pagar (`/api/commissions/pay` la rechaza);
--   - no la pisa ni la borra un recálculo (`isLocked()` en calculate.ts).
-- ============================================================================

ALTER TABLE public.commission_records
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_reason TEXT;

COMMENT ON COLUMN public.commission_records.settled_at IS
  'Cierre administrativo: la comisión quedó saldada sin pago (VIB-94). No es '
  'deuda, no se puede pagar y ningún recálculo la modifica. Distinto de status '
  '= PAID, que sí implica un movimiento de caja.';

COMMENT ON COLUMN public.commission_records.settled_reason IS
  'Motivo del cierre administrativo, para auditoría. Ej: "cutover 2026-06-30".';

-- Índice parcial: las consultas normales filtran `settled_at IS NULL` y las
-- saldadas son una minoría acotada (una carga histórica por agencia).
CREATE INDEX IF NOT EXISTS idx_commission_records_settled
  ON public.commission_records(org_id, settled_at)
  WHERE settled_at IS NOT NULL;
