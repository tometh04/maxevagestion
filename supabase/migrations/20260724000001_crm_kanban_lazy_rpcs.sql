-- VIB-61: CRM Ventas lazy por columna.
--
-- El kanban dejaba de escalar porque cargaba TODO el pipeline al cliente y
-- contaba client-side (org Lozada Rosario: ~9.600 leads activos, 93% NEW). Estas
-- funciones permiten conteos exactos por columna + paginado por columna en el
-- servidor, replicando EXACTAMENTE la lógica de columna del kanban:
--   column_key = COALESCE(NULLIF(btrim(list_name),''), NULLIF(btrim(region),''), 'Sin lista')
-- (list_name → region → "Sin lista").
--
-- Seguridad (regla de oro del repo: no confiar solo en RLS):
--  - SECURITY DEFINER + filtro EXPLÍCITO por p_org_id. El caller (route) resuelve
--    p_org_id desde la sesión (user.org_id) y las agencias permitidas
--    (getUserAgencyIds), nunca desde el body. Estas funciones NO aceptan datos
--    de tenant desde el cliente.
--  - p_agency_ids acota el scope; si viene vacío, no devuelve nada.

-- Expresión de columna compartida (mantener sincronizada con el kanban).
CREATE OR REPLACE FUNCTION public.crm_lead_column_key(p_list_name text, p_region text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(btrim(p_list_name), ''), NULLIF(btrim(p_region), ''), 'Sin lista');
$$;

-- Conteos por columna (headers del kanban). Devuelve la key cruda; el cliente la
-- foldea case-insensitive contra manychat_list_order para el nombre visible.
CREATE OR REPLACE FUNCTION public.crm_kanban_column_counts(
  p_org_id UUID,
  p_agency_ids UUID[],
  p_status TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_created_from TIMESTAMPTZ DEFAULT NULL,
  p_created_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(column_key TEXT, cnt BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.crm_lead_column_key(l.list_name, l.region) AS column_key,
         count(*)::bigint AS cnt
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND l.archived_at IS NULL
    AND l.agency_id = ANY(p_agency_ids)
    AND (p_status IS NULL OR l.status = p_status)
    AND (p_region IS NULL OR l.region = p_region)
    AND (
      p_search IS NULL
      OR l.contact_name ILIKE '%' || p_search || '%'
      OR l.contact_phone ILIKE '%' || p_search || '%'
    )
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
  GROUP BY 1;
$$;

-- Leads de UNA columna, paginados (updated_at desc). Matchea la MISMA key.
CREATE OR REPLACE FUNCTION public.crm_kanban_column_leads(
  p_org_id UUID,
  p_agency_ids UUID[],
  p_column_key TEXT,
  p_limit INT DEFAULT 30,
  p_offset INT DEFAULT 0,
  p_status TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_created_from TIMESTAMPTZ DEFAULT NULL,
  p_created_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.leads
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT l.*
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND l.archived_at IS NULL
    AND l.agency_id = ANY(p_agency_ids)
    AND public.crm_lead_column_key(l.list_name, l.region) = p_column_key
    AND (p_status IS NULL OR l.status = p_status)
    AND (p_region IS NULL OR l.region = p_region)
    AND (
      p_search IS NULL
      OR l.contact_name ILIKE '%' || p_search || '%'
      OR l.contact_phone ILIKE '%' || p_search || '%'
    )
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
  ORDER BY l.updated_at DESC NULLS LAST
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
$$;

-- Índice para el paginado por columna (org + agencia + orden por updated_at).
CREATE INDEX IF NOT EXISTS idx_leads_org_agency_updated
  ON public.leads (org_id, agency_id, updated_at DESC)
  WHERE archived_at IS NULL;

REVOKE ALL ON FUNCTION public.crm_kanban_column_counts(UUID, UUID[], TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_kanban_column_leads(UUID, UUID[], TEXT, INT, INT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_kanban_column_counts(UUID, UUID[], TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_kanban_column_leads(UUID, UUID[], TEXT, INT, INT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
