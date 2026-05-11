-- Migración 2026-05-07: payments.is_legacy_import + backfill 125 huérfanos del 29/04
--
-- CONTEXTO
--   El pipeline `lib/import/pipelines/payments-suelto.ts` (mergeado el
--   2026-04-29 con el PR #9 del import multitenant) hace un INSERT directo
--   en `payments` con status=PAID cuando viene `date_paid`. Pero NO crea
--   `cash_movement` ni `ledger_movement`. Esto fue intencional: el pipeline
--   está pensado para importar HISTORIAL legacy (pagos viejos cuyo dinero
--   ya entró al banco real), no para registrar plata fresca.
--
--   El "bug" no es funcional — los saldos del banco están bien — pero los
--   125 pagos importados aparecen como "huérfanos" en cualquier query de
--   diagnóstico (PAID sin contramovimiento), confunden a soporte y ponen
--   en duda la integridad contable.
--
--   La columna `organizations.legacy_import_until` (mig 20260505000001)
--   resuelve esto a nivel ORG con un cutoff temporal, pero está seteada
--   a 2026-02-19 para Lozada (importación legacy MÁS vieja). Los 125 del
--   29/04 son POSTERIORES al cutoff y por eso no quedan tapados.
--
-- SOLUCIÓN per-row (complementaria al cutoff de org)
--   Columna `payments.is_legacy_import BOOLEAN DEFAULT false`. Los rows
--   marcados true se consideran "carga histórica sin contramovimiento
--   esperado" y se excluyen de los chequeos de huérfanos.
--
-- BACKFILL preciso
--   Marcamos los 125 rows del bulk import del 2026-04-29 00:46:26.886868+00
--   (el timestamp es idéntico al microsegundo en todos — fue un INSERT
--   masivo del pipeline). Para evitar falsos positivos, la condición
--   también requiere status=PAID + payer_type=CUSTOMER + ledger_movement_id IS NULL,
--   que es el patrón EXACTO del huérfano legacy.
--
-- NO TOCA SALDOS BANCARIOS. Solo agrega un flag de clasificación.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS is_legacy_import BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN payments.is_legacy_import IS
  'Si true, este pago vino de un import histórico (ej: pipeline payments-suelto del 29/04/2026). NO tiene cash_movement/ledger_movement asociado por diseño — el dinero ya entró al banco real antes del import. Excluir de chequeos de "pagos huérfanos".';

CREATE INDEX IF NOT EXISTS idx_payments_is_legacy_import
  ON payments(is_legacy_import)
  WHERE is_legacy_import = true;

-- Backfill: marcar los 125 huérfanos del bulk INSERT del 2026-04-29 00:46:26.886868+00
-- Condición triple para máxima precisión:
--   1. created_at idéntico al microsegundo (el bulk INSERT del pipeline)
--   2. status = PAID (lo que hace que aparezcan como "huérfanos")
--   3. ledger_movement_id IS NULL (la marca de orfandad)
UPDATE payments
SET is_legacy_import = true
WHERE created_at = '2026-04-29 00:46:26.886868+00'::timestamptz
  AND status = 'PAID'
  AND payer_type = 'CUSTOMER'
  AND ledger_movement_id IS NULL;

-- Sanity check (loguea cuántos se marcaron — solo informativo)
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM payments WHERE is_legacy_import = true;
  RAISE NOTICE 'Pagos marcados como is_legacy_import: %', v_count;
END $$;
