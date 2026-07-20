-- ============================================================
-- Fix: columnas faltantes en support_tickets en producción.
--
-- La migración original 20260522000003_support_system.sql definía
-- priority / assigned_to / resolved_at, pero en producción la tabla quedó
-- creada SIN esas columnas (la migración de mayo se aplicó parcial o la tabla
-- se creó por otra vía). Resultado: el panel /admin/tickets (que selecciona
-- priority) tiraba "column support_tickets.priority does not exist" y el INSERT
-- de un ticket clasificado fallaba.
--
-- Este backfill agrega las columnas de forma idempotente (IF NOT EXISTS), así
-- que es seguro en cualquier entorno donde ya existan.
-- ============================================================

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_support_tickets_priority
  ON support_tickets(priority);
