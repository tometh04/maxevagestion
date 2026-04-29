-- =====================================================
-- Migración 166: organizations.manual_mrr_override_ars
-- =====================================================
-- Override manual del MRR para deals fuera del flow MP/custom_plan
-- (Enterprise pagando por transferencia, descuentos one-off, etc.).
-- Tiene prioridad sobre custom_plan y PLANS price en computeMrrArs.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS manual_mrr_override_ars NUMERIC(12,2);

COMMENT ON COLUMN organizations.manual_mrr_override_ars IS
  'Override manual del MRR mensual en ARS. Tiene prioridad sobre custom_plan y PLANS[plan].priceArsMonthly. Usado para deals que no pasan por MP (transferencia, factura manual). Nullable = sin override.';
