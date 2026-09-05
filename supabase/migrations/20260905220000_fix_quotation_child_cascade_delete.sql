-- Preserve child immutability while allowing parent-driven cascade deletion.
CREATE OR REPLACE FUNCTION public.guard_closed_quotation_child_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status INTO v_old_status
    FROM public.quotations
    WHERE id = OLD.quotation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      -- ON DELETE CASCADE runs after the parent row has been removed.
      -- Direct writes still require a visible, editable quotation.
      IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'quotation parent not found' USING ERRCODE = '23503';
    END IF;
    IF v_old_status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN
      RAISE EXCEPTION 'quotation child content is immutable after acceptance'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
    AND (TG_OP = 'INSERT' OR NEW.quotation_id IS DISTINCT FROM OLD.quotation_id)
  THEN
    SELECT status INTO v_new_status
    FROM public.quotations
    WHERE id = NEW.quotation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation parent not found' USING ERRCODE = '23503';
    END IF;
    IF v_new_status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN
      RAISE EXCEPTION 'quotation child content is immutable after acceptance'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
