-- Agregar campo movement_type a partner_withdrawals para distinguir retiros de aportes
-- Los registros existentes quedan como 'WITHDRAWAL' automáticamente (DEFAULT)
ALTER TABLE partner_withdrawals ADD COLUMN IF NOT EXISTS movement_type TEXT NOT NULL DEFAULT 'WITHDRAWAL'
  CHECK (movement_type IN ('WITHDRAWAL', 'DEPOSIT'));

-- Notificar a PostgREST para que recargue el schema
NOTIFY pgrst, 'reload schema';
