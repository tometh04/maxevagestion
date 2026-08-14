-- =====================================================
-- Que los filtros de /admin/usage filtren de verdad
-- =====================================================
-- Auditoria: de 20 bloques de la pantalla, 11 ignoraban los tres filtros y solo
-- 2 los respetaban. La causa es de firma — de las 13 RPC, una sola aceptaba
-- `p_org_id`, `p_agency_id` y `p_role`.
--
-- ATENCION, ES EL RIESGO CENTRAL DE ESTA MIGRACION: agregar un parametro NO
-- reemplaza una funcion, crea una SOBRECARGA, y entonces la llamada vieja
-- (`admin_usage_by_hour(30)`) pasa a ser ambigua y falla. Por eso cada bloque es
-- DROP + CREATE. Y el DROP se lleva los GRANT: Postgres le devuelve EXECUTE a
-- PUBLIC a la funcion nueva, o sea que sin el REVOKE explicito se abre el
-- agujero que documenta usage-heatmap.md. Hay un REVOKE por funcion al final y
-- se verifica con `has_function_privilege` despues de aplicar.
--
-- Convencion de los filtros, igual en todas:
--   (p_org_id IS NULL OR org_id = p_org_id)
--   (p_agency_id IS NULL OR agency_id = p_agency_id)
--   (NOT p_agency_unassigned OR agency_id IS NULL)
--   (p_role IS NULL OR role = p_role)
--
-- `p_agency_unassigned` existe porque "sin agencia asignada" y "sin filtro de
-- agencia" son cosas distintas y ambas se expresaban con NULL. En la UI eso
-- hacia que elegir "Sin agencia" mostrara exactamente lo mismo que "Todas": un
-- filtro fantasma, peor que no tenerlo porque el `<Select>` decia que habia algo
-- aplicado.

BEGIN;

-- -----------------------------------------------------------------
-- Rol de analitica, en SQL
-- -----------------------------------------------------------------
-- Replica la prioridad de `getEffectiveAgencyScopeRole` (lib/permissions.ts) y
-- el plegado del asesor independiente de `usageRoleFor` (lib/analytics/roles.ts).
--
-- Hace falta porque el rol solo existe como columna en `usage_events` (lecturas).
-- Las escrituras derivadas de tablas de dominio tienen `actor_id` pero no rol, y
-- sin esto el filtro por rol no podia tocar mas que el ranking de pantallas.
--
-- ASIMETRIA A TENER PRESENTE: en lecturas el rol es el CONGELADO al momento del
-- evento; aca es el ACTUAL del usuario, porque nunca se capturo. Es la unica
-- opcion disponible y es mejor que un filtro que no hace nada, pero significa
-- que un cambio de rol reescribe la historia del lado de las escrituras.
CREATE OR REPLACE FUNCTION public._usage_role_for(
  p_role TEXT,
  p_additional TEXT[],
  p_is_avi BOOLEAN
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_role IS NULL THEN NULL
    WHEN 'SUPER_ADMIN' = ANY(roles) THEN 'SUPER_ADMIN'
    WHEN 'ORG_OWNER'   = ANY(roles) THEN 'ORG_OWNER'
    WHEN 'CONTABLE'    = ANY(roles) THEN 'CONTABLE'
    WHEN 'POST_VENTA'  = ANY(roles) THEN 'POST_VENTA'
    WHEN 'ADMIN'       = ANY(roles) THEN 'ADMIN'
    WHEN 'SELLER'      = ANY(roles) THEN
      CASE WHEN COALESCE(p_is_avi, FALSE) THEN 'SELLER_AVI' ELSE 'SELLER' END
    WHEN 'VIEWER'      = ANY(roles) THEN 'VIEWER'
    ELSE NULL
  END
  FROM (SELECT ARRAY[p_role] || COALESCE(p_additional, '{}'::TEXT[]) AS roles) t
$$;

REVOKE ALL ON FUNCTION public._usage_role_for(TEXT, TEXT[], BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._usage_role_for(TEXT, TEXT[], BOOLEAN) TO service_role;

-- -----------------------------------------------------------------
-- Actividad humana, ahora con rol en las dos ramas
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._admin_usage_actors(p_since TIMESTAMPTZ)
RETURNS TABLE (
  org_id UUID,
  agency_id UUID,
  user_id UUID,
  role TEXT,
  occurred_at TIMESTAMPTZ,
  signal TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.org_id,
         e.agency_id,
         e.actor_id,
         public._usage_role_for(u.role, u.additional_roles, u.is_independent_advisor),
         e.occurred_at,
         'write'
  FROM public._admin_usage_events(p_since) e
  LEFT JOIN users u ON u.id = e.actor_id
  WHERE e.org_id IS NOT NULL
    AND e.actor_id IS NOT NULL
    AND e.module <> 'ingestion'
  UNION ALL
  SELECT ue.org_id, ue.agency_id, ue.user_id, ue.role, ue.occurred_at, 'read'
  FROM usage_events ue
  WHERE ue.occurred_at >= p_since
    AND ue.org_id IS NOT NULL
    AND ue.user_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public._admin_usage_actors(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._admin_usage_actors(TIMESTAMPTZ) TO service_role;

-- -----------------------------------------------------------------
-- 1. Matriz de escrituras
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_by_org_module(INT);

CREATE FUNCTION public.admin_usage_by_org_module(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (org_id UUID, module TEXT, events BIGINT, actors BIGINT, last_event_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.org_id,
         e.module,
         COUNT(*)::BIGINT,
         COUNT(DISTINCT e.actor_id)::BIGINT,
         MAX(e.occurred_at)
  FROM public._admin_usage_events(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))) e
  LEFT JOIN users u ON u.id = e.actor_id
  WHERE e.org_id IS NOT NULL
    AND (p_org_id IS NULL OR e.org_id = p_org_id)
    AND (p_agency_id IS NULL OR e.agency_id = p_agency_id)
    AND (NOT p_agency_unassigned OR e.agency_id IS NULL)
    AND (p_role IS NULL
         OR public._usage_role_for(u.role, u.additional_roles, u.is_independent_advisor) = p_role)
  GROUP BY e.org_id, e.module
$$;

-- -----------------------------------------------------------------
-- 2. Matriz de lecturas
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_reads_by_org_module(INT);

CREATE FUNCTION public.admin_usage_reads_by_org_module(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (org_id UUID, module TEXT, events BIGINT, actors BIGINT, last_event_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.org_id,
         COALESCE(e.module, 'other'),
         COUNT(*)::BIGINT,
         COUNT(DISTINCT e.user_id)::BIGINT,
         MAX(e.occurred_at)
  FROM usage_events e
  WHERE e.occurred_at >= NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))
    -- El login no es una pantalla: sin esto cada org gana una fila 'other'
    -- fantasma en la matriz de lecturas.
    AND e.event_name <> 'login'
    AND (p_org_id IS NULL OR e.org_id = p_org_id)
    AND (p_agency_id IS NULL OR e.agency_id = p_agency_id)
    AND (NOT p_agency_unassigned OR e.agency_id IS NULL)
    AND (p_role IS NULL OR e.role = p_role)
  GROUP BY e.org_id, COALESCE(e.module, 'other')
$$;

-- -----------------------------------------------------------------
-- 3. Dia x hora
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_by_hour(INT);

CREATE FUNCTION public.admin_usage_by_hour(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (dow SMALLINT, hour SMALLINT, events BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXTRACT(ISODOW FROM local_ts)::SMALLINT,
         EXTRACT(HOUR FROM local_ts)::SMALLINT,
         COUNT(*)::BIGINT
  FROM (
    SELECT a.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires' AS local_ts
    FROM public._admin_usage_actors(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))) a
    WHERE (p_org_id IS NULL OR a.org_id = p_org_id)
      AND (p_agency_id IS NULL OR a.agency_id = p_agency_id)
      AND (NOT p_agency_unassigned OR a.agency_id IS NULL)
      AND (p_role IS NULL OR a.role = p_role)
  ) t
  GROUP BY 1, 2
$$;

-- -----------------------------------------------------------------
-- 4. Serie diaria
-- -----------------------------------------------------------------
-- Cambia de significado segun el alcance y por eso devuelve las dos columnas:
-- sin filtro interesa cuantas ORGS estuvieron activas; con una org elegida esa
-- serie seria una linea plana en 1, y lo que interesa son sus PERSONAS.
DROP FUNCTION IF EXISTS public.admin_usage_daily(INT);

CREATE FUNCTION public.admin_usage_daily(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (day DATE, events BIGINT, active_orgs BIGINT, active_users BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT (a.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE,
         COUNT(*)::BIGINT,
         COUNT(DISTINCT a.org_id)::BIGINT,
         COUNT(DISTINCT a.user_id)::BIGINT
  FROM public._admin_usage_actors(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))) a
  WHERE (p_org_id IS NULL OR a.org_id = p_org_id)
    AND (p_agency_id IS NULL OR a.agency_id = p_agency_id)
    AND (NOT p_agency_unassigned OR a.agency_id IS NULL)
    AND (p_role IS NULL OR a.role = p_role)
  GROUP BY 1
$$;

-- -----------------------------------------------------------------
-- 5. Resumen por organizacion
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_by_org(INT);

CREATE FUNCTION public.admin_usage_by_org(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (
  org_id UUID,
  org_name TEXT,
  slug TEXT,
  subscription_status TEXT,
  plan TEXT,
  org_created_at TIMESTAMPTZ,
  events BIGINT,
  user_events BIGINT,
  actors BIGINT,
  active_days BIGINT,
  modules_used BIGINT,
  last_event_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ev AS (
    SELECT e.*,
           public._usage_role_for(u.role, u.additional_roles, u.is_independent_advisor) AS actor_role
    FROM public._admin_usage_events(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))) e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.org_id IS NOT NULL
      AND (p_agency_id IS NULL OR e.agency_id = p_agency_id)
      AND (NOT p_agency_unassigned OR e.agency_id IS NULL)
  )
  SELECT o.id,
         o.name::TEXT,
         o.slug::TEXT,
         o.subscription_status::TEXT,
         o.plan::TEXT,
         o.created_at,
         COUNT(ev.occurred_at)::BIGINT,
         COUNT(*) FILTER (WHERE ev.module <> 'ingestion')::BIGINT,
         COUNT(DISTINCT ev.actor_id)::BIGINT,
         COUNT(DISTINCT (ev.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE)
           FILTER (WHERE ev.module <> 'ingestion')::BIGINT,
         COUNT(DISTINCT ev.module) FILTER (WHERE ev.module <> 'ingestion')::BIGINT,
         MAX(ev.occurred_at) FILTER (WHERE ev.module <> 'ingestion')
  FROM organizations o
  LEFT JOIN ev ON ev.org_id = o.id
    AND (p_role IS NULL OR ev.actor_role = p_role)
  WHERE (p_org_id IS NULL OR o.id = p_org_id)
  GROUP BY o.id, o.name, o.slug, o.subscription_status, o.plan, o.created_at
$$;

-- -----------------------------------------------------------------
-- 6. Pantallas
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_screens(INT, UUID, UUID, TEXT);

CREATE FUNCTION public.admin_usage_screens(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (screen TEXT, module TEXT, events BIGINT, actors BIGINT, orgs BIGINT, last_event_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.screen,
         MIN(e.module),
         COUNT(*)::BIGINT,
         COUNT(DISTINCT e.user_id)::BIGINT,
         COUNT(DISTINCT e.org_id)::BIGINT,
         MAX(e.occurred_at)
  FROM usage_events e
  WHERE e.occurred_at >= NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))
    AND e.screen IS NOT NULL
    AND (p_org_id IS NULL OR e.org_id = p_org_id)
    AND (p_agency_id IS NULL OR e.agency_id = p_agency_id)
    AND (NOT p_agency_unassigned OR e.agency_id IS NULL)
    AND (p_role IS NULL OR e.role = p_role)
  GROUP BY e.screen
$$;

-- -----------------------------------------------------------------
-- 7. Sesiones
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_sessions(INT, UUID);

CREATE FUNCTION public.admin_usage_sessions(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (
  sessions BIGINT,
  actors BIGINT,
  avg_screens NUMERIC,
  avg_duration_sec NUMERIC,
  median_duration_sec NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH per_session AS (
    SELECT e.session_id,
           e.user_id,
           COUNT(DISTINCT e.screen) AS screens,
           EXTRACT(EPOCH FROM (MAX(e.occurred_at) - MIN(e.occurred_at))) AS duration_sec
    FROM usage_events e
    WHERE e.occurred_at >= NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))
      AND e.session_id IS NOT NULL
      AND (p_org_id IS NULL OR e.org_id = p_org_id)
      AND (p_agency_id IS NULL OR e.agency_id = p_agency_id)
      AND (NOT p_agency_unassigned OR e.agency_id IS NULL)
      AND (p_role IS NULL OR e.role = p_role)
    GROUP BY e.session_id, e.user_id
  )
  -- Una sola fila agregada, no una por org. La version anterior devolvia una
  -- fila por organizacion y la pagina las "sumaba" con un reduce que arrastraba
  -- la mediana de una org arbitraria: medio numero filtrado y medio no.
  SELECT COUNT(*)::BIGINT,
         COUNT(DISTINCT user_id)::BIGINT,
         ROUND(AVG(screens), 1),
         ROUND(AVG(duration_sec)),
         ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_sec)::NUMERIC)
  FROM per_session
$$;

-- -----------------------------------------------------------------
-- 8. Logins por dia
-- -----------------------------------------------------------------
-- Sin `p_agency_id`: `login_sessions` no tiene esa columna. La sesion de auth es
-- de la persona, no de la sucursal, y atribuirla a una agencia seria inventar.
DROP FUNCTION IF EXISTS public.admin_usage_logins_daily(INT, UUID);

CREATE FUNCTION public.admin_usage_logins_daily(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (day DATE, logins BIGINT, users BIGINT, orgs BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT (ls.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE,
         COUNT(*)::BIGINT,
         COUNT(DISTINCT ls.user_id)::BIGINT,
         COUNT(DISTINCT ls.org_id)::BIGINT
  FROM login_sessions ls
  LEFT JOIN users u ON u.id = ls.user_id
  WHERE ls.started_at >= NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))
    AND (p_org_id IS NULL OR ls.org_id = p_org_id)
    AND (p_role IS NULL
         OR public._usage_role_for(u.role, u.additional_roles, u.is_independent_advisor) = p_role)
  GROUP BY 1
$$;

-- -----------------------------------------------------------------
-- 9. Usuarios activos (DAU/WAU/MAU)
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_active_users(INT, UUID, UUID);

CREATE FUNCTION public.admin_usage_active_users(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (day DATE, dau BIGINT, wau BIGINT, mau BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH activity AS (
    SELECT DISTINCT
           a.user_id,
           (a.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE AS day
    FROM public._admin_usage_actors(
           NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1) + 30)
         ) a
    WHERE (p_org_id IS NULL OR a.org_id = p_org_id)
      AND (p_agency_id IS NULL OR a.agency_id = p_agency_id)
      AND (NOT p_agency_unassigned OR a.agency_id IS NULL)
      AND (p_role IS NULL OR a.role = p_role)
  ),
  days AS (
    SELECT generate_series(
             (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE
               - (GREATEST(p_days, 1) - 1),
             (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE,
             '1 day'::INTERVAL
           )::DATE AS day
  )
  SELECT d.day,
         COUNT(DISTINCT a.user_id) FILTER (WHERE a.day = d.day)::BIGINT,
         COUNT(DISTINCT a.user_id) FILTER (WHERE a.day > d.day - 7)::BIGINT,
         COUNT(DISTINCT a.user_id) FILTER (WHERE a.day > d.day - 30)::BIGINT
  FROM days d
  LEFT JOIN activity a ON a.day <= d.day AND a.day > d.day - 30
  GROUP BY d.day
  -- La pagina tomaba `actives[actives.length - 1]` como "hoy" asumiendo un orden
  -- que la funcion no garantizaba: la card de Stickiness podia estar mostrando
  -- un dia cualquiera de la ventana.
  ORDER BY d.day
$$;

-- -----------------------------------------------------------------
-- 10. Drill-down por agencia
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_by_agency(INT, UUID);

CREATE FUNCTION public.admin_usage_by_agency(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (
  org_id UUID,
  agency_id UUID,
  agency_name TEXT,
  users BIGINT,
  writes BIGINT,
  reads BIGINT,
  active_days BIGINT,
  last_event_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH acts AS (
    SELECT a.*
    FROM public._admin_usage_actors(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))) a
    WHERE (p_org_id IS NULL OR a.org_id = p_org_id)
      AND (p_agency_id IS NULL OR a.agency_id = p_agency_id)
      AND (NOT p_agency_unassigned OR a.agency_id IS NULL)
      AND (p_role IS NULL OR a.role = p_role)
  )
  SELECT acts.org_id,
         acts.agency_id,
         COALESCE(ag.name, CASE WHEN acts.agency_id IS NULL THEN 'Sin agencia' ELSE '(agencia borrada)' END)::TEXT,
         COUNT(DISTINCT acts.user_id)::BIGINT,
         COUNT(*) FILTER (WHERE acts.signal = 'write')::BIGINT,
         COUNT(*) FILTER (WHERE acts.signal = 'read')::BIGINT,
         COUNT(DISTINCT (acts.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE)::BIGINT,
         MAX(acts.occurred_at)
  FROM acts
  LEFT JOIN agencies ag ON ag.id = acts.agency_id
  GROUP BY acts.org_id, acts.agency_id, ag.name
$$;

-- -----------------------------------------------------------------
-- 11. Drill-down por persona
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_by_user(UUID, INT);

CREATE FUNCTION public.admin_usage_by_user(
  p_org_id UUID,
  p_days INT DEFAULT 30,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  role TEXT,
  is_active BOOLEAN,
  is_platform_admin BOOLEAN,
  agency_name TEXT,
  writes BIGINT,
  reads BIGINT,
  sessions BIGINT,
  active_days BIGINT,
  screens BIGINT,
  last_event_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH acts AS (
    SELECT a.*
    FROM public._admin_usage_actors(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))) a
    WHERE a.org_id = p_org_id
      AND (p_agency_id IS NULL OR a.agency_id = p_agency_id)
      AND (NOT p_agency_unassigned OR a.agency_id IS NULL)
  ),
  agg AS (
    SELECT acts.user_id,
           COUNT(*) FILTER (WHERE acts.signal = 'write')::BIGINT AS writes,
           COUNT(*) FILTER (WHERE acts.signal = 'read')::BIGINT AS reads,
           COUNT(DISTINCT (acts.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE)::BIGINT AS active_days,
           MAX(acts.occurred_at) AS last_event_at
    FROM acts GROUP BY acts.user_id
  ),
  ev AS (
    SELECT e.user_id,
           COUNT(DISTINCT e.session_id)::BIGINT AS sessions,
           COUNT(DISTINCT e.screen)::BIGINT AS screens
    FROM usage_events e
    WHERE e.org_id = p_org_id
      AND e.occurred_at >= NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))
      AND (p_agency_id IS NULL OR e.agency_id = p_agency_id)
      AND (NOT p_agency_unassigned OR e.agency_id IS NULL)
    GROUP BY e.user_id
  ),
  logins AS (
    SELECT ls.user_id, MAX(ls.started_at) AS last_login_at
    FROM login_sessions ls WHERE ls.org_id = p_org_id GROUP BY ls.user_id
  )
  SELECT u.id,
         u.name::TEXT,
         u.email::TEXT,
         public._usage_role_for(u.role, u.additional_roles, u.is_independent_advisor),
         u.is_active,
         (pa.user_id IS NOT NULL),
         (
           SELECT ag.name::TEXT FROM user_agencies ua
           JOIN agencies ag ON ag.id = ua.agency_id
           WHERE ua.user_id = u.id AND ag.org_id = p_org_id
           ORDER BY ag.name LIMIT 1
         ),
         COALESCE(agg.writes, 0),
         COALESCE(agg.reads, 0),
         COALESCE(ev.sessions, 0),
         COALESCE(agg.active_days, 0),
         COALESCE(ev.screens, 0),
         agg.last_event_at,
         logins.last_login_at
  FROM users u
  LEFT JOIN agg ON agg.user_id = u.id
  LEFT JOIN ev ON ev.user_id = u.id
  LEFT JOIN logins ON logins.user_id = u.id
  LEFT JOIN platform_admins pa ON pa.user_id = u.id
  WHERE u.org_id = p_org_id
    AND (p_role IS NULL
         OR public._usage_role_for(u.role, u.additional_roles, u.is_independent_advisor) = p_role)
$$;

-- -----------------------------------------------------------------
-- 12. Activacion
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_usage_activation();

CREATE FUNCTION public.admin_usage_activation(p_org_id UUID DEFAULT NULL)
RETURNS TABLE (
  org_id UUID,
  org_name TEXT,
  subscription_status TEXT,
  org_created_at TIMESTAMPTZ,
  first_operation_at TIMESTAMPTZ,
  first_payment_at TIMESTAMPTZ,
  days_to_first_operation NUMERIC,
  days_to_first_payment NUMERIC,
  is_migrated BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT o.id,
         o.name::TEXT,
         o.subscription_status::TEXT,
         o.created_at,
         f.first_op,
         f.first_pay,
         ROUND(EXTRACT(EPOCH FROM (f.first_op - o.created_at)) / 86400.0, 1),
         ROUND(EXTRACT(EPOCH FROM (f.first_pay - o.created_at)) / 86400.0, 1),
         COALESCE(f.first_op < o.created_at, FALSE)
  FROM organizations o
  CROSS JOIN LATERAL (
    SELECT (SELECT MIN(op.created_at) FROM operations op WHERE op.org_id = o.id) AS first_op,
           (SELECT MIN(p.created_at) FROM payments p WHERE p.org_id = o.id) AS first_pay
  ) f
  WHERE (p_org_id IS NULL OR o.id = p_org_id)
$$;

-- -----------------------------------------------------------------
-- 13. Stickiness — dejaba de estar muerta
-- -----------------------------------------------------------------
-- Se creo en la tanda anterior y nunca se llamo desde el codigo. Ahora alimenta
-- la card de habito y acepta los filtros como el resto.
DROP FUNCTION IF EXISTS public.admin_usage_stickiness_by_org(INT);

CREATE FUNCTION public.admin_usage_stickiness_by_org(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
  p_agency_unassigned BOOLEAN DEFAULT FALSE,
  p_role TEXT DEFAULT NULL
)
RETURNS TABLE (
  org_id UUID,
  active_days BIGINT,
  dau_avg NUMERIC,
  mau BIGINT,
  stickiness NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH activity AS (
    SELECT DISTINCT
           a.org_id,
           a.user_id,
           (a.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE AS day
    FROM public._admin_usage_actors(NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))) a
    WHERE (p_org_id IS NULL OR a.org_id = p_org_id)
      AND (p_agency_id IS NULL OR a.agency_id = p_agency_id)
      AND (NOT p_agency_unassigned OR a.agency_id IS NULL)
      AND (p_role IS NULL OR a.role = p_role)
  ),
  per_day AS (
    SELECT org_id, day, COUNT(DISTINCT user_id) AS dau
    FROM activity GROUP BY org_id, day
  )
  SELECT act.org_id,
         COUNT(DISTINCT act.day)::BIGINT,
         ROUND(AVG(pd.dau), 2),
         COUNT(DISTINCT act.user_id)::BIGINT,
         ROUND(AVG(pd.dau) / NULLIF(COUNT(DISTINCT act.user_id), 0), 3)
  FROM activity act
  JOIN per_day pd ON pd.org_id = act.org_id
  GROUP BY act.org_id
$$;

-- -----------------------------------------------------------------
-- Permisos — OBLIGATORIO despues de cada DROP
-- -----------------------------------------------------------------
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'admin_usage%' OR p.proname LIKE '\_admin\_usage%' OR p.proname = '_usage_role_for')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;

COMMIT;
