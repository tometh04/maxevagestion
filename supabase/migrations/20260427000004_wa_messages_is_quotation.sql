-- Clasificador PDFs cotización (#3 reunión Gabi)
-- is_quotation = NULL: pending classification
-- is_quotation = true: real quotation, cuenta para "PDFs Enviados"
-- is_quotation = false: otro doc (factura/voucher/etc), NO cuenta
ALTER TABLE wa_messages
  ADD COLUMN IF NOT EXISTS is_quotation BOOLEAN;

-- Índice parcial: el cron filtra rápido pendientes outbound recientes
CREATE INDEX IF NOT EXISTS idx_wa_messages_unclassified_pdfs
  ON wa_messages (sent_at DESC)
  WHERE message_type = 'document' AND is_quotation IS NULL AND direction = 'outbound';
