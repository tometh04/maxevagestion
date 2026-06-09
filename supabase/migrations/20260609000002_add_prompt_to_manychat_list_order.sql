-- Prompt configurable por lista del Kanban CRM.
-- Se usa como contexto al generar el prompt sugerido del chat con Emilia
-- ("Cotizar" en el detalle del lead): el prompt de la columna donde está el
-- lead se incorpora al mensaje que viaja a la API de Emilia.

ALTER TABLE manychat_list_order
  ADD COLUMN IF NOT EXISTS prompt TEXT;

COMMENT ON COLUMN manychat_list_order.prompt IS 'Contexto/instrucciones para Emilia al cotizar leads de esta lista (ej: "Cotizar all inclusive saliendo desde Córdoba"). NULL = sin prompt.';
