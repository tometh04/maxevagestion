-- =====================================================
-- Migración 111: Agregar columna affects_balance a ledger_movements
-- =====================================================
-- Permite crear movimientos "informativos" que se VEN en la lista
-- pero NO afectan el cálculo de saldos de las cuentas financieras.
-- Caso de uso: movimientos históricos importados donde el saldo
-- inicial (initial_balance) ya contempla esos montos.

ALTER TABLE ledger_movements
ADD COLUMN IF NOT EXISTS affects_balance BOOLEAN NOT NULL DEFAULT true;

-- Comentario descriptivo
COMMENT ON COLUMN ledger_movements.affects_balance IS 'Si es false, el movimiento se muestra en la UI pero no afecta el cálculo de balance de la cuenta. Usado para importaciones históricas donde el initial_balance ya contempla los montos.';

-- Índice parcial para queries de balance (solo filas que afectan balance)
CREATE INDEX IF NOT EXISTS idx_ledger_affects_balance ON ledger_movements(account_id, affects_balance) WHERE affects_balance = true;
