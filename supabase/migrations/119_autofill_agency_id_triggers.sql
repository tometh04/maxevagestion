-- =====================================================
-- Migration 119: triggers BEFORE INSERT auto-fill agency_id
-- =====================================================
-- Garantiza que cualquier INSERT futuro en customers/operators/payments/
-- cash_movements tenga agency_id, incluso si el código del endpoint no
-- lo pasa explícitamente.
--
-- Estrategia por tabla:
--   payments: hereda de operation_id (NOT NULL) → operations.agency_id
--   cash_movements: 1° de operation_id, 2° de user_id → user_agencies
--   customers: de auth.uid() → user_agencies
--   operators: de auth.uid() → user_agencies
--
-- Comportamiento: si el caller pasa agency_id, NO se sobreescribe.
-- Si no se puede determinar (admin client sin auth.uid() y sin operation_id):
-- agency_id queda NULL → el constraint NOT NULL (migration 121) lo rechaza.
-- Esto es intencional: forzar explicitud en code paths admin.
--
-- Limitación: usuarios con múltiples agencias (Maxi con Rosario+Madero)
-- → el trigger elige LIMIT 1 (la primera). Para esos casos el endpoint
-- debe pasar agency_id explícito. Aceptable en Fase 1; el motor de import
-- de Fase 2 SIEMPRE pasa agency_id como parámetro.
-- =====================================================

-- ─── payments ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_autofill_agency_id_payments()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    SELECT agency_id INTO NEW.agency_id
    FROM operations WHERE id = NEW.operation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS autofill_payments_agency_id ON payments;
CREATE TRIGGER autofill_payments_agency_id
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_autofill_agency_id_payments();

-- ─── cash_movements ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_autofill_agency_id_cash_movements()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    -- 1. Try operation_id
    IF NEW.operation_id IS NOT NULL THEN
      SELECT agency_id INTO NEW.agency_id
      FROM operations WHERE id = NEW.operation_id;
    END IF;

    -- 2. Fallback: user_id → user_agencies
    IF NEW.agency_id IS NULL AND NEW.user_id IS NOT NULL THEN
      SELECT agency_id INTO NEW.agency_id
      FROM user_agencies WHERE user_id = NEW.user_id LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS autofill_cash_movements_agency_id ON cash_movements;
CREATE TRIGGER autofill_cash_movements_agency_id
  BEFORE INSERT ON cash_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_autofill_agency_id_cash_movements();

-- ─── customers ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_autofill_agency_id_customers()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT agency_id INTO NEW.agency_id
    FROM user_agencies WHERE user_id = auth.uid() LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS autofill_customers_agency_id ON customers;
CREATE TRIGGER autofill_customers_agency_id
  BEFORE INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_autofill_agency_id_customers();

-- ─── operators ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_autofill_agency_id_operators()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT agency_id INTO NEW.agency_id
    FROM user_agencies WHERE user_id = auth.uid() LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS autofill_operators_agency_id ON operators;
CREATE TRIGGER autofill_operators_agency_id
  BEFORE INSERT ON operators
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_autofill_agency_id_operators();

-- Verificación: los 4 triggers existen
SELECT event_object_table AS tabla, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE 'autofill_%_agency_id'
ORDER BY event_object_table;
