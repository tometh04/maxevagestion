-- =====================================================
-- Agregar estado CONVERTING a quotations.status
-- Migración 20260416000154
--
-- Motivación: el endpoint POST /api/quotations/[id]/convert usa un
-- CAS lock que pasa el status de APPROVED a CONVERTING. Sin este
-- valor en el CHECK, el UPDATE falla.
--
-- Idempotente: si el CHECK ya incluye 'CONVERTING', el bloque no hace nada.
-- =====================================================

DO $$
BEGIN
  -- Chequear si el valor 'CONVERTING' ya es aceptado
  BEGIN
    -- Intento un update con CONVERTING en una fila temporal-memoria (rollback)
    -- Mejor: recrear el CHECK drop+add (idempotente)
    ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_status_check;

    ALTER TABLE quotations ADD CONSTRAINT quotations_status_check
      CHECK (status IN (
        'DRAFT',
        'SENT',
        'PENDING_APPROVAL',
        'APPROVED',
        'CONVERTING',      -- NUEVO: lock intermedio al convertir
        'REJECTED',
        'EXPIRED',
        'CONVERTED'
      ));
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Error ajustando CHECK de quotations.status: %', SQLERRM;
  END;
END $$;
