-- Migration: plan_prices — catálogo editable de precios de planes estándar.
--
-- Contexto: hasta ahora los precios de los planes estándar (PRO, STARTER) vivían
-- hardcodeados en lib/billing/plans.ts. Este cambio los mueve a DB para poder
-- editarlos desde el panel platform-admin sin deploy. La constante PLANS sigue
-- siendo el DEFAULT/fallback: si falta la fila, el código usa el valor de código
-- (ver lib/billing/plan-pricing.ts). Nada cambia si esta tabla queda vacía.
--
-- Enterprise queda con price_ars_monthly NULL a propósito (precio per-cuenta vía
-- custom_plans). Editar el precio global NO re-cobra suscripciones existentes:
-- aplica a nuevos checkouts y a cambios de plan. El re-precio de una suscripción
-- viva es siempre explícito (lib/billing/mp-update.ts applyPriceChange).

CREATE TABLE IF NOT EXISTS public.plan_prices (
  plan_id           TEXT PRIMARY KEY,
  price_ars_monthly NUMERIC(12,2),
  updated_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plan_prices_plan_id_check CHECK (plan_id IN ('STARTER', 'PRO', 'ENTERPRISE')),
  CONSTRAINT plan_prices_price_positive CHECK (price_ars_monthly IS NULL OR price_ars_monthly > 0)
);

-- Seed solo PRO: es el único plan estándar que se ofrece y cobra self-serve.
-- STARTER es legacy (no se ofrece en la web) y ENTERPRISE se cobra per-cuenta;
-- para cualquiera de esos, el resolver cae a la constante PLANS (fallback), así
-- que no hace falta tener fila acá.
INSERT INTO public.plan_prices (plan_id, price_ars_monthly) VALUES
  ('PRO', 119000)
ON CONFLICT (plan_id) DO NOTHING;

ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prices FORCE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (los precios ya son públicos en la landing).
DROP POLICY IF EXISTS plan_prices_read ON public.plan_prices;
CREATE POLICY plan_prices_read ON public.plan_prices
  FOR SELECT TO authenticated
  USING (true);

-- Escritura: solo platform admins (mismo patrón que custom_plans_admin_all).
DROP POLICY IF EXISTS plan_prices_admin_all ON public.plan_prices;
CREATE POLICY plan_prices_admin_all ON public.plan_prices
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS plan_prices_updated_at ON public.plan_prices;
CREATE TRIGGER plan_prices_updated_at
  BEFORE UPDATE ON public.plan_prices
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE public.plan_prices IS
  'Precios editables de planes estándar desde platform-admin. DEFAULT/fallback = '
  'constante PLANS en lib/billing/plans.ts. ENTERPRISE queda NULL (precio '
  'per-cuenta vía custom_plans). Editar acá NO re-cobra suscripciones existentes.';
