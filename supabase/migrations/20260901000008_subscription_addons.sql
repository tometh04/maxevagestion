-- Complementos facturables (addons) — modelo de datos.
--
-- Permite prender/apagar por tenant funcionalidad que no es núcleo del sistema
-- (Agente Blanco, Emilia, WHA Control, Growth Studio, Biblioteca, Referidos,
-- Comisiones mensuales, Cerebro) y cobrarla como adicional del plan.
--
-- Inerte al aplicarse: sin filas en `subscription_addons`, el catálogo está
-- vacío, el enforcement arranca en 'OFF' y ningún gate corta a nadie.
--
-- Nota de nomenclatura: `app/api/quotations/[id]/addons` ya usa "addons" para
-- los extras de línea de una cotización (seguro, traslado). Eso es otra cosa;
-- estos son complementos comerciales de la suscripción.

BEGIN;

-- ---------------------------------------------------------------------------
-- Catálogo comercial.
--
-- La METADATA de qué gatea cada complemento vive en `lib/addons/catalog.ts`:
-- está acoplada a rutas y a código, así que moverla a la DB solo daría la
-- ilusión de ser configurable. Acá vive únicamente lo que un platform admin
-- cambia sin deploy: precio, disponibilidad y enforcement. Es el mismo patrón
-- de `plan_prices` sobre la constante `PLANS` (ver lib/billing/plan-pricing.ts).
--
-- `addon_key` es TEXT con regex y NO un CHECK con lista de valores, a
-- propósito: agregar un complemento no debe requerir una migración. La lista
-- autoritativa es el catálogo TS y las claves desconocidas se ignoran en el
-- overlay. Es la lección de `billing_events.event_type` (un valor faltante
-- rompe con 23514 en silencio) y de `org_integrations.integration` (cuyo CHECK
-- no incluye 'eve' aunque el código lo escribe).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_addons (
  addon_key TEXT PRIMARY KEY
    CHECK (addon_key ~ '^[a-z][a-z0-9_]{1,48}$'),
  price_ars_monthly NUMERIC(14,2)
    CHECK (price_ars_monthly IS NULL OR price_ars_monthly >= 0),
  -- false ⇒ no se ofrece en el catálogo del cliente.
  active BOOLEAN NOT NULL DEFAULT false,
  -- OFF    : el gate deja pasar a todos (sistema inerte, default).
  -- SHADOW : deja pasar pero loguea a quién habría cortado (ensayo).
  -- ON     : gatea de verdad.
  -- Permite desplegar el cableado de los 8 complementos sin cambiar nada para
  -- nadie, y encenderlos de a uno desde /admin/billing sin deploy.
  enforcement TEXT NOT NULL DEFAULT 'OFF'
    CHECK (enforcement IN ('OFF','SHADOW','ON')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Complemento incluido en un plan (sin cargo).
--
-- Es lo que evita cobrar dos veces: si hay una inclusión vigente, el
-- complemento queda habilitado y su importe es 0, tenga o no fila en
-- `organization_addons`. Una org que lo compró y después subió a un plan que lo
-- incluye deja de pagarlo sola.
--
-- 'CUSTOM' matchea `organizations.custom_plan_id IS NOT NULL`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_addon_plan_inclusions (
  addon_key TEXT NOT NULL
    REFERENCES public.subscription_addons(addon_key) ON DELETE CASCADE,
  plan_id TEXT NOT NULL
    CHECK (plan_id IN ('STARTER','PRO','ENTERPRISE','CUSTOM')),
  -- NULL = incluido mientras la org esté en ese plan.
  included_until TIMESTAMPTZ,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (addon_key, plan_id)
);

-- ---------------------------------------------------------------------------
-- Estado comercial por tenant. Una fila por (org, complemento).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'REQUESTED',        -- el cliente lo pidió (complemento que requiere setup nuestro)
    'PENDING_SETUP',    -- lo tomamos, falta la configuración de nuestro lado
    'ACTIVE',
    'SCHEDULED_CANCEL', -- usable hasta cancel_effective_at (ya lo pagó)
    'CANCELLED',
    'DENIED'
  )),
  -- Precio congelado al activar. NULL ⇒ se usa el precio de catálogo vigente.
  -- Mismo modo de falla benigno que `organizations.agreed_plan_price_ars`.
  price_ars_monthly_snapshot NUMERIC(14,2)
    CHECK (price_ars_monthly_snapshot IS NULL OR price_ars_monthly_snapshot >= 0),
  price_source TEXT
    CHECK (price_source IS NULL OR price_source IN ('CATALOG','ADMIN_OVERRIDE','INCLUDED_IN_PLAN')),
  requested_at TIMESTAMPTZ,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Entra en la factura desde acá: el próximo ciclo, sin prorrateo.
  billable_from TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cancel_effective_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_addons_org_key_unique UNIQUE (org_id, addon_key),
  CONSTRAINT organization_addons_scheduled_cancel_check
    CHECK (status <> 'SCHEDULED_CANCEL' OR cancel_effective_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS organization_addons_org_status_idx
  ON public.organization_addons(org_id, status);
CREATE INDEX IF NOT EXISTS organization_addons_pending_idx
  ON public.organization_addons(status, requested_at)
  WHERE status IN ('REQUESTED','PENDING_SETUP');
CREATE INDEX IF NOT EXISTS organization_addons_cancel_due_idx
  ON public.organization_addons(cancel_effective_at)
  WHERE status = 'SCHEDULED_CANCEL';

-- ---------------------------------------------------------------------------
-- Estado de sincronización del monto con Mercado Pago.
--
-- Va a nivel ORG y no por complemento porque hay un solo preapproval y un solo
-- `transaction_amount`. `addons_mp_synced_amount_ars` guarda la suma de
-- complementos que ESTÁ reflejada hoy en ese importe, y es lo que le permite al
-- webhook seguir escribiendo `agreed_plan_price_ars` como precio del PLAN BASE
-- en vez de contaminarlo con el total (ver lib/billing/agreed-price.ts).
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS addons_mp_sync_state TEXT NOT NULL DEFAULT 'SYNCED'
    CHECK (addons_mp_sync_state IN ('SYNCED','PENDING','PENDING_REAUTH','NOT_APPLICABLE')),
  ADD COLUMN IF NOT EXISTS addons_mp_synced_amount_ars NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS addons_mp_synced_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS subscription_addons_updated_at ON public.subscription_addons;
CREATE TRIGGER subscription_addons_updated_at
  BEFORE UPDATE ON public.subscription_addons
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS organization_addons_updated_at ON public.organization_addons;
CREATE TRIGGER organization_addons_updated_at
  BEFORE UPDATE ON public.organization_addons
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- El tenant LEE lo suyo y NO escribe nada. A diferencia de
-- `organization_settings` —cuya policy `tenant_isolation` es cmd=ALL y por lo
-- tanto hoy le permite a un ADMIN de tenant prenderse un `features.*` solo—,
-- acá NO hay policy de INSERT/UPDATE/DELETE a propósito: con FORCE ROW LEVEL
-- SECURITY, `authenticated` no puede escribir ni con la anon key. Un
-- complemento es plata: toda mutación pasa por un endpoint que valida rol y
-- usa service role. Es el patrón de quotation_quota_*.
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_addons FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_addon_plan_inclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_addon_plan_inclusions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_addons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_addons_read ON public.subscription_addons;
CREATE POLICY subscription_addons_read
  ON public.subscription_addons FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS subscription_addon_plan_inclusions_read
  ON public.subscription_addon_plan_inclusions;
CREATE POLICY subscription_addon_plan_inclusions_read
  ON public.subscription_addon_plan_inclusions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS organization_addons_tenant_select ON public.organization_addons;
CREATE POLICY organization_addons_tenant_select
  ON public.organization_addons FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

-- ---------------------------------------------------------------------------
-- Comentarios: cerrar puertas que ya confundieron antes.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.organization_addons IS
  'Estado comercial de cada complemento por org. Una fila por (org, addon); el '
  'historial vive en billing_events + security_audit_log. Solo escribible con '
  'service role: no hay policy de write a proposito.';

COMMENT ON COLUMN public.subscription_addons.enforcement IS
  'OFF deja pasar a todos (inerte), SHADOW deja pasar y loguea, ON gatea. '
  'Permite encender cada complemento de a uno sin deploy.';

COMMENT ON COLUMN public.organizations.addons_mp_synced_amount_ars IS
  'Suma de complementos ya incluida en el transaction_amount del preapproval '
  'de MP. La resta buildAgreedPriceUpdate para que agreed_plan_price_ars siga '
  'significando "precio del plan base" y no se cuenten dos veces.';

COMMENT ON COLUMN public.custom_plans.features IS
  'Cosmetico (lista de bullets en la UI del custom plan). Los complementos '
  'facturables viven en organization_addons: no usar esto para gatear.';

COMMENT ON COLUMN public.organizations.features IS
  'Sin lectores ni escritores. No usar; ver organization_addons.';

COMMIT;
