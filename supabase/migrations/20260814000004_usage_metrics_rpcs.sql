-- =====================================================
-- RPCs de metricas de uso
-- =====================================================
-- Pantallas, sesiones, logins, habito (DAU/WAU/MAU), activacion y los dos
-- drill-downs (agencia y persona).
--
-- Todas siguen el patron obligatorio del modulo: SECURITY INVOKER, REVOKE a
-- PUBLIC/anon/authenticated y GRANT solo a service_role. Se invocan con el admin
-- client desde `/admin/usage`, que ya esta detras de `isPlatformAdmin()`.

BEGIN;

-- -----------------------------------------------------------------
-- 1. Ranking de pantallas
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_usage_screens(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL,
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
    AND (p_role IS NULL OR e.role = p_role)
  GROUP BY e.screen
$$;

-- -----------------------------------------------------------------
-- 2. Sesiones de trabajo
-- -----------------------------------------------------------------
-- La duracion es `max(occurred_at) - min(occurred_at)` por `session_id`, o sea
-- una COTA INFERIOR: alguien que lee una pantalla cuarenta minutos y se va mide
-- cero. GA4 tiene el mismo problema y lo resuelve con pings de engagement; aca
-- se decidio NO agregarlos, porque multiplicarian el volumen de la tabla mas
-- grande del schema para afinar la metrica menos accionable del set.
--
-- Por eso va tambien la mediana: dos sesiones abandonadas con la pestaña abierta
-- arruinan el promedio.
CREATE OR REPLACE FUNCTION public.admin_usage_sessions(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  org_id UUID,
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
    -- `user_id` va en el GROUP BY y no como agregado: una sesion pertenece a
    -- una sola persona, y Postgres no tiene MIN() para uuid.
    SELECT e.org_id,
           e.session_id,
           e.user_id,
           COUNT(DISTINCT e.screen) AS screens,
           EXTRACT(EPOCH FROM (MAX(e.occurred_at) - MIN(e.occurred_at))) AS duration_sec
    FROM usage_events e
    WHERE e.occurred_at >= NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))
      AND e.session_id IS NOT NULL
      AND (p_org_id IS NULL OR e.org_id = p_org_id)
    GROUP BY e.org_id, e.session_id, e.user_id
  )
  SELECT org_id,
         COUNT(*)::BIGINT,
         COUNT(DISTINCT user_id)::BIGINT,
         ROUND(AVG(screens), 1),
         ROUND(AVG(duration_sec)),
         ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_sec)::NUMERIC)
  FROM per_session
  GROUP BY org_id
$$;

-- -----------------------------------------------------------------
-- 3. Logins por dia
-- -----------------------------------------------------------------
-- Sale de `login_sessions`, no del event stream: tiene historia retroactiva
-- desde febrero (ver 20260814000001) y no depende de que el browser llegue a
-- mandar el beacon.
--
-- Cobertura: solo login con password. Magic link y aceptacion de invitacion no
-- pasan por `/post-login`, pero SI crean sesion, asi que aca aparecen igual.
CREATE OR REPLACE FUNCTION public.admin_usage_logins_daily(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (day DATE, logins BIGINT, users BIGINT, orgs BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT (started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE,
         COUNT(*)::BIGINT,
         COUNT(DISTINCT user_id)::BIGINT,
         COUNT(DISTINCT org_id)::BIGINT
  FROM login_sessions
  WHERE started_at >= NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))
    AND (p_org_id IS NULL OR org_id = p_org_id)
  GROUP BY 1
$$;

-- -----------------------------------------------------------------
-- 4. Usuarios activos: DAU / WAU / MAU
-- -----------------------------------------------------------------
-- El CTE de (usuario, dia) distintos va PRIMERO y es chico — ~50 usuarios por
-- ~120 dias son unas 6k filas. Sin el, cada dia del grafico volveria a escanear
-- las ~34 tablas del union de escrituras.
--
-- Se piden `p_days + 30` dias de historia porque el MAU del primer dia del
-- grafico necesita los 30 anteriores.
CREATE OR REPLACE FUNCTION public.admin_usage_active_users(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL,
  p_agency_id UUID DEFAULT NULL
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
$$;

-- -----------------------------------------------------------------
-- 5. Stickiness por organizacion
-- -----------------------------------------------------------------
-- DAU/MAU es el indicador estandar de "se volvio habito": 1.0 seria que todos
-- los que la usan en el mes la usan todos los dias. Arriba de 0.2 ya es un
-- producto que se abre casi a diario.
CREATE OR REPLACE FUNCTION public.admin_usage_stickiness_by_org(p_days INT DEFAULT 30)
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
-- 6. Drill-down por agencia
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_usage_by_agency(
  p_days INT DEFAULT 30,
  p_org_id UUID DEFAULT NULL
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
  )
  SELECT acts.org_id,
         acts.agency_id,
         -- LEFT JOIN y no INNER: `agency_id` no tiene FK a proposito (ver la
         -- migracion de dimensiones), asi que una agencia borrada deja un id
         -- huerfano que igual hay que mostrar.
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
-- 7. Drill-down por persona
-- -----------------------------------------------------------------
-- LA UNICA RPC CON PII. `p_org_id` es OBLIGATORIO y sin default: sin eso, una
-- sola llamada devolveria el padron de usuarios de toda la plataforma.
--
-- `is_platform_admin` importa mas de lo que parece: los platform admins tienen
-- `org_id` de una agencia real (admin@vibook.ai pertenece a Lozada) y
-- apareceria como el usuario mas activo de esa org. `/admin` esta excluido de la
-- telemetria, pero nada les impide navegar el dashboard del tenant.
CREATE OR REPLACE FUNCTION public.admin_usage_by_user(
  p_org_id UUID,
  p_days INT DEFAULT 30
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
    GROUP BY e.user_id
  ),
  logins AS (
    SELECT ls.user_id, MAX(ls.started_at) AS last_login_at
    FROM login_sessions ls WHERE ls.org_id = p_org_id GROUP BY ls.user_id
  )
  SELECT u.id,
         u.name::TEXT,
         u.email::TEXT,
         u.role::TEXT,
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
$$;

-- -----------------------------------------------------------------
-- 8. Activacion / time-to-value
-- -----------------------------------------------------------------
-- Sale integra de tablas que ya existian: tiene historia retroactiva desde el
-- dia uno.
--
-- `is_migrated` no es cosmetico: las orgs que entraron con datos historicos
-- tienen operaciones ANTERIORES a su `created_at`, o sea dias negativos. Sin el
-- flag ensucian la mediana de la cohorte y no hay forma de excluirlas.
CREATE OR REPLACE FUNCTION public.admin_usage_activation()
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
  WITH firsts AS (
    SELECT o.id,
           (SELECT MIN(op.created_at) FROM operations op WHERE op.org_id = o.id) AS first_op,
           (SELECT MIN(p.created_at) FROM payments p WHERE p.org_id = o.id) AS first_pay
    FROM organizations o
  )
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
  JOIN firsts f ON f.id = o.id
$$;

-- -----------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_usage_screens(INT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_sessions(INT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_logins_daily(INT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_active_users(INT, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_stickiness_by_org(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_by_agency(INT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_by_user(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_activation() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_usage_screens(INT, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_sessions(INT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_logins_daily(INT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_active_users(INT, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_stickiness_by_org(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_agency(INT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_by_user(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_activation() TO service_role;

COMMIT;
