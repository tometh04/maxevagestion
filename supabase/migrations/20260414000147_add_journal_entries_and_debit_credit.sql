-- =====================================================
-- Migración 147: Tabla journal_entries + Columnas Debe/Haber en ledger_movements
-- Implementación de partida doble profesional (Debe/Haber)
-- =====================================================

-- =====================================================
-- 1. Tabla de Asientos Contables (Journal Entries)
-- =====================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Número secuencial de asiento (auto-increment)
  entry_number SERIAL,

  -- Fecha del asiento contable
  entry_date DATE NOT NULL,

  -- Descripción / concepto del asiento
  description TEXT NOT NULL,

  -- Operación relacionada (opcional)
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,

  -- Origen del asiento
  -- MANUAL: creado a mano por el usuario
  -- AUTO_PAYMENT: generado al registrar cobro/pago
  -- AUTO_CONFIRMATION: generado al confirmar operación
  -- AUTO_COMMISSION: generado al pagar comisión
  -- AUTO_FX: generado por diferencia de cambio
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'AUTO_PAYMENT', 'AUTO_CONFIRMATION', 'AUTO_COMMISSION', 'AUTO_FX')),

  -- Validación: Debe = Haber
  is_balanced BOOLEAN NOT NULL DEFAULT true,

  -- Monto total del asiento (suma de Debe)
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Moneda principal del asiento
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),

  -- Notas adicionales
  notes TEXT,

  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para journal_entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_operation ON journal_entries(operation_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source);
CREATE INDEX IF NOT EXISTS idx_journal_entries_number ON journal_entries(entry_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at ON journal_entries(created_at DESC);

-- Comentarios
COMMENT ON TABLE journal_entries IS 'Asientos contables. Cada asiento agrupa N movimientos de ledger con Debe = Haber.';
COMMENT ON COLUMN journal_entries.entry_number IS 'Número secuencial auto-generado para referencia rápida';
COMMENT ON COLUMN journal_entries.source IS 'Origen: MANUAL (usuario), AUTO_PAYMENT (cobro/pago), AUTO_CONFIRMATION, AUTO_COMMISSION, AUTO_FX';

-- =====================================================
-- 2. Columnas nuevas en ledger_movements
-- =====================================================

-- Referencia al asiento contable
ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- Debe (debit) y Haber (credit) - partida doble
ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS debit_amount NUMERIC(18,2) DEFAULT NULL;

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(18,2) DEFAULT NULL;

-- Referencia directa a cuenta contable (chart_of_accounts)
-- Permite asociar un movimiento a una cuenta del plan sin pasar por financial_accounts
ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

-- Índices para las columnas nuevas
CREATE INDEX IF NOT EXISTS idx_ledger_journal_entry ON ledger_movements(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_ledger_chart_account ON ledger_movements(chart_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_debit_credit ON ledger_movements(debit_amount, credit_amount)
  WHERE debit_amount IS NOT NULL OR credit_amount IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN ledger_movements.journal_entry_id IS 'Asiento contable al que pertenece este movimiento';
COMMENT ON COLUMN ledger_movements.debit_amount IS 'Monto en Debe (partida doble). NULL = movimiento legacy (usa type-based calc)';
COMMENT ON COLUMN ledger_movements.credit_amount IS 'Monto en Haber (partida doble). NULL = movimiento legacy (usa type-based calc)';
COMMENT ON COLUMN ledger_movements.chart_account_id IS 'Cuenta contable directa del plan de cuentas (complementa account_id de financial_accounts)';

-- =====================================================
-- 3. RLS Policies para journal_entries
-- =====================================================
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- Política de lectura: todos los usuarios autenticados
CREATE POLICY "journal_entries_select" ON journal_entries
  FOR SELECT USING (true);

-- Política de inserción: todos los usuarios autenticados
CREATE POLICY "journal_entries_insert" ON journal_entries
  FOR INSERT WITH CHECK (true);

-- Política de actualización: todos los usuarios autenticados
CREATE POLICY "journal_entries_update" ON journal_entries
  FOR UPDATE USING (true);
