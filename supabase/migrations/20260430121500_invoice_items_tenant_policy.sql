-- Allow invoice items to follow the same tenant access model as their parent invoice.
-- The legacy policy checks user_agencies.user_id = auth.uid(), but user_agencies
-- stores the app users.id in current data while auth.uid() is auth.users.id.
-- Invoices already carry org_id and are protected with user_org_ids().

DROP POLICY IF EXISTS invoice_items_tenant_isolation ON invoice_items;

CREATE POLICY invoice_items_tenant_isolation
  ON invoice_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND invoices.org_id IN (SELECT user_org_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND invoices.org_id IN (SELECT user_org_ids())
    )
  );
