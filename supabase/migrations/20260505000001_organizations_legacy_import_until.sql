-- Migration: organizations.legacy_import_until
--
-- Contexto:
--   El endpoint /api/audit-logs/reconciliation usa un cutoff hardcoded
--   (2026-02-19) para excluir la importación masiva de Lozada de los
--   chequeos de "pagos sin asiento" / "movimientos sin cuenta". El cutoff
--   global es Lozada-specific y rompe para tenants nuevos que importen
--   data legacy en otras fechas.
--
-- Solución:
--   Agregar columna nullable organizations.legacy_import_until.
--   - Si está seteada → cualquier payment/cash_movement creado antes
--     queda excluido de los checks de integridad para ese tenant.
--   - Si null (default para tenants nuevos) → todo el historial
--     se valida (los seeds quedan como falsos positivos esperados,
--     que es el caso de Test V7).
--
-- Backfill Lozada con la fecha histórica del fix anterior para
-- preservar el comportamiento actual.
--
-- Bug #19 (parcial) en QA report: Test V7 tenía 55 pagos PAID sin asiento.
-- Era seed data, no bug de prod. Esta migration desbloquea poder marcar
-- per-tenant qué fecha es legacy vs nativa.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS legacy_import_until TIMESTAMPTZ NULL;

COMMENT ON COLUMN organizations.legacy_import_until IS
  'Si seteado, los chequeos de integridad contable (reconciliation) ignoran movimientos creados antes de esta fecha. Usado para excluir importaciones masivas legacy de tenants migrados desde otros sistemas. Default NULL = sin cutoff = se validan todos los movimientos del tenant.';

-- Backfill Lozada (importación masiva 12-18/02/2026)
UPDATE organizations
SET legacy_import_until = '2026-02-19T00:00:00Z'::timestamptz
WHERE slug = 'lozada-viajes'
  AND legacy_import_until IS NULL;
