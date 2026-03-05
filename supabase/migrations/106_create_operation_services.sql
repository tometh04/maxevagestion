-- ============================================================
-- MIGRATION 106: Create operation_services table
-- Servicios adicionales dentro de una operación
-- (Asiento, Equipaje, Visa, Transfer, Asistencia)
-- ============================================================

-- 1. Tipo enum para los tipos de servicio
CREATE TYPE operation_service_type AS ENUM (
  'SEAT',
  'LUGGAGE',
  'VISA',
  'TRANSFER',
  'ASSISTANCE'
);

-- 2. Tabla principal de servicios de operación
CREATE TABLE operation_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  service_type operation_service_type NOT NULL,
  description TEXT,

  -- Operador/proveedor del servicio
  operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,

  -- Precio al cliente
  sale_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sale_currency TEXT NOT NULL DEFAULT 'ARS' CHECK (sale_currency IN ('ARS', 'USD')),

  -- Costo nuestro al proveedor
  cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost_currency TEXT NOT NULL DEFAULT 'ARS' CHECK (cost_currency IN ('ARS', 'USD')),

  -- Margen (calculado = sale_amount - cost_amount, solo válido si misma moneda)
  margin_amount NUMERIC(12, 2) GENERATED ALWAYS AS (
    CASE WHEN sale_currency = cost_currency THEN sale_amount - cost_amount ELSE NULL END
  ) STORED,

  -- Si este tipo de servicio genera comisión al vendedor
  -- SEAT=false, LUGGAGE=false, VISA=false, TRANSFER=true, ASSISTANCE=true
  generates_commission BOOLEAN NOT NULL DEFAULT false,

  -- IDs de los registros contables generados (para trazabilidad y rollback)
  payment_id UUID,            -- registro en payments (deuda cliente)
  operator_payment_id UUID,   -- registro en operator_payments (deuda proveedor)
  ledger_income_id UUID,      -- ledger_movement INCOME
  ledger_expense_id UUID,     -- ledger_movement EXPENSE
  commission_record_id UUID,  -- commission_records si aplica

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Índices
CREATE INDEX idx_operation_services_operation_id ON operation_services(operation_id);
CREATE INDEX idx_operation_services_agency_id ON operation_services(agency_id);
CREATE INDEX idx_operation_services_operator_id ON operation_services(operator_id);

-- 4. Trigger updated_at
CREATE OR REPLACE FUNCTION update_operation_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_operation_services_updated_at
  BEFORE UPDATE ON operation_services
  FOR EACH ROW
  EXECUTE FUNCTION update_operation_services_updated_at();

-- 5. RLS
ALTER TABLE operation_services ENABLE ROW LEVEL SECURITY;

-- Helper: usuario tiene acceso a la agencia (member) o es SUPER_ADMIN/ADMIN
-- Los SUPER_ADMIN no siempre tienen registro en user_agencies, acceden por rol.

CREATE POLICY "Agency members can view their operation services"
  ON operation_services FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Agency admins and sellers can insert operation services"
  ON operation_services FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Agency admins can update operation services"
  ON operation_services FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Agency admins can delete operation services"
  ON operation_services FOR DELETE
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- 6. Insertar operador "Tarjeta de Crédito" si no existe
-- (usado principalmente para el servicio de Asiento pagado con tarjeta)
INSERT INTO operators (name, contact_name, contact_email, contact_phone, credit_limit)
SELECT 'Tarjeta de Crédito', NULL, NULL, NULL, 0
WHERE NOT EXISTS (
  SELECT 1 FROM operators WHERE name = 'Tarjeta de Crédito'
);
