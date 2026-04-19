-- ============================================================================
-- MIGRATION 136 — RLS tenant isolation en todas las tablas con org_id
-- ============================================================================
-- Policy uniforme: un usuario solo puede ver/escribir rows cuyo org_id esta
-- entre las orgs donde es miembro ACTIVE.
--
-- Impact:
-- - createServerClient (user-auth): queries auto-filtradas por RLS
-- - createAdminClient (service_role): RLS bypassed (sin cambio)
--
-- Para Maxi (OWNER de Lozada): ve toda la data de Lozada (ningun cambio)
-- Para LOLO user: solo ve data de LOLO
-- ============================================================================

-- Helper: la clausula que verifica membership
-- Nota: Supabase resuelve auth.uid() al UUID del usuario autenticado via JWT.

-- Drop policies existentes con este nombre (idempotente)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'leads', 'operations', 'operation_services', 'operation_customers',
    'operation_operators', 'operation_passengers', 'quotations', 'quotation_items',
    'payments', 'operator_payments', 'cash_movements', 'ledger_movements',
    'journal_entries', 'iva_sales', 'iva_purchases', 'commission_records',
    'commission_rules', 'tasks', 'whatsapp_messages', 'invoices',
    'recurring_payments', 'customer_segments', 'settings_trello',
    'customer_settings', 'operation_settings', 'financial_settings',
    'tools_settings', 'integrations', 'lead_comments', 'documents',
    'chart_of_accounts', 'partner_accounts', 'partner_profit_allocations',
    'recurring_payment_categories', 'financial_accounts', 'pdf_templates',
    'message_templates', 'alerts', 'organization_settings'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_select" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_insert" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_update" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_delete" ON %I', t);
  END LOOP;
END $$;

-- Enable RLS + create policy en cada tabla
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'leads', 'operations', 'operation_services', 'operation_customers',
    'operation_operators', 'operation_passengers', 'quotations', 'quotation_items',
    'payments', 'operator_payments', 'cash_movements', 'ledger_movements',
    'journal_entries', 'iva_sales', 'iva_purchases', 'commission_records',
    'commission_rules', 'tasks', 'whatsapp_messages', 'invoices',
    'recurring_payments', 'customer_segments', 'settings_trello',
    'customer_settings', 'operation_settings', 'financial_settings',
    'tools_settings', 'integrations', 'lead_comments', 'documents',
    'chart_of_accounts', 'partner_accounts', 'partner_profit_allocations',
    'recurring_payment_categories', 'financial_accounts', 'pdf_templates',
    'message_templates', 'organization_settings'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY "tenant_isolation" ON %I
      AS PERMISSIVE
      FOR ALL
      TO authenticated
      USING (
        org_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
      )
      WITH CHECK (
        org_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
      )
    $p$, t);
  END LOOP;
END $$;

-- Para alerts, mantener nullable org_id (sistema alerts) pero filtrar por org cuando exista
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON alerts;
CREATE POLICY "tenant_isolation" ON alerts
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  )
  WITH CHECK (
    org_id IS NULL
    OR org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  );
