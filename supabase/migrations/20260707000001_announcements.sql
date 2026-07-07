-- =====================================================
-- Novedades del sistema (changelog global del producto)
-- Tablas: announcements, announcement_reads
-- =====================================================
-- El equipo de vibook (platform_admins) publica novedades desde /admin.
-- Son GLOBALES: todos los usuarios autenticados de todas las orgs las ven
-- (no scopeadas por org_id). Molde: kb_articles (tabla global) + custom_plans
-- (gate de escritura por platform_admins).

-- ─── Tabla announcements (global, sin org_id) ────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  body          text NOT NULL,
  type          text NOT NULL DEFAULT 'NEW'
                CHECK (type IN ('NEW','IMPROVEMENT','FIX')),
  published     boolean NOT NULL DEFAULT true,
  published_at  timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_published
  ON announcements(published, published_at DESC)
  WHERE published = true;

-- ─── Tabla announcement_reads (tracking por usuario) ─────────
-- Una fila = "este usuario ya leyó esta novedad". Sin fila = no leída.

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_user
  ON announcement_reads(user_id);

-- ─── Trigger updated_at ──────────────────────────────────────
-- Reusa trigger_set_updated_at (definida por migraciones previas; la creamos
-- defensivamente si no existe).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_set_updated_at') THEN
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $body$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS announcements_updated_at ON announcements;
CREATE TRIGGER announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ─── RLS: announcements ──────────────────────────────────────
-- Lectura: cualquier usuario autenticado ve las novedades publicadas (global).
-- Escritura: solo platform_admins (defense-in-depth; las API admin usan
-- service_role igual, pero el gate protege ante accesos directos).

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_read ON announcements;
CREATE POLICY announcements_read ON announcements
  FOR SELECT TO authenticated
  USING (published = true);

DROP POLICY IF EXISTS announcements_admin_all ON announcements;
CREATE POLICY announcements_admin_all ON announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

-- ─── RLS: announcement_reads ─────────────────────────────────
-- Cada usuario solo ve/inserta sus propias filas (gate por users.auth_id).

ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_reads_self ON announcement_reads;
CREATE POLICY announcement_reads_self ON announcement_reads
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = announcement_reads.user_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = announcement_reads.user_id
        AND u.auth_id = auth.uid()
    )
  );
