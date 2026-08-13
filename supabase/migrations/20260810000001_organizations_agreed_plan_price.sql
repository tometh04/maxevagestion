-- =====================================================
-- Migración: precio pactado por organización (grandfathering)
-- =====================================================
-- Hasta ahora el precio de un plan estándar se resolvía SIEMPRE del precio de
-- lista global (`plan_prices`, una fila por plan, sin historial ni per-org).
-- Cuando sube el precio de lista, Mercado Pago de facto no re-cobra a las orgs
-- ya suscriptas (el monto viaja en la cache key de `mp_plans`, así que un
-- template nuevo no muta los preapprovals viejos), pero la app no tenía forma
-- de SABER cuánto paga cada org: la pantalla de Suscripción mostraba el precio
-- de lista nuevo y el MRR del platform admin las contaba al precio nuevo.
--
-- Estas columnas son ese registro faltante: el monto que MP efectivamente
-- debita a esta org. NULL = "sin precio congelado, usar el de lista".
--
-- `agreed_plan_id` NO es redundante: es el guardrail. El precio pactado solo
-- vale para el plan al que corresponde, y hay varios flujos que mutan
-- `organizations.plan` (change-plan, cron de downgrades programados,
-- custom-plan que fuerza ENTERPRISE, billing/sync). Si alguno se olvida de
-- limpiar el precio, el gate `agreed_plan_id = plan` lo convierte en un
-- no-evento (cae al precio de lista) en vez de un cobro incorrecto.
--
-- Precedencia de precio para una org:
--   manual_mrr_override_ars > custom_plans > agreed_plan_price_ars > plan_prices
--
-- RLS: `organizations` solo tiene policy de SELECT para miembros del tenant
-- (`org_members_view`). No hay policy de UPDATE, así que ningún tenant puede
-- escribir su propio precio; todos los writes van por service role. La lectura
-- por parte del tenant es deseada: es su precio y se muestra en Suscripción.
-- =====================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS agreed_plan_price_ars    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS agreed_plan_id           TEXT,
  ADD COLUMN IF NOT EXISTS agreed_plan_price_source TEXT;

-- ADD CONSTRAINT no soporta IF NOT EXISTS: envolvemos para que la migración
-- sea re-ejecutable.
DO $$
BEGIN
  ALTER TABLE organizations
    ADD CONSTRAINT organizations_agreed_plan_price_positive
    CHECK (agreed_plan_price_ars IS NULL OR agreed_plan_price_ars > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE organizations
    ADD CONSTRAINT organizations_agreed_plan_id_check
    CHECK (agreed_plan_id IS NULL OR agreed_plan_id IN ('STARTER', 'PRO', 'ENTERPRISE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Monto y plan viajan juntos o no viajan: un monto sin plan no es interpretable
-- (no se puede aplicar el gate) y un plan sin monto no dice nada.
DO $$
BEGIN
  ALTER TABLE organizations
    ADD CONSTRAINT organizations_agreed_plan_price_pair
    CHECK ((agreed_plan_price_ars IS NULL) = (agreed_plan_id IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE organizations
    ADD CONSTRAINT organizations_agreed_plan_price_source_check
    CHECK (agreed_plan_price_source IS NULL
           OR agreed_plan_price_source IN ('backfill', 'mp_webhook', 'checkout_sync', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN organizations.agreed_plan_price_ars IS
  'Precio mensual ARS congelado de esta org: el monto que MP efectivamente debita. NULL = usar el precio de lista vigente (plan_prices). Lo escribe el webhook de MP desde auto_recurring.transaction_amount cuando un pago se aprueba. Pierde contra custom_plans y manual_mrr_override_ars.';
COMMENT ON COLUMN organizations.agreed_plan_id IS
  'Plan al que corresponde agreed_plan_price_ars. El precio solo se aplica si coincide con organizations.plan — si la org cambió de plan, el precio viejo se ignora y se cae al de lista.';
COMMENT ON COLUMN organizations.agreed_plan_price_source IS
  'Quién escribió el precio pactado: backfill | mp_webhook | checkout_sync | admin. Solo para auditoría.';
