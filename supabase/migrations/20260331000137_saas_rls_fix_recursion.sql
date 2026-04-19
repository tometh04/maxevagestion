-- ============================================================================
-- MIGRATION 137 — Fix RLS infinite recursion
-- ============================================================================
-- Bug: las policies sobre organization_members hacen subquery recursiva.
-- Cuando otra policy (ej leads) consulta organization_members, dispara la
-- policy de organization_members, que hace OTRA subquery a organization_members
-- → recursion → PostgreSQL error 42P17.
--
-- Fix: crear funcion SECURITY DEFINER que obtiene user org_ids bypaseando RLS.
-- Luego usar esa funcion en todas las policies.
-- ============================================================================

-- 1. Funcion helper con SECURITY DEFINER (bypasa RLS al resolver)
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND status = 'ACTIVE'
$$;

GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated, anon;

-- 2. Fix organization_members policies: evitar subquery recursiva
DROP POLICY IF EXISTS "Members can view org members" ON organization_members;
DROP POLICY IF EXISTS "Owner and admins can insert members" ON organization_members;
DROP POLICY IF EXISTS "Owner and admins can update members" ON organization_members;
DROP POLICY IF EXISTS "Owner can delete members" ON organization_members;

CREATE POLICY "members_self_or_same_org" ON organization_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT public.user_org_ids())
  );

CREATE POLICY "members_admins_insert" ON organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
  );

CREATE POLICY "members_admins_update" ON organization_members
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "members_admins_delete" ON organization_members
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()));

-- 3. Fix organizations policy tambien
DROP POLICY IF EXISTS "Members can view their organization" ON organizations;
CREATE POLICY "org_members_view" ON organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_org_ids()));

-- 4. Reescribir todas las policies tenant_isolation usando la funcion
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
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %I', t);
    EXECUTE format($p$
      CREATE POLICY "tenant_isolation" ON %I
      AS PERMISSIVE FOR ALL TO authenticated
      USING (org_id IN (SELECT public.user_org_ids()))
      WITH CHECK (org_id IN (SELECT public.user_org_ids()))
    $p$, t);
  END LOOP;
END $$;

-- 5. Fix alerts (policy con org_id NULL permitida)
DROP POLICY IF EXISTS "tenant_isolation" ON alerts;
CREATE POLICY "tenant_isolation" ON alerts
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IS NULL OR org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IS NULL OR org_id IN (SELECT public.user_org_ids()));

-- 6. Fix customers/operators (las policies viejas de mig 132 usan subquery recursiva)
DROP POLICY IF EXISTS "Users can view customers in their org" ON customers;
DROP POLICY IF EXISTS "Users can insert customers in their org" ON customers;
DROP POLICY IF EXISTS "Users can update customers in their org" ON customers;
DROP POLICY IF EXISTS "tenant_isolation" ON customers;

CREATE POLICY "tenant_isolation" ON customers
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS "Users can view operators in their org" ON operators;
DROP POLICY IF EXISTS "Users can insert operators in their org" ON operators;
DROP POLICY IF EXISTS "Users can update operators in their org" ON operators;
DROP POLICY IF EXISTS "tenant_isolation" ON operators;

CREATE POLICY "tenant_isolation" ON operators
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
