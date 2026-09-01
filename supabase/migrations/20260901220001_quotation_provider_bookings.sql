CREATE TABLE public.quotation_provider_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL UNIQUE REFERENCES public.quotations(id) ON DELETE RESTRICT,
  operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL UNIQUE,
  remote_job_id UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','CONFIRMED','PRICE_CHANGED','PARTIAL','FAILED')),
  result JSONB,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quotation_provider_bookings_scope_idx ON public.quotation_provider_bookings(org_id,agency_id,quotation_id);
ALTER TABLE public.quotation_provider_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotation_provider_bookings_select ON public.quotation_provider_bookings FOR SELECT TO authenticated
USING (
  org_id IN (SELECT public.user_org_ids())
  AND (
    agency_id IN (SELECT agency_id FROM public.user_agencies WHERE user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND org_id=quotation_provider_bookings.org_id AND role IN ('SUPER_ADMIN','ORG_OWNER','ADMIN'))
  )
);
REVOKE INSERT,UPDATE,DELETE ON public.quotation_provider_bookings FROM anon,authenticated;
GRANT SELECT ON public.quotation_provider_bookings TO authenticated;
GRANT ALL ON public.quotation_provider_bookings TO service_role;
