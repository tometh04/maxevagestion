-- =====================================================
-- Migration 123: crear RLS policies para las 4 tablas (sin activar RLS)
-- =====================================================
-- IMPORTANTE: este script crea las policies pero NO ejecuta
-- ENABLE ROW LEVEL SECURITY. La activación se hace en otra sesión,
-- tabla por tabla, después de auditar que cada endpoint pase agency_id
-- correctamente. Mientras RLS no está habilitada, las policies no
-- tienen efecto (existen pero no se aplican).
--
-- Pre-requisitos:
--   - agency_id existe en las 4 tablas (migration 114)
--   - backfill aplicado (migrations 115-118, 120)
-- =====================================================

DO $$
BEGIN
  -- customers
  DROP POLICY IF EXISTS customers_tenant_isolation ON customers;
  CREATE POLICY customers_tenant_isolation ON customers
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );

  -- operators
  DROP POLICY IF EXISTS operators_tenant_isolation ON operators;
  CREATE POLICY operators_tenant_isolation ON operators
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );

  -- payments
  DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
  CREATE POLICY payments_tenant_isolation ON payments
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );

  -- cash_movements
  DROP POLICY IF EXISTS cash_movements_tenant_isolation ON cash_movements;
  CREATE POLICY cash_movements_tenant_isolation ON cash_movements
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );
END $$;

-- Verificación 1: las 4 policies deben existir
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('customers', 'operators', 'payments', 'cash_movements')
  AND policyname LIKE '%tenant_isolation%'
ORDER BY tablename;

-- Verificación 2: RLS debe estar DESACTIVADA (rowsecurity = false) en las 4
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('customers', 'operators', 'payments', 'cash_movements')
  AND schemaname = 'public'
ORDER BY tablename;
