-- ============================================================================
-- MIGRATION — agencies.agente_blanco_network
-- Fecha: 2026-08-30
-- Contexto:
--   Segundo campo del embebido de Conversaciones (ver migracion
--   20260830000002 y docs/integrations/agente-blanco/embebido-conversaciones.md).
--
--   En Agente Blanco la "sucursal" es la RED conectada: la cuenta de Instagram
--   o el numero de WhatsApp. Una empresa con dos redes (Lozada: Rosario y
--   Madero) necesita decir cual bandeja abrir, porque sin el claim `network`
--   Agente Blanco muestra la primera por orden alfabetico y parece que faltan
--   chats.
--
--   Mapea 1:1 con nuestras agencias, igual que la ingesta de leads que ya
--   distingue por `agency`. El valor lo asigna Agente Blanco: acepta el id de
--   la red, el usuario de Instagram o el numero de WhatsApp.
--
--   Como el slug de la empresa, lo escribe SOLO platform admin.
-- ============================================================================

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS agente_blanco_network TEXT;

-- Formato permisivo a proposito: puede ser un id, un usuario de Instagram o un
-- telefono con +. Solo cortamos espacios y caracteres de control.
ALTER TABLE agencies
  DROP CONSTRAINT IF EXISTS agencies_agente_blanco_network_format;

ALTER TABLE agencies
  ADD CONSTRAINT agencies_agente_blanco_network_format
  CHECK (
    agente_blanco_network IS NULL
    OR agente_blanco_network ~ '^[A-Za-z0-9._+@-]{1,128}$'
  );

-- Una red (cuenta de IG / numero de WhatsApp) pertenece a una sola agencia.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agencies_agente_blanco_network
  ON agencies (agente_blanco_network)
  WHERE agente_blanco_network IS NOT NULL;

COMMENT ON COLUMN agencies.agente_blanco_network IS
  'Identificador de la red conectada en Agente Blanco (cuenta de IG o numero de WhatsApp). Va en el claim `network` del JWT y elige que bandeja abrir. NULL = esta agencia no tiene red propia. Solo lo escribe platform admin.';
