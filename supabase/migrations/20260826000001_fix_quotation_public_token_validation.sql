-- Fix atomic quotation creation after public_token became UUID.
-- Comparing an UUID with an empty string makes PostgreSQL cast '' to UUID and
-- raises 22P02 even when public_token contains a valid UUID.
CREATE OR REPLACE FUNCTION public.create_quotation_with_structure(
  p_quotation_id UUID,
  p_org_id UUID,
  p_agency_id UUID,
  p_actor_id UUID,
  p_header JSONB,
  p_options JSONB,
  p_items JSONB
)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_input public.quotations%ROWTYPE;
  v_quote public.quotations%ROWTYPE;
  v_first_total NUMERIC;
  v_quotation_number TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_quotation_id IS NULL OR p_org_id IS NULL OR p_agency_id IS NULL OR p_actor_id IS NULL
    OR jsonb_typeof(p_header) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_options) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_options) = 0
  THEN
    RAISE EXCEPTION 'invalid atomic quotation create payload' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_header) AS header_key
    WHERE header_key NOT IN (
      'lead_id', 'destination', 'origin', 'region', 'departure_date', 'return_date',
      'valid_until', 'adults', 'children', 'infants', 'currency',
      'package_description', 'notes', 'internal_notes', 'terms_and_conditions',
      'subtotal', 'total_amount', 'pricing_mode', 'payment_methods',
      'presentation_content', 'presentation_schema_version', 'public_token'
    )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_options) row_value
    WHERE row_value->>'quotation_id' IS DISTINCT FROM p_quotation_id::TEXT
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) row_value
    WHERE row_value->>'quotation_id' IS DISTINCT FROM p_quotation_id::TEXT
      OR row_value->>'org_id' IS DISTINCT FROM p_org_id::TEXT
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item_value
    WHERE item_value->>'option_id' IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_options) option_value
        WHERE option_value->>'id' = item_value->>'option_id'
      )
  ) OR jsonb_array_length(p_options) IS DISTINCT FROM (
    SELECT count(DISTINCT option_value->>'id')
    FROM jsonb_array_elements(p_options) option_value
  ) OR jsonb_array_length(p_options) IS DISTINCT FROM (
    SELECT count(DISTINCT option_value->>'option_number')
    FROM jsonb_array_elements(p_options) option_value
  ) OR jsonb_array_length(p_items) IS DISTINCT FROM (
    SELECT count(DISTINCT item_value->>'id')
    FROM jsonb_array_elements(p_items) item_value
  ) THEN
    RAISE EXCEPTION 'invalid atomic quotation create structure' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agencies WHERE id = p_agency_id AND org_id = p_org_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_actor_id AND org_id = p_org_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'quotation create scope mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_input
  FROM jsonb_populate_record(NULL::public.quotations, p_header);
  IF v_input.lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = v_input.lead_id AND org_id = p_org_id AND agency_id = p_agency_id
  ) THEN
    RAISE EXCEPTION 'quotation lead scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF char_length(btrim(COALESCE(v_input.destination, ''))) = 0
    OR v_input.departure_date IS NULL
    OR v_input.valid_until IS NULL
    OR v_input.currency NOT IN ('ARS', 'USD')
    OR COALESCE(v_input.total_amount, 0) <= 0
    OR v_input.public_token IS NULL
  THEN
    RAISE EXCEPTION 'quotation header is incomplete' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_org_id::TEXT || ':quotation-number', 0)
  );
  v_quotation_number := public.generate_quotation_number(p_org_id);

  INSERT INTO public.quotations (
    id, org_id, lead_id, agency_id, seller_id, quotation_number,
    destination, origin, region, departure_date, return_date, valid_until,
    adults, children, infants, subtotal, total_amount, currency, pricing_mode,
    status, public_token, package_description, notes, internal_notes,
    terms_and_conditions, payment_methods, presentation_content,
    presentation_schema_version, created_by
  ) VALUES (
    p_quotation_id, p_org_id, v_input.lead_id, p_agency_id, p_actor_id,
    v_quotation_number, v_input.destination, v_input.origin, v_input.region,
    v_input.departure_date, v_input.return_date, v_input.valid_until,
    COALESCE(v_input.adults, 1), COALESCE(v_input.children, 0),
    COALESCE(v_input.infants, 0), v_input.total_amount, v_input.total_amount,
    v_input.currency, COALESCE(v_input.pricing_mode, 'PER_PERSON'), 'DRAFT',
    v_input.public_token, v_input.package_description, v_input.notes,
    v_input.internal_notes, v_input.terms_and_conditions,
    COALESCE(v_input.payment_methods, ARRAY[]::TEXT[]),
    COALESCE(v_input.presentation_content, '{"schemaVersion":1}'::JSONB),
    COALESCE(v_input.presentation_schema_version, 1), p_actor_id
  );

  INSERT INTO public.quotation_options
  SELECT * FROM jsonb_populate_recordset(NULL::public.quotation_options, p_options);
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.quotation_items
    SELECT * FROM jsonb_populate_recordset(NULL::public.quotation_items, p_items);
  END IF;

  SELECT total_amount INTO v_first_total
  FROM public.quotation_options
  WHERE quotation_id = p_quotation_id
  ORDER BY option_number
  LIMIT 1;

  UPDATE public.quotations
  SET subtotal = v_first_total,
      total_amount = v_first_total,
      updated_at = clock_timestamp()
  WHERE id = p_quotation_id
  RETURNING * INTO v_quote;

  PERFORM public.assert_quotation_structure_valid(p_quotation_id, p_org_id, v_quote.currency);
  RETURN v_quote;
END;
$$;

REVOKE ALL ON FUNCTION public.create_quotation_with_structure(
  UUID, UUID, UUID, UUID, JSONB, JSONB, JSONB
) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_quotation_with_structure(
  UUID, UUID, UUID, UUID, JSONB, JSONB, JSONB
) TO service_role;
