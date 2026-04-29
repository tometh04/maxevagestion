-- =====================================================
-- Migración 146: Lozada plan ENTERPRISE (Pilar 7)
-- =====================================================
-- SaaS Pilar 7 — Maxi / Lozada Viajes arrancó como tenant existente antes
-- de que existiera el modelo de planes. Para que no le salte ningún
-- banner ni limitador cuando todo esté activo, le seteamos:
--   plan = ENTERPRISE
--   subscription_status = ACTIVE
--   max_* = 999 (efectivamente sin límite para operaciones reales)
--
-- Cualquier tenant nuevo arranca con TRIAL 14 días vía /onboarding.

UPDATE organizations
SET
  plan = 'ENTERPRISE',
  subscription_status = 'ACTIVE',
  trial_ends_at = NULL,
  grace_period_ends_at = NULL,
  max_users = 999,
  max_agencies = 99,
  max_operations_per_month = 99999
WHERE slug = 'lozada-viajes';
