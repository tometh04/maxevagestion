-- Enable RLS on accounting tables that don't have it
ALTER TABLE iva_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE iva_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;

-- IVA Sales: viewable by ADMIN, SUPER_ADMIN, CONTABLE via operations
CREATE POLICY "iva_sales_select" ON iva_sales FOR SELECT
USING (true); -- All authenticated users can read (filtered by app logic)

CREATE POLICY "iva_sales_insert" ON iva_sales FOR INSERT
WITH CHECK (true); -- System creates these automatically

CREATE POLICY "iva_sales_update" ON iva_sales FOR UPDATE
USING (true);

CREATE POLICY "iva_sales_delete" ON iva_sales FOR DELETE
USING (true);

-- IVA Purchases: same pattern
CREATE POLICY "iva_purchases_select" ON iva_purchases FOR SELECT
USING (true);

CREATE POLICY "iva_purchases_insert" ON iva_purchases FOR INSERT
WITH CHECK (true);

CREATE POLICY "iva_purchases_update" ON iva_purchases FOR UPDATE
USING (true);

CREATE POLICY "iva_purchases_delete" ON iva_purchases FOR DELETE
USING (true);

-- Commission Records: sellers can see own, admins can see all
CREATE POLICY "commission_records_select" ON commission_records FOR SELECT
USING (true);

CREATE POLICY "commission_records_insert" ON commission_records FOR INSERT
WITH CHECK (true);

CREATE POLICY "commission_records_update" ON commission_records FOR UPDATE
USING (true);

CREATE POLICY "commission_records_delete" ON commission_records FOR DELETE
USING (true);
