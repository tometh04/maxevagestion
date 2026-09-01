-- =====================================================
-- login_sessions — historial durable de sesiones
-- =====================================================
-- Hoy no existe NINGUN registro de login en Postgres. El tipo `AuditAction`
-- declara LOGIN/LOGOUT y la UI de auditoria ofrece filtrarlos, pero no hay un
-- solo call site: ese filtro no puede devolver filas.
--
-- Lo unico que hay es `auth.sessions`, que guarda `created_at` (el momento del
-- login) y `refreshed_at`. Al escribir esto son 335 sesiones de 77 usuarios, la
-- mas vieja de hace 234 dias.
--
-- POR QUE ESTA TABLA Y POR QUE AHORA: `auth.sessions` es efimero. Cuando se
-- active la expiracion de sesion (inactividad 12 h + timebox 7 dias) GoTrue
-- reapea las sesiones vencidas y con ellas se van ocho meses de historial de
-- login que hoy existen y que no se pueden reconstruir. Esta tabla se llena
-- ANTES de tocar esa configuracion.
--
-- QUE NO SE GUARDA:
--   * `ip` — dato personal y no aporta a ninguna metrica de producto.
--   * `user_agent` — inservible para clasificar dispositivo: el middleware
--     refresca la sesion server-side en cada request y pisa el UA del browser.
--     Al escribir esto, 183 de 335 sesiones dicen "Next.js Middleware" o "node".
--     El dispositivo se resuelve del lado del cliente, en el event stream.

BEGIN;

-- `service_role` no tiene SELECT sobre el schema `auth` (solo USAGE). El GRANT
-- explicito es preferible a una funcion SECURITY DEFINER: es auditable, acotado
-- a una tabla y no crea una superficie de escalada.
GRANT SELECT ON auth.sessions TO service_role;

CREATE TABLE IF NOT EXISTS login_sessions (
  -- El id de `auth.sessions`. Es lo que hace idempotente al sync: el cron puede
  -- correr cuantas veces quiera sin duplicar.
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  -- Se completa cuando la sesion desaparece de `auth.sessions` (logout,
  -- expiracion o revocacion). NULL = sigue viva.
  ended_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE login_sessions IS
  'Historial durable de sesiones, sincronizado desde auth.sessions. Sin IP ni user agent. Ver 20260814000001_login_sessions.sql.';
COMMENT ON COLUMN login_sessions.started_at IS
  'auth.sessions.created_at — el momento real del login.';
COMMENT ON COLUMN login_sessions.role IS
  'Rol del usuario al momento del sync. Se congela para que un cambio de rol no reescriba la historia.';

CREATE INDEX IF NOT EXISTS idx_login_sessions_org_started
  ON login_sessions (org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_sessions_user_started
  ON login_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_sessions_live
  ON login_sessions (org_id) WHERE ended_at IS NULL;

ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_sessions FORCE ROW LEVEL SECURITY;

-- Mismo criterio que `usage_events`: solo platform admin lee, los writes entran
-- por service_role. Un tenant no ve a que hora entra cada empleado.
DROP POLICY IF EXISTS "login_sessions_platform_admin_read" ON login_sessions;
CREATE POLICY "login_sessions_platform_admin_read" ON login_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------
-- Sync desde auth.sessions
-- -----------------------------------------------------------------
-- Todo el trabajo ocurre dentro de la base a proposito: PostgREST no expone el
-- schema `auth`, asi que la alternativa seria traer las filas por HTTP y volver
-- a escribirlas. Aca es una sola sentencia, atomica e idempotente.
--
-- INNER JOIN contra `users`: una sesion que no mapea a un usuario del producto
-- (auth huerfano) no es uso de ningun tenant y no interesa.
CREATE OR REPLACE FUNCTION public.admin_sync_login_sessions()
RETURNS TABLE (synced BIGINT, ended BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_synced BIGINT;
  v_ended BIGINT;
BEGIN
  WITH upserted AS (
    INSERT INTO login_sessions (id, user_id, org_id, role, started_at, last_seen_at, synced_at)
    SELECT s.id,
           u.id,
           u.org_id,
           u.role,
           s.created_at,
           -- `refreshed_at` es `timestamp without time zone` en auth.sessions.
           s.refreshed_at AT TIME ZONE 'UTC',
           NOW()
    FROM auth.sessions s
    INNER JOIN users u ON u.auth_id = s.user_id
    ON CONFLICT (id) DO UPDATE
      SET last_seen_at = EXCLUDED.last_seen_at,
          synced_at = NOW(),
          -- Una sesion que reaparece estaba viva: se corrige el cierre.
          ended_at = NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_synced FROM upserted;

  -- Lo que ya no esta arriba, termino. Se estampa una sola vez.
  WITH closed AS (
    UPDATE login_sessions ls
    SET ended_at = NOW()
    WHERE ls.ended_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = ls.id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_ended FROM closed;

  RETURN QUERY SELECT v_synced, v_ended;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sync_login_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_login_sessions() TO service_role;

COMMIT;
