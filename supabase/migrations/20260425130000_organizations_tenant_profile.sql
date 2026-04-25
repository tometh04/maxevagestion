-- =====================================================
-- Migración 163: Tenant Profile Fields (Phase A admin)
-- =====================================================
-- Agrega 9 columnas nullable a organizations para que el tenant
-- complete su perfil (contacto, dirección fiscal, condición fiscal AR)
-- + 1 columna admin-only (internal_notes).
--
-- RLS: las policies actuales (members read + owner update) cubren las
-- nuevas columnas. internal_notes se filtra a nivel de endpoint del
-- tenant (cuando exista) — no en RLS, así admin lee normal con service_role.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS contact_name        TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone       TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes      TEXT,
  ADD COLUMN IF NOT EXISTS address_street      TEXT,
  ADD COLUMN IF NOT EXISTS address_city        TEXT,
  ADD COLUMN IF NOT EXISTS address_province    TEXT,
  ADD COLUMN IF NOT EXISTS address_country     TEXT DEFAULT 'AR',
  ADD COLUMN IF NOT EXISTS address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS tax_category        TEXT
    CHECK (tax_category IN (
      'RESPONSABLE_INSCRIPTO',
      'MONOTRIBUTO',
      'EXENTO',
      'CONSUMIDOR_FINAL',
      'NO_RESPONSABLE'
    ));

COMMENT ON COLUMN organizations.internal_notes IS
  'Notas admin-only sobre la org. NO debe exponerse al tenant en sus endpoints.';
