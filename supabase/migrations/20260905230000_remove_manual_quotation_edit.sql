-- The manual editor has been retired. Preserve creation, price refresh,
-- issued documents and existing quotation data. No CASCADE is intentional.
DROP FUNCTION IF EXISTS public.update_quotation_with_structure(UUID, UUID, UUID, TIMESTAMPTZ, JSONB, JSONB, JSONB, UUID);
DROP FUNCTION IF EXISTS public.update_quotation_header(UUID, UUID, UUID, TIMESTAMPTZ, JSONB, UUID);
