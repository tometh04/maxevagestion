-- ============================================================
-- support_tickets.attachments — adjuntos cargados desde el widget.
--
-- Array JSON de objetos { name, url, type, size }. Los archivos viven en el
-- bucket público `documents` bajo el prefijo `support/`, así que la url es
-- directamente accesible (también desde Linear).
-- ============================================================

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
