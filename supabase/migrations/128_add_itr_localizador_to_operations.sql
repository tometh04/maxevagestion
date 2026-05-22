-- Agrega campo ITR LOCALIZADOR a operaciones
-- Código de liquidación del operador para identificar una reserva/cliente puntual

ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS itr_localizador TEXT NULL;

COMMENT ON COLUMN operations.itr_localizador IS 'Código ITR/localizador del operador para identificar la reserva en su sistema';
