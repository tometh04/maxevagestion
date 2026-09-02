CREATE OR REPLACE FUNCTION public.accept_issued_quotation_option(
  p_public_token TEXT,
  p_document_id UUID,
  p_content_hash TEXT,
  p_option_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_document public.issued_quotation_documents%ROWTYPE;
  v_public_token UUID := p_public_token::UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM id
  FROM public.quotation_items
  WHERE quotation_id = (
    SELECT id FROM public.quotations WHERE public_token = v_public_token
  )
  ORDER BY id
  FOR UPDATE;
  PERFORM id
  FROM public.quotation_options
  WHERE quotation_id = (
    SELECT id FROM public.quotations WHERE public_token = v_public_token
  )
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_quote
  FROM public.quotations
  WHERE public_token = v_public_token
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', false, 'code', 'NOT_FOUND');
  END IF;
  IF v_quote.status NOT IN ('SENT', 'PENDING_APPROVAL') THEN
    RETURN jsonb_build_object('accepted', false, 'code', 'INVALID_STATE');
  END IF;
  IF v_quote.valid_until < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE THEN
    UPDATE public.quotations
    SET status = 'EXPIRED'
    WHERE id = v_quote.id
      AND status IN ('SENT', 'PENDING_APPROVAL');
    RETURN jsonb_build_object('accepted', false, 'code', 'EXPIRED');
  END IF;
  IF v_quote.active_document_id IS DISTINCT FROM p_document_id THEN
    RETURN jsonb_build_object('accepted', false, 'code', 'DOCUMENT_CHANGED');
  END IF;

  SELECT * INTO v_document
  FROM public.issued_quotation_documents
  WHERE id = p_document_id
    AND quotation_id = v_quote.id
    AND content_hash = p_content_hash
    AND status = 'READY';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', false, 'code', 'DOCUMENT_CHANGED');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_document.data_snapshot->'options', '[]'::jsonb)) option_row
    WHERE option_row->>'id' = p_option_id::TEXT
  ) OR NOT EXISTS (
    SELECT 1 FROM public.quotation_options
    WHERE id = p_option_id AND quotation_id = v_quote.id
  ) THEN
    RETURN jsonb_build_object('accepted', false, 'code', 'OPTION_NOT_FOUND');
  END IF;

  UPDATE public.quotation_options
  SET is_selected = (id = p_option_id)
  WHERE quotation_id = v_quote.id;

  UPDATE public.quotations
  SET status = 'APPROVED', approved_at = now()
  WHERE id = v_quote.id;

  RETURN jsonb_build_object(
    'accepted', true,
    'quotation_id', v_quote.id,
    'quotation_number', v_quote.quotation_number,
    'destination', v_quote.destination,
    'seller_id', v_quote.seller_id,
    'org_id', v_quote.org_id
  );
END;
$$;
