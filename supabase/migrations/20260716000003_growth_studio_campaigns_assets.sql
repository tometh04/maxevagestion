BEGIN;

CREATE TABLE IF NOT EXISTS public.growth_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  brief_data JSONB NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id UUID,
  source_snapshot JSONB,
  selected_concept_index SMALLINT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT growth_campaigns_name_length
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT growth_campaigns_status_check
    CHECK (status IN ('DRAFT', 'CONCEPTS_READY', 'CONCEPT_SELECTED', 'CHANNELS_READY')),
  CONSTRAINT growth_campaigns_source_type_check
    CHECK (source_type IN ('manual', 'operation', 'quotation')),
  CONSTRAINT growth_campaigns_source_identity_check
    CHECK (
      (source_type = 'manual' AND source_id IS NULL)
      OR (source_type IN ('operation', 'quotation') AND source_id IS NOT NULL)
    ),
  CONSTRAINT growth_campaigns_selected_concept_check
    CHECK (selected_concept_index IS NULL OR selected_concept_index BETWEEN 1 AND 3),
  CONSTRAINT growth_campaigns_brief_object
    CHECK (jsonb_typeof(brief_data) = 'object'),
  CONSTRAINT growth_campaigns_source_snapshot_object
    CHECK (source_snapshot IS NULL OR jsonb_typeof(source_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_growth_campaigns_agency_updated
  ON public.growth_campaigns (org_id, agency_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.growth_generation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.growth_campaigns(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  quality TEXT,
  input_snapshot JSONB NOT NULL,
  output_snapshot JSONB,
  usage_data JSONB,
  error_code TEXT,
  idempotency_key TEXT NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT growth_generation_requests_kind_check
    CHECK (kind IN ('concepts', 'channels', 'image')),
  CONSTRAINT growth_generation_requests_status_check
    CHECK (status IN ('pending', 'completed', 'failed')),
  CONSTRAINT growth_generation_requests_quality_check
    CHECK (quality IS NULL OR quality IN ('low', 'medium', 'high')),
  CONSTRAINT growth_generation_requests_input_object
    CHECK (jsonb_typeof(input_snapshot) = 'object'),
  CONSTRAINT growth_generation_requests_output_object
    CHECK (output_snapshot IS NULL OR jsonb_typeof(output_snapshot) = 'object'),
  CONSTRAINT growth_generation_requests_usage_object
    CHECK (usage_data IS NULL OR jsonb_typeof(usage_data) = 'object'),
  CONSTRAINT growth_generation_requests_idempotency_unique
    UNIQUE (org_id, agency_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_growth_generation_requests_quota
  ON public.growth_generation_requests (org_id, agency_id, kind, created_at DESC)
  WHERE status IN ('pending', 'completed');

CREATE INDEX IF NOT EXISTS idx_growth_generation_requests_campaign
  ON public.growth_generation_requests (org_id, campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.growth_campaign_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.growth_campaigns(id) ON DELETE CASCADE,
  generation_request_id UUID REFERENCES public.growth_generation_requests(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT growth_campaign_revisions_kind_check
    CHECK (kind IN ('concepts', 'channels', 'composition')),
  CONSTRAINT growth_campaign_revisions_version_positive
    CHECK (version > 0),
  CONSTRAINT growth_campaign_revisions_payload_object
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT growth_campaign_revisions_version_unique
    UNIQUE (campaign_id, kind, version)
);

CREATE INDEX IF NOT EXISTS idx_growth_campaign_revisions_latest
  ON public.growth_campaign_revisions (org_id, agency_id, campaign_id, kind, version DESC);

CREATE TABLE IF NOT EXISTS public.growth_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.growth_campaigns(id) ON DELETE SET NULL,
  generation_request_id UUID REFERENCES public.growth_generation_requests(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_file_name TEXT,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT growth_assets_source_check
    CHECK (source IN ('upload', 'generated', 'composition', 'logo')),
  CONSTRAINT growth_assets_mime_check
    CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  CONSTRAINT growth_assets_width_check
    CHECK (width IS NULL OR width BETWEEN 1 AND 3840),
  CONSTRAINT growth_assets_height_check
    CHECK (height IS NULL OR height BETWEEN 1 AND 3840),
  CONSTRAINT growth_assets_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT growth_assets_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_growth_assets_library
  ON public.growth_assets (org_id, agency_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.growth_studio_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.growth_campaigns(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.growth_assets(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT growth_studio_events_type_check
    CHECK (event_type IN ('generated', 'selected', 'edited', 'copied', 'exported', 'rated')),
  CONSTRAINT growth_studio_events_payload_object
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_growth_studio_events_metrics
  ON public.growth_studio_events (org_id, agency_id, event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_growth_studio_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_growth_studio_agency_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.agencies a
    WHERE a.id = NEW.agency_id
      AND a.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'growth_studio agency_id does not belong to org_id'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = NEW.created_by
      AND u.org_id = NEW.org_id
      AND (auth.uid() IS NULL OR u.auth_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'growth_studio created_by does not belong to the current actor'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_growth_studio_agency(
  p_org_id UUID,
  p_agency_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.agencies a
      ON a.id = p_agency_id
     AND a.org_id = p_org_id
    WHERE u.auth_id = auth.uid()
      AND u.org_id = p_org_id
      AND COALESCE(u.is_active, true)
      AND (
        u.role IN ('SUPER_ADMIN', 'ORG_OWNER', 'CONTABLE', 'POST_VENTA')
        OR COALESCE(u.additional_roles, '{}'::TEXT[]) && ARRAY[
          'SUPER_ADMIN', 'ORG_OWNER', 'CONTABLE', 'POST_VENTA'
        ]::TEXT[]
        OR EXISTS (
          SELECT 1
          FROM public.user_agencies ua
          WHERE ua.user_id = u.id
            AND ua.agency_id = p_agency_id
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_access_growth_studio_agency(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_growth_studio_agency(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_growth_campaign_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type = 'operation' AND NOT EXISTS (
    SELECT 1
    FROM public.operations o
    WHERE o.id = NEW.source_id
      AND o.org_id = NEW.org_id
      AND o.agency_id = NEW.agency_id
      AND o.status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'growth_studio operation source is not available'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.source_type = 'quotation' AND NOT EXISTS (
    SELECT 1
    FROM public.quotations q
    WHERE q.id = NEW.source_id
      AND q.org_id = NEW.org_id
      AND q.agency_id = NEW.agency_id
      AND q.status NOT IN ('REJECTED', 'EXPIRED')
  ) THEN
    RAISE EXCEPTION 'growth_studio quotation source is not available'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_growth_studio_references()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.growth_campaigns c
    WHERE c.id = NEW.campaign_id
      AND c.org_id = NEW.org_id
      AND c.agency_id = NEW.agency_id
  ) THEN
    RAISE EXCEPTION 'growth_studio campaign reference crosses scope'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME IN ('growth_campaign_revisions', 'growth_assets') THEN
    IF NEW.generation_request_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.growth_generation_requests r
        WHERE r.id = NEW.generation_request_id
          AND r.org_id = NEW.org_id
          AND r.agency_id = NEW.agency_id
          AND (NEW.campaign_id IS NULL OR r.campaign_id = NEW.campaign_id)
      )
    THEN
      RAISE EXCEPTION 'growth_studio generation reference crosses scope'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'growth_studio_events' THEN
    IF NEW.asset_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.growth_assets a
        WHERE a.id = NEW.asset_id
          AND a.org_id = NEW.org_id
          AND a.agency_id = NEW.agency_id
      )
    THEN
      RAISE EXCEPTION 'growth_studio asset reference crosses scope'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_growth_campaign_revision_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.campaign_id::text || ':' || NEW.kind, 0)
  );

  SELECT COALESCE(MAX(r.version), 0) + 1
    INTO NEW.version
  FROM public.growth_campaign_revisions r
  WHERE r.campaign_id = NEW.campaign_id
    AND r.kind = NEW.kind;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_campaigns_updated_at ON public.growth_campaigns;
CREATE TRIGGER trg_growth_campaigns_updated_at
  BEFORE UPDATE ON public.growth_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_studio_updated_at();

DROP TRIGGER IF EXISTS trg_growth_generation_requests_updated_at ON public.growth_generation_requests;
CREATE TRIGGER trg_growth_generation_requests_updated_at
  BEFORE UPDATE ON public.growth_generation_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_studio_updated_at();

DROP TRIGGER IF EXISTS trg_growth_assets_updated_at ON public.growth_assets;
CREATE TRIGGER trg_growth_assets_updated_at
  BEFORE UPDATE ON public.growth_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_studio_updated_at();

DROP TRIGGER IF EXISTS trg_growth_campaign_revisions_version ON public.growth_campaign_revisions;
CREATE TRIGGER trg_growth_campaign_revisions_version
  BEFORE INSERT ON public.growth_campaign_revisions
  FOR EACH ROW EXECUTE FUNCTION public.assign_growth_campaign_revision_version();

DROP TRIGGER IF EXISTS trg_growth_campaigns_source ON public.growth_campaigns;
CREATE TRIGGER trg_growth_campaigns_source
  BEFORE INSERT OR UPDATE OF org_id, agency_id, source_type, source_id
  ON public.growth_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.validate_growth_campaign_source();

DROP TRIGGER IF EXISTS trg_growth_generation_requests_references ON public.growth_generation_requests;
CREATE TRIGGER trg_growth_generation_requests_references
  BEFORE INSERT OR UPDATE OF org_id, agency_id, campaign_id
  ON public.growth_generation_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_growth_studio_references();

DROP TRIGGER IF EXISTS trg_growth_campaign_revisions_references ON public.growth_campaign_revisions;
CREATE TRIGGER trg_growth_campaign_revisions_references
  BEFORE INSERT OR UPDATE OF org_id, agency_id, campaign_id, generation_request_id
  ON public.growth_campaign_revisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_growth_studio_references();

DROP TRIGGER IF EXISTS trg_growth_assets_references ON public.growth_assets;
CREATE TRIGGER trg_growth_assets_references
  BEFORE INSERT OR UPDATE OF org_id, agency_id, campaign_id, generation_request_id
  ON public.growth_assets
  FOR EACH ROW EXECUTE FUNCTION public.validate_growth_studio_references();

DROP TRIGGER IF EXISTS trg_growth_studio_events_references ON public.growth_studio_events;
CREATE TRIGGER trg_growth_studio_events_references
  BEFORE INSERT OR UPDATE OF org_id, agency_id, campaign_id, asset_id
  ON public.growth_studio_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_growth_studio_references();

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'growth_campaigns',
    'growth_generation_requests',
    'growth_campaign_revisions',
    'growth_assets',
    'growth_studio_events'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.%I',
      'trg_' || table_name || '_agency_org',
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF org_id, agency_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_growth_studio_agency_org()',
      'trg_' || table_name || '_agency_org',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_growth_studio_generation(
  p_org_id UUID,
  p_agency_id UUID,
  p_campaign_id UUID,
  p_kind TEXT,
  p_prompt_version TEXT,
  p_model TEXT,
  p_quality TEXT,
  p_input_snapshot JSONB,
  p_idempotency_key TEXT,
  p_created_by UUID
)
RETURNS TABLE(request_id UUID, remaining INTEGER, is_existing BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quota_group TEXT;
  quota_limit INTEGER;
  consumed INTEGER;
  existing_id UUID;
BEGIN
  IF p_kind NOT IN ('concepts', 'channels', 'image') THEN
    RAISE EXCEPTION 'growth_studio_invalid_generation_kind' USING ERRCODE = '22023';
  END IF;

  IF p_quality IS NOT NULL AND p_quality NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'growth_studio_invalid_quality' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_created_by
      AND u.auth_id = auth.uid()
      AND u.org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'growth_studio_forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_growth_studio_agency(p_org_id, p_agency_id) THEN
    RAISE EXCEPTION 'growth_studio_agency_not_found' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.growth_campaigns c
    WHERE c.id = p_campaign_id
      AND c.org_id = p_org_id
      AND c.agency_id = p_agency_id
  ) THEN
    RAISE EXCEPTION 'growth_studio_campaign_not_found' USING ERRCODE = '42501';
  END IF;

  quota_group := CASE WHEN p_kind = 'image' THEN 'image' ELSE 'text' END;
  quota_limit := CASE WHEN quota_group = 'image' THEN 12 ELSE 20 END;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_org_id::text || ':' || p_agency_id::text || ':' || quota_group, 0)
  );

  SELECT r.id
    INTO existing_id
  FROM public.growth_generation_requests r
  WHERE r.org_id = p_org_id
    AND r.agency_id = p_agency_id
    AND r.idempotency_key = p_idempotency_key;

  IF existing_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_id, 0, true;
    RETURN;
  END IF;

  IF quota_group = 'image' AND EXISTS (
    SELECT 1
    FROM public.growth_generation_requests r
    WHERE r.org_id = p_org_id
      AND r.agency_id = p_agency_id
      AND r.kind = 'image'
      AND r.status = 'pending'
      AND r.created_at >= now() - interval '15 minutes'
  ) THEN
    RAISE EXCEPTION 'growth_studio_image_in_progress' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO consumed
  FROM public.growth_generation_requests r
  WHERE r.org_id = p_org_id
    AND r.agency_id = p_agency_id
    AND (CASE WHEN r.kind = 'image' THEN 'image' ELSE 'text' END) = quota_group
    AND (
      (r.status = 'completed' AND r.created_at >= now() - interval '24 hours')
      OR (r.status = 'pending' AND r.created_at >= now() - interval '15 minutes')
    );

  IF consumed >= quota_limit THEN
    RAISE EXCEPTION 'growth_studio_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.growth_generation_requests (
    org_id,
    agency_id,
    campaign_id,
    kind,
    prompt_version,
    model,
    quality,
    input_snapshot,
    idempotency_key,
    created_by
  )
  VALUES (
    p_org_id,
    p_agency_id,
    p_campaign_id,
    p_kind,
    p_prompt_version,
    p_model,
    p_quality,
    p_input_snapshot,
    p_idempotency_key,
    p_created_by
  )
  RETURNING id INTO request_id;

  remaining := quota_limit - consumed - 1;
  is_existing := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_growth_studio_generation(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_growth_studio_generation(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_growth_studio_generation(
  p_org_id UUID,
  p_agency_id UUID,
  p_request_id UUID,
  p_status TEXT,
  p_output_snapshot JSONB,
  p_usage_data JSONB,
  p_error_code TEXT,
  p_created_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_rows INTEGER;
BEGIN
  IF p_status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'growth_studio_invalid_finish_status' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'completed' AND (
    p_output_snapshot IS NULL OR jsonb_typeof(p_output_snapshot) <> 'object'
  ) THEN
    RAISE EXCEPTION 'growth_studio_missing_output' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_created_by
      AND u.auth_id = auth.uid()
      AND u.org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'growth_studio_forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.growth_generation_requests r
  SET
    status = p_status,
    output_snapshot = CASE
      WHEN p_status = 'completed' THEN p_output_snapshot
      ELSE NULL
    END,
    usage_data = CASE
      WHEN p_status = 'completed' THEN p_usage_data
      ELSE NULL
    END,
    error_code = CASE
      WHEN p_status = 'failed' THEN NULLIF(btrim(p_error_code), '')
      ELSE NULL
    END,
    completed_at = now()
  WHERE r.id = p_request_id
    AND r.org_id = p_org_id
    AND r.agency_id = p_agency_id
    AND r.created_by = p_created_by
    AND r.status = 'pending';

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RAISE EXCEPTION 'growth_studio_generation_not_pending' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_growth_studio_generation(
  UUID, UUID, UUID, TEXT, JSONB, JSONB, TEXT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_growth_studio_generation(
  UUID, UUID, UUID, TEXT, JSONB, JSONB, TEXT, UUID
) TO authenticated;

ALTER TABLE public.growth_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.growth_generation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_generation_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.growth_campaign_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_campaign_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.growth_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.growth_studio_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_studio_events FORCE ROW LEVEL SECURITY;

CREATE POLICY growth_campaigns_tenant_isolation
  ON public.growth_campaigns FOR ALL TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(org_id, agency_id)
  )
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(org_id, agency_id)
  );

CREATE POLICY growth_generation_requests_select
  ON public.growth_generation_requests FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(org_id, agency_id)
  );

CREATE POLICY growth_campaign_revisions_select
  ON public.growth_campaign_revisions FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(org_id, agency_id)
  );

CREATE POLICY growth_campaign_revisions_insert
  ON public.growth_campaign_revisions FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(org_id, agency_id)
  );

CREATE POLICY growth_assets_tenant_isolation
  ON public.growth_assets FOR ALL TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(org_id, agency_id)
  )
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(org_id, agency_id)
  );

CREATE POLICY growth_studio_events_select
  ON public.growth_studio_events FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(org_id, agency_id)
  );

CREATE POLICY growth_studio_events_insert
  ON public.growth_studio_events FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(org_id, agency_id)
  );

GRANT SELECT, INSERT, UPDATE ON public.growth_campaigns TO authenticated;
GRANT SELECT ON public.growth_generation_requests TO authenticated;
GRANT SELECT, INSERT ON public.growth_campaign_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.growth_assets TO authenticated;
GRANT SELECT, INSERT ON public.growth_studio_events TO authenticated;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'growth-studio-assets',
  'growth-studio-assets',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS growth_studio_assets_select ON storage.objects;
CREATE POLICY growth_studio_assets_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'growth-studio-assets'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 1)::UUID IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(
      split_part(name, '/', 1)::UUID,
      split_part(name, '/', 2)::UUID
    )
  );

DROP POLICY IF EXISTS growth_studio_assets_insert ON storage.objects;
CREATE POLICY growth_studio_assets_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'growth-studio-assets'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 1)::UUID IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(
      split_part(name, '/', 1)::UUID,
      split_part(name, '/', 2)::UUID
    )
  );

DROP POLICY IF EXISTS growth_studio_assets_delete ON storage.objects;
CREATE POLICY growth_studio_assets_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'growth-studio-assets'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 1)::UUID IN (SELECT public.user_org_ids())
    AND public.can_access_growth_studio_agency(
      split_part(name, '/', 1)::UUID,
      split_part(name, '/', 2)::UUID
    )
  );

COMMENT ON TABLE public.growth_campaigns IS
  'Growth Studio: agregado de campaña por agencia.';
COMMENT ON TABLE public.growth_generation_requests IS
  'Growth Studio: reservas de cuota e historial de llamadas a IA.';
COMMENT ON TABLE public.growth_campaign_revisions IS
  'Growth Studio: revisiones append-only de conceptos, canales y composiciones.';
COMMENT ON TABLE public.growth_assets IS
  'Growth Studio: biblioteca privada de imágenes por agencia.';
COMMENT ON TABLE public.growth_studio_events IS
  'Growth Studio: eventos internos de selección, edición, copia, exportación y valoración.';

COMMIT;
