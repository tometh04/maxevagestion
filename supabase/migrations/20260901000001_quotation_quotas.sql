-- Cotizaciones creadas = documentos comerciales READY emitidos.
-- El cupo es compartido por organización, se fotografía por ciclo de billing y
-- los paquetes/extensiones vencen junto con ese ciclo.

CREATE TABLE IF NOT EXISTS public.quotation_quota_plan_configs (
  plan_id TEXT PRIMARY KEY,
  included_documents INTEGER NOT NULL CHECK (included_documents >= 0),
  enforcement_enabled BOOLEAN NOT NULL DEFAULT false,
  enforce_from TIMESTAMPTZ,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quotation_quota_plan_configs_plan_check
    CHECK (plan_id IN ('STARTER', 'PRO', 'ENTERPRISE'))
);

CREATE TABLE IF NOT EXISTS public.quotation_quota_org_overrides (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  included_documents INTEGER NOT NULL CHECK (included_documents >= 0),
  enforcement_enabled BOOLEAN NOT NULL DEFAULT false,
  enforce_from TIMESTAMPTZ,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotation_credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  units INTEGER NOT NULL CHECK (units > 0),
  price_ars NUMERIC(14, 2) NOT NULL CHECK (price_ars > 0),
  target_plan TEXT,
  target_org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quotation_credit_packages_plan_check
    CHECK (target_plan IS NULL OR target_plan IN ('STARTER', 'PRO', 'ENTERPRISE')),
  CONSTRAINT quotation_credit_packages_single_target_check
    CHECK (target_plan IS NULL OR target_org_id IS NULL)
);

CREATE TABLE IF NOT EXISTS public.quotation_quota_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  included_documents INTEGER CHECK (included_documents >= 0),
  enforcement_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quotation_quota_periods_dates_check CHECK (ends_at > starts_at),
  CONSTRAINT quotation_quota_periods_org_start_unique UNIQUE (org_id, starts_at)
);

CREATE TABLE IF NOT EXISTS public.quotation_credit_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.quotation_quota_periods(id) ON DELETE RESTRICT,
  package_id UUID REFERENCES public.quotation_credit_packages(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  units_snapshot INTEGER NOT NULL CHECK (units_snapshot > 0),
  amount_ars_snapshot NUMERIC(14, 2) NOT NULL CHECK (amount_ars_snapshot > 0),
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
  expires_at TIMESTAMPTZ NOT NULL,
  mp_preference_id TEXT UNIQUE,
  mp_payment_id TEXT UNIQUE,
  checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  CONSTRAINT quotation_credit_orders_status_check CHECK (
    status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED', 'REFUNDED', 'CHARGEBACK')
  )
);

CREATE TABLE IF NOT EXISTS public.quotation_credit_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.quotation_quota_periods(id) ON DELETE RESTRICT,
  units INTEGER NOT NULL CHECK (units <> 0),
  movement_type TEXT NOT NULL,
  source_order_id UUID REFERENCES public.quotation_credit_orders(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quotation_credit_movements_type_check
    CHECK (movement_type IN ('PURCHASE', 'MANUAL', 'REVERSAL'))
);

CREATE UNIQUE INDEX IF NOT EXISTS quotation_credit_movements_order_type_unique
  ON public.quotation_credit_movements(source_order_id, movement_type)
  WHERE source_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quotation_quota_periods_org_window_idx
  ON public.quotation_quota_periods(org_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS quotation_credit_packages_active_target_idx
  ON public.quotation_credit_packages(active, target_plan, target_org_id, sort_order);
CREATE INDEX IF NOT EXISTS quotation_credit_orders_org_created_idx
  ON public.quotation_credit_orders(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotation_credit_orders_period_status_idx
  ON public.quotation_credit_orders(period_id, status);
CREATE INDEX IF NOT EXISTS quotation_credit_movements_period_idx
  ON public.quotation_credit_movements(org_id, period_id, expires_at);
CREATE INDEX IF NOT EXISTS issued_quotation_documents_quota_usage_idx
  ON public.issued_quotation_documents(org_id, status, created_at, agency_id);

ALTER TABLE public.quotation_quota_plan_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_quota_plan_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_quota_org_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_quota_org_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_credit_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_credit_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_quota_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_quota_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_credit_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_credit_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_credit_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_credit_movements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotation_quota_org_overrides_tenant_select ON public.quotation_quota_org_overrides;
CREATE POLICY quotation_quota_org_overrides_tenant_select
  ON public.quotation_quota_org_overrides FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS quotation_credit_packages_tenant_select ON public.quotation_credit_packages;
CREATE POLICY quotation_credit_packages_tenant_select
  ON public.quotation_credit_packages FOR SELECT TO authenticated
  USING (
    active = true
    AND (target_org_id IS NULL OR target_org_id IN (SELECT public.user_org_ids()))
    AND (
      target_plan IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.organizations o
        WHERE o.id IN (SELECT public.user_org_ids())
          AND o.plan = target_plan
      )
    )
  );

DROP POLICY IF EXISTS quotation_quota_periods_tenant_select ON public.quotation_quota_periods;
CREATE POLICY quotation_quota_periods_tenant_select
  ON public.quotation_quota_periods FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS quotation_credit_orders_tenant_select ON public.quotation_credit_orders;
CREATE POLICY quotation_credit_orders_tenant_select
  ON public.quotation_credit_orders FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS quotation_credit_movements_tenant_select ON public.quotation_credit_movements;
CREATE POLICY quotation_credit_movements_tenant_select
  ON public.quotation_credit_movements FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE OR REPLACE FUNCTION public.resolve_current_quotation_quota_period(p_org_id UUID)
RETURNS public.quotation_quota_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_override public.quotation_quota_org_overrides%ROWTYPE;
  v_plan public.quotation_quota_plan_configs%ROWTYPE;
  v_period public.quotation_quota_periods%ROWTYPE;
  v_end TIMESTAMPTZ;
  v_start TIMESTAMPTZ;
  v_included INTEGER;
  v_enabled BOOLEAN := false;
  v_enforce_from TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_end := CASE
    WHEN v_org.current_period_ends_at > now() THEN v_org.current_period_ends_at
    WHEN v_org.trial_ends_at > now() THEN v_org.trial_ends_at
    ELSE NULL
  END;
  IF v_end IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_override
  FROM public.quotation_quota_org_overrides
  WHERE org_id = p_org_id;
  IF FOUND THEN
    v_included := v_override.included_documents;
    v_enabled := v_override.enforcement_enabled;
    v_enforce_from := v_override.enforce_from;
  ELSE
    SELECT * INTO v_plan
    FROM public.quotation_quota_plan_configs
    WHERE plan_id = v_org.plan;
    IF FOUND THEN
      v_included := v_plan.included_documents;
      v_enabled := v_plan.enforcement_enabled;
      v_enforce_from := v_plan.enforce_from;
    ELSE
      v_included := NULL;
      v_enabled := false;
      v_enforce_from := NULL;
    END IF;
  END IF;

  v_start := GREATEST(v_org.created_at, v_end - interval '1 month');
  SELECT * INTO v_period
  FROM public.quotation_quota_periods
  WHERE org_id = p_org_id
    AND starts_at = v_start;
  IF FOUND THEN
    RETURN v_period;
  END IF;

  INSERT INTO public.quotation_quota_periods (
    org_id,
    starts_at,
    ends_at,
    included_documents,
    enforcement_enabled
  ) VALUES (
    p_org_id,
    v_start,
    v_end,
    v_included,
    v_enabled
      AND v_included IS NOT NULL
      AND v_enforce_from IS NOT NULL
      AND v_start >= v_enforce_from
  )
  ON CONFLICT (org_id, starts_at) DO UPDATE
    SET ends_at = EXCLUDED.ends_at
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_quotation_quota_usage(
  p_org_id UUID,
  p_agency_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period public.quotation_quota_periods%ROWTYPE;
  v_used INTEGER := 0;
  v_extra INTEGER := 0;
  v_limit INTEGER;
  v_agencies JSONB := '[]'::JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_period := public.resolve_current_quotation_quota_period(p_org_id);
  IF v_period.id IS NULL THEN
    RETURN jsonb_build_object(
      'configured', false,
      'period_id', NULL,
      'starts_at', NULL,
      'ends_at', NULL,
      'included', NULL,
      'extra', 0,
      'limit', NULL,
      'used', 0,
      'remaining', NULL,
      'at_limit', false,
      'enforcement_enabled', false,
      'agencies', '[]'::JSONB
    );
  END IF;

  SELECT count(*)::INTEGER INTO v_used
  FROM public.issued_quotation_documents d
  WHERE d.org_id = p_org_id
    AND d.status = 'READY'
    AND d.created_at >= v_period.starts_at
    AND d.created_at < v_period.ends_at;

  SELECT COALESCE(sum(m.units), 0)::INTEGER INTO v_extra
  FROM public.quotation_credit_movements m
  WHERE m.org_id = p_org_id
    AND m.period_id = v_period.id
    AND m.expires_at >= now();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'agency_id', a.id,
    'agency_name', a.name,
    'used', COALESCE(x.used, 0)
  ) ORDER BY a.name), '[]'::JSONB)
  INTO v_agencies
  FROM public.agencies a
  LEFT JOIN (
    SELECT d.agency_id, count(*)::INTEGER AS used
    FROM public.issued_quotation_documents d
    WHERE d.org_id = p_org_id
      AND d.status = 'READY'
      AND d.created_at >= v_period.starts_at
      AND d.created_at < v_period.ends_at
    GROUP BY d.agency_id
  ) x ON x.agency_id = a.id
  WHERE a.org_id = p_org_id
    AND (p_agency_ids IS NULL OR a.id = ANY(p_agency_ids));

  v_limit := CASE
    WHEN v_period.included_documents IS NULL THEN NULL
    ELSE GREATEST(v_period.included_documents + v_extra, 0)
  END;

  RETURN jsonb_build_object(
    'configured', v_period.included_documents IS NOT NULL,
    'period_id', v_period.id,
    'starts_at', v_period.starts_at,
    'ends_at', v_period.ends_at,
    'included', v_period.included_documents,
    'extra', v_extra,
    'limit', v_limit,
    'used', v_used,
    'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE GREATEST(v_limit - v_used, 0) END,
    'at_limit', CASE WHEN v_limit IS NULL THEN false ELSE v_used >= v_limit END,
    'enforcement_enabled', v_period.enforcement_enabled,
    'agencies', v_agencies
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_quotation_document_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period public.quotation_quota_periods%ROWTYPE;
  v_used INTEGER;
  v_extra INTEGER;
  v_limit INTEGER;
BEGIN
  IF NEW.status <> 'READY' THEN
    RETURN NEW;
  END IF;

  v_period := public.resolve_current_quotation_quota_period(NEW.org_id);
  IF v_period.id IS NULL
    OR v_period.included_documents IS NULL
    OR NOT v_period.enforcement_enabled
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('quotation-quota:' || NEW.org_id::TEXT || ':' || v_period.id::TEXT, 0)
  );

  SELECT count(*)::INTEGER INTO v_used
  FROM public.issued_quotation_documents d
  WHERE d.org_id = NEW.org_id
    AND d.status = 'READY'
    AND d.created_at >= v_period.starts_at
    AND d.created_at < v_period.ends_at;

  SELECT COALESCE(sum(m.units), 0)::INTEGER INTO v_extra
  FROM public.quotation_credit_movements m
  WHERE m.org_id = NEW.org_id
    AND m.period_id = v_period.id
    AND m.expires_at >= now();

  v_limit := GREATEST(v_period.included_documents + v_extra, 0);
  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'quotation quota exhausted'
      USING
        ERRCODE = 'P4201',
        DETAIL = jsonb_build_object(
          'code', 'QUOTATION_QUOTA_EXHAUSTED',
          'used', v_used,
          'limit', v_limit,
          'period_ends_at', v_period.ends_at
        )::TEXT;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_quotation_document_quota
  ON public.issued_quotation_documents;
CREATE TRIGGER trg_enforce_quotation_document_quota
  BEFORE INSERT ON public.issued_quotation_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_quotation_document_quota();

CREATE OR REPLACE FUNCTION public.apply_quotation_credit_payment(
  p_order_id UUID,
  p_payment_id TEXT,
  p_payment_status TEXT,
  p_amount_ars NUMERIC,
  p_currency TEXT
)
RETURNS public.quotation_credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.quotation_credit_orders%ROWTYPE;
  v_status TEXT := lower(btrim(p_payment_status));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.quotation_credit_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit order not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_currency <> v_order.currency OR p_amount_ars <> v_order.amount_ars_snapshot THEN
    RAISE EXCEPTION 'credit payment amount mismatch' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('quotation-quota:' || v_order.org_id::TEXT || ':' || v_order.period_id::TEXT, 0)
  );

  IF v_status = 'approved' THEN
    UPDATE public.quotation_credit_orders
    SET status = 'APPROVED',
        mp_payment_id = p_payment_id,
        approved_at = COALESCE(approved_at, now()),
        updated_at = now()
    WHERE id = v_order.id;

    INSERT INTO public.quotation_credit_movements (
      org_id, period_id, units, movement_type, source_order_id,
      reason, created_by, expires_at
    ) VALUES (
      v_order.org_id, v_order.period_id, v_order.units_snapshot, 'PURCHASE',
      v_order.id, 'Compra aprobada por Mercado Pago', v_order.created_by, v_order.expires_at
    ) ON CONFLICT (source_order_id, movement_type) WHERE source_order_id IS NOT NULL DO NOTHING;
  ELSIF v_status IN ('refunded', 'charged_back') THEN
    UPDATE public.quotation_credit_orders
    SET status = CASE WHEN v_status = 'refunded' THEN 'REFUNDED' ELSE 'CHARGEBACK' END,
        mp_payment_id = COALESCE(mp_payment_id, p_payment_id),
        updated_at = now()
    WHERE id = v_order.id;

    IF EXISTS (
      SELECT 1 FROM public.quotation_credit_movements
      WHERE source_order_id = v_order.id AND movement_type = 'PURCHASE'
    ) THEN
      INSERT INTO public.quotation_credit_movements (
        org_id, period_id, units, movement_type, source_order_id,
        reason, created_by, expires_at
      ) VALUES (
        v_order.org_id, v_order.period_id, -v_order.units_snapshot, 'REVERSAL',
        v_order.id,
        CASE WHEN v_status = 'refunded' THEN 'Reintegro de Mercado Pago' ELSE 'Contracargo de Mercado Pago' END,
        NULL,
        v_order.expires_at
      ) ON CONFLICT (source_order_id, movement_type) WHERE source_order_id IS NOT NULL DO NOTHING;
    END IF;
  ELSIF v_status IN ('rejected', 'cancelled') THEN
    UPDATE public.quotation_credit_orders
    SET status = CASE WHEN v_status = 'rejected' THEN 'REJECTED' ELSE 'CANCELLED' END,
        mp_payment_id = COALESCE(mp_payment_id, p_payment_id),
        updated_at = now()
    WHERE id = v_order.id AND status <> 'APPROVED';
  END IF;

  SELECT * INTO v_order FROM public.quotation_credit_orders WHERE id = p_order_id;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_manual_quotation_credits(
  p_org_id UUID,
  p_units INTEGER,
  p_reason TEXT,
  p_actor_id UUID
)
RETURNS public.quotation_credit_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period public.quotation_quota_periods%ROWTYPE;
  v_movement public.quotation_credit_movements%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_units <= 0 OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'invalid manual credit grant' USING ERRCODE = '22023';
  END IF;

  v_period := public.resolve_current_quotation_quota_period(p_org_id);
  IF v_period.id IS NULL OR v_period.included_documents IS NULL THEN
    RAISE EXCEPTION 'organization has no active quotation quota' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('quotation-quota:' || p_org_id::TEXT || ':' || v_period.id::TEXT, 0)
  );

  INSERT INTO public.quotation_credit_movements (
    org_id, period_id, units, movement_type, reason, created_by, expires_at
  ) VALUES (
    p_org_id, v_period.id, p_units, 'MANUAL', btrim(p_reason), p_actor_id, v_period.ends_at
  ) RETURNING * INTO v_movement;
  RETURN v_movement;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_current_quotation_quota_period(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_quotation_quota_usage(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_quotation_credit_payment(UUID, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_manual_quotation_credits(UUID, INTEGER, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_current_quotation_quota_period(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_quotation_quota_usage(UUID, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_quotation_credit_payment(UUID, TEXT, TEXT, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_manual_quotation_credits(UUID, INTEGER, TEXT, UUID) TO service_role;

COMMENT ON TABLE public.quotation_quota_periods IS
  'Snapshot del cupo de PDFs por ciclo de facturación. No se recalcula retroactivamente.';
COMMENT ON TABLE public.quotation_credit_movements IS
  'Ledger inmutable de créditos extra; el consumo canónico sigue siendo issued_quotation_documents READY.';
