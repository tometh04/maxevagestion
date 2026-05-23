-- support_ticket_replies: hilo de respuestas en tickets
CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('user','admin')),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_replies_ticket ON support_ticket_replies(ticket_id);

ALTER TABLE support_ticket_replies ENABLE ROW LEVEL SECURITY;

-- Users can see replies on their own tickets
CREATE POLICY "Users see replies on own tickets"
  ON support_ticket_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

-- Users can insert replies on their own tickets
CREATE POLICY "Users insert replies on own tickets"
  ON support_ticket_replies FOR INSERT
  WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

-- Auto-update ticket updated_at when new reply arrives
CREATE OR REPLACE FUNCTION support_reply_touch_ticket()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_reply_touch_ticket
  AFTER INSERT ON support_ticket_replies
  FOR EACH ROW EXECUTE FUNCTION support_reply_touch_ticket();
