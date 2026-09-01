-- ============================================================================
-- MIGRATION — organizations.agente_blanco_org_slug
-- Fecha: 2026-08-30
-- Contexto:
--   Embebido de "Conversaciones" (bandeja de Instagram/WhatsApp de Agente
--   Blanco dentro de Vibook). Agente Blanco identifica a cada empresa con un
--   slug corto propio (ej. 'lozada-viajes') que nos pasan ellos, uno por org.
--
--   Este campo es el switch de la seccion: org sin slug => la seccion no
--   existe (no aparece en el sidebar y la ruta devuelve 404). Ver
--   docs/integrations/agente-blanco/embebido.md.
--
--   Se guarda en organizations y no en org_integrations porque no hay webhook
--   entrante: org_integrations exige webhook_token/webhook_secret NOT NULL y
--   modela credenciales de integraciones inbound. Aca solo hay un
--   identificador externo por tenant.
--
--   Lo escribe SOLO platform admin (PATCH /api/admin/orgs/[id]/agente-blanco).
--   Ningun flujo de tenant lo modifica: si el usuario pudiera setearlo,
--   podria pedir la bandeja de otra empresa habilitada.
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS agente_blanco_org_slug TEXT;

-- Formato del slug: minusculas, digitos y guiones internos. Mismo regex que
-- valida la API (lib/agente-blanco/config.ts) — la DB es la ultima linea.
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_agente_blanco_org_slug_format;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_agente_blanco_org_slug_format
  CHECK (
    agente_blanco_org_slug IS NULL
    OR agente_blanco_org_slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'
  );

-- Un slug de Agente Blanco pertenece a UNA sola org de Vibook. Sin esto, dos
-- tenants podrian apuntar a la misma bandeja (fuga cross-tenant hacia afuera).
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_agente_blanco_org_slug
  ON organizations (agente_blanco_org_slug)
  WHERE agente_blanco_org_slug IS NOT NULL;

COMMENT ON COLUMN organizations.agente_blanco_org_slug IS
  'Identificador de la empresa en Agente Blanco (lo asigna Agente Blanco). Va en el claim `org` del JWT que firma /api/agente-blanco/token. NULL = la seccion Conversaciones no existe para esta org. Solo lo escribe platform admin.';
