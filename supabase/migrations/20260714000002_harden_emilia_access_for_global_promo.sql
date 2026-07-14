-- Habilitación global temporal de Emilia y hardening multi-tenant.
-- La regla temporal/por plan vive en lib/emilia/access.ts. Esta migración
-- asegura que las conversaciones también tengan ownership de organización y
-- recupera RLS como defensa en profundidad.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- user_id es TEXT por legado y llegó a guardar tanto users.id como auth.uid().
-- Normalizamos ambos formatos al id interno que usa hoy la aplicación.
UPDATE conversations c
SET
  org_id = u.org_id,
  user_id = u.id::text
FROM users u
WHERE c.org_id IS NULL
  AND u.org_id IS NOT NULL
  AND (
    c.user_id = u.id::text
    OR c.user_id = u.auth_id::text
  );

CREATE INDEX IF NOT EXISTS idx_conversations_org_user_state
  ON conversations(org_id, user_id, state, last_message_at DESC);

-- El flujo GET -> POST puede recibir dos clicks concurrentes. Cerramos
-- duplicados históricos conservando la conversación más reciente y luego
-- protegemos la invariante en DB.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, user_id, lead_id
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_number
  FROM conversations
  WHERE org_id IS NOT NULL
    AND lead_id IS NOT NULL
    AND state = 'active'
)
UPDATE conversations c
SET state = 'closed'
FROM ranked r
WHERE c.id = r.id
  AND r.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_one_active_per_lead_user
  ON conversations(org_id, user_id, lead_id)
  WHERE org_id IS NOT NULL
    AND lead_id IS NOT NULL
    AND state = 'active';

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_tenant_select ON conversations;
DROP POLICY IF EXISTS conversations_tenant_insert ON conversations;
DROP POLICY IF EXISTS conversations_tenant_update ON conversations;
DROP POLICY IF EXISTS conversations_tenant_delete ON conversations;
DROP POLICY IF EXISTS "conversations_owner_all" ON conversations;
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;

CREATE POLICY conversations_tenant_select ON conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id::text = conversations.user_id
        AND u.auth_id = auth.uid()
        AND u.is_active = true
        AND u.org_id = conversations.org_id
    )
  );

CREATE POLICY conversations_tenant_insert ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id::text = conversations.user_id
        AND u.auth_id = auth.uid()
        AND u.is_active = true
        AND u.org_id = conversations.org_id
    )
  );

CREATE POLICY conversations_tenant_update ON conversations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id::text = conversations.user_id
        AND u.auth_id = auth.uid()
        AND u.is_active = true
        AND u.org_id = conversations.org_id
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id::text = conversations.user_id
        AND u.auth_id = auth.uid()
        AND u.is_active = true
        AND u.org_id = conversations.org_id
    )
  );

CREATE POLICY conversations_tenant_delete ON conversations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id::text = conversations.user_id
        AND u.auth_id = auth.uid()
        AND u.is_active = true
        AND u.org_id = conversations.org_id
    )
  );

DROP POLICY IF EXISTS messages_tenant_select ON messages;
DROP POLICY IF EXISTS messages_tenant_insert ON messages;
DROP POLICY IF EXISTS messages_tenant_update ON messages;
DROP POLICY IF EXISTS messages_tenant_delete ON messages;
DROP POLICY IF EXISTS "messages_owner_all" ON messages;
DROP POLICY IF EXISTS "Users can view messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can delete messages from their conversations" ON messages;

CREATE POLICY messages_tenant_select ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      INNER JOIN users u ON u.id::text = c.user_id
      WHERE c.id = messages.conversation_id
        AND u.auth_id = auth.uid()
        AND u.is_active = true
        AND u.org_id = c.org_id
    )
  );

CREATE POLICY messages_tenant_insert ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversations c
      INNER JOIN users u ON u.id::text = c.user_id
      WHERE c.id = messages.conversation_id
        AND u.auth_id = auth.uid()
        AND u.is_active = true
        AND u.org_id = c.org_id
    )
  );

CREATE POLICY messages_tenant_update ON messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      INNER JOIN users u ON u.id::text = c.user_id
      WHERE c.id = messages.conversation_id
        AND u.auth_id = auth.uid()
        AND u.is_active = true
        AND u.org_id = c.org_id
    )
  );

CREATE POLICY messages_tenant_delete ON messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      INNER JOIN users u ON u.id::text = c.user_id
      WHERE c.id = messages.conversation_id
        AND u.auth_id = auth.uid()
        AND u.is_active = true
        AND u.org_id = c.org_id
    )
  );

COMMENT ON COLUMN conversations.org_id IS
  'Organización propietaria de la conversación Emilia. Obligatorio para filas nuevas; nullable sólo para legado sin tenant.';
