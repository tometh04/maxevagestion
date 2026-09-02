CREATE OR REPLACE FUNCTION public.convert_price_confirmed_quotation_to_operation(
  p_quotation_id UUID,
  p_org_id UUID,
  p_agency_id UUID,
  p_actor_id UUID,
  p_file_code TEXT,
  p_commission_snapshot JSONB,
  p_price_refresh_run_id UUID,
  p_selected_option_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_run public.quotation_price_refresh_runs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_price_refresh_run_id IS NULL OR p_selected_option_id IS NULL THEN
    RAISE EXCEPTION 'price confirmation is required for quotation conversion'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_org_id::TEXT || ':quotation-conversion', 0)
  );
  PERFORM id FROM public.quotation_items
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;
  PERFORM id FROM public.quotation_options
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;

  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quotation_id AND org_id = p_org_id AND agency_id = p_agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_quote.status = 'CONVERTED' AND v_quote.operation_id IS NOT NULL THEN
    RETURN public.convert_quotation_to_operation(
      p_quotation_id, p_org_id, p_agency_id, p_actor_id,
      p_file_code, p_commission_snapshot
    );
  END IF;
  IF v_quote.status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL')
    OR v_quote.operation_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'quotation status does not allow price-confirmed conversion'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_run
  FROM public.quotation_price_refresh_runs
  WHERE id = p_price_refresh_run_id
    AND quotation_id = v_quote.id
    AND org_id = p_org_id
    AND agency_id = p_agency_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_quote.last_price_refresh_run_id IS DISTINCT FROM v_run.id
    OR v_run.status IS DISTINCT FROM 'APPLIED'
    OR v_run.applied_at IS NULL
    OR v_run.valid_until IS NULL
    OR v_run.valid_until <= clock_timestamp()
    OR (
      v_run.issued_document_id IS NOT NULL
      AND v_quote.active_document_id IS DISTINCT FROM v_run.issued_document_id
    )
    OR (
      v_run.issued_document_id IS NULL
      AND v_quote.updated_at IS DISTINCT FROM v_run.source_quotation_updated_at
    )
  THEN
    RAISE EXCEPTION 'price confirmation is missing, stale or expired'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quotation_options
    WHERE id = p_selected_option_id AND quotation_id = v_quote.id
  ) THEN
    RAISE EXCEPTION 'selected option does not belong to quotation'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.quotation_options
  SET is_selected = (id = p_selected_option_id)
  WHERE quotation_id = v_quote.id;

  IF v_quote.status = 'DRAFT' THEN
    UPDATE public.quotations
    SET status = 'PENDING_APPROVAL'
    WHERE id = v_quote.id;
  END IF;

  UPDATE public.quotations
  SET status = 'APPROVED', approved_at = NULL
  WHERE id = v_quote.id;

  RETURN public.convert_quotation_to_operation(
    p_quotation_id, p_org_id, p_agency_id, p_actor_id,
    p_file_code, p_commission_snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_price_confirmed_quotation_to_operation(
  UUID, UUID, UUID, UUID, TEXT, JSONB, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_price_confirmed_quotation_to_operation(
  UUID, UUID, UUID, UUID, TEXT, JSONB, UUID, UUID
) TO service_role;
