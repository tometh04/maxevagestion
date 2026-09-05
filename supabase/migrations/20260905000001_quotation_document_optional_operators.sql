-- Emitir una cotizacion comercial no exige asignar operadores internos.
-- Conserva CAS, idempotencia, validacion de estructura, emisor y service role.
-- La conversion a operacion sigue exigiendo operador para cada servicio.
-- CREATE OR REPLACE conserva los grants existentes y la firma de la RPC.

CREATE OR REPLACE FUNCTION public.issue_quotation_document(
  p_quotation_id UUID,
  p_revision_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_data_snapshot JSONB,
  p_manifest_snapshot JSONB,
  p_html_snapshot TEXT,
  p_content_hash TEXT,
  p_file_name TEXT,
  p_generated_by UUID,
  p_mark_sent BOOLEAN
)
RETURNS public.issued_quotation_documents
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_existing public.issued_quotation_documents%ROWTYPE;
  v_document public.issued_quotation_documents%ROWTYPE;
  v_user_id UUID;
  v_sequence INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Todo escritor que luego toca options usa orden child -> parent. Esto evita
  -- el deadlock clásico con el trigger AFTER de una edición concurrente, que
  -- ya posee el child y necesita invalidar el parent.
  PERFORM id
  FROM public.quotation_items
  WHERE quotation_id = p_quotation_id
  ORDER BY id
  FOR UPDATE;
  PERFORM id
  FROM public.quotation_options
  WHERE quotation_id = p_quotation_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quotation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_existing
  FROM public.issued_quotation_documents
  WHERE quotation_id = p_quotation_id
    AND content_hash = p_content_hash
    AND status = 'READY'
  ORDER BY sequence DESC
  LIMIT 1;

  IF v_quote.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'quotation changed during document generation' USING ERRCODE = '40001';
  END IF;
  IF v_quote.status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'quotation status does not allow document issuance'
      USING ERRCODE = '55000';
  END IF;

  PERFORM public.assert_quotation_structure_valid(
    p_quotation_id,
    v_quote.org_id,
    v_quote.currency
  );

  -- Retry exacto: sólo después de CAS e invariantes, para que un snapshot viejo
  -- nunca tape una edición concurrente o una estructura que dejó de ser válida.
  IF v_existing.id IS NOT NULL
    AND v_quote.active_document_id = v_existing.id
    AND (NOT p_mark_sent OR v_quote.status <> 'DRAFT')
  THEN
    RETURN v_existing;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.quotations
    SET active_document_id = v_existing.id,
        status = CASE WHEN p_mark_sent AND status = 'DRAFT' THEN 'SENT' ELSE status END
    WHERE id = p_quotation_id;
    RETURN v_existing;
  END IF;

  IF p_generated_by IS NOT NULL THEN
    SELECT id INTO v_user_id
    FROM public.users
    WHERE id = p_generated_by
      AND org_id = v_quote.org_id
      AND is_active = true
    LIMIT 1;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'document issuer does not belong to quotation org'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT COALESCE(MAX(sequence), 0) + 1 INTO v_sequence
  FROM public.issued_quotation_documents
  WHERE quotation_id = p_quotation_id;

  INSERT INTO public.issued_quotation_documents (
    org_id, agency_id, quotation_id, revision_id, sequence,
    data_snapshot, manifest_snapshot, html_snapshot, content_hash,
    file_name, generated_by
  ) VALUES (
    v_quote.org_id, v_quote.agency_id, v_quote.id, p_revision_id, v_sequence,
    p_data_snapshot, p_manifest_snapshot, p_html_snapshot, p_content_hash,
    p_file_name, v_user_id
  ) RETURNING * INTO v_document;

  UPDATE public.quotations
  SET active_document_id = v_document.id,
      status = CASE WHEN p_mark_sent AND status = 'DRAFT' THEN 'SENT' ELSE status END
  WHERE id = p_quotation_id;

  RETURN v_document;
END;
$$;
