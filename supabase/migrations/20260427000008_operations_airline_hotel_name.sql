-- Migración retroactiva: agrega operations.airline_name y operations.hotel_name
-- (item 6 backlog Santi). En el commit 56f1716 se agregaron en código pero la
-- migración SQL fue aplicada manualmente en el editor de Supabase y nunca
-- comiteada al repo. Esta migración hace IF NOT EXISTS para que sea idempotente
-- en prod (donde ya existen) y agregue las columnas en dev/staging fresh.

ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS airline_name TEXT,
  ADD COLUMN IF NOT EXISTS hotel_name TEXT;

-- Índices trigram para soportar el search ILIKE en /api/operations
-- (route.ts líneas 988-994). Sin esto el LIKE %x% hace seq scan en
-- tablas grandes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_operations_airline_name_trgm
  ON operations USING gin (airline_name gin_trgm_ops)
  WHERE airline_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operations_hotel_name_trgm
  ON operations USING gin (hotel_name gin_trgm_ops)
  WHERE hotel_name IS NOT NULL;

COMMENT ON COLUMN operations.airline_name IS 'Aerolínea principal de la operación. Usado para search en /operaciones.';
COMMENT ON COLUMN operations.hotel_name IS 'Hotel principal de la operación. Usado para search en /operaciones.';
