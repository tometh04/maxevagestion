BEGIN;

-- Supabase default privileges can grant broad table access to anon and
-- authenticated. RLS remains the tenant boundary, but keep the SQL privilege
-- surface limited to the operations exposed by Growth Studio.
REVOKE ALL PRIVILEGES ON TABLE public.growth_campaigns FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.growth_generation_requests FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.growth_campaign_revisions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.growth_assets FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.growth_studio_events FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.growth_campaigns TO authenticated;
GRANT SELECT ON TABLE public.growth_generation_requests TO authenticated;
GRANT SELECT, INSERT ON TABLE public.growth_campaign_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.growth_assets TO authenticated;
GRANT SELECT, INSERT ON TABLE public.growth_studio_events TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_growth_studio_agency(UUID, UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_growth_studio_generation(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_growth_studio_generation(
  UUID, UUID, UUID, TEXT, JSONB, JSONB, TEXT, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_access_growth_studio_agency(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_growth_studio_generation(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_growth_studio_generation(
  UUID, UUID, UUID, TEXT, JSONB, JSONB, TEXT, UUID
) TO authenticated;

COMMIT;
