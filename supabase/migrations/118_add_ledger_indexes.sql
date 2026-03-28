-- Performance indexes for accounting reports
CREATE INDEX IF NOT EXISTS idx_ledger_movements_movement_date ON ledger_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_type_date ON ledger_movements(type, movement_date);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_account_date ON ledger_movements(account_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_operation_type ON ledger_movements(operation_id, type);

-- Index for IVA reports
CREATE INDEX IF NOT EXISTS idx_iva_sales_date ON iva_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_date ON iva_purchases(purchase_date);

-- Index for commission lookups
CREATE INDEX IF NOT EXISTS idx_commission_records_operation_seller ON commission_records(operation_id, seller_id);
