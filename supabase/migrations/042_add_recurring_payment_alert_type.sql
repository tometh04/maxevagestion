-- =====================================================
-- Migración 042: Agregar soporte para alertas de pagos recurrentes
-- =====================================================

-- Agregar columna metadata si no existe (para guardar info adicional de alertas)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'metadata') THEN
        ALTER TABLE alerts ADD COLUMN metadata JSONB;
    END IF;
END $$;

-- Agregar columna priority si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'priority') THEN
        ALTER TABLE alerts ADD COLUMN priority TEXT DEFAULT 'MEDIUM';
    END IF;
END $$;

-- Comentarios
COMMENT ON COLUMN alerts.metadata IS 'Información adicional de la alerta en formato JSON';
COMMENT ON COLUMN alerts.priority IS 'Prioridad: LOW, MEDIUM, HIGH';

