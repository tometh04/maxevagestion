BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- El runtime de pagos y los tipos generados ya consumen amount_paid, pero el
-- historial versionado nunca cerró ese drift para commission_records. Es el
-- guard autoritativo de pagos parciales antes de recalcular una comisión.
ALTER TABLE public.commission_records
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0;

-- El esquema tipado y el runtime ya usan estos servicios base, pero el
-- historial de migraciones sólo creó los cinco valores originales. Registrar
-- explícitamente el drift evita que una instalación nueva falle al persistir
-- HOTEL/FLIGHT/EXCURSION después de este commit.
ALTER TYPE public.operation_service_type ADD VALUE IF NOT EXISTS 'HOTEL';
ALTER TYPE public.operation_service_type ADD VALUE IF NOT EXISTS 'FLIGHT';
ALTER TYPE public.operation_service_type ADD VALUE IF NOT EXISTS 'EXCURSION';

-- ---------------------------------------------------------------------------
-- Cotizaciones: contenido de presentación estructurado y documento activo.
-- ---------------------------------------------------------------------------

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS presentation_content JSONB NOT NULL
    DEFAULT '{"schemaVersion": 1}'::jsonb,
  ADD COLUMN IF NOT EXISTS presentation_schema_version SMALLINT NOT NULL DEFAULT 1;

UPDATE public.quotations
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;
ALTER TABLE public.quotations ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_presentation_content_object,
  ADD CONSTRAINT quotations_presentation_content_object
    CHECK (jsonb_typeof(presentation_content) = 'object'),
  DROP CONSTRAINT IF EXISTS quotations_presentation_schema_version_positive,
  ADD CONSTRAINT quotations_presentation_schema_version_positive
    CHECK (presentation_schema_version > 0);

-- El token es una credencial bearer y todas las lecturas/aceptaciones públicas
-- asumen identidad unívoca. La creación del índice falla de forma segura si
-- una base legacy ya contiene duplicados, para corregirlos antes del deploy.
CREATE UNIQUE INDEX IF NOT EXISTS quotations_public_token_unique
  ON public.quotations(public_token)
  WHERE public_token IS NOT NULL;

-- Un item nunca puede declarar una cotización y apuntar a una opción de otra.
-- Frenamos la migración con un diagnóstico explícito si existe corrupción
-- legacy; corregirla automáticamente podría mover importes entre tenants.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.quotation_items item
    JOIN public.quotation_options option ON option.id = item.option_id
    WHERE item.option_id IS NOT NULL
      AND item.quotation_id IS DISTINCT FROM option.quotation_id
  ) THEN
    RAISE EXCEPTION 'quotation item points to an option from another quotation'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotation_options_id_quotation_id_key'
      AND conrelid = 'public.quotation_options'::regclass
  ) THEN
    ALTER TABLE public.quotation_options
      ADD CONSTRAINT quotation_options_id_quotation_id_key
      UNIQUE (id, quotation_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotation_items_option_quotation_fkey'
      AND conrelid = 'public.quotation_items'::regclass
  ) THEN
    ALTER TABLE public.quotation_items
      ADD CONSTRAINT quotation_items_option_quotation_fkey
      FOREIGN KEY (option_id, quotation_id)
      REFERENCES public.quotation_options(id, quotation_id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Autoría. Un modelo es una familia; cada cambio publicable vive en una
-- revisión. HTML/CSS tenant-supplied no forma parte de este runtime.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quotation_document_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  document_kind TEXT NOT NULL DEFAULT 'quotation'
    CHECK (document_kind IN ('quotation')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quotation_document_models_key_format
    CHECK (key ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  CONSTRAINT quotation_document_models_name_length
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS quotation_document_models_agency_key_unique
  ON public.quotation_document_models(org_id, agency_id, document_kind, key)
  WHERE agency_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quotation_document_models_org_key_unique
  ON public.quotation_document_models(org_id, document_kind, key)
  WHERE agency_id IS NULL;

CREATE TABLE IF NOT EXISTS public.quotation_document_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.quotation_document_models(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  layout_key TEXT NOT NULL,
  layout_version INTEGER NOT NULL DEFAULT 1 CHECK (layout_version > 0),
  schema_version SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  manifest JSONB NOT NULL,
  manifest_checksum TEXT NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quotation_document_revisions_model_number_unique
    UNIQUE (model_id, revision_number),
  CONSTRAINT quotation_document_revisions_manifest_object
    CHECK (jsonb_typeof(manifest) = 'object'),
  CONSTRAINT quotation_document_revisions_layout_key_format
    CHECK (layout_key ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  CONSTRAINT quotation_document_revisions_checksum_format
    CHECK (manifest_checksum ~ '^[a-f0-9]{64}$'),
  CONSTRAINT quotation_document_revisions_publish_metadata
    CHECK (
      (status = 'DRAFT' AND published_at IS NULL)
      OR (status IN ('PUBLISHED', 'ARCHIVED') AND published_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS quotation_document_revisions_scope_idx
  ON public.quotation_document_revisions(org_id, agency_id, status);
CREATE INDEX IF NOT EXISTS quotation_document_revisions_model_idx
  ON public.quotation_document_revisions(model_id, revision_number DESC);
CREATE UNIQUE INDEX IF NOT EXISTS quotation_document_revisions_one_draft_per_model
  ON public.quotation_document_revisions(model_id)
  WHERE status = 'DRAFT';

-- Binding completo por scope. Nunca se mezclan fragmentos de distintos scopes.
CREATE TABLE IF NOT EXISTS public.quotation_document_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  document_kind TEXT NOT NULL DEFAULT 'quotation'
    CHECK (document_kind IN ('quotation')),
  revision_id UUID NOT NULL REFERENCES public.quotation_document_revisions(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quotation_document_bindings_agency_unique
  ON public.quotation_document_bindings(org_id, agency_id, document_kind)
  WHERE agency_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quotation_document_bindings_org_unique
  ON public.quotation_document_bindings(org_id, document_kind)
  WHERE agency_id IS NULL;
CREATE INDEX IF NOT EXISTS quotation_document_bindings_revision_idx
  ON public.quotation_document_bindings(revision_id);

-- ---------------------------------------------------------------------------
-- Emisión. HTML, manifest y datos quedan congelados juntos. El PDF se deriva
-- de html_snapshot desde el mismo renderer; pdf_storage_path permite persistir
-- el artifact server-side cuando el adapter de Storage está habilitado.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.issued_quotation_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE RESTRICT,
  revision_id UUID REFERENCES public.quotation_document_revisions(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'FAILED')),
  data_snapshot JSONB NOT NULL,
  manifest_snapshot JSONB NOT NULL,
  html_snapshot TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  pdf_storage_path TEXT,
  generated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT issued_quotation_documents_sequence_unique UNIQUE (quotation_id, sequence),
  CONSTRAINT issued_quotation_documents_data_object CHECK (jsonb_typeof(data_snapshot) = 'object'),
  CONSTRAINT issued_quotation_documents_manifest_object CHECK (jsonb_typeof(manifest_snapshot) = 'object'),
  CONSTRAINT issued_quotation_documents_hash_format CHECK (content_hash ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS issued_quotation_documents_ready_hash_unique
  ON public.issued_quotation_documents(quotation_id, content_hash)
  WHERE status = 'READY';
CREATE INDEX IF NOT EXISTS issued_quotation_documents_scope_idx
  ON public.issued_quotation_documents(org_id, agency_id, quotation_id, sequence DESC);

-- Outbox durable para los efectos de comisión del vendedor. La conversión
-- financiera y el snapshot del motor de comisiones se confirman juntos; el
-- worker sólo reclama esta fila con lease y CAS, sin recalcular configuración
-- vigente después del commit.
CREATE TABLE IF NOT EXISTS public.quotation_conversion_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  commission_snapshot JSONB NOT NULL,
  operation_snapshot JSONB NOT NULL,
  output_snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'REVIEW', 'COMPLETED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quotation_conversion_effects_operation_unique UNIQUE (operation_id),
  CONSTRAINT quotation_conversion_effects_quotation_unique UNIQUE (quotation_id),
  CONSTRAINT quotation_conversion_effects_commission_snapshot_object
    CHECK (jsonb_typeof(commission_snapshot) = 'object'),
  CONSTRAINT quotation_conversion_effects_operation_snapshot_object
    CHECK (jsonb_typeof(operation_snapshot) = 'object'),
  CONSTRAINT quotation_conversion_effects_output_snapshot_object
    CHECK (output_snapshot IS NULL OR jsonb_typeof(output_snapshot) = 'object'),
  CONSTRAINT quotation_conversion_effects_status_metadata
    CHECK (
      (status = 'PENDING' AND lease_until IS NULL AND completed_at IS NULL AND output_snapshot IS NULL)
      OR (status = 'PROCESSING' AND lease_until IS NOT NULL AND completed_at IS NULL AND output_snapshot IS NULL)
      OR (status = 'REVIEW' AND lease_until IS NULL AND completed_at IS NULL AND output_snapshot IS NULL)
      OR (status = 'COMPLETED' AND lease_until IS NULL AND completed_at IS NOT NULL AND output_snapshot IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS quotation_conversion_effects_claim_idx
  ON public.quotation_conversion_effects(status, lease_until, created_at);
CREATE INDEX IF NOT EXISTS quotation_conversion_effects_scope_idx
  ON public.quotation_conversion_effects(org_id, agency_id, quotation_id);

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS active_document_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_active_document_id_fkey'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_active_document_id_fkey
      FOREIGN KEY (active_document_id)
      REFERENCES public.issued_quotation_documents(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- El documento activo sólo puede apuntar a un snapshot READY de esta misma
-- cotización/agencia/organización. Las APIs normales pueden invalidarlo
-- llevándolo a NULL, pero únicamente el runtime server-side que emite el
-- documento puede asignar un UUID no nulo.
CREATE OR REPLACE FUNCTION public.guard_quotation_active_document_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_document public.issued_quotation_documents%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.active_document_id IS NOT DISTINCT FROM OLD.active_document_id
  THEN
    RETURN NEW;
  END IF;

  IF NEW.active_document_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'active quotation documents can only be assigned by the document runtime'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_document
  FROM public.issued_quotation_documents
  WHERE id = NEW.active_document_id
    AND status = 'READY';

  IF NOT FOUND
    OR v_document.quotation_id IS DISTINCT FROM NEW.id
    OR v_document.org_id IS DISTINCT FROM NEW.org_id
    OR v_document.agency_id IS DISTINCT FROM NEW.agency_id
  THEN
    RAISE EXCEPTION 'active quotation document scope mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_quotation_active_document_assignment
  ON public.quotations;
CREATE TRIGGER guard_quotation_active_document_assignment
BEFORE INSERT OR UPDATE OF active_document_id ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.guard_quotation_active_document_assignment();

REVOKE ALL ON FUNCTION public.guard_quotation_active_document_assignment()
  FROM PUBLIC, authenticated, anon;

-- La API invalida explícitamente el snapshot, pero esta defensa protege también
-- updates directos por PostgREST y futuros writers. Los cambios de lifecycle
-- (SENT/APPROVED/CONVERTED) no alteran el contenido comercial congelado.
CREATE OR REPLACE FUNCTION public.invalidate_quotation_document_on_header_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.active_document_id := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invalidate_quotation_document_on_header_change
  ON public.quotations;
CREATE TRIGGER invalidate_quotation_document_on_header_change
BEFORE UPDATE OF
  org_id,
  agency_id,
  lead_id,
  customer_id,
  seller_id,
  quotation_number,
  destination,
  origin,
  region,
  departure_date,
  return_date,
  valid_until,
  adults,
  children,
  infants,
  currency,
  pricing_mode,
  subtotal,
  total_amount,
  insurance_amount,
  transfer_amount,
  package_description,
  notes,
  terms_and_conditions,
  payment_methods,
  presentation_content,
  presentation_schema_version
ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.invalidate_quotation_document_on_header_change();

REVOKE ALL ON FUNCTION public.invalidate_quotation_document_on_header_change()
  FROM PUBLIC, authenticated, anon;

-- Cualquier cambio de contenido hijo invalida el snapshot activo y avanza el
-- CAS del header. Sin este trigger, una mutación de options/items podía correr
-- entre prepare e issue sin modificar quotations.updated_at. is_selected se
-- excluye porque la aceptación pública lo cambia después de validar el
-- snapshot, sin alterar su contenido comercial.
CREATE OR REPLACE FUNCTION public.invalidate_quotation_document_on_child_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old_quotation_id UUID;
  v_new_quotation_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'quotation_options' AND TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['is_selected', 'created_at'])
       IS NOT DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['is_selected', 'created_at']) THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'quotation_items' AND TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['updated_at', 'created_at'])
       IS NOT DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['updated_at', 'created_at']) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_new_quotation_id := NEW.quotation_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_quotation_id := OLD.quotation_id;
  ELSE
    v_old_quotation_id := OLD.quotation_id;
    v_new_quotation_id := NEW.quotation_id;
  END IF;

  UPDATE public.quotations
  SET active_document_id = NULL,
      updated_at = clock_timestamp()
  WHERE id = v_old_quotation_id OR id = v_new_quotation_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS invalidate_quotation_document_on_option_change
  ON public.quotation_options;
CREATE TRIGGER invalidate_quotation_document_on_option_change
AFTER INSERT OR UPDATE OR DELETE ON public.quotation_options
FOR EACH ROW EXECUTE FUNCTION public.invalidate_quotation_document_on_child_change();

DROP TRIGGER IF EXISTS invalidate_quotation_document_on_item_change
  ON public.quotation_items;
CREATE TRIGGER invalidate_quotation_document_on_item_change
AFTER INSERT OR UPDATE OR DELETE ON public.quotation_items
FOR EACH ROW EXECUTE FUNCTION public.invalidate_quotation_document_on_child_change();

REVOKE ALL ON FUNCTION public.invalidate_quotation_document_on_child_change()
  FROM PUBLIC, authenticated, anon;

-- Una aceptación congela el contenido comercial. El trigger de invalidación
-- protege documentos abiertos; esta guarda adicional evita el bypass en
-- APPROVED/CONVERTING/CONVERTED (incluido el patrón de reabrir y luego editar).
CREATE OR REPLACE FUNCTION public.guard_closed_quotation_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL')
    AND NEW.status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL')
  THEN
    RAISE EXCEPTION 'closed quotation cannot be reopened for content changes'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL')
    AND (
      to_jsonb(NEW) - ARRAY[
        'converted_at', 'operation_id', 'status', 'updated_at'
      ]
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY[
        'converted_at', 'operation_id', 'status', 'updated_at'
      ]
    )
  THEN
    RAISE EXCEPTION 'quotation commercial content is immutable after acceptance'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_closed_quotation_content ON public.quotations;
CREATE TRIGGER guard_closed_quotation_content
BEFORE UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.guard_closed_quotation_content();

REVOKE ALL ON FUNCTION public.guard_closed_quotation_content()
  FROM PUBLIC, authenticated, anon;

-- Estado y vínculos de conversión sólo avanzan por el lifecycle explícito.
-- Esta guarda protege también writers service-role futuros: la RLS no sustituye
-- una máquina de estados y una cotización convertida nunca puede relinkearse.
CREATE OR REPLACE FUNCTION public.guard_quotation_lifecycle_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
    OR NEW.converted_at IS DISTINCT FROM OLD.converted_at
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  ) THEN
    RAISE EXCEPTION 'quotation lifecycle mutations are server-only'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('SENT', 'PENDING_APPROVAL', 'REJECTED', 'EXPIRED'))
    OR (OLD.status = 'SENT' AND NEW.status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED'))
    OR (OLD.status = 'PENDING_APPROVAL' AND NEW.status IN ('SENT', 'APPROVED', 'REJECTED', 'EXPIRED'))
    OR (OLD.status = 'APPROVED' AND NEW.status IN ('CONVERTING', 'CONVERTED'))
    OR (OLD.status = 'CONVERTING' AND NEW.status IN ('APPROVED', 'CONVERTED'))
  ) THEN
    RAISE EXCEPTION 'invalid quotation lifecycle transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '55000';
  END IF;

  IF NEW.operation_id IS DISTINCT FROM OLD.operation_id THEN
    IF OLD.operation_id IS NOT NULL
      OR NEW.operation_id IS NULL
      OR NEW.status <> 'CONVERTED'
      OR OLD.status NOT IN ('APPROVED', 'CONVERTING')
    THEN
      RAISE EXCEPTION 'quotation operation link is immutable outside conversion'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.converted_at IS DISTINCT FROM OLD.converted_at AND (
    OLD.converted_at IS NOT NULL
    OR NEW.converted_at IS NULL
    OR NEW.status <> 'CONVERTED'
  ) THEN
    RAISE EXCEPTION 'quotation converted_at is immutable outside conversion'
      USING ERRCODE = '55000';
  END IF;

  IF (NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by)
    AND NEW.status <> 'APPROVED'
  THEN
    RAISE EXCEPTION 'quotation approval metadata requires APPROVED status'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
    AND NEW.status <> 'REJECTED'
  THEN
    RAISE EXCEPTION 'quotation rejection metadata requires REJECTED status'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_quotation_lifecycle_transition ON public.quotations;
CREATE TRIGGER guard_quotation_lifecycle_transition
BEFORE UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.guard_quotation_lifecycle_transition();

REVOKE ALL ON FUNCTION public.guard_quotation_lifecycle_transition()
  FROM PUBLIC, authenticated, anon;

-- Options e items se bloquean contra el estado del padre dentro del mismo lock
-- ordering child -> parent que usan prepare/accept/convert. La aceptación puede
-- cambiar is_selected porque lo hace mientras el padre todavía está SENT.
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

DROP TRIGGER IF EXISTS guard_closed_quotation_option_content
  ON public.quotation_options;
CREATE TRIGGER guard_closed_quotation_option_content
BEFORE INSERT OR UPDATE OR DELETE ON public.quotation_options
FOR EACH ROW EXECUTE FUNCTION public.guard_closed_quotation_child_content();

DROP TRIGGER IF EXISTS guard_closed_quotation_item_content
  ON public.quotation_items;
CREATE TRIGGER guard_closed_quotation_item_content
BEFORE INSERT OR UPDATE OR DELETE ON public.quotation_items
FOR EACH ROW EXECUTE FUNCTION public.guard_closed_quotation_child_content();

REVOKE ALL ON FUNCTION public.guard_closed_quotation_child_content()
  FROM PUBLIC, authenticated, anon;

-- Reemplaza la RPC legacy con un contrato server-only, lock ordering estable y
-- validación de estado/scope. La API ya validó permisos dinámicos y llama con
-- service role; ningún browser puede invocarla para saltear esos permisos.
CREATE OR REPLACE FUNCTION public.replace_quotation_structure(
  p_quotation_id UUID,
  p_options JSONB,
  p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_selected_option_number INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_options) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_options) = 0
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_options) row_value
      WHERE row_value->>'quotation_id' IS DISTINCT FROM p_quotation_id::TEXT
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_items) row_value
      WHERE row_value->>'quotation_id' IS DISTINCT FROM p_quotation_id::TEXT
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_items) item_value
      WHERE item_value->>'option_id' IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_options) option_value
          WHERE option_value->>'id' = item_value->>'option_id'
        )
    )
  THEN
    RAISE EXCEPTION 'invalid quotation structure payload' USING ERRCODE = '22023';
  END IF;

  PERFORM id FROM public.quotation_items
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;
  PERFORM id FROM public.quotation_options
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;
  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quotation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_quote.status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'quotation status does not allow structure changes'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) item_value
    WHERE item_value->>'org_id' IS DISTINCT FROM v_quote.org_id::TEXT
  ) THEN
    RAISE EXCEPTION 'quotation item org does not match quotation'
      USING ERRCODE = '23514';
  END IF;

  SELECT option_number INTO v_selected_option_number
  FROM public.quotation_options
  WHERE quotation_id = p_quotation_id AND is_selected IS TRUE
  ORDER BY option_number
  LIMIT 1;

  DELETE FROM public.quotation_items WHERE quotation_id = p_quotation_id;
  DELETE FROM public.quotation_options WHERE quotation_id = p_quotation_id;

  INSERT INTO public.quotation_options
  SELECT * FROM jsonb_populate_recordset(NULL::public.quotation_options, p_options);

  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.quotation_items
    SELECT * FROM jsonb_populate_recordset(NULL::public.quotation_items, p_items);
  END IF;

  IF v_selected_option_number IS NOT NULL THEN
    UPDATE public.quotation_options
    SET is_selected = TRUE
    WHERE quotation_id = p_quotation_id
      AND option_number = v_selected_option_number;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_quotation_structure(UUID, JSONB, JSONB)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.replace_quotation_structure(UUID, JSONB, JSONB)
  TO service_role;

-- Única fórmula autoritativa para el costo unitario que realmente se paga al
-- operador. Los campos viven en quotation_items como snapshot: cambios futuros
-- en la ficha del operador no deben alterar una cotización ya emitida.
CREATE OR REPLACE FUNCTION public.quotation_item_effective_unit_cost(
  p_cost_amount NUMERIC,
  p_cost_calculation_mode TEXT,
  p_gross_price NUMERIC,
  p_commission_percentage NUMERIC,
  p_admin_fee_percentage NUMERIC
)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN COALESCE(p_cost_calculation_mode, 'SIMPLE') = 'COMMISSIONABLE'
      THEN COALESCE(p_gross_price, 0)
        * (
          1
          - COALESCE(p_commission_percentage, 0) / 100
          + COALESCE(p_admin_fee_percentage, 0) / 100
        )
    ELSE COALESCE(p_cost_amount, 0)
      * (1 + COALESCE(p_admin_fee_percentage, 0) / 100)
  END
$$;

REVOKE ALL ON FUNCTION public.quotation_item_effective_unit_cost(
  NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC
) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.quotation_item_effective_unit_cost(
  NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC
) TO service_role;

-- Invariante única para toda estructura persistida. Alta, edición, prepare e
-- issue la invocan dentro de su propia transacción; ningún cliente puede emitir
-- una opción sin precio, debajo del costo o con un operador de otro tenant.
CREATE OR REPLACE FUNCTION public.assert_quotation_structure_valid(
  p_quotation_id UUID,
  p_org_id UUID,
  p_currency TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_quotation_id IS NULL OR p_org_id IS NULL OR p_currency NOT IN ('ARS', 'USD') THEN
    RAISE EXCEPTION 'invalid quotation structure scope' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quotation_options WHERE quotation_id = p_quotation_id
  ) OR EXISTS (
    SELECT 1
    FROM public.quotation_options option
    WHERE option.quotation_id = p_quotation_id
      AND (
        COALESCE(option.total_amount, 0) <= 0
        OR NOT EXISTS (
          SELECT 1 FROM public.quotation_items item
          WHERE item.quotation_id = p_quotation_id AND item.option_id = option.id
        )
        OR (
          option.manual_total_amount IS NOT NULL
          AND round(option.total_amount, 2) IS DISTINCT FROM round(option.manual_total_amount, 2)
        )
        OR (
          option.manual_total_amount IS NULL
          AND option.calculated_total_amount IS NOT NULL
          AND round(option.total_amount, 2) IS DISTINCT FROM round(option.calculated_total_amount, 2)
        )
        OR (
          option.calculated_total_amount IS NOT NULL
          AND round(option.calculated_total_amount, 2) IS DISTINCT FROM (
            SELECT round(COALESCE(sum(
              COALESCE(item.sale_amount, item.unit_price, 0) * COALESCE(item.quantity, 1)
            ), 0), 2)
            FROM public.quotation_items item
            WHERE item.quotation_id = p_quotation_id AND item.option_id = option.id
          )
        )
        OR round(option.total_amount, 2) < (
          SELECT round(COALESCE(sum(
            public.quotation_item_effective_unit_cost(
              item.cost_amount,
              item.cost_calculation_mode,
              item.gross_price,
              item.commission_percentage,
              item.admin_fee_percentage
            ) * COALESCE(item.quantity, 1)
          ), 0), 2)
          FROM public.quotation_items item
          WHERE item.quotation_id = p_quotation_id AND item.option_id = option.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'quotation options require a positive total not below cost'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotations quotation
    LEFT JOIN LATERAL (
      SELECT option.total_amount
      FROM public.quotation_options option
      WHERE option.quotation_id = quotation.id
      ORDER BY option.option_number
      LIMIT 1
    ) first_option ON TRUE
    WHERE quotation.id = p_quotation_id
      AND (
        quotation.org_id IS DISTINCT FROM p_org_id
        OR quotation.currency IS DISTINCT FROM p_currency
        OR first_option.total_amount IS NULL
        OR round(quotation.total_amount, 2) IS DISTINCT FROM round(first_option.total_amount, 2)
        OR round(quotation.subtotal, 2) IS DISTINCT FROM round(first_option.total_amount, 2)
      )
  ) THEN
    RAISE EXCEPTION 'quotation header total does not match its first option'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotation_items item
    WHERE item.quotation_id = p_quotation_id
      AND (
        item.option_id IS NULL
        OR item.org_id IS DISTINCT FROM p_org_id
        OR COALESCE(item.quantity, 1) <= 0
        OR COALESCE(item.sale_amount, item.unit_price, 0) < 0
        OR COALESCE(item.cost_amount, 0) < 0
        OR COALESCE(item.cost_calculation_mode, '') NOT IN ('SIMPLE', 'COMMISSIONABLE')
        OR COALESCE(item.admin_fee_percentage, -1) NOT BETWEEN 0 AND 100
        OR COALESCE(item.commission_percentage, -1) NOT BETWEEN 0 AND 100
        OR (
          item.cost_calculation_mode = 'COMMISSIONABLE'
          AND COALESCE(item.gross_price, 0) <= 0
        )
        OR public.quotation_item_effective_unit_cost(
          item.cost_amount,
          item.cost_calculation_mode,
          item.gross_price,
          item.commission_percentage,
          item.admin_fee_percentage
        ) < 0
        OR item.currency IS DISTINCT FROM p_currency
        OR COALESCE(item.cost_currency, item.currency) IS DISTINCT FROM p_currency
      )
  ) THEN
    RAISE EXCEPTION 'quotation items have invalid amount, quantity, currency or scope'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotation_items item
    JOIN public.quotations quotation ON quotation.id = item.quotation_id
    LEFT JOIN public.operators operator ON operator.id = item.operator_id
    WHERE item.quotation_id = p_quotation_id
      AND item.operator_id IS NOT NULL
      AND (
        operator.id IS NULL
        OR operator.org_id IS DISTINCT FROM p_org_id
        OR (
          operator.agency_id IS NOT NULL
          AND operator.agency_id IS DISTINCT FROM quotation.agency_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'quotation item operator scope mismatch' USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_quotation_structure_valid(UUID, UUID, TEXT)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.assert_quotation_structure_valid(UUID, UUID, TEXT)
  TO service_role;

-- Edición completa con CAS: encabezado, opciones e ítems pertenecen siempre a
-- la misma versión. La API valida permisos dinámicos y esta función vuelve a
-- fijar organización, agencia, actor, estado y contrato del payload.
CREATE OR REPLACE FUNCTION public.update_quotation_with_structure(
  p_quotation_id UUID,
  p_org_id UUID,
  p_agency_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_header JSONB,
  p_options JSONB,
  p_items JSONB,
  p_actor_id UUID
)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_next public.quotations%ROWTYPE;
  v_actor UUID;
  v_selected_option_number INTEGER;
  v_first_total NUMERIC;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IS NULL OR p_agency_id IS NULL
    OR jsonb_typeof(p_header) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_options) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_options) = 0
  THEN
    RAISE EXCEPTION 'invalid atomic quotation update payload' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_header) AS header_key
    WHERE header_key NOT IN (
      'destination', 'origin', 'region', 'departure_date', 'return_date',
      'valid_until', 'adults', 'children', 'infants', 'currency',
      'package_description', 'notes', 'internal_notes',
      'terms_and_conditions', 'subtotal', 'total_amount', 'pricing_mode',
      'payment_methods', 'presentation_content',
      'presentation_schema_version', 'public_token'
    )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_options) row_value
    WHERE row_value->>'quotation_id' IS DISTINCT FROM p_quotation_id::TEXT
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) row_value
    WHERE row_value->>'quotation_id' IS DISTINCT FROM p_quotation_id::TEXT
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item_value
    WHERE item_value->>'option_id' IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_options) option_value
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
    RAISE EXCEPTION 'invalid atomic quotation update structure' USING ERRCODE = '22023';
  END IF;

  -- Orden compartido por todos los writers de cotización: children -> parent.
  PERFORM id FROM public.quotation_items
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;
  PERFORM id FROM public.quotation_options
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;
  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quotation_id
    AND org_id = p_org_id
    AND agency_id = p_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation not found in expected scope' USING ERRCODE = 'P0002';
  END IF;
  IF v_quote.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'quotation changed during atomic update' USING ERRCODE = '40001';
  END IF;
  IF v_quote.status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'quotation status does not allow content changes'
      USING ERRCODE = '55000';
  END IF;

  SELECT id INTO v_actor
  FROM public.users
  WHERE id = p_actor_id
    AND org_id = p_org_id
    AND is_active = true
  LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'actor does not belong to quotation org'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) item_value
    WHERE item_value->>'org_id' IS DISTINCT FROM p_org_id::TEXT
  ) THEN
    RAISE EXCEPTION 'quotation item org does not match quotation'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_next
  FROM jsonb_populate_record(
    NULL::public.quotations,
    to_jsonb(v_quote) || p_header
  );

  SELECT option_number INTO v_selected_option_number
  FROM public.quotation_options
  WHERE quotation_id = p_quotation_id AND is_selected IS TRUE
  ORDER BY option_number
  LIMIT 1;

  DELETE FROM public.quotation_items WHERE quotation_id = p_quotation_id;
  DELETE FROM public.quotation_options WHERE quotation_id = p_quotation_id;

  INSERT INTO public.quotation_options
  SELECT * FROM jsonb_populate_recordset(NULL::public.quotation_options, p_options);

  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.quotation_items
    SELECT * FROM jsonb_populate_recordset(NULL::public.quotation_items, p_items);
  END IF;

  IF v_selected_option_number IS NOT NULL THEN
    UPDATE public.quotation_options
    SET is_selected = TRUE
    WHERE quotation_id = p_quotation_id
      AND option_number = v_selected_option_number;
  END IF;

  SELECT total_amount INTO v_first_total
  FROM public.quotation_options
  WHERE quotation_id = p_quotation_id
  ORDER BY option_number
  LIMIT 1;

  UPDATE public.quotations
  SET destination = v_next.destination,
      origin = v_next.origin,
      region = v_next.region,
      departure_date = v_next.departure_date,
      return_date = v_next.return_date,
      valid_until = v_next.valid_until,
      adults = v_next.adults,
      children = v_next.children,
      infants = v_next.infants,
      currency = v_next.currency,
      package_description = v_next.package_description,
      notes = v_next.notes,
      internal_notes = v_next.internal_notes,
      terms_and_conditions = v_next.terms_and_conditions,
      subtotal = v_first_total,
      total_amount = v_first_total,
      pricing_mode = v_next.pricing_mode,
      payment_methods = v_next.payment_methods,
      presentation_content = v_next.presentation_content,
      presentation_schema_version = v_next.presentation_schema_version,
      public_token = v_next.public_token,
      active_document_id = NULL,
      updated_at = clock_timestamp()
  WHERE id = p_quotation_id
  RETURNING * INTO v_quote;

  PERFORM public.assert_quotation_structure_valid(
    p_quotation_id,
    p_org_id,
    v_quote.currency
  );

  RETURN v_quote;
END;
$$;

REVOKE ALL ON FUNCTION public.update_quotation_with_structure(
  UUID, UUID, UUID, TIMESTAMPTZ, JSONB, JSONB, JSONB, UUID
) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_quotation_with_structure(
  UUID, UUID, UUID, TIMESTAMPTZ, JSONB, JSONB, JSONB, UUID
) TO service_role;

-- Alta completa con numeración serializada por tenant. No existe encabezado
-- huérfano ni rollback compensatorio: cualquier opción/ítem inválido aborta.
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
    OR char_length(btrim(COALESCE(v_input.public_token, ''))) = 0
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

-- Edición sólo de encabezado con CAS; también revalida la estructura porque un
-- cambio de moneda puede volver incompatibles sus ítems.
CREATE OR REPLACE FUNCTION public.update_quotation_header(
  p_quotation_id UUID,
  p_org_id UUID,
  p_agency_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_header JSONB,
  p_actor_id UUID
)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_next public.quotations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_header) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_header) AS header_key
    WHERE header_key NOT IN (
      'destination', 'origin', 'region', 'departure_date', 'return_date',
      'valid_until', 'adults', 'children', 'infants', 'currency',
      'package_description', 'notes', 'internal_notes', 'terms_and_conditions',
      'subtotal', 'total_amount', 'pricing_mode', 'payment_methods',
      'presentation_content', 'presentation_schema_version', 'public_token'
    )
  ) THEN
    RAISE EXCEPTION 'invalid atomic quotation header payload' USING ERRCODE = '22023';
  END IF;

  PERFORM id FROM public.quotation_items
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;
  PERFORM id FROM public.quotation_options
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;
  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quotation_id AND org_id = p_org_id AND agency_id = p_agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation not found in expected scope' USING ERRCODE = 'P0002';
  END IF;
  IF v_quote.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'quotation changed during header update' USING ERRCODE = '40001';
  END IF;
  IF v_quote.status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'quotation status does not allow content changes' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_actor_id AND org_id = p_org_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'actor does not belong to quotation org' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_next
  FROM jsonb_populate_record(NULL::public.quotations, to_jsonb(v_quote) || p_header);

  UPDATE public.quotations
  SET destination = v_next.destination,
      origin = v_next.origin,
      region = v_next.region,
      departure_date = v_next.departure_date,
      return_date = v_next.return_date,
      valid_until = v_next.valid_until,
      adults = v_next.adults,
      children = v_next.children,
      infants = v_next.infants,
      currency = v_next.currency,
      package_description = v_next.package_description,
      notes = v_next.notes,
      internal_notes = v_next.internal_notes,
      terms_and_conditions = v_next.terms_and_conditions,
      pricing_mode = v_next.pricing_mode,
      payment_methods = v_next.payment_methods,
      presentation_content = v_next.presentation_content,
      presentation_schema_version = v_next.presentation_schema_version,
      public_token = v_next.public_token,
      active_document_id = NULL,
      updated_at = clock_timestamp()
  WHERE id = p_quotation_id
  RETURNING * INTO v_quote;

  PERFORM public.assert_quotation_structure_valid(p_quotation_id, p_org_id, v_quote.currency);
  RETURN v_quote;
END;
$$;

REVOKE ALL ON FUNCTION public.update_quotation_header(
  UUID, UUID, UUID, TIMESTAMPTZ, JSONB, UUID
) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_quotation_header(
  UUID, UUID, UUID, TIMESTAMPTZ, JSONB, UUID
) TO service_role;

-- ---------------------------------------------------------------------------
-- Invariantes compartidos de org/agencia/modelo/revisión/documento.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_quotation_document_model_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.agency_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.agencies a
    WHERE a.id = NEW.agency_id AND a.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'quotation document model agency does not belong to org'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_quotation_document_revision_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_model public.quotation_document_models%ROWTYPE;
BEGIN
  SELECT * INTO v_model
  FROM public.quotation_document_models
  WHERE id = NEW.model_id;

  IF NOT FOUND
    OR v_model.org_id IS DISTINCT FROM NEW.org_id
    OR v_model.agency_id IS DISTINCT FROM NEW.agency_id
    OR v_model.document_kind <> 'quotation'
  THEN
    RAISE EXCEPTION 'quotation document revision scope does not match its model'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_quotation_document_binding_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_revision public.quotation_document_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_revision
  FROM public.quotation_document_revisions
  WHERE id = NEW.revision_id;

  IF NOT FOUND
    OR v_revision.status <> 'PUBLISHED'
    OR v_revision.org_id IS DISTINCT FROM NEW.org_id
    OR v_revision.agency_id IS DISTINCT FROM NEW.agency_id
  THEN
    RAISE EXCEPTION 'quotation document binding must reference a published revision in the same scope'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_issued_quotation_document_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote RECORD;
  v_revision RECORD;
BEGIN
  SELECT org_id, agency_id INTO v_quote
  FROM public.quotations
  WHERE id = NEW.quotation_id;

  IF NOT FOUND
    OR v_quote.org_id IS DISTINCT FROM NEW.org_id
    OR v_quote.agency_id IS DISTINCT FROM NEW.agency_id
  THEN
    RAISE EXCEPTION 'issued quotation document scope does not match quotation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.revision_id IS NOT NULL THEN
    SELECT org_id, agency_id, status INTO v_revision
    FROM public.quotation_document_revisions
    WHERE id = NEW.revision_id;

    IF NOT FOUND
      OR v_revision.org_id IS DISTINCT FROM NEW.org_id
      OR (v_revision.agency_id IS NOT NULL AND v_revision.agency_id IS DISTINCT FROM NEW.agency_id)
      OR v_revision.status NOT IN ('PUBLISHED', 'ARCHIVED')
    THEN
      RAISE EXCEPTION 'issued quotation document revision is outside quotation scope'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_published_quotation_document_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'published quotation document revisions are immutable'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
    IF OLD.status = 'PUBLISHED'
      AND NEW.status = 'ARCHIVED'
      AND (to_jsonb(NEW) - ARRAY['status', 'updated_at']::TEXT[])
        = (to_jsonb(OLD) - ARRAY['status', 'updated_at']::TEXT[])
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'published quotation document revisions are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_issued_quotation_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'issued quotation documents are immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_quotation_document_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_document_models_scope ON public.quotation_document_models;
CREATE TRIGGER trg_quotation_document_models_scope
  BEFORE INSERT OR UPDATE OF org_id, agency_id
  ON public.quotation_document_models
  FOR EACH ROW EXECUTE FUNCTION public.validate_quotation_document_model_scope();

DROP TRIGGER IF EXISTS trg_quotation_document_revisions_scope ON public.quotation_document_revisions;
CREATE TRIGGER trg_quotation_document_revisions_scope
  BEFORE INSERT OR UPDATE OF model_id, org_id, agency_id
  ON public.quotation_document_revisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_quotation_document_revision_scope();

DROP TRIGGER IF EXISTS trg_quotation_document_revisions_immutable ON public.quotation_document_revisions;
CREATE TRIGGER trg_quotation_document_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.quotation_document_revisions
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_quotation_document_revision();

DROP TRIGGER IF EXISTS trg_quotation_document_bindings_scope ON public.quotation_document_bindings;
CREATE TRIGGER trg_quotation_document_bindings_scope
  BEFORE INSERT OR UPDATE ON public.quotation_document_bindings
  FOR EACH ROW EXECUTE FUNCTION public.validate_quotation_document_binding_scope();

DROP TRIGGER IF EXISTS trg_issued_quotation_documents_scope ON public.issued_quotation_documents;
CREATE TRIGGER trg_issued_quotation_documents_scope
  BEFORE INSERT OR UPDATE OF org_id, agency_id, quotation_id, revision_id
  ON public.issued_quotation_documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_issued_quotation_document_scope();

DROP TRIGGER IF EXISTS trg_issued_quotation_documents_immutable ON public.issued_quotation_documents;
CREATE TRIGGER trg_issued_quotation_documents_immutable
  BEFORE UPDATE OR DELETE ON public.issued_quotation_documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_quotation_document();

DROP TRIGGER IF EXISTS trg_quotation_document_models_updated_at ON public.quotation_document_models;
CREATE TRIGGER trg_quotation_document_models_updated_at
  BEFORE UPDATE ON public.quotation_document_models
  FOR EACH ROW EXECUTE FUNCTION public.set_quotation_document_updated_at();

DROP TRIGGER IF EXISTS trg_quotation_document_revisions_updated_at ON public.quotation_document_revisions;
CREATE TRIGGER trg_quotation_document_revisions_updated_at
  BEFORE UPDATE ON public.quotation_document_revisions
  FOR EACH ROW EXECUTE FUNCTION public.set_quotation_document_updated_at();

DROP TRIGGER IF EXISTS trg_quotation_document_bindings_updated_at ON public.quotation_document_bindings;
CREATE TRIGGER trg_quotation_document_bindings_updated_at
  BEFORE UPDATE ON public.quotation_document_bindings
  FOR EACH ROW EXECUTE FUNCTION public.set_quotation_document_updated_at();

-- Guardado atómico del modelo y su único borrador. El advisory lock serializa
-- tanto la creación inicial como los guardados concurrentes del mismo scope.
CREATE OR REPLACE FUNCTION public.save_quotation_document_model_draft(
  p_org_id UUID,
  p_agency_id UUID,
  p_model_id UUID,
  p_name TEXT,
  p_manifest JSONB,
  p_layout_key TEXT,
  p_layout_version INTEGER,
  p_schema_version SMALLINT,
  p_created_by UUID,
  p_expected_revision_id UUID,
  p_expected_revision_updated_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_model public.quotation_document_models%ROWTYPE;
  v_revision public.quotation_document_revisions%ROWTYPE;
  v_user_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IS NULL OR p_agency_id IS NULL THEN
    RAISE EXCEPTION 'quotation document model requires an organization and agency'
      USING ERRCODE = '22023';
  END IF;
  IF (p_expected_revision_id IS NULL) IS DISTINCT FROM
     (p_expected_revision_updated_at IS NULL) THEN
    RAISE EXCEPTION 'expected revision id and timestamp must be provided together'
      USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'invalid quotation document model name' USING ERRCODE = '22023';
  END IF;
  IF p_manifest IS NULL OR jsonb_typeof(p_manifest) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'quotation document manifest must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_layout_key IS NULL OR p_layout_key !~ '^[a-z0-9][a-z0-9-]{2,80}$'
    OR p_layout_version IS NULL OR p_layout_version <= 0
    OR p_schema_version IS NULL OR p_schema_version <= 0 THEN
    RAISE EXCEPTION 'invalid quotation document manifest metadata' USING ERRCODE = '22023';
  END IF;
  IF p_manifest->>'documentKind' IS DISTINCT FROM 'quotation'
    OR p_manifest->>'layoutKey' IS DISTINCT FROM p_layout_key
    OR p_manifest->>'layoutVersion' IS DISTINCT FROM p_layout_version::TEXT
    OR p_manifest->>'schemaVersion' IS DISTINCT FROM p_schema_version::TEXT THEN
    RAISE EXCEPTION 'quotation document manifest metadata does not match its payload'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_user_id
  FROM public.users
  WHERE id = p_created_by
    AND org_id = p_org_id
    AND is_active = true
  LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'author does not belong to quotation document org'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agencies
    WHERE id = p_agency_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'agency does not belong to quotation document org'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_org_id::TEXT || ':' || p_agency_id::TEXT || ':quotation-authoring', 0)
  );

  IF p_model_id IS NOT NULL THEN
    SELECT * INTO v_model
    FROM public.quotation_document_models
    WHERE id = p_model_id
      AND org_id = p_org_id
      AND agency_id = p_agency_id
      AND document_kind = 'quotation'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation document model not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.quotation_document_models
    SET name = btrim(p_name)
    WHERE id = v_model.id
    RETURNING * INTO v_model;
  ELSE
    SELECT * INTO v_model
    FROM public.quotation_document_models
    WHERE org_id = p_org_id
      AND agency_id = p_agency_id
      AND document_kind = 'quotation'
      AND key = 'main-quotation'
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.quotation_document_models
      SET name = btrim(p_name)
      WHERE id = v_model.id
      RETURNING * INTO v_model;
    ELSE
      INSERT INTO public.quotation_document_models (
        org_id, agency_id, key, name, document_kind, created_by
      ) VALUES (
        p_org_id, p_agency_id, 'main-quotation', btrim(p_name), 'quotation', v_user_id
      )
      RETURNING * INTO v_model;
    END IF;
  END IF;

  SELECT * INTO v_revision
  FROM public.quotation_document_revisions
  WHERE model_id = v_model.id
    AND status = 'DRAFT'
  ORDER BY revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_revision.id IS DISTINCT FROM p_expected_revision_id
      OR v_revision.updated_at IS DISTINCT FROM p_expected_revision_updated_at
    THEN
      RAISE EXCEPTION 'quotation document draft changed in another session'
        USING ERRCODE = '40001';
    END IF;
    UPDATE public.quotation_document_revisions
    SET layout_key = p_layout_key,
        layout_version = p_layout_version,
        schema_version = p_schema_version,
        manifest = p_manifest,
        manifest_checksum = encode(digest(p_manifest::TEXT, 'sha256'), 'hex')
    WHERE id = v_revision.id
      AND status = 'DRAFT'
    RETURNING * INTO v_revision;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.quotation_document_revisions
      WHERE model_id = v_model.id
    ) THEN
      IF p_expected_revision_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.quotation_document_revisions expected
        WHERE expected.id = p_expected_revision_id
          AND expected.model_id = v_model.id
          AND expected.updated_at IS NOT DISTINCT FROM p_expected_revision_updated_at
      ) THEN
        RAISE EXCEPTION 'quotation document source revision changed in another session'
          USING ERRCODE = '40001';
      END IF;
    ELSIF p_expected_revision_id IS NOT NULL THEN
      RAISE EXCEPTION 'unexpected quotation document source revision'
        USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.quotation_document_revisions (
      model_id, org_id, agency_id, revision_number, status,
      layout_key, layout_version, schema_version, manifest,
      manifest_checksum, created_by
    ) VALUES (
      v_model.id, p_org_id, p_agency_id,
      COALESCE((
        SELECT MAX(revision_number)
        FROM public.quotation_document_revisions
        WHERE model_id = v_model.id
      ), 0) + 1,
      'DRAFT', p_layout_key, p_layout_version, p_schema_version,
      p_manifest, encode(digest(p_manifest::TEXT, 'sha256'), 'hex'), v_user_id
    )
    RETURNING * INTO v_revision;
  END IF;

  RETURN jsonb_build_object(
    'model', to_jsonb(v_model),
    'revision', to_jsonb(v_revision)
  );
END;
$$;

-- Publicación atómica: revision + binding del scope en una transacción.
CREATE OR REPLACE FUNCTION public.publish_quotation_document_revision(
  p_revision_id UUID,
  p_published_by UUID,
  p_expected_revision_updated_at TIMESTAMPTZ
)
RETURNS public.quotation_document_revisions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_revision public.quotation_document_revisions%ROWTYPE;
  v_user_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_revision
  FROM public.quotation_document_revisions
  WHERE id = p_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation document revision not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_revision.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'only draft revisions can be published' USING ERRCODE = '55000';
  END IF;
  IF v_revision.updated_at IS DISTINCT FROM p_expected_revision_updated_at THEN
    RAISE EXCEPTION 'quotation document draft changed before publish'
      USING ERRCODE = '40001';
  END IF;
  SELECT id INTO v_user_id
  FROM public.users
  WHERE id = p_published_by
    AND org_id = v_revision.org_id
    AND is_active = true
  LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'publisher does not belong to quotation document org'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_revision.org_id::TEXT || ':' || COALESCE(v_revision.agency_id::TEXT, 'ORG') || ':quotation',
      0
    )
  );

  UPDATE public.quotation_document_revisions
  SET status = 'PUBLISHED', published_at = now(), published_by = v_user_id
  WHERE id = p_revision_id
  RETURNING * INTO v_revision;

  DELETE FROM public.quotation_document_bindings
  WHERE org_id = v_revision.org_id
    AND agency_id IS NOT DISTINCT FROM v_revision.agency_id
    AND document_kind = 'quotation';

  INSERT INTO public.quotation_document_bindings (
    org_id, agency_id, document_kind, revision_id, created_by
  ) VALUES (
    v_revision.org_id, v_revision.agency_id, 'quotation', v_revision.id, v_user_id
  );

  RETURN v_revision;
END;
$$;

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
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE quotation_id = p_quotation_id AND operator_id IS NULL
  ) THEN
    RAISE EXCEPTION 'every issued quotation item requires an operator'
      USING ERRCODE = '22023';
  END IF;

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

-- Precio, adicionales y contenido visible se guardan juntos. La ruta valida
-- permisos dinámicos; la función vuelve a validar actor, scope, estado y costo.
DROP FUNCTION IF EXISTS public.prepare_quotation_document_content(
  UUID, TIMESTAMPTZ, JSONB, NUMERIC, NUMERIC, JSONB, SMALLINT, UUID
);
CREATE OR REPLACE FUNCTION public.prepare_quotation_document_content(
  p_quotation_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_prices JSONB,
  p_insurance_amount NUMERIC,
  p_transfer_amount NUMERIC,
  p_presentation_content JSONB,
  p_presentation_schema_version SMALLINT,
  p_actor_id UUID,
  p_item_operators JSONB DEFAULT '[]'::JSONB
)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_option public.quotation_options%ROWTYPE;
  v_entry JSONB;
  v_option_id UUID;
  v_manual NUMERIC;
  v_calculated NUMERIC;
  v_effective NUMERIC;
  v_cost NUMERIC;
  v_first_total NUMERIC;
  v_actor UUID;
  v_item_operator JSONB;
  v_item_id UUID;
  v_operator_id UUID;
  v_item public.quotation_items%ROWTYPE;
  v_operator public.operators%ROWTYPE;
  v_default_cost_mode TEXT;
  v_default_commission NUMERIC;
  v_cost_mode TEXT;
  v_commission NUMERIC;
  v_admin_fee NUMERIC;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_prices) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_item_operators) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_presentation_content) IS DISTINCT FROM 'object'
    OR p_insurance_amount IS NULL
    OR p_insurance_amount < 0
    OR p_transfer_amount IS NULL
    OR p_transfer_amount < 0
    OR p_presentation_schema_version IS NULL
    OR p_presentation_schema_version <= 0
  THEN
    RAISE EXCEPTION 'invalid quotation document content' USING ERRCODE = '22023';
  END IF;

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
  IF v_quote.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'quotation changed while editing document content' USING ERRCODE = '40001';
  END IF;
  IF v_quote.status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'quotation status does not allow document changes' USING ERRCODE = '55000';
  END IF;

  SELECT id INTO v_actor
  FROM public.users
  WHERE id = p_actor_id AND org_id = v_quote.org_id AND is_active = true
  LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'actor does not belong to quotation org' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_item_operators) entry(value)
    WHERE jsonb_typeof(entry.value) IS DISTINCT FROM 'object'
      OR jsonb_typeof(entry.value->'item_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(entry.value->'operator_id') IS DISTINCT FROM 'string'
      OR COALESCE(entry.value->>'item_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR COALESCE(entry.value->>'operator_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) OR jsonb_array_length(p_item_operators) <> (
    SELECT count(DISTINCT entry.value->>'item_id')
    FROM jsonb_array_elements(p_item_operators) entry(value)
  ) THEN
    RAISE EXCEPTION 'item operator assignments are invalid'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item_operator IN
    SELECT value FROM jsonb_array_elements(p_item_operators) entry(value)
  LOOP
    v_item_id := (v_item_operator->>'item_id')::UUID;
    v_operator_id := (v_item_operator->>'operator_id')::UUID;

    SELECT * INTO v_item
      FROM public.quotation_items
      WHERE id = v_item_id
        AND quotation_id = p_quotation_id
        AND org_id = v_quote.org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation item operator assignment scope mismatch'
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_operator
    FROM public.operators
    WHERE id = v_operator_id
      AND org_id = v_quote.org_id
      AND (agency_id IS NULL OR agency_id = v_quote.agency_id)
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation operator assignment scope mismatch'
        USING ERRCODE = '23514';
    END IF;

    -- Volver a abrir el editor no puede alterar un costo ya congelado porque
    -- cambió la ficha del mismo operador. Sólo se toma un snapshot nuevo en la
    -- primera asignación o cuando el usuario reemplaza al operador.
    IF v_item.operator_id IS NOT DISTINCT FROM v_operator_id THEN
      v_cost_mode := v_item.cost_calculation_mode;
      v_commission := v_item.commission_percentage;
      v_admin_fee := v_item.admin_fee_percentage;
    ELSE
      v_default_cost_mode := NULL;
      v_default_commission := NULL;
      SELECT default_cost_calculation_mode, default_commission_percentage
      INTO v_default_cost_mode, v_default_commission
      FROM public.financial_settings
      WHERE agency_id = v_quote.agency_id
        AND org_id = v_quote.org_id
      FOR SHARE;

      v_cost_mode := COALESCE(
        v_operator.cost_calculation_mode,
        v_default_cost_mode,
        'SIMPLE'
      );
      v_commission := CASE
        WHEN COALESCE(v_operator.commission_percentage, 0) > 0
          THEN v_operator.commission_percentage
        ELSE COALESCE(v_default_commission, 0)
      END;
      v_admin_fee := COALESCE(v_operator.admin_fee_percentage, 0);
    END IF;

    IF v_cost_mode NOT IN ('SIMPLE', 'COMMISSIONABLE')
      OR v_commission NOT BETWEEN 0 AND 100
      OR v_admin_fee NOT BETWEEN 0 AND 100
    THEN
      RAISE EXCEPTION 'quotation operator cost configuration is invalid'
        USING ERRCODE = '23514';
    END IF;
    IF (
      v_cost_mode = 'SIMPLE'
      AND COALESCE(v_item.cost_amount, 0) <= 0
    ) OR (
      v_cost_mode = 'COMMISSIONABLE'
      AND COALESCE(v_item.gross_price, 0) <= 0
    ) THEN
      RAISE EXCEPTION 'quotation item is missing its provider cost base'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.quotation_items
    SET operator_id = v_operator_id,
        cost_calculation_mode = v_cost_mode,
        commission_percentage = v_commission,
        admin_fee_percentage = v_admin_fee
    WHERE id = v_item_id
      AND quotation_id = p_quotation_id
      AND org_id = v_quote.org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation item changed while assigning operator'
        USING ERRCODE = '40001';
    END IF;
  END LOOP;

  IF jsonb_array_length(p_prices) <> (
    SELECT count(*) FROM public.quotation_options WHERE quotation_id = p_quotation_id
  ) OR jsonb_array_length(p_prices) <> (
    SELECT count(DISTINCT value->>'option_id') FROM jsonb_array_elements(p_prices)
  ) THEN
    RAISE EXCEPTION 'price set does not match quotation options' USING ERRCODE = '40001';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_prices)
  LOOP
    v_option_id := (v_entry->>'option_id')::UUID;
    SELECT * INTO v_option
    FROM public.quotation_options
    WHERE id = v_option_id AND quotation_id = p_quotation_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation option not found' USING ERRCODE = '40001';
    END IF;

    v_manual := CASE
      WHEN v_entry->'manual_total_amount' IS NULL
        OR jsonb_typeof(v_entry->'manual_total_amount') = 'null'
      THEN NULL
      ELSE round((v_entry->>'manual_total_amount')::NUMERIC, 2)
    END;
    IF EXISTS (
      SELECT 1
      FROM public.quotation_items
      WHERE option_id = v_option_id
        AND COALESCE(currency, v_quote.currency) IS DISTINCT FROM v_quote.currency
        AND COALESCE(sale_amount, unit_price, 0) <> 0
    ) OR EXISTS (
      SELECT 1
      FROM public.quotation_items
      WHERE option_id = v_option_id
        AND COALESCE(cost_currency, currency, v_quote.currency) IS DISTINCT FROM v_quote.currency
        AND public.quotation_item_effective_unit_cost(
          cost_amount,
          cost_calculation_mode,
          gross_price,
          commission_percentage,
          admin_fee_percentage
        ) <> 0
    ) THEN
      RAISE EXCEPTION 'quotation item currency requires an explicit exchange rate before price validation'
        USING ERRCODE = '22023';
    END IF;

    SELECT
      round(COALESCE(sum(
        public.quotation_item_effective_unit_cost(
          cost_amount,
          cost_calculation_mode,
          gross_price,
          commission_percentage,
          admin_fee_percentage
        ) * COALESCE(quantity, 1)
      ), 0), 2),
      round(COALESCE(sum(COALESCE(sale_amount, unit_price, 0) * COALESCE(quantity, 1)), 0), 2)
    INTO v_cost, v_calculated
    FROM public.quotation_items
    WHERE option_id = v_option_id;
    v_calculated := COALESCE(v_calculated, 0);
    v_effective := COALESCE(v_manual, v_calculated);

    IF v_effective <= 0 OR v_effective < v_cost THEN
      RAISE EXCEPTION 'invalid option price or price below cost' USING ERRCODE = '22023';
    END IF;

    UPDATE public.quotation_options
    SET manual_total_amount = v_manual,
        calculated_total_amount = v_calculated,
        total_amount = v_effective
    WHERE id = v_option_id AND quotation_id = p_quotation_id;
  END LOOP;

  SELECT total_amount INTO v_first_total
  FROM public.quotation_options
  WHERE quotation_id = p_quotation_id
  ORDER BY option_number
  LIMIT 1;

  UPDATE public.quotations
  SET insurance_amount = round(p_insurance_amount, 2),
      transfer_amount = round(p_transfer_amount, 2),
      presentation_content = p_presentation_content,
      presentation_schema_version = p_presentation_schema_version,
      subtotal = COALESCE(v_first_total, subtotal),
      total_amount = COALESCE(v_first_total, total_amount),
      active_document_id = NULL
  WHERE id = p_quotation_id
  RETURNING * INTO v_quote;

  PERFORM public.assert_quotation_structure_valid(
    p_quotation_id,
    v_quote.org_id,
    v_quote.currency
  );

  RETURN v_quote;
END;
$$;

-- Aceptación vinculada al snapshot visible y atómica con la selección.
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
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Mismo orden de locks que prepare_quotation_document_content y que las
  -- mutaciones directas protegidas por el trigger: child -> parent.
  PERFORM id
  FROM public.quotation_items
  WHERE quotation_id = (
    SELECT id FROM public.quotations WHERE public_token = p_public_token
  )
  ORDER BY id
  FOR UPDATE;
  PERFORM id
  FROM public.quotation_options
  WHERE quotation_id = (
    SELECT id FROM public.quotations WHERE public_token = p_public_token
  )
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_quote
  FROM public.quotations
  WHERE public_token = p_public_token
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

-- Conversión financiera atómica. Para nuevas aceptaciones, el snapshot READY
-- define moneda, opción y total cliente. Durante el cutover, una cotización
-- legacy ya APPROVED puede no tener active_document_id; en ese único caso se
-- toma el total vivo ya bloqueado de la opción seleccionada y los adicionales
-- de la cotización. Los items vivos sólo aportan el detalle interno y costos,
-- y ya están congelados por las guardas anteriores. Los servicios base se
-- persisten en operation_operators (operation_services queda reservado para
-- adicionales fuera del total base). Cualquier falla aborta todo el commit.
DROP FUNCTION IF EXISTS public.convert_quotation_to_operation(
  UUID, UUID, UUID, UUID, TEXT
);
CREATE OR REPLACE FUNCTION public.convert_quotation_to_operation(
  p_quotation_id UUID,
  p_org_id UUID,
  p_agency_id UUID,
  p_actor_id UUID,
  p_file_code TEXT,
  p_commission_snapshot JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_document public.issued_quotation_documents%ROWTYPE;
  v_selected_option public.quotation_options%ROWTYPE;
  v_operation public.operations%ROWTYPE;
  v_conversion_effect public.quotation_conversion_effects%ROWTYPE;
  v_item public.quotation_items%ROWTYPE;
  v_snapshot_option JSONB;
  v_snapshot_currency TEXT;
  v_option_total NUMERIC;
  v_insurance_amount NUMERIC;
  v_transfer_amount NUMERIC;
  v_sale_total NUMERIC;
  v_total_cost NUMERIC;
  v_operator_base_total NUMERIC;
  v_item_base NUMERIC;
  v_item_sale NUMERIC;
  v_item_cost NUMERIC;
  v_allocated_sale NUMERIC := 0;
  v_selected_count INTEGER;
  v_selected_option_count INTEGER;
  v_service_family_count INTEGER;
  v_operator_item_count INTEGER;
  v_item_index INTEGER := 0;
  v_services_created INTEGER := 0;
  v_operation_type TEXT;
  v_product_type TEXT;
  v_single_service_family TEXT;
  v_item_product_type TEXT;
  v_passenger_detail JSONB;
  v_primary_operator_id UUID;
  v_customer_id UUID;
  v_conversion_date DATE;
  v_item_due_date DATE;
  v_lead_name TEXT;
  v_lead_email TEXT;
  v_lead_phone TEXT;
  v_lead_instagram TEXT;
  v_customer_first_name TEXT;
  v_customer_last_name TEXT;
  v_sale_margin NUMERIC;
  v_sale_iva NUMERIC;
  v_sale_net NUMERIC;
  v_purchase_net NUMERIC;
  v_purchase_iva NUMERIC;
  v_receivable_chart_id UUID;
  v_payable_chart_id UUID;
  v_receivable_account_id UUID;
  v_payable_account_id UUID;
  v_exchange_rate NUMERIC;
  v_operation_limit INTEGER;
  v_operations_this_month BIGINT;
  v_subscription_status TEXT;
  v_month_start TIMESTAMPTZ;
  v_legacy_source BOOLEAN := FALSE;
  v_customer_referral_partner_id UUID;
  v_customer_referral_percentage NUMERIC;
  v_referral_partner_org_id UUID;
  v_referral_partner_agency_id UUID;
  v_referral_default_percentage NUMERIC;
  v_referral_partner_active BOOLEAN;
  v_referral_percentage NUMERIC;
  v_referral_base NUMERIC;
  v_referral_amount NUMERIC;
  v_referral_commission_id UUID;
  v_financial_settings_org_id UUID;
  v_commission_base_net_of_iva BOOLEAN;
  v_commission_iva_rate NUMERIC;
  v_commission_net_from DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_quotation_id IS NULL OR p_org_id IS NULL OR p_agency_id IS NULL
    OR p_actor_id IS NULL OR char_length(btrim(COALESCE(p_file_code, ''))) NOT BETWEEN 4 AND 80
  THEN
    RAISE EXCEPTION 'invalid quotation conversion request' USING ERRCODE = '22023';
  END IF;

  -- Las cuentas CxC/CxP y la deduplicación de clientes son compartidas entre
  -- cotizaciones del mismo tenant. Fijar este lock antes de cualquier row lock
  -- evita carreras entre dos conversiones distintas y establece un único orden.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_org_id::TEXT || ':quotation-conversion', 0)
  );

  -- Lock ordering compartido por prepare/accept/update: hijos y luego padre.
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

  IF NOT FOUND
    OR v_quote.org_id IS DISTINCT FROM p_org_id
    OR v_quote.agency_id IS DISTINCT FROM p_agency_id
  THEN
    RAISE EXCEPTION 'quotation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_actor_id AND org_id = p_org_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'actor does not belong to quotation org' USING ERRCODE = '23514';
  END IF;

  -- Un retry después del commit anterior devuelve el mismo resultado. Nunca
  -- crea una segunda operación para la misma cotización.
  IF v_quote.status = 'CONVERTED' AND v_quote.operation_id IS NOT NULL THEN
    SELECT * INTO v_operation
    FROM public.operations
    WHERE id = v_quote.operation_id
      AND org_id = p_org_id
      AND agency_id = p_agency_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'converted quotation operation scope mismatch'
        USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_services_created
    FROM public.operation_operators
    WHERE operation_id = v_operation.id AND org_id = p_org_id;

    SELECT * INTO v_conversion_effect
    FROM public.quotation_conversion_effects
    WHERE operation_id = v_operation.id
      AND quotation_id = v_quote.id
      AND org_id = p_org_id
      AND agency_id = p_agency_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'converted quotation effects outbox is missing or out of scope'
        USING ERRCODE = '23514';
    END IF;

    RETURN jsonb_build_object(
      'operation_id', v_operation.id,
      'file_code', v_operation.file_code,
      'services_created', v_services_created,
      'already_converted', TRUE,
      'legacy_source', v_quote.active_document_id IS NULL,
      'effects_status', v_conversion_effect.status,
      'effects_attempts', v_conversion_effect.attempts,
      'operation', to_jsonb(v_operation)
    );
  END IF;

  IF v_quote.status IS DISTINCT FROM 'APPROVED' OR v_quote.operation_id IS NOT NULL THEN
    RAISE EXCEPTION 'quotation status does not allow conversion'
      USING ERRCODE = '55000';
  END IF;

  -- Sólo una conversión nueva necesita el snapshot: un retry CONVERTED ya
  -- devolvió arriba la fila durable original y nunca acepta configuración viva.
  IF p_commission_snapshot IS NULL
    OR jsonb_typeof(p_commission_snapshot) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'commission snapshot is required for quotation conversion'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_selected_option_count
  FROM public.quotation_options
  WHERE quotation_id = v_quote.id AND is_selected IS TRUE;
  IF v_selected_option_count <> 1 THEN
    RAISE EXCEPTION 'accepted quotation must have exactly one selected option'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_selected_option
  FROM public.quotation_options
  WHERE quotation_id = v_quote.id AND is_selected IS TRUE
  LIMIT 1;

  IF v_quote.active_document_id IS NOT NULL THEN
    SELECT * INTO v_document
    FROM public.issued_quotation_documents
    WHERE id = v_quote.active_document_id
      AND quotation_id = v_quote.id
      AND org_id = p_org_id
      AND agency_id = p_agency_id
      AND status = 'READY'
    FOR SHARE;

    IF NOT FOUND
      OR v_document.data_snapshot #>> '{identity,quotationId}' IS DISTINCT FROM v_quote.id::TEXT
      OR v_document.data_snapshot #>> '{agency,id}' IS DISTINCT FROM p_agency_id::TEXT
    THEN
      RAISE EXCEPTION 'active accepted document does not match quotation'
        USING ERRCODE = '23514';
    END IF;

    SELECT option_row.value INTO v_snapshot_option
    FROM jsonb_array_elements(
      COALESCE(v_document.data_snapshot->'options', '[]'::jsonb)
    ) option_row(value)
    WHERE option_row.value->>'id' = v_selected_option.id::TEXT
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'selected option is not part of accepted snapshot'
        USING ERRCODE = '23514';
    END IF;
    IF COALESCE(v_snapshot_option->>'totalAmount', '') !~ '^-?[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_document.data_snapshot #>> '{commercial,insuranceAmount}', '') !~ '^-?[0-9]+([.][0-9]+)?$'
      OR COALESCE(v_document.data_snapshot #>> '{commercial,transferAmount}', '') !~ '^-?[0-9]+([.][0-9]+)?$'
    THEN
      RAISE EXCEPTION 'accepted snapshot has invalid monetary values'
        USING ERRCODE = '22023';
    END IF;

    v_snapshot_currency := v_document.data_snapshot #>> '{commercial,currency}';
    v_option_total := round((v_snapshot_option->>'totalAmount')::NUMERIC, 2);
    v_insurance_amount := round((v_document.data_snapshot #>> '{commercial,insuranceAmount}')::NUMERIC, 2);
    v_transfer_amount := round((v_document.data_snapshot #>> '{commercial,transferAmount}')::NUMERIC, 2);
  ELSE
    -- Compatibilidad de cutover: sólo se alcanza después de validar APPROVED,
    -- con option/items/quotation bajo lock y exactamente una opción elegida.
    v_legacy_source := TRUE;
    v_snapshot_currency := v_quote.currency;
    v_option_total := round(COALESCE(v_selected_option.total_amount, 0), 2);
    v_insurance_amount := round(COALESCE(v_quote.insurance_amount, 0), 2);
    v_transfer_amount := round(COALESCE(v_quote.transfer_amount, 0), 2);
  END IF;

  v_sale_total := round(v_option_total + v_insurance_amount + v_transfer_amount, 2);

  IF v_snapshot_currency IS DISTINCT FROM v_quote.currency
    OR v_quote.currency NOT IN ('ARS', 'USD')
    OR v_option_total <= 0
    OR v_insurance_amount < 0
    OR v_transfer_amount < 0
    OR round(COALESCE(v_selected_option.total_amount, 0), 2) IS DISTINCT FROM v_option_total
    OR round(COALESCE(v_quote.insurance_amount, 0), 2) IS DISTINCT FROM v_insurance_amount
    OR round(COALESCE(v_quote.transfer_amount, 0), 2) IS DISTINCT FROM v_transfer_amount
  THEN
    IF v_legacy_source THEN
      RAISE EXCEPTION 'legacy accepted quotation totals are invalid'
        USING ERRCODE = '23514';
    ELSE
      RAISE EXCEPTION 'accepted snapshot totals do not match frozen quotation'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_quote.seller_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'quotation seller does not belong to org' USING ERRCODE = '23514';
  END IF;

  IF v_quote.lead_id IS NOT NULL THEN
    SELECT contact_name, contact_email, contact_phone, contact_instagram
    INTO v_lead_name, v_lead_email, v_lead_phone, v_lead_instagram
    FROM public.leads
    WHERE id = v_quote.lead_id
      AND org_id = p_org_id
      AND agency_id = p_agency_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation lead scope mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT
    count(*),
    round(COALESCE(sum(
      public.quotation_item_effective_unit_cost(
        cost_amount,
        cost_calculation_mode,
        gross_price,
        commission_percentage,
        admin_fee_percentage
      ) * COALESCE(quantity, 1)
    ), 0), 2)
  INTO v_selected_count, v_total_cost
  FROM public.quotation_items
  WHERE quotation_id = v_quote.id
    AND option_id = v_selected_option.id;

  IF v_selected_count = 0
    OR EXISTS (
      SELECT 1 FROM public.quotation_items
      WHERE quotation_id = v_quote.id AND option_id = v_selected_option.id
        AND (
          COALESCE(quantity, 1) <= 0
          OR COALESCE(sale_amount, unit_price, 0) < 0
          OR COALESCE(cost_amount, 0) < 0
          OR COALESCE(cost_calculation_mode, '') NOT IN ('SIMPLE', 'COMMISSIONABLE')
          OR COALESCE(admin_fee_percentage, -1) NOT BETWEEN 0 AND 100
          OR COALESCE(commission_percentage, -1) NOT BETWEEN 0 AND 100
          OR (
            cost_calculation_mode = 'COMMISSIONABLE'
            AND COALESCE(gross_price, 0) <= 0
          )
          OR public.quotation_item_effective_unit_cost(
            cost_amount,
            cost_calculation_mode,
            gross_price,
            commission_percentage,
            admin_fee_percentage
          ) < 0
          OR org_id IS DISTINCT FROM p_org_id
          OR (COALESCE(sale_amount, unit_price, 0) <> 0 AND currency IS DISTINCT FROM v_quote.currency)
          OR (
            public.quotation_item_effective_unit_cost(
              cost_amount,
              cost_calculation_mode,
              gross_price,
              commission_percentage,
              admin_fee_percentage
            ) <> 0
            AND COALESCE(cost_currency, currency) IS DISTINCT FROM v_quote.currency
          )
          OR operator_id IS NULL
        )
    )
    OR v_option_total < v_total_cost
  THEN
    RAISE EXCEPTION 'accepted quotation items are incomplete or below cost'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotation_items item
    LEFT JOIN public.operators operator ON operator.id = item.operator_id
    WHERE item.quotation_id = v_quote.id
      AND item.option_id = v_selected_option.id
      AND item.operator_id IS NOT NULL
      AND (
        operator.id IS NULL
        OR operator.org_id IS DISTINCT FROM p_org_id
        OR (
          operator.agency_id IS NOT NULL
          AND operator.agency_id IS DISTINCT FROM p_agency_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'quotation item operator scope mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT service_family), min(service_family)
  INTO v_service_family_count, v_single_service_family
  FROM (
    SELECT CASE
      WHEN item_type IN ('FLIGHT', 'SEAT', 'LUGGAGE') THEN 'FLIGHT'
      WHEN item_type IN ('HOTEL', 'ACCOMMODATION') THEN 'HOTEL'
      WHEN item_type = 'TRANSFER' THEN 'TRANSFER'
      WHEN item_type IN ('ASSISTANCE', 'INSURANCE') THEN 'ASSISTANCE'
      WHEN item_type IN ('EXCURSION', 'ACTIVITY') THEN 'ACTIVITY'
      ELSE 'PACKAGE'
    END AS service_family
    FROM public.quotation_items
    WHERE quotation_id = v_quote.id AND option_id = v_selected_option.id
  ) normalized_services;

  SELECT operator_id INTO v_primary_operator_id
  FROM public.quotation_items
  WHERE quotation_id = v_quote.id
    AND option_id = v_selected_option.id
    AND operator_id IS NOT NULL
  ORDER BY order_index NULLS LAST, id
  LIMIT 1;

  IF v_service_family_count = 1 THEN
    v_operation_type := v_single_service_family;
  ELSE
    v_operation_type := 'MIXED';
  END IF;
  v_product_type := CASE v_operation_type
    WHEN 'FLIGHT' THEN 'AEREO'
    WHEN 'HOTEL' THEN 'HOTEL'
    WHEN 'PACKAGE' THEN 'PAQUETE'
    ELSE 'OTRO'
  END;
  v_conversion_date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE;

  IF v_quote.departure_date IS NULL
    OR v_quote.departure_date < v_conversion_date
    OR (
      v_quote.return_date IS NOT NULL
      AND v_quote.return_date < v_quote.departure_date
    )
  THEN
    RAISE EXCEPTION 'quotation travel dates are invalid for conversion'
      USING ERRCODE = '22023';
  END IF;

  -- El check JS es sólo un fast-fail. El límite autoritativo comparte la
  -- transacción y el advisory lock por tenant con el INSERT, por lo que dos
  -- conversiones concurrentes no pueden consumir el mismo último cupo.
  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT max_operations_per_month, subscription_status
  INTO v_operation_limit, v_subscription_status
  FROM public.organizations
  WHERE id = p_org_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found for operation limit'
      USING ERRCODE = '23514';
  END IF;
  IF v_subscription_status = 'SUSPENDED' THEN
    RAISE EXCEPTION 'organization subscription suspended'
      USING ERRCODE = '42501';
  END IF;
  IF v_operation_limit IS NOT NULL THEN
    SELECT count(*) INTO v_operations_this_month
    FROM public.operations
    WHERE org_id = p_org_id
      AND created_at >= v_month_start
      AND created_at < v_month_start + interval '1 month';
    IF v_operations_this_month >= v_operation_limit THEN
      RAISE EXCEPTION 'operation monthly plan limit reached'
        USING ERRCODE = 'P0001',
          DETAIL = jsonb_build_object(
            'current', v_operations_this_month,
            'limit', v_operation_limit
          )::TEXT;
    END IF;
  END IF;

  INSERT INTO public.operations (
    org_id, agency_id, lead_id, seller_id, operator_id, type, product_type,
    origin, destination, operation_date, departure_date, return_date,
    adults, children, infants, status, sale_amount_total, operator_cost,
    currency, sale_currency, operator_cost_currency, margin_amount,
    margin_percentage, billing_margin_amount, billing_margin_percentage,
    file_code
  ) VALUES (
    p_org_id, p_agency_id, v_quote.lead_id, v_quote.seller_id,
    v_primary_operator_id, v_operation_type, v_product_type,
    v_quote.origin, v_quote.destination,
    v_conversion_date,
    v_quote.departure_date, v_quote.return_date,
    COALESCE(v_quote.adults, 1), COALESCE(v_quote.children, 0),
    COALESCE(v_quote.infants, 0), 'RESERVED', v_sale_total, v_total_cost,
    v_quote.currency, v_quote.currency, v_quote.currency,
    round(v_sale_total - v_total_cost, 2),
    CASE WHEN v_sale_total > 0
      THEN round(((v_sale_total - v_total_cost) / v_sale_total) * 100, 2)
      ELSE 0
    END,
    round(v_sale_total - v_total_cost, 2),
    CASE WHEN v_sale_total > 0
      THEN round(((v_sale_total - v_total_cost) / v_sale_total) * 100, 2)
      ELSE 0
    END,
    btrim(p_file_code)
  ) RETURNING * INTO v_operation;

  -- Las señas/cobros registrados durante la etapa de lead pasan a pertenecer a
  -- la operación en el mismo commit. El scope por tenant evita que un lead
  -- corrupto o reutilizado mueva asientos de otra organización.
  IF v_quote.lead_id IS NOT NULL THEN
    UPDATE public.ledger_movements
    SET operation_id = v_operation.id,
        lead_id = NULL
    WHERE org_id = p_org_id
      AND lead_id = v_quote.lead_id;
  END IF;

  -- operation_operators representa cada pata/servicio base del ERP. El mismo
  -- operador puede aparecer varias veces (hotel + aéreo, por ejemplo); la
  -- migración 20260515000001 eliminó deliberadamente esa unicidad.
  SELECT
    count(*) FILTER (WHERE operator_id IS NOT NULL),
    round(COALESCE(sum(
      COALESCE(sale_amount, unit_price, 0) * COALESCE(quantity, 1)
    ) FILTER (WHERE operator_id IS NOT NULL), 0), 2)
  INTO v_operator_item_count, v_operator_base_total
  FROM public.quotation_items
  WHERE quotation_id = v_quote.id AND option_id = v_selected_option.id;

  FOR v_item IN
    SELECT * FROM public.quotation_items
    WHERE quotation_id = v_quote.id
      AND option_id = v_selected_option.id
      AND operator_id IS NOT NULL
    ORDER BY order_index NULLS LAST, id
  LOOP
    v_item_index := v_item_index + 1;
    v_item_base := round(
      COALESCE(v_item.sale_amount, v_item.unit_price, 0) * COALESCE(v_item.quantity, 1),
      2
    );
    v_item_cost := round(
      public.quotation_item_effective_unit_cost(
        v_item.cost_amount,
        v_item.cost_calculation_mode,
        v_item.gross_price,
        v_item.commission_percentage,
        v_item.admin_fee_percentage
      ) * COALESCE(v_item.quantity, 1),
      2
    );

    IF v_item_index = v_operator_item_count THEN
      v_item_sale := round(v_sale_total - v_allocated_sale, 2);
    ELSIF v_operator_base_total > 0 THEN
      v_item_sale := round(
        v_sale_total * (v_item_base / v_operator_base_total),
        2
      );
    ELSE
      v_item_sale := round(v_sale_total / v_operator_item_count, 2);
    END IF;
    v_allocated_sale := round(v_allocated_sale + v_item_sale, 2);

    v_item_product_type := CASE v_item.item_type
      WHEN 'HOTEL' THEN 'HOTEL'
      WHEN 'ACCOMMODATION' THEN 'HOTEL'
      WHEN 'FLIGHT' THEN 'FLIGHT'
      WHEN 'TRANSFER' THEN 'TRANSFER'
      WHEN 'EXCURSION' THEN 'EXCURSION'
      WHEN 'ACTIVITY' THEN 'EXCURSION'
      WHEN 'ASSISTANCE' THEN 'ASSISTANCE'
      WHEN 'INSURANCE' THEN 'ASSISTANCE'
      WHEN 'VISA' THEN 'VISA'
      WHEN 'LUGGAGE' THEN 'LUGGAGE'
      WHEN 'SEAT' THEN 'SEAT'
      ELSE 'PACKAGE'
    END;
    v_passenger_detail := CASE
      WHEN v_item.item_type IN ('HOTEL', 'ACCOMMODATION') THEN
        jsonb_strip_nulls(jsonb_build_object(
          'hotel_name', v_item.hotel_name,
          'meal_plan', v_item.meal_plan,
          'room_type', v_item.room_type,
          'checkin', v_item.checkin_date,
          'checkout', v_item.checkout_date
        ))
      WHEN v_item.item_type = 'FLIGHT' THEN
        jsonb_strip_nulls(jsonb_build_object(
          'airline', v_item.airline,
          'flight_info', v_item.flight_route,
          'flight_date', v_item.flight_date
        ))
      ELSE jsonb_build_object(
        'detail', COALESCE(NULLIF(btrim(v_item.description), ''), v_item.item_type)
      )
    END;
    v_item_due_date := CASE
      WHEN v_item.item_type = 'FLIGHT' THEN v_conversion_date + 10
      WHEN v_item.item_type IN ('HOTEL', 'ACCOMMODATION')
        AND v_item.checkin_date IS NOT NULL
        THEN v_item.checkin_date - 30
      ELSE v_quote.departure_date
    END;

    INSERT INTO public.operation_operators (
      operation_id, operator_id, cost, cost_currency, product_type, notes,
      passenger_detail, payment_due_date, sale_amount, org_id
    ) VALUES (
      v_operation.id, v_item.operator_id, v_item_cost, v_quote.currency,
      v_item_product_type,
      COALESCE(NULLIF(btrim(v_item.description), ''), v_item.item_type)
        || CASE WHEN COALESCE(v_item.quantity, 1) > 1
          THEN ' x' || v_item.quantity::TEXT ELSE '' END,
      v_passenger_detail, v_item_due_date, v_item_sale, p_org_id
    );

    IF v_item_cost > 0 THEN
      INSERT INTO public.operator_payments (
        operation_id, operator_id, amount, currency, due_date, status,
        paid_amount, notes, org_id, created_by_user_id
      ) VALUES (
        v_operation.id, v_item.operator_id, v_item_cost, v_quote.currency,
        v_item_due_date, 'PENDING', 0,
        'Servicios de cotización ' || v_quote.quotation_number || ': '
          || COALESCE(NULLIF(btrim(v_item.description), ''), v_item.item_type),
        p_org_id, p_actor_id
      );
    END IF;

    v_services_created := v_services_created + 1;
  END LOOP;

  -- El IVA forma parte del mismo commit. A diferencia de la ruta legacy, una
  -- falla fiscal no queda silenciada después de haber creado la operación.
  v_sale_margin := round(v_sale_total - v_total_cost, 2);
  v_sale_iva := round(v_sale_margin * 0.21, 2);
  v_sale_net := round(v_sale_margin - v_sale_iva, 2);
  INSERT INTO public.iva_sales (
    operation_id, sale_amount_total, net_amount, iva_amount, currency,
    sale_date, iva_rate, service_type, is_exempt, org_id
  ) VALUES (
    v_operation.id, v_sale_total, v_sale_net, v_sale_iva, v_quote.currency,
    v_quote.departure_date, 0.21, 'INTERMEDIACION', FALSE, p_org_id
  );

  FOR v_item IN
    SELECT * FROM public.quotation_items
    WHERE quotation_id = v_quote.id
      AND option_id = v_selected_option.id
      AND public.quotation_item_effective_unit_cost(
        cost_amount,
        cost_calculation_mode,
        gross_price,
        commission_percentage,
        admin_fee_percentage
      ) * COALESCE(quantity, 1) > 0
    ORDER BY order_index NULLS LAST, id
  LOOP
    v_item_cost := round(
      public.quotation_item_effective_unit_cost(
        v_item.cost_amount,
        v_item.cost_calculation_mode,
        v_item.gross_price,
        v_item.commission_percentage,
        v_item.admin_fee_percentage
      ) * COALESCE(v_item.quantity, 1),
      2
    );
    v_purchase_net := round(v_item_cost / 1.21, 2);
    v_purchase_iva := round(v_item_cost - v_purchase_net, 2);
    INSERT INTO public.iva_purchases (
      operation_id, operator_id, operator_cost_total, net_amount, iva_amount,
      currency, purchase_date, iva_rate, org_id
    ) VALUES (
      v_operation.id, v_item.operator_id, v_item_cost, v_purchase_net,
      v_purchase_iva, v_quote.currency, v_quote.departure_date, 0.21, p_org_id
    );
  END LOOP;

  -- Registrar CxC/CxP cuando el tenant tiene esas cuentas configuradas, igual
  -- que el flujo normal de alta de operaciones. Si existen, cualquier error
  -- (incluida una tasa USD ausente) aborta toda la conversión.
  SELECT id INTO v_receivable_chart_id
  FROM public.chart_of_accounts
  WHERE org_id = p_org_id AND account_code = '1.1.03' AND is_active IS TRUE
  ORDER BY created_at, id
  LIMIT 1;

  SELECT id INTO v_payable_chart_id
  FROM public.chart_of_accounts
  WHERE org_id = p_org_id AND account_code = '2.1.01' AND is_active IS TRUE
  ORDER BY created_at, id
  LIMIT 1;

  IF (v_receivable_chart_id IS NOT NULL OR (v_payable_chart_id IS NOT NULL AND v_total_cost > 0))
    AND v_quote.currency = 'USD'
  THEN
    SELECT rate INTO v_exchange_rate
    FROM public.exchange_rates
    WHERE from_currency = 'USD'
      AND to_currency = 'ARS'
      AND rate_date <= v_conversion_date
    ORDER BY rate_date DESC
    LIMIT 1;
    IF v_exchange_rate IS NULL OR v_exchange_rate <= 0 THEN
      RAISE EXCEPTION 'USD exchange rate is required for quotation conversion'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    v_exchange_rate := NULL;
  END IF;

  IF v_receivable_chart_id IS NOT NULL THEN
    SELECT id INTO v_receivable_account_id
    FROM public.financial_accounts
    WHERE org_id = p_org_id
      AND chart_account_id = v_receivable_chart_id
      AND currency = v_quote.currency
      AND is_active IS TRUE
    ORDER BY created_at, id
    LIMIT 1;

    IF v_receivable_account_id IS NULL THEN
      INSERT INTO public.financial_accounts (
        name, type, currency, chart_account_id, initial_balance, is_active,
        created_by, org_id
      ) VALUES (
        'Cuentas por Cobrar', 'ASSETS', v_quote.currency,
        v_receivable_chart_id, 0, TRUE, p_actor_id, p_org_id
      ) RETURNING id INTO v_receivable_account_id;
    END IF;

    INSERT INTO public.ledger_movements (
      operation_id, type, concept, currency, amount_original, exchange_rate,
      amount_ars_equivalent, method, account_id, seller_id, operator_id,
      notes, created_by, affects_balance, org_id, movement_date
    ) VALUES (
      v_operation.id, 'INCOME', 'Venta - Operación ' || btrim(p_file_code),
      v_quote.currency, v_sale_total, v_exchange_rate,
      round(v_sale_total * COALESCE(v_exchange_rate, 1), 2), 'OTHER',
      v_receivable_account_id, v_quote.seller_id, NULL,
      'Operación creada desde cotización ' || v_quote.quotation_number,
      p_actor_id, TRUE, p_org_id, now()
    );
  END IF;

  IF v_payable_chart_id IS NOT NULL AND v_total_cost > 0 THEN
    SELECT id INTO v_payable_account_id
    FROM public.financial_accounts
    WHERE org_id = p_org_id
      AND chart_account_id = v_payable_chart_id
      AND currency = v_quote.currency
      AND is_active IS TRUE
    ORDER BY created_at, id
    LIMIT 1;

    IF v_payable_account_id IS NULL THEN
      INSERT INTO public.financial_accounts (
        name, type, currency, chart_account_id, initial_balance, is_active,
        created_by, org_id
      ) VALUES (
        'Cuentas por Pagar', 'ASSETS', v_quote.currency,
        v_payable_chart_id, 0, TRUE, p_actor_id, p_org_id
      ) RETURNING id INTO v_payable_account_id;
    END IF;

    INSERT INTO public.ledger_movements (
      operation_id, type, concept, currency, amount_original, exchange_rate,
      amount_ars_equivalent, method, account_id, seller_id, operator_id,
      notes, created_by, affects_balance, org_id, movement_date
    ) VALUES (
      v_operation.id, 'EXPENSE', 'Costo de Operadores - Operación ' || btrim(p_file_code),
      v_quote.currency, v_total_cost, v_exchange_rate,
      round(v_total_cost * COALESCE(v_exchange_rate, 1), 2), 'OTHER',
      v_payable_account_id, v_quote.seller_id, v_primary_operator_id,
      'Operación creada desde cotización ' || v_quote.quotation_number,
      p_actor_id, TRUE, p_org_id, now()
    );
  END IF;

  IF v_quote.customer_id IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE id = v_quote.customer_id
      AND org_id = p_org_id
      AND agency_id = p_agency_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation customer scope mismatch' USING ERRCODE = '23514';
    END IF;
  ELSIF v_quote.lead_id IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE org_id = p_org_id
      AND agency_id = p_agency_id
      AND (
        (v_lead_email IS NOT NULL AND email = v_lead_email)
        OR (v_lead_phone IS NOT NULL AND phone = v_lead_phone)
      )
    ORDER BY CASE WHEN v_lead_email IS NOT NULL AND email = v_lead_email THEN 0 ELSE 1 END, id
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      v_lead_name := regexp_replace(btrim(COALESCE(v_lead_name, '')), '\s+', ' ', 'g');
      v_customer_first_name := COALESCE(NULLIF(split_part(v_lead_name, ' ', 1), ''), 'Sin nombre');
      v_customer_last_name := NULLIF(btrim(substr(v_lead_name, char_length(v_customer_first_name) + 1)), '');

      INSERT INTO public.customers (
        org_id, agency_id, first_name, last_name, phone, email,
        instagram_handle, destination, created_by
      ) VALUES (
        p_org_id, p_agency_id, v_customer_first_name, v_customer_last_name,
        NULLIF(btrim(COALESCE(v_lead_phone, '')), ''),
        NULLIF(btrim(COALESCE(v_lead_email, '')), ''),
        NULLIF(btrim(COALESCE(v_lead_instagram, '')), ''),
        v_quote.destination, p_actor_id
      ) RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'quotation conversion requires a customer or lead'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.operation_customers (operation_id, customer_id, role, org_id)
  VALUES (v_operation.id, v_customer_id, 'MAIN', p_org_id);

  -- La comisión del referidor pertenece al mismo commit que la operación. Se
  -- resuelve una sola vez contra cliente/partner/config bloqueados y queda como
  -- snapshot financiero; el worker posterior procesa únicamente vendedores.
  SELECT referral_partner_id, referral_commission_percentage
  INTO v_customer_referral_partner_id, v_customer_referral_percentage
  FROM public.customers
  WHERE id = v_customer_id
    AND org_id = p_org_id
    AND agency_id = p_agency_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operation customer scope changed during conversion'
      USING ERRCODE = '40001';
  END IF;

  IF v_customer_referral_partner_id IS NOT NULL THEN
    SELECT org_id, agency_id, default_commission_percentage, active
    INTO
      v_referral_partner_org_id,
      v_referral_partner_agency_id,
      v_referral_default_percentage,
      v_referral_partner_active
    FROM public.referral_partners
    WHERE id = v_customer_referral_partner_id
    FOR SHARE;

    IF NOT FOUND
      OR v_referral_partner_org_id IS DISTINCT FROM p_org_id
      OR (
        v_referral_partner_agency_id IS NOT NULL
        AND v_referral_partner_agency_id IS DISTINCT FROM p_agency_id
      )
    THEN
      RAISE EXCEPTION 'referral partner scope mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF v_referral_partner_active IS TRUE AND v_sale_margin > 0 THEN
      v_referral_percentage := COALESCE(
        v_customer_referral_percentage,
        v_referral_default_percentage,
        0
      );
      v_referral_base := v_sale_margin;

      SELECT
        org_id,
        commission_base_net_of_iva,
        commission_iva_rate,
        commission_net_from
      INTO
        v_financial_settings_org_id,
        v_commission_base_net_of_iva,
        v_commission_iva_rate,
        v_commission_net_from
      FROM public.financial_settings
      WHERE agency_id = p_agency_id
      FOR SHARE;

      IF FOUND THEN
        IF v_financial_settings_org_id IS DISTINCT FROM p_org_id THEN
          RAISE EXCEPTION 'financial settings scope mismatch during referral calculation'
            USING ERRCODE = '23514';
        END IF;
        IF v_commission_base_net_of_iva IS TRUE
          AND v_commission_iva_rate > 0
          AND v_commission_iva_rate < 1
          AND (
            v_commission_net_from IS NULL
            OR v_conversion_date >= v_commission_net_from
          )
        THEN
          v_referral_base := round(
            v_sale_margin * (1 - v_commission_iva_rate),
            2
          );
        END IF;
      END IF;

      v_referral_amount := round(
        v_referral_base * v_referral_percentage / 100,
        2
      );
      IF v_referral_percentage > 0 AND v_referral_amount > 0 THEN
        INSERT INTO public.referral_commissions (
          org_id,
          agency_id,
          operation_id,
          referral_partner_id,
          customer_id,
          basis,
          base_amount,
          percentage,
          amount,
          currency,
          status,
          date_calculated,
          updated_at,
          percentage_mode
        ) VALUES (
          p_org_id,
          p_agency_id,
          v_operation.id,
          v_customer_referral_partner_id,
          v_customer_id,
          'MARGIN',
          round(v_referral_base, 2),
          v_referral_percentage,
          v_referral_amount,
          v_quote.currency,
          'PENDING',
          now(),
          now(),
          'AUTO'
        )
        RETURNING id INTO v_referral_commission_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.quotations
  SET status = 'CONVERTED',
      operation_id = v_operation.id,
      converted_at = now()
  WHERE id = v_quote.id AND status = 'APPROVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation changed during conversion' USING ERRCODE = '40001';
  END IF;

  IF v_quote.lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET status = 'WON'
    WHERE id = v_quote.lead_id AND org_id = p_org_id AND agency_id = p_agency_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation lead changed during conversion' USING ERRCODE = '40001';
    END IF;
  END IF;

  INSERT INTO public.quotation_conversion_effects (
    org_id,
    agency_id,
    quotation_id,
    operation_id,
    commission_snapshot,
    operation_snapshot,
    status,
    attempts
  ) VALUES (
    p_org_id,
    p_agency_id,
    v_quote.id,
    v_operation.id,
    p_commission_snapshot,
    to_jsonb(v_operation),
    'PENDING',
    0
  )
  RETURNING * INTO v_conversion_effect;

  RETURN jsonb_build_object(
    'operation_id', v_operation.id,
    'file_code', v_operation.file_code,
    'services_created', v_services_created,
    'already_converted', FALSE,
    'legacy_source', v_legacy_source,
    'referral_commission_id', v_referral_commission_id,
    'effects_status', v_conversion_effect.status,
    'effects_attempts', v_conversion_effect.attempts,
    'operation', to_jsonb(v_operation)
  );
END;
$$;

-- Reclamo atómico del post-proceso de vendedor. REVIEW se puede reclamar de
-- inmediato; PROCESSING sólo cuando venció su lease. El contador de intentos
-- funciona como fencing token para que un worker viejo no cierre uno nuevo.
CREATE OR REPLACE FUNCTION public.claim_quotation_conversion_effects(
  p_operation_id UUID,
  p_org_id UUID,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_effect public.quotation_conversion_effects%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_org_id IS NULL
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 3600
  THEN
    RAISE EXCEPTION 'invalid quotation conversion effects claim'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.quotation_conversion_effects
  SET status = 'PROCESSING',
      attempts = attempts + 1,
      lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = clock_timestamp()
  WHERE operation_id = p_operation_id
    AND org_id = p_org_id
    AND (
      status IN ('PENDING', 'REVIEW')
      OR (
        status = 'PROCESSING'
        AND lease_until <= clock_timestamp()
      )
    )
  RETURNING * INTO v_effect;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'claimed', TRUE,
      'status', v_effect.status,
      'commission_snapshot', v_effect.commission_snapshot,
      'operation_snapshot', v_effect.operation_snapshot,
      'output_snapshot', v_effect.output_snapshot,
      'attempts', v_effect.attempts,
      'effect_id', v_effect.id,
      'operation_id', v_effect.operation_id,
      'quotation_id', v_effect.quotation_id,
      'org_id', v_effect.org_id,
      'agency_id', v_effect.agency_id,
      'lease_until', v_effect.lease_until,
      'last_error', v_effect.last_error,
      'completed_at', v_effect.completed_at
    );
  END IF;

  SELECT * INTO v_effect
  FROM public.quotation_conversion_effects
  WHERE operation_id = p_operation_id
    AND org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation conversion effects not found'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'claimed', FALSE,
    'status', v_effect.status,
    'commission_snapshot', v_effect.commission_snapshot,
    'operation_snapshot', v_effect.operation_snapshot,
    'output_snapshot', v_effect.output_snapshot,
    'attempts', v_effect.attempts,
    'effect_id', v_effect.id,
    'operation_id', v_effect.operation_id,
    'quotation_id', v_effect.quotation_id,
    'org_id', v_effect.org_id,
    'agency_id', v_effect.agency_id,
    'lease_until', v_effect.lease_until,
    'last_error', v_effect.last_error,
    'completed_at', v_effect.completed_at
  );
END;
$$;

-- Recovery cross-tenant para cron. SKIP LOCKED permite varios workers sin
-- duplicar jobs; REVIEW queda fuera deliberadamente porque requiere una
-- decisión explícita antes de volver a intentarse.
CREATE OR REPLACE FUNCTION public.claim_next_quotation_conversion_effects(
  p_limit INTEGER DEFAULT 20,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_jobs JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 3600
  THEN
    RAISE EXCEPTION 'invalid quotation conversion effects batch claim'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT effect.id
    FROM public.quotation_conversion_effects effect
    WHERE effect.status = 'PENDING'
      OR (
        effect.status = 'PROCESSING'
        AND effect.lease_until <= clock_timestamp()
      )
    ORDER BY effect.created_at, effect.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.quotation_conversion_effects effect
    SET status = 'PROCESSING',
        attempts = effect.attempts + 1,
        lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
        updated_at = clock_timestamp()
    FROM candidates
    WHERE effect.id = candidates.id
      AND (
        effect.status = 'PENDING'
        OR (
          effect.status = 'PROCESSING'
          AND effect.lease_until <= clock_timestamp()
        )
      )
    RETURNING effect.*
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'claimed', TRUE,
        'status', claimed.status,
        'commission_snapshot', claimed.commission_snapshot,
        'operation_snapshot', claimed.operation_snapshot,
        'output_snapshot', claimed.output_snapshot,
        'attempts', claimed.attempts,
        'effect_id', claimed.id,
        'operation_id', claimed.operation_id,
        'quotation_id', claimed.quotation_id,
        'org_id', claimed.org_id,
        'agency_id', claimed.agency_id,
        'lease_until', claimed.lease_until,
        'last_error', claimed.last_error,
        'completed_at', claimed.completed_at
      ) ORDER BY claimed.created_at, claimed.id
    ),
    '[]'::jsonb
  )
  INTO v_jobs
  FROM claimed;

  RETURN jsonb_build_object(
    'claimed', jsonb_array_length(v_jobs),
    'jobs', v_jobs
  );
END;
$$;

-- Finalización CAS. COMPLETED aplica el plan puro entero dentro de esta misma
-- transacción; no existe una ventana donde el job figure completo con filas de
-- comisión parciales. REVIEW sólo registra el error para intervención/retry.
DROP FUNCTION IF EXISTS public.finish_quotation_conversion_effects(
  UUID, UUID, INTEGER, TEXT, TEXT
);
CREATE OR REPLACE FUNCTION public.finish_quotation_conversion_effects(
  p_operation_id UUID,
  p_org_id UUID,
  p_expected_attempt INTEGER,
  p_outcome TEXT,
  p_error TEXT DEFAULT NULL,
  p_commission_plan JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_effect public.quotation_conversion_effects%ROWTYPE;
  v_operation public.operations%ROWTYPE;
  v_entry JSONB;
  v_entry_role TEXT;
  v_entry_seller_id UUID;
  v_entry_source_seller_id UUID;
  v_entry_percentage NUMERIC;
  v_entry_amount NUMERIC;
  v_entry_count INTEGER;
  v_primary_count INTEGER := 0;
  v_secondary_count INTEGER := 0;
  v_advisor_count INTEGER := 0;
  v_primary_seller_id UUID;
  v_secondary_seller_id UUID;
  v_planned_seller_ids UUID[] := ARRAY[]::UUID[];
  v_plan_total NUMERIC;
  v_plan_sum NUMERIC := 0;
  v_pct_primary NUMERIC;
  v_pct_secondary NUMERIC;
  v_absorber_id UUID;
  v_record_id UUID;
  v_records_written INTEGER := 0;
  v_records_removed INTEGER := 0;
  v_commission_base NUMERIC;
  v_snapshot_base_enabled BOOLEAN;
  v_snapshot_base_rate NUMERIC;
  v_snapshot_base_from DATE;
  v_has_advisor_manager_commission BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_org_id IS NULL
    OR p_expected_attempt IS NULL OR p_expected_attempt <= 0
    OR p_outcome IS NULL OR p_outcome NOT IN ('COMPLETED', 'REVIEW')
    OR (
      p_outcome = 'REVIEW'
      AND char_length(btrim(COALESCE(p_error, ''))) = 0
    )
    OR (
      p_outcome = 'COMPLETED'
      AND (
        p_commission_plan IS NULL
        OR jsonb_typeof(p_commission_plan) IS DISTINCT FROM 'object'
      )
    )
  THEN
    RAISE EXCEPTION 'invalid quotation conversion effects finish'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_effect
  FROM public.quotation_conversion_effects
  WHERE operation_id = p_operation_id
    AND org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation conversion effects not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_effect.status IS DISTINCT FROM 'PROCESSING'
    OR v_effect.attempts IS DISTINCT FROM p_expected_attempt
  THEN
    IF v_effect.attempts = p_expected_attempt
      AND v_effect.status = p_outcome
    THEN
      RETURN jsonb_build_object(
        'finished', FALSE,
        'idempotent', TRUE,
        'status', v_effect.status,
        'attempts', v_effect.attempts,
        'operation_id', v_effect.operation_id,
        'completed_at', v_effect.completed_at,
        'last_error', v_effect.last_error
      );
    END IF;

    RAISE EXCEPTION 'quotation conversion effects attempt is stale'
      USING ERRCODE = '40001',
        DETAIL = jsonb_build_object(
          'expected_attempt', p_expected_attempt,
          'current_attempt', v_effect.attempts,
          'current_status', v_effect.status
        )::TEXT;
  END IF;

  IF p_outcome = 'REVIEW' THEN
    UPDATE public.quotation_conversion_effects
    SET status = 'REVIEW',
        lease_until = NULL,
        last_error = left(btrim(p_error), 4000),
        completed_at = NULL,
        output_snapshot = NULL,
        updated_at = clock_timestamp()
    WHERE id = v_effect.id
      AND status = 'PROCESSING'
      AND attempts = p_expected_attempt
    RETURNING * INTO v_effect;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'quotation conversion effects attempt is stale'
        USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
      'finished', TRUE,
      'idempotent', FALSE,
      'status', v_effect.status,
      'attempts', v_effect.attempts,
      'operation_id', v_effect.operation_id,
      'completed_at', v_effect.completed_at,
      'last_error', v_effect.last_error
    );
  END IF;

  -- Validar primero el envelope completo; ningún write financiero ocurre antes
  -- de que el plan, la operación y todas las filas existentes sean aceptables.
  IF jsonb_typeof(p_commission_plan->'entries') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_commission_plan->'entries') NOT BETWEEN 1 AND 20
    OR jsonb_typeof(p_commission_plan->'totalCommission') IS DISTINCT FROM 'number'
    OR COALESCE(p_commission_plan->>'rule', '') NOT IN (
      'SOLO', 'HALF_HALF', 'ABSORB', 'SINGLE', 'MANUAL', 'NONE'
    )
    OR jsonb_typeof(p_commission_plan->'warnings') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_commission_plan->'hasAdvisorManagerCommission')
      IS DISTINCT FROM 'boolean'
    OR COALESCE(jsonb_typeof(p_commission_plan->'pctPrimary'), 'missing')
      NOT IN ('number', 'null')
    OR COALESCE(jsonb_typeof(p_commission_plan->'pctSecondary'), 'missing')
      NOT IN ('number', 'null')
    OR COALESCE(jsonb_typeof(p_commission_plan->'absorberId'), 'missing')
      NOT IN ('string', 'null')
  THEN
    RAISE EXCEPTION 'commission plan envelope is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_entry_count := jsonb_array_length(p_commission_plan->'entries');
  v_plan_total := (p_commission_plan->>'totalCommission')::NUMERIC;
  v_has_advisor_manager_commission := (
    p_commission_plan->>'hasAdvisorManagerCommission'
  )::BOOLEAN;
  IF v_plan_total < 0 OR round(v_plan_total, 2) IS DISTINCT FROM v_plan_total THEN
    RAISE EXCEPTION 'commission plan total is invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_commission_plan->'pctPrimary') = 'number' THEN
    v_pct_primary := (p_commission_plan->>'pctPrimary')::NUMERIC;
  END IF;
  IF jsonb_typeof(p_commission_plan->'pctSecondary') = 'number' THEN
    v_pct_secondary := (p_commission_plan->>'pctSecondary')::NUMERIC;
  END IF;
  IF (v_pct_primary IS NOT NULL AND (
      v_pct_primary NOT BETWEEN 0 AND 100
      OR round(v_pct_primary, 2) IS DISTINCT FROM v_pct_primary
    )) OR (v_pct_secondary IS NOT NULL AND (
      v_pct_secondary NOT BETWEEN 0 AND 100
      OR round(v_pct_secondary, 2) IS DISTINCT FROM v_pct_secondary
    ))
  THEN
    RAISE EXCEPTION 'commission plan percentages are invalid'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_commission_plan->'absorberId') = 'string' THEN
    IF COALESCE(p_commission_plan->>'absorberId', '')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'commission plan absorber is invalid'
        USING ERRCODE = '22023';
    END IF;
    v_absorber_id := (p_commission_plan->>'absorberId')::UUID;
  END IF;
  IF (p_commission_plan->>'rule' = 'ABSORB' AND v_absorber_id IS NULL)
    OR (p_commission_plan->>'rule' <> 'ABSORB' AND v_absorber_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'commission plan absorber does not match rule'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_operation
  FROM public.operations
  WHERE id = p_operation_id
    AND org_id = p_org_id
    AND agency_id = v_effect.agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission plan operation scope mismatch'
      USING ERRCODE = '23514';
  END IF;

  -- El plan fue calculado contra este snapshot. Si alguien editó vendedores,
  -- margen o modo mientras el job esperaba, aplicar el plan viejo sería mover
  -- plata contra otra operación: va a REVIEW mediante el caller.
  IF jsonb_build_object(
      'id', v_operation.id,
      'org_id', v_operation.org_id,
      'agency_id', v_operation.agency_id,
      'seller_id', v_operation.seller_id,
      'seller_secondary_id', v_operation.seller_secondary_id,
      'margin_amount', v_operation.margin_amount,
      'operation_date', v_operation.operation_date,
      'commission_split_mode', v_operation.commission_split_mode,
      'commission_pct_primary', v_operation.commission_pct_primary,
      'commission_pct_secondary', v_operation.commission_pct_secondary
    ) IS DISTINCT FROM jsonb_build_object(
      'id', v_effect.operation_snapshot->'id',
      'org_id', v_effect.operation_snapshot->'org_id',
      'agency_id', v_effect.operation_snapshot->'agency_id',
      'seller_id', v_effect.operation_snapshot->'seller_id',
      'seller_secondary_id', v_effect.operation_snapshot->'seller_secondary_id',
      'margin_amount', v_effect.operation_snapshot->'margin_amount',
      'operation_date', v_effect.operation_snapshot->'operation_date',
      'commission_split_mode', v_effect.operation_snapshot->'commission_split_mode',
      'commission_pct_primary', v_effect.operation_snapshot->'commission_pct_primary',
      'commission_pct_secondary', v_effect.operation_snapshot->'commission_pct_secondary'
    )
  THEN
    RAISE EXCEPTION 'operation changed after commission snapshot'
      USING ERRCODE = '40001';
  END IF;

  IF jsonb_typeof(v_effect.commission_snapshot->'base_config')
      IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_effect.commission_snapshot #> '{base_config,enabled}')
      IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_effect.commission_snapshot #> '{base_config,rate}')
      IS DISTINCT FROM 'number'
    OR COALESCE(
      jsonb_typeof(v_effect.commission_snapshot #> '{base_config,from}'),
      'missing'
    ) NOT IN ('string', 'null')
  THEN
    RAISE EXCEPTION 'commission base snapshot is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_snapshot_base_enabled := (
    v_effect.commission_snapshot #>> '{base_config,enabled}'
  )::BOOLEAN;
  v_snapshot_base_rate := (
    v_effect.commission_snapshot #>> '{base_config,rate}'
  )::NUMERIC;
  IF jsonb_typeof(v_effect.commission_snapshot #> '{base_config,from}') = 'string' THEN
    IF COALESCE(v_effect.commission_snapshot #>> '{base_config,from}', '')
      !~ '^\d{4}-\d{2}-\d{2}$'
    THEN
      RAISE EXCEPTION 'commission base snapshot date is invalid'
        USING ERRCODE = '22023';
    END IF;
    v_snapshot_base_from := (
      v_effect.commission_snapshot #>> '{base_config,from}'
    )::DATE;
  END IF;
  IF v_snapshot_base_rate < 0 OR v_snapshot_base_rate >= 1 THEN
    RAISE EXCEPTION 'commission base snapshot rate is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_commission_base := round(COALESCE(v_operation.margin_amount, 0), 2);
  IF v_snapshot_base_enabled IS TRUE
    AND v_snapshot_base_rate > 0
    AND (
      v_snapshot_base_from IS NULL
      OR v_operation.operation_date >= v_snapshot_base_from
    )
  THEN
    v_commission_base := round(
      v_commission_base * (1 - v_snapshot_base_rate),
      2
    );
  END IF;

  v_primary_seller_id := v_operation.seller_id;
  v_secondary_seller_id := v_operation.seller_secondary_id;

  FOR v_entry IN
    SELECT value FROM jsonb_array_elements(p_commission_plan->'entries') entry(value)
  LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_entry->'sellerId') IS DISTINCT FROM 'string'
      OR COALESCE(v_entry->>'sellerId', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR COALESCE(v_entry->>'role', '') NOT IN (
        'PRIMARY', 'SECONDARY', 'ADVISOR_MANAGER'
      )
      OR jsonb_typeof(v_entry->'percentage') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_entry->'amount') IS DISTINCT FROM 'number'
      OR (
        v_entry ? 'sourceSellerId'
        AND jsonb_typeof(v_entry->'sourceSellerId') NOT IN ('string', 'null')
      )
    THEN
      RAISE EXCEPTION 'commission plan entry is invalid'
        USING ERRCODE = '22023';
    END IF;

    v_entry_seller_id := (v_entry->>'sellerId')::UUID;
    v_entry_role := v_entry->>'role';
    v_entry_percentage := (v_entry->>'percentage')::NUMERIC;
    v_entry_amount := (v_entry->>'amount')::NUMERIC;
    v_entry_source_seller_id := NULL;

    IF jsonb_typeof(v_entry->'sourceSellerId') = 'string' THEN
      IF COALESCE(v_entry->>'sourceSellerId', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'commission plan source seller is invalid'
          USING ERRCODE = '22023';
      END IF;
      v_entry_source_seller_id := (v_entry->>'sourceSellerId')::UUID;
    END IF;

    IF v_entry_seller_id = ANY(v_planned_seller_ids)
      OR v_entry_percentage NOT BETWEEN 0 AND 100
      OR round(v_entry_percentage, 2) IS DISTINCT FROM v_entry_percentage
      OR v_entry_amount < 0
      OR round(v_entry_amount, 2) IS DISTINCT FROM v_entry_amount
      OR v_entry_amount IS DISTINCT FROM (
        CASE
          WHEN v_commission_base <= 0 OR v_entry_percentage <= 0 THEN 0
          ELSE round(v_commission_base * v_entry_percentage / 100, 2)
        END
      )
      OR (
        v_entry_role <> 'ADVISOR_MANAGER'
        AND v_entry_source_seller_id IS NOT NULL
      )
    THEN
      RAISE EXCEPTION 'commission plan entry values are invalid'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = v_entry_seller_id AND org_id = p_org_id
    ) OR (
      v_entry_source_seller_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = v_entry_source_seller_id AND org_id = p_org_id
      )
    )
    THEN
      RAISE EXCEPTION 'commission plan seller scope mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF v_entry_role = 'PRIMARY' THEN
      v_primary_count := v_primary_count + 1;
      IF v_entry_seller_id IS DISTINCT FROM v_primary_seller_id THEN
        RAISE EXCEPTION 'commission plan primary seller mismatch'
          USING ERRCODE = '23514';
      END IF;
    ELSIF v_entry_role = 'SECONDARY' THEN
      v_secondary_count := v_secondary_count + 1;
      IF v_secondary_seller_id IS NULL
        OR v_entry_seller_id IS DISTINCT FROM v_secondary_seller_id
      THEN
        RAISE EXCEPTION 'commission plan secondary seller mismatch'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      v_advisor_count := v_advisor_count + 1;
      IF v_entry_seller_id = v_primary_seller_id
        OR v_entry_seller_id = v_secondary_seller_id
        OR (
          v_entry_source_seller_id IS NOT NULL
          AND v_entry_source_seller_id IS DISTINCT FROM v_primary_seller_id
          AND v_entry_source_seller_id IS DISTINCT FROM v_secondary_seller_id
        )
      THEN
        RAISE EXCEPTION 'commission plan advisor-manager relationship is invalid'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    v_planned_seller_ids := array_append(v_planned_seller_ids, v_entry_seller_id);
    v_plan_sum := round(v_plan_sum + v_entry_amount, 2);
  END LOOP;

  IF v_primary_count <> 1
    OR v_secondary_count <> (
      CASE WHEN v_secondary_seller_id IS NULL THEN 0 ELSE 1 END
    )
    OR (v_secondary_seller_id IS NULL AND v_pct_secondary IS NOT NULL)
    OR (v_secondary_seller_id IS NOT NULL AND v_pct_secondary IS NULL)
    OR v_pct_primary IS NULL
    OR (v_advisor_count > 0 AND v_has_advisor_manager_commission IS NOT TRUE)
    OR (
      v_operation.commission_split_mode = 'MANUAL'
      AND (
        v_operation.commission_pct_primary IS DISTINCT FROM v_pct_primary
        OR v_operation.commission_pct_secondary IS DISTINCT FROM v_pct_secondary
      )
    )
    OR round(v_plan_sum, 2) IS DISTINCT FROM v_plan_total
    OR (v_absorber_id IS NOT NULL AND NOT (v_absorber_id = ANY(v_planned_seller_ids)))
  THEN
    RAISE EXCEPTION 'commission plan participants or totals are inconsistent'
      USING ERRCODE = '22023';
  END IF;

  -- Todas las filas se bloquean y validan ANTES del primer upsert/delete. Una
  -- comisión pagada, parcial o saldada obliga revisión manual de todo el plan.
  PERFORM id
  FROM public.commission_records
  WHERE operation_id = p_operation_id
  ORDER BY id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.commission_records
    WHERE operation_id = p_operation_id
      AND (
        org_id IS DISTINCT FROM p_org_id
        OR agency_id IS DISTINCT FROM v_effect.agency_id
      )
  ) THEN
    RAISE EXCEPTION 'commission record scope mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commission_records
    WHERE operation_id = p_operation_id
      AND (
        status IS DISTINCT FROM 'PENDING'
        OR COALESCE(amount_paid, 0) > 0
        OR settled_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'commission records are locked by payment or settlement'
      USING ERRCODE = '55000';
  END IF;

  FOR v_entry IN
    SELECT value FROM jsonb_array_elements(p_commission_plan->'entries') entry(value)
  LOOP
    v_entry_seller_id := (v_entry->>'sellerId')::UUID;
    v_entry_role := v_entry->>'role';
    v_entry_percentage := (v_entry->>'percentage')::NUMERIC;
    v_entry_amount := (v_entry->>'amount')::NUMERIC;
    v_entry_source_seller_id := CASE
      WHEN jsonb_typeof(v_entry->'sourceSellerId') = 'string'
        THEN (v_entry->>'sourceSellerId')::UUID
      ELSE NULL
    END;

    SELECT id INTO v_record_id
    FROM public.commission_records
    WHERE operation_id = p_operation_id
      AND seller_id = v_entry_seller_id;

    IF FOUND OR v_entry_amount > 0 THEN
      INSERT INTO public.commission_records (
        operation_id,
        seller_id,
        org_id,
        agency_id,
        amount,
        amount_paid,
        percentage,
        status,
        date_calculated,
        date_paid,
        updated_at,
        settled_at,
        settled_reason,
        kind,
        source_seller_id
      ) VALUES (
        p_operation_id,
        v_entry_seller_id,
        p_org_id,
        v_effect.agency_id,
        v_entry_amount,
        0,
        v_entry_percentage,
        'PENDING',
        v_operation.operation_date,
        NULL,
        clock_timestamp(),
        NULL,
        NULL,
        CASE WHEN v_entry_role = 'ADVISOR_MANAGER'
          THEN 'ADVISOR_MANAGER' ELSE 'SELLER' END,
        CASE WHEN v_entry_role = 'ADVISOR_MANAGER'
          THEN v_entry_source_seller_id ELSE NULL END
      )
      ON CONFLICT ON CONSTRAINT unique_commission_operation_seller
      DO UPDATE SET
        org_id = EXCLUDED.org_id,
        agency_id = EXCLUDED.agency_id,
        amount = EXCLUDED.amount,
        amount_paid = 0,
        percentage = EXCLUDED.percentage,
        status = 'PENDING',
        date_calculated = EXCLUDED.date_calculated,
        date_paid = NULL,
        updated_at = EXCLUDED.updated_at,
        settled_at = NULL,
        settled_reason = NULL,
        kind = EXCLUDED.kind,
        source_seller_id = EXCLUDED.source_seller_id
      WHERE public.commission_records.status = 'PENDING'
        AND COALESCE(public.commission_records.amount_paid, 0) = 0
        AND public.commission_records.settled_at IS NULL
      RETURNING id INTO v_record_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'commission record changed while applying plan'
          USING ERRCODE = '40001';
      END IF;
      v_records_written := v_records_written + 1;
    END IF;
  END LOOP;

  DELETE FROM public.commission_records
  WHERE operation_id = p_operation_id
    AND NOT (seller_id = ANY(v_planned_seller_ids));
  GET DIAGNOSTICS v_records_removed = ROW_COUNT;

  IF v_operation.commission_split_mode = 'AUTO' THEN
    UPDATE public.operations
    SET commission_pct_primary = v_pct_primary,
        commission_pct_secondary = v_pct_secondary
    WHERE id = p_operation_id
      AND org_id = p_org_id
      AND commission_split_mode = 'AUTO';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'operation commission mode changed while applying plan'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  UPDATE public.quotation_conversion_effects
  SET status = 'COMPLETED',
      lease_until = NULL,
      last_error = NULL,
      completed_at = clock_timestamp(),
      output_snapshot = p_commission_plan,
      updated_at = clock_timestamp()
  WHERE id = v_effect.id
    AND status = 'PROCESSING'
    AND attempts = p_expected_attempt
  RETURNING * INTO v_effect;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation conversion effects attempt is stale'
      USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'finished', TRUE,
    'idempotent', FALSE,
    'status', v_effect.status,
    'attempts', v_effect.attempts,
    'operation_id', v_effect.operation_id,
    'completed_at', v_effect.completed_at,
    'last_error', v_effect.last_error,
    'records_written', v_records_written,
    'records_removed', v_records_removed
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: primero retirar explícitamente policies legacy permisivas.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pdf_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on pdf_templates" ON public.pdf_templates;
DROP POLICY IF EXISTS "Users can view templates for their agencies" ON public.pdf_templates;
DROP POLICY IF EXISTS "Admins can manage templates" ON public.pdf_templates;
DROP POLICY IF EXISTS "Agency members can view their templates" ON public.pdf_templates;
DROP POLICY IF EXISTS "Admins can manage their templates" ON public.pdf_templates;
DROP POLICY IF EXISTS tenant_isolation ON public.pdf_templates;
DROP POLICY IF EXISTS tenant_isolation_v2 ON public.pdf_templates;
DROP POLICY IF EXISTS pdf_templates_tenant_isolation ON public.pdf_templates;
-- El HTML/CSS legacy sólo se entrega desde las rutas server después de
-- settings.read + org + agencyIds. No exponerlo directo al browser por RLS
-- org-wide porque eso saltea permisos dinámicos y el scope por agencia.
REVOKE ALL PRIVILEGES ON TABLE public.pdf_templates FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.pdf_templates TO service_role;

ALTER TABLE public.generated_pdfs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.generated_pdfs gp
SET org_id = a.org_id
FROM public.agencies a
WHERE gp.agency_id = a.id
  AND gp.org_id IS DISTINCT FROM a.org_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.generated_pdfs gp
    LEFT JOIN public.agencies a ON a.id = gp.agency_id
    WHERE a.id IS NULL OR a.org_id IS NULL OR gp.org_id IS DISTINCT FROM a.org_id
  ) THEN
    RAISE EXCEPTION 'generated_pdfs contains rows without a valid agency/org scope'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.generated_pdfs ALTER COLUMN org_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agencies_id_org_id_unique
  ON public.agencies(id, org_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generated_pdfs_org_id_fkey'
      AND conrelid = 'public.generated_pdfs'::regclass
  ) THEN
    ALTER TABLE public.generated_pdfs
      ADD CONSTRAINT generated_pdfs_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generated_pdfs_agency_org_fkey'
      AND conrelid = 'public.generated_pdfs'::regclass
  ) THEN
    ALTER TABLE public.generated_pdfs
      ADD CONSTRAINT generated_pdfs_agency_org_fkey
      FOREIGN KEY (agency_id, org_id)
      REFERENCES public.agencies(id, org_id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS generated_pdfs_org_id_idx
  ON public.generated_pdfs(org_id);
ALTER TABLE public.generated_pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_pdfs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view generated pdfs for their agencies" ON public.generated_pdfs;
DROP POLICY IF EXISTS "Users can create generated pdfs" ON public.generated_pdfs;
DROP POLICY IF EXISTS generated_pdfs_tenant_isolation ON public.generated_pdfs;
CREATE POLICY generated_pdfs_tenant_isolation
  ON public.generated_pdfs FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
REVOKE ALL PRIVILEGES ON TABLE public.generated_pdfs FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'quotation_document_models',
    'quotation_document_revisions',
    'quotation_document_bindings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_tenant_isolation', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (org_id IN (SELECT public.user_org_ids()))',
      v_table || '_tenant_isolation',
      v_table
    );
  END LOOP;
END;
$$;

ALTER TABLE public.issued_quotation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_quotation_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS issued_quotation_documents_tenant_isolation
  ON public.issued_quotation_documents;
ALTER TABLE public.quotation_conversion_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_conversion_effects FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.quotation_document_models,
  public.quotation_document_revisions,
  public.quotation_document_bindings,
  public.issued_quotation_documents,
  public.quotation_conversion_effects
FROM PUBLIC, authenticated, anon;
GRANT ALL PRIVILEGES ON TABLE
  public.quotation_document_models,
  public.quotation_document_revisions,
  public.quotation_document_bindings,
  public.issued_quotation_documents,
  public.quotation_conversion_effects
TO service_role;
REVOKE ALL ON FUNCTION public.publish_quotation_document_revision(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_quotation_document_revision(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
REVOKE ALL ON FUNCTION public.save_quotation_document_model_draft(
  UUID, UUID, UUID, TEXT, JSONB, TEXT, INTEGER, SMALLINT, UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_quotation_document_model_draft(
  UUID, UUID, UUID, TEXT, JSONB, TEXT, INTEGER, SMALLINT, UUID, UUID, TIMESTAMPTZ
) TO service_role;
REVOKE ALL ON FUNCTION public.issue_quotation_document(
  UUID, UUID, TIMESTAMPTZ, JSONB, JSONB, TEXT, TEXT, TEXT, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_quotation_document(
  UUID, UUID, TIMESTAMPTZ, JSONB, JSONB, TEXT, TEXT, TEXT, UUID, BOOLEAN
) TO service_role;
REVOKE ALL ON FUNCTION public.prepare_quotation_document_content(
  UUID, TIMESTAMPTZ, JSONB, NUMERIC, NUMERIC, JSONB, SMALLINT, UUID, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_quotation_document_content(
  UUID, TIMESTAMPTZ, JSONB, NUMERIC, NUMERIC, JSONB, SMALLINT, UUID, JSONB
) TO service_role;
REVOKE ALL ON FUNCTION public.accept_issued_quotation_option(TEXT, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_issued_quotation_option(TEXT, UUID, TEXT, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.convert_quotation_to_operation(
  UUID, UUID, UUID, UUID, TEXT, JSONB
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_operation(
  UUID, UUID, UUID, UUID, TEXT, JSONB
)
  TO service_role;
REVOKE ALL ON FUNCTION public.claim_quotation_conversion_effects(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_quotation_conversion_effects(UUID, UUID, INTEGER)
  TO service_role;
REVOKE ALL ON FUNCTION public.claim_next_quotation_conversion_effects(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_quotation_conversion_effects(INTEGER, INTEGER)
  TO service_role;
REVOKE ALL ON FUNCTION public.finish_quotation_conversion_effects(
  UUID, UUID, INTEGER, TEXT, TEXT, JSONB
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_quotation_conversion_effects(
  UUID, UUID, INTEGER, TEXT, TEXT, JSONB
)
  TO service_role;

-- Las policies legacy eran org-wide y no conocen agencia, permisos dinámicos
-- ni own-data; quotation_options ni siquiera tenía una policy propia. El
-- browser no accede directo a estas tablas: las rutas server validan permiso y
-- scope antes de leer, y todos los writes pasan por RPCs service-role.
REVOKE ALL PRIVILEGES ON TABLE
  public.quotations,
  public.quotation_options,
  public.quotation_items
FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE
  public.quotations,
  public.quotation_options,
  public.quotation_items
TO service_role;

-- ---------------------------------------------------------------------------
-- KYO. El seed se limita al tenant cuyo perfil declara el legajo 13123 y a
-- agencias con la marca KYO. Nunca reemplaza un binding que el tenant haya
-- publicado después.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_agency RECORD;
  v_model_id UUID;
  v_revision_id UUID;
  v_manifest JSONB := '{
    "schemaVersion": 1,
    "documentKind": "quotation",
    "layoutKey": "editorial-right-rail-v1",
    "layoutVersion": 1,
    "locale": "es-AR",
    "theme": {
      "primaryColor": "#153B5B",
      "secondaryColor": "#9D765D",
      "accentColor": "#CC661B",
      "paperColor": "#FCFCFA",
      "textColor": "#243746",
      "fontFamily": "OPEN_SANS"
    },
    "assets": {"backgroundPath": "/quotation-models/kyo-2026/background.jpg"},
    "branding": {
      "displayName": "KYO Viajes y Turismo",
      "travelLicense": "Leg. 13123"
    },
    "copy": {
      "documentTitle": "Presupuesto de viaje",
      "availabilityNote": "Cotización sujeta a disponibilidad y modificaciones al momento de reservar.",
      "priceDisclaimer": "Tarifas expresadas en la moneda indicada. Consultar condiciones de pago y cancelación."
    },
    "blocks": [
      {"kind":"hero","visible":true,"emptyPolicy":"reject"},
      {"kind":"trip-summary","visible":true,"emptyPolicy":"reject"},
      {"kind":"flight-options","visible":true,"emptyPolicy":"hide"},
      {"kind":"hotel-options","visible":true,"emptyPolicy":"hide"},
      {"kind":"services-included","visible":true,"emptyPolicy":"hide"},
      {"kind":"pricing","visible":true,"emptyPolicy":"reject"},
      {"kind":"itinerary","visible":true,"emptyPolicy":"hide","pageBreakBefore":true},
      {"kind":"recommendations","visible":true,"emptyPolicy":"hide"},
      {"kind":"restrictions","visible":true,"emptyPolicy":"hide"},
      {"kind":"legal-terms","visible":true,"emptyPolicy":"hide"},
      {"kind":"payment-schedule","visible":true,"emptyPolicy":"hide"},
      {"kind":"advisor-signature","visible":true,"emptyPolicy":"hide"}
    ]
  }'::jsonb;
BEGIN
  FOR v_agency IN
    SELECT a.id, a.org_id
    FROM public.agencies a
    WHERE a.name ~* '(^|[^[:alnum:]])kyo([^[:alnum:]]|$)'
      AND EXISTS (
        SELECT 1
        FROM public.organization_settings settings
        WHERE settings.org_id = a.org_id
          AND settings.key IN ('legajo', 'company_legajo')
          AND regexp_replace(COALESCE(settings.value, ''), '[^0-9]', '', 'g') = '13123'
      )
  LOOP
    SELECT id INTO v_model_id
    FROM public.quotation_document_models
    WHERE org_id = v_agency.org_id
      AND agency_id = v_agency.id
      AND document_kind = 'quotation'
      AND key = 'kyo-presupuesto-2026';

    IF v_model_id IS NULL THEN
      INSERT INTO public.quotation_document_models (
        org_id, agency_id, key, name, document_kind
      ) VALUES (
        v_agency.org_id, v_agency.id, 'kyo-presupuesto-2026', 'KYO Presupuesto 2026', 'quotation'
      ) RETURNING id INTO v_model_id;
    END IF;

    SELECT id INTO v_revision_id
    FROM public.quotation_document_revisions
    WHERE model_id = v_model_id AND revision_number = 1;

    IF v_revision_id IS NULL THEN
      INSERT INTO public.quotation_document_revisions (
        model_id, org_id, agency_id, revision_number, status,
        layout_key, layout_version, schema_version, manifest,
        manifest_checksum, published_at
      ) VALUES (
        v_model_id, v_agency.org_id, v_agency.id, 1, 'PUBLISHED',
        'editorial-right-rail-v1', 1, 1, v_manifest,
        encode(digest(v_manifest::TEXT, 'sha256'), 'hex'), now()
      ) RETURNING id INTO v_revision_id;
    END IF;

    INSERT INTO public.quotation_document_bindings (
      org_id, agency_id, document_kind, revision_id
    )
    SELECT v_agency.org_id, v_agency.id, 'quotation', v_revision_id
    FROM public.quotation_document_revisions revision
    WHERE revision.id = v_revision_id
      AND revision.status = 'PUBLISHED'
      AND NOT EXISTS (
        SELECT 1
        FROM public.quotation_document_bindings binding
        WHERE binding.org_id = v_agency.org_id
          AND binding.agency_id = v_agency.id
          AND binding.document_kind = 'quotation'
      )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

COMMENT ON TABLE public.quotation_document_models IS
  'Familias de modelos documentales de cotización por organización o agencia.';
COMMENT ON TABLE public.quotation_document_revisions IS
  'Revisiones seguras y versionadas; las publicadas son inmutables.';
COMMENT ON TABLE public.quotation_document_bindings IS
  'Revisión publicada efectiva por scope y tipo documental.';
COMMENT ON TABLE public.issued_quotation_documents IS
  'Snapshots inmutables del documento presentado al cliente.';

COMMIT;
