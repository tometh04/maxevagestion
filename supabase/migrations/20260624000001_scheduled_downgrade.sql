-- Migration: Downgrade programado Enterprise → PRO (self-serve, al fin del período).
--
-- Contexto: un cliente Enterprise puede programar desde la web la baja a PRO.
-- La org sigue con Enterprise hasta que venza el período ya pagado
-- (current_period_ends_at); recién entonces un cron aplica el cambio a PRO y
-- deja la org en PAST_DUE para que regularice el pago de PRO manualmente.
--
-- Estas dos columnas guardan la intención del downgrade SIN tocar plan/status
-- todavía. Mientras scheduled_plan esté seteado y el período no haya vencido,
-- el cliente puede deshacer el downgrade (limpiar ambas columnas).
--
-- Plan: C:\Users\Mateo Montaña\.claude\plans\revis-el-panel-admin-eager-kazoo.md

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS scheduled_plan TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_plan_effective_at TIMESTAMPTZ;

-- Por ahora el único downgrade self-serve soportado es Enterprise → PRO.
-- Restringimos el valor para evitar estados inconsistentes; ampliable a futuro.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_scheduled_plan_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_scheduled_plan_check
  CHECK (scheduled_plan IS NULL OR scheduled_plan = 'PRO');

COMMENT ON COLUMN public.organizations.scheduled_plan IS
  'Plan destino de un downgrade programado (hoy solo ''PRO''). NULL = sin downgrade '
  'programado. Se setea desde POST /api/billing/schedule-downgrade y lo aplica el '
  'cron apply-scheduled-downgrades al llegar scheduled_plan_effective_at.';
COMMENT ON COLUMN public.organizations.scheduled_plan_effective_at IS
  'Momento en que el cron aplica el downgrade. Se setea = current_period_ends_at al '
  'programar, para que el cliente conserve el plan actual hasta el fin del período pagado.';

-- Índice parcial para el barrido diario del cron: solo orgs con downgrade pendiente.
CREATE INDEX IF NOT EXISTS idx_organizations_scheduled_downgrade
  ON public.organizations (scheduled_plan_effective_at)
  WHERE scheduled_plan IS NOT NULL;

COMMENT ON INDEX idx_organizations_scheduled_downgrade IS
  'Acelera el cron apply-scheduled-downgrades, que filtra orgs con '
  'scheduled_plan IS NOT NULL AND scheduled_plan_effective_at <= now().';
