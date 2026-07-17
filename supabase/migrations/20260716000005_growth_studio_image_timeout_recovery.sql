BEGIN;

-- Cierra reservas que quedaron huérfanas con la implementación sin timeout.
UPDATE public.growth_generation_requests
SET
  status = 'failed',
  error_code = 'provider_timeout',
  completed_at = now(),
  updated_at = now()
WHERE kind = 'image'
  AND status = 'pending'
  AND created_at < now() - interval '5 minutes';

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
  pending_window INTERVAL;
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
  pending_window := CASE
    WHEN quota_group = 'image' THEN interval '5 minutes'
    ELSE interval '15 minutes'
  END;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_org_id::text || ':' || p_agency_id::text || ':' || quota_group, 0)
  );

  -- El proveedor corta a los cuatro minutos. El minuto adicional evita que un
  -- retry compita con el catch que está cerrando la reserva original.
  IF quota_group = 'image' THEN
    UPDATE public.growth_generation_requests r
    SET
      status = 'failed',
      error_code = 'provider_timeout',
      completed_at = now(),
      updated_at = now()
    WHERE r.org_id = p_org_id
      AND r.agency_id = p_agency_id
      AND r.kind = 'image'
      AND r.status = 'pending'
      AND r.created_at < now() - pending_window;
  END IF;

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
      OR (r.status = 'pending' AND r.created_at >= now() - pending_window)
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

COMMIT;
