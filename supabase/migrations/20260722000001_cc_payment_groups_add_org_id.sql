-- =====================================================
-- Migración: agregar org_id a cc_payment_groups
-- =====================================================
-- Contexto: el endpoint POST /api/expenses/cc-payment inserta `org_id` en
-- cc_payment_groups y el GET filtra por `org_id` (cross-tenant fix 2026-05-18),
-- pero la columna NUNCA se creó (la migración 20260406000135 creó la tabla sin
-- org_id y ninguna posterior lo agregó). Efecto: TODO intento de crear un pago
-- de tarjeta falla con PGRST204 ("Could not find the 'org_id' column ...") y la
-- tabla quedó en 0 filas. Detectado durante la verificación E2E de la feature de
-- cancelación de deudas desde el resumen.
--
-- La tabla está vacía, así que la columna se agrega nullable sin backfill.

ALTER TABLE cc_payment_groups
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cc_payment_groups_org_id
  ON cc_payment_groups(org_id);

COMMENT ON COLUMN cc_payment_groups.org_id IS
  'Tenant dueño del pago de tarjeta. Lo escribe/filtra la API (cross-tenant); sin él, el insert del grupo fallaba y la feature no podía crear resúmenes.';
