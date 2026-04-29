-- ============================================================================
-- MIGRATION 134 — SaaS Tenant Isolation (core tables)
-- ============================================================================
-- Agrega org_id directo a las tablas "core" que hoy solo tienen agency_id o
-- operation_id. Despues del backfill, TODA query de la app puede filtrar por
-- user.org_id sin hacer joins. Patrón consistente con la regla del PDF:
-- "WHERE tenant_id = current_user.tenant_id. Sin excepciones."
--
-- Backfill strategy:
-- - Tablas con agency_id: org_id = agencies.org_id
-- - Tablas con operation_id: org_id = operations.org_id (despues de setear
--   operations.org_id primero)
-- - Default: org_id = Lozada Viajes (para rows huerfanas)
--
-- Note: NO habilitamos RLS en esta migration. RLS viene en migration 135
-- despues de validar que el filtering aplicativo funciona. Approach safe:
-- primero columnas + filtros, despues enforce DB-level.
-- ============================================================================

-- PART 1: Tablas con agency_id directo
-- ----------------------------------------------------------------------------

ALTER TABLE leads                ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operations           ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operation_services   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE quotations           ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE commission_records   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE commission_rules     ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tasks                ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_messages    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE invoices             ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE recurring_payments   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE customer_segments    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE settings_trello      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE customer_settings    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operation_settings   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE financial_settings   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tools_settings       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE integrations         ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- PART 2: Tablas con operation_id (heredan via operation)
-- ----------------------------------------------------------------------------

ALTER TABLE operation_customers  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operation_operators  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operation_passengers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE payments             ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operator_payments    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE iva_sales            ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE iva_purchases        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE quotation_items      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE lead_comments        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE documents            ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- PART 3: Tablas con account_id (heredan via financial_accounts)
-- ----------------------------------------------------------------------------

ALTER TABLE cash_movements       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE ledger_movements     ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE journal_entries      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- PART 4: Tablas que pueden ser globales o org-scoped (hoy sin agency ni org)
-- ----------------------------------------------------------------------------
-- Hacemos org-scoped porque cada tenant tiene su propio plan de cuentas,
-- reglas de comisiones, cuentas de socios, etc. Global = Lozada, lo cual
-- mezclaba todo.

ALTER TABLE chart_of_accounts              ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE partner_accounts               ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE partner_profit_allocations     ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE recurring_payment_categories   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- ============================================================================
-- BACKFILL — orden importa (primero tablas con agency_id, despues descendants)
-- ============================================================================

-- 1. Tablas con agency_id → copiar de agencies.org_id
UPDATE leads l              SET org_id = a.org_id FROM agencies a WHERE l.agency_id = a.id AND l.org_id IS NULL;
UPDATE operations o         SET org_id = a.org_id FROM agencies a WHERE o.agency_id = a.id AND o.org_id IS NULL;
UPDATE operation_services s SET org_id = a.org_id FROM agencies a WHERE s.agency_id = a.id AND s.org_id IS NULL;
UPDATE quotations q         SET org_id = a.org_id FROM agencies a WHERE q.agency_id = a.id AND q.org_id IS NULL;
UPDATE commission_records cr SET org_id = a.org_id FROM agencies a WHERE cr.agency_id = a.id AND cr.org_id IS NULL;
UPDATE commission_rules cru  SET org_id = a.org_id FROM agencies a WHERE cru.agency_id = a.id AND cru.org_id IS NULL;
UPDATE tasks t              SET org_id = a.org_id FROM agencies a WHERE t.agency_id = a.id AND t.org_id IS NULL;
UPDATE whatsapp_messages w  SET org_id = a.org_id FROM agencies a WHERE w.agency_id = a.id AND w.org_id IS NULL;
UPDATE invoices i           SET org_id = a.org_id FROM agencies a WHERE i.agency_id = a.id AND i.org_id IS NULL;
UPDATE recurring_payments r SET org_id = a.org_id FROM agencies a WHERE r.agency_id = a.id AND r.org_id IS NULL;
UPDATE customer_segments cs SET org_id = a.org_id FROM agencies a WHERE cs.agency_id = a.id AND cs.org_id IS NULL;
UPDATE settings_trello st   SET org_id = a.org_id FROM agencies a WHERE st.agency_id = a.id AND st.org_id IS NULL;
UPDATE customer_settings csg SET org_id = a.org_id FROM agencies a WHERE csg.agency_id = a.id AND csg.org_id IS NULL;
UPDATE operation_settings os SET org_id = a.org_id FROM agencies a WHERE os.agency_id = a.id AND os.org_id IS NULL;
UPDATE financial_settings fs SET org_id = a.org_id FROM agencies a WHERE fs.agency_id = a.id AND fs.org_id IS NULL;
UPDATE tools_settings ts    SET org_id = a.org_id FROM agencies a WHERE ts.agency_id = a.id AND ts.org_id IS NULL;
UPDATE integrations it      SET org_id = a.org_id FROM agencies a WHERE it.agency_id = a.id AND it.org_id IS NULL;

-- 2. Tablas con operation_id → copiar de operations.org_id (ya seteado arriba)
UPDATE operation_customers  oc SET org_id = op.org_id FROM operations op WHERE oc.operation_id = op.id AND oc.org_id IS NULL;
UPDATE operation_operators  oo SET org_id = op.org_id FROM operations op WHERE oo.operation_id = op.id AND oo.org_id IS NULL;
UPDATE operation_passengers oss SET org_id = op.org_id FROM operations op WHERE oss.operation_id = op.id AND oss.org_id IS NULL;
UPDATE payments p           SET org_id = op.org_id FROM operations op WHERE p.operation_id = op.id AND p.org_id IS NULL;
UPDATE operator_payments op2 SET org_id = op.org_id FROM operations op WHERE op2.operation_id = op.id AND op2.org_id IS NULL;
UPDATE iva_sales ivs        SET org_id = op.org_id FROM operations op WHERE ivs.operation_id = op.id AND ivs.org_id IS NULL;
UPDATE iva_purchases ivp    SET org_id = op.org_id FROM operations op WHERE ivp.operation_id = op.id AND ivp.org_id IS NULL;
UPDATE quotation_items qi   SET org_id = q.org_id FROM quotations q WHERE qi.quotation_id = q.id AND qi.org_id IS NULL;
UPDATE lead_comments lc     SET org_id = l.org_id FROM leads l WHERE lc.lead_id = l.id AND lc.org_id IS NULL;
UPDATE documents d          SET org_id = op.org_id FROM operations op WHERE d.operation_id = op.id AND d.org_id IS NULL;
UPDATE documents d          SET org_id = l.org_id  FROM leads l      WHERE d.lead_id      = l.id  AND d.org_id IS NULL;
UPDATE documents d          SET org_id = c.org_id  FROM customers c  WHERE d.customer_id  = c.id  AND d.org_id IS NULL;

-- 3. Tablas con account_id → copiar de financial_accounts.org_id
UPDATE cash_movements cm    SET org_id = fa.org_id FROM financial_accounts fa WHERE cm.financial_account_id = fa.id AND cm.org_id IS NULL;
UPDATE ledger_movements lm  SET org_id = fa.org_id FROM financial_accounts fa WHERE lm.account_id = fa.id AND lm.org_id IS NULL;
UPDATE ledger_movements lm  SET org_id = op.org_id FROM operations op WHERE lm.operation_id = op.id AND lm.org_id IS NULL;
UPDATE journal_entries je   SET org_id = op.org_id FROM operations op WHERE je.operation_id = op.id AND je.org_id IS NULL;

-- 4. Fallback a Lozada Viajes para cualquier row huerfana
UPDATE leads                      SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operations                 SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_services         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_customers        SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_operators        SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_passengers       SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE quotations                 SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE quotation_items            SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE payments                   SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operator_payments          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE cash_movements             SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE ledger_movements           SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE journal_entries            SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE iva_sales                  SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE iva_purchases              SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE commission_records         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE commission_rules           SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE tasks                      SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE whatsapp_messages          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE invoices                   SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE recurring_payments         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE customer_segments          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE settings_trello            SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE customer_settings          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_settings         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE financial_settings         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE tools_settings             SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE integrations               SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE lead_comments              SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE documents                  SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE chart_of_accounts          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE partner_accounts           SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE partner_profit_allocations SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE recurring_payment_categories SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;

-- ============================================================================
-- NOT NULL constraints: DEFERRED a migration 135 despues de fixear codigo que
-- hace INSERTs sin org_id. Hoy esta migration es aditiva no-breaking.
-- ============================================================================
-- INDEXES (org_id es clave de filtrado primario)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_org_id                     ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_operations_org_id                ON operations(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_services_org_id        ON operation_services(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_customers_org_id       ON operation_customers(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_operators_org_id       ON operation_operators(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_passengers_org_id      ON operation_passengers(org_id);
CREATE INDEX IF NOT EXISTS idx_quotations_org_id                ON quotations(org_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_org_id           ON quotation_items(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_id                  ON payments(org_id);
CREATE INDEX IF NOT EXISTS idx_operator_payments_org_id         ON operator_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_org_id            ON cash_movements(org_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_org_id          ON ledger_movements(org_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_id           ON journal_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_iva_sales_org_id                 ON iva_sales(org_id);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_org_id             ON iva_purchases(org_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_org_id        ON commission_records(org_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_org_id          ON commission_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org_id                     ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org_id         ON whatsapp_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_id                  ON invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_org_id        ON recurring_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_segments_org_id         ON customer_segments(org_id);
CREATE INDEX IF NOT EXISTS idx_settings_trello_org_id           ON settings_trello(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_settings_org_id         ON customer_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_settings_org_id        ON operation_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_financial_settings_org_id        ON financial_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_tools_settings_org_id            ON tools_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_integrations_org_id              ON integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_lead_comments_org_id             ON lead_comments(org_id);
CREATE INDEX IF NOT EXISTS idx_documents_org_id                 ON documents(org_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_org_id         ON chart_of_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_org_id          ON partner_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_partner_profit_allocations_org_id ON partner_profit_allocations(org_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payment_categories_org_id ON recurring_payment_categories(org_id);
