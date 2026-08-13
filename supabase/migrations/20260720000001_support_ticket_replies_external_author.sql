-- ============================================================
-- support_ticket_replies: soportar autores externos (comentarios de Linear).
--
-- Un comentario hecho por un desarrollador en el issue de Linear se replica
-- como respuesta del ticket. Ese autor NO es un auth.users del sistema, así que
-- author_id pasa a ser nullable y se guarda el nombre del autor + el origen.
-- ============================================================

ALTER TABLE support_ticket_replies
  ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE support_ticket_replies
  ADD COLUMN IF NOT EXISTS author_name text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app'
    CHECK (source IN ('app', 'linear'));
