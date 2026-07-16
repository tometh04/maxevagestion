BEGIN;

CREATE TABLE IF NOT EXISTS public.growth_brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  profile_data JSONB NOT NULL DEFAULT '{
    "identity": {"tagline": "", "valueProposition": "", "differentiators": []},
    "audience": {"summary": "", "segments": []},
    "voice": {"tone": "", "personality": [], "wordsToUse": [], "forbiddenTerms": [], "writingRules": ""},
    "offer": {"commercialFocus": [], "preferredDestinations": []},
    "visual": {"primaryColor": null, "secondaryColor": null, "styleNotes": ""},
    "conversion": {"preferredCta": ""},
    "locale": {"language": "es", "country": "AR"}
  }'::jsonb,
  schema_version SMALLINT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT growth_brand_profiles_org_agency_unique UNIQUE (org_id, agency_id),
  CONSTRAINT growth_brand_profiles_brand_name_length
    CHECK (char_length(btrim(brand_name)) BETWEEN 2 AND 120),
  CONSTRAINT growth_brand_profiles_profile_data_object
    CHECK (jsonb_typeof(profile_data) = 'object'),
  CONSTRAINT growth_brand_profiles_schema_version_positive
    CHECK (schema_version > 0)
);

COMMENT ON TABLE public.growth_brand_profiles IS
  'Growth Studio: perfil de marca vigente por agencia y organización.';
COMMENT ON COLUMN public.growth_brand_profiles.profile_data IS
  'Documento versionado del agregado BrandProfile. La aplicación valida el shape con Zod.';
COMMENT ON COLUMN public.growth_brand_profiles.schema_version IS
  'Versión del contrato JSON almacenado en profile_data.';

CREATE OR REPLACE FUNCTION public.set_growth_brand_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by = OLD.created_by;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_growth_brand_profile_agency_org()
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
    RAISE EXCEPTION 'growth_brand_profiles agency_id does not belong to org_id'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_brand_profiles_updated_at
  ON public.growth_brand_profiles;
CREATE TRIGGER trg_growth_brand_profiles_updated_at
  BEFORE UPDATE ON public.growth_brand_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_growth_brand_profiles_updated_at();

DROP TRIGGER IF EXISTS trg_growth_brand_profiles_agency_org
  ON public.growth_brand_profiles;
CREATE TRIGGER trg_growth_brand_profiles_agency_org
  BEFORE INSERT OR UPDATE OF org_id, agency_id
  ON public.growth_brand_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_growth_brand_profile_agency_org();

ALTER TABLE public.growth_brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_brand_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS growth_brand_profiles_tenant_isolation
  ON public.growth_brand_profiles;
CREATE POLICY growth_brand_profiles_tenant_isolation
  ON public.growth_brand_profiles
  FOR ALL
  TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.growth_brand_profiles
  TO authenticated;

COMMIT;
