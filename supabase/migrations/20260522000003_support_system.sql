-- ============================================================
-- Support System — Chat persistence, Tickets, Feedback
-- Vibook's built-in support > Tawk.to
-- ============================================================

-- ─── Conversations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Nueva conversación',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'escalated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_conv_user ON support_conversations(user_id);
CREATE INDEX idx_support_conv_org ON support_conversations(org_id);
CREATE INDEX idx_support_conv_updated ON support_conversations(updated_at DESC);

CREATE TRIGGER set_support_conversations_updated_at
  BEFORE UPDATE ON support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_conversations_select"
  ON support_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "own_conversations_insert"
  ON support_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_conversations_update"
  ON support_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid());


-- ─── Messages ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  feedback text CHECK (feedback IN ('positive', 'negative')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_msg_conv ON support_messages(conversation_id);
CREATE INDEX idx_support_msg_created ON support_messages(conversation_id, created_at);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_messages_select"
  ON support_messages FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM support_conversations
      WHERE user_id = auth.uid() OR org_id IN (SELECT public.user_org_ids())
    )
  );

CREATE POLICY "own_messages_insert"
  ON support_messages FOR INSERT TO authenticated
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM support_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "own_messages_update"
  ON support_messages FOR UPDATE TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM support_conversations WHERE user_id = auth.uid()
    )
  );


-- ─── Tickets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES support_conversations(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_org ON support_tickets(org_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);

CREATE TRIGGER set_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_tickets_select"
  ON support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "own_tickets_insert"
  ON support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin_tickets_update"
  ON support_tickets FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
