-- =====================================================
-- Migración: clientes referidos + comisión al referidor (VIB-62)
-- =====================================================
-- Contexto (pedido Lozada Rosario / yamil@agencialozada.com): empiezan a trabajar
-- con otra agencia que les deriva clientes. Necesitan (1) dejar registrado que un
-- cliente "viene referido" de esa empresa y (2) que cada venta de ese cliente
-- calcule automáticamente una comisión para el referidor.
--
-- Decisiones de diseño:
--   - La comisión del referidor se calcula SOBRE EL MARGEN (margin_amount) de la
--     operación, igual que la comisión del vendedor. Un % configurable por partner,
--     con override opcional por cliente.
--   - El referidor es una entidad reutilizable (referral_partners), no texto libre:
--     permite seleccionarlo al cargar el cliente y acumular cuánto se le debe.
--   - La comisión vive en tabla propia (referral_commissions), SEPARADA de
--     commission_records (que atan seller_id → users). El referidor es externo,
--     no un usuario del tenant.
--   - Aplica a ventas nuevas (al crear/editar la operación), no retroactivo.

BEGIN;

-- ─────────────────────────────────────────────────────
-- 1. referral_partners: agencias/empresas que derivan clientes.
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  -- % por defecto que se le paga al referidor sobre el margen de cada venta.
  default_commission_percentage NUMERIC(6,3) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_partners_name_length
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT referral_partners_pct_range
    CHECK (default_commission_percentage >= 0 AND default_commission_percentage <= 100)
);

CREATE INDEX IF NOT EXISTS idx_referral_partners_org
  ON public.referral_partners(org_id);

COMMENT ON TABLE public.referral_partners IS
  'Socios referidores (agencias/empresas que derivan clientes). Su comisión por '
  'venta se calcula sobre el margen. Ver referral_commissions.';

-- ─────────────────────────────────────────────────────
-- 2. customers: marca de cliente referido + override de %.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS referral_partner_id UUID
    REFERENCES public.referral_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_commission_percentage NUMERIC(6,3);

-- ADD CONSTRAINT no soporta IF NOT EXISTS en Postgres; lo hacemos idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_referral_pct_range'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_referral_pct_range
      CHECK (
        referral_commission_percentage IS NULL
        OR (referral_commission_percentage >= 0 AND referral_commission_percentage <= 100)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_referral_partner
  ON public.customers(referral_partner_id)
  WHERE referral_partner_id IS NOT NULL;

COMMENT ON COLUMN public.customers.referral_partner_id IS
  'Si está seteado, el cliente viene REFERIDO por este partner y sus ventas generan '
  'comisión de referido (ver referral_commissions).';
COMMENT ON COLUMN public.customers.referral_commission_percentage IS
  'Override del % de comisión del referidor para este cliente. NULL = usar '
  'referral_partners.default_commission_percentage.';

-- ─────────────────────────────────────────────────────
-- 3. referral_commissions: comisión al referidor por operación.
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  referral_partner_id UUID NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  -- Base del cálculo. Hoy siempre 'MARGIN'; se deja explícito para trazabilidad.
  basis TEXT NOT NULL DEFAULT 'MARGIN',
  base_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(6,3) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ARS',
  status TEXT NOT NULL DEFAULT 'PENDING',
  date_calculated TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_paid TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una comisión de referido por operación (la operación tiene un cliente MAIN).
  CONSTRAINT referral_commissions_operation_unique UNIQUE (operation_id),
  CONSTRAINT referral_commissions_basis_check CHECK (basis IN ('MARGIN', 'SALE')),
  CONSTRAINT referral_commissions_status_check
    CHECK (status IN ('PENDING', 'PAID', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_org
  ON public.referral_commissions(org_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_partner
  ON public.referral_commissions(referral_partner_id);

COMMENT ON TABLE public.referral_commissions IS
  'Comisión al referidor por cada venta de un cliente referido. Se calcula sobre '
  'el margen al crear/editar la operación (upsert idempotente por operation_id). '
  'SEPARADA de commission_records (comisión del vendedor/usuario).';

-- ─────────────────────────────────────────────────────
-- 4. Triggers updated_at (reusa helper existente).
-- ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS referral_partners_updated_at ON public.referral_partners;
CREATE TRIGGER referral_partners_updated_at
  BEFORE UPDATE ON public.referral_partners
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS referral_commissions_updated_at ON public.referral_commissions;
CREATE TRIGGER referral_commissions_updated_at
  BEFORE UPDATE ON public.referral_commissions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────
-- 5. RLS: aislamiento por tenant (defensa en profundidad).
-- ─────────────────────────────────────────────────────
ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_partners FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_partners_tenant_isolation ON public.referral_partners;
CREATE POLICY referral_partners_tenant_isolation ON public.referral_partners
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_partners TO authenticated;

ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_commissions_tenant_isolation ON public.referral_commissions;
CREATE POLICY referral_commissions_tenant_isolation ON public.referral_commissions
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_commissions TO authenticated;

COMMIT;
