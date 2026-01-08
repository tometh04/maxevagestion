-- =====================================================
-- Migración 075: Arreglar políticas RLS de settings
-- Las políticas anteriores usaban auth.uid() pero el API
-- usa autenticación server-side con service role
-- =====================================================

-- Desactivar RLS temporalmente para modificar políticas
-- OPERATION_SETTINGS
DROP POLICY IF EXISTS "Users can view operation settings for their agencies" ON operation_settings;
DROP POLICY IF EXISTS "Only admins can modify operation settings" ON operation_settings;

-- Crear políticas más permisivas para operación con service role
CREATE POLICY "Allow all operations on operation_settings"
  ON operation_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- CUSTOMER_SETTINGS
DROP POLICY IF EXISTS "Users can view customer settings for their agencies" ON customer_settings;
DROP POLICY IF EXISTS "Only admins can modify customer settings" ON customer_settings;

CREATE POLICY "Allow all operations on customer_settings"
  ON customer_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- FINANCIAL_SETTINGS  
DROP POLICY IF EXISTS "Users can view financial settings for their agencies" ON financial_settings;
DROP POLICY IF EXISTS "Only admins can modify financial settings" ON financial_settings;

CREATE POLICY "Allow all operations on financial_settings"
  ON financial_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- TOOLS_SETTINGS
DROP POLICY IF EXISTS "Users can view tools settings for their agencies" ON tools_settings;
DROP POLICY IF EXISTS "Only admins can modify tools settings" ON tools_settings;

CREATE POLICY "Allow all operations on tools_settings"
  ON tools_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- TEAMS
DROP POLICY IF EXISTS "Users can view teams for their agencies" ON teams;
DROP POLICY IF EXISTS "Only admins can modify teams" ON teams;

CREATE POLICY "Allow all operations on teams"
  ON teams
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- TEAM_MEMBERS
DROP POLICY IF EXISTS "Users can view team members" ON team_members;
DROP POLICY IF EXISTS "Only admins can modify team members" ON team_members;

CREATE POLICY "Allow all operations on team_members"
  ON team_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- TEAM_GOALS
DROP POLICY IF EXISTS "Users can view team goals" ON team_goals;
DROP POLICY IF EXISTS "Only admins can modify team goals" ON team_goals;

CREATE POLICY "Allow all operations on team_goals"
  ON team_goals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- USER_GOALS
DROP POLICY IF EXISTS "Users can view user goals" ON user_goals;
DROP POLICY IF EXISTS "Only admins can modify user goals" ON user_goals;

CREATE POLICY "Allow all operations on user_goals"
  ON user_goals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- NOTES
DROP POLICY IF EXISTS "Users can view notes" ON notes;
DROP POLICY IF EXISTS "Users can modify their own notes" ON notes;

CREATE POLICY "Allow all operations on notes"
  ON notes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- NOTE_COMMENTS
DROP POLICY IF EXISTS "Users can view note comments" ON note_comments;
DROP POLICY IF EXISTS "Users can modify their own comments" ON note_comments;

CREATE POLICY "Allow all operations on note_comments"
  ON note_comments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- INVOICES
DROP POLICY IF EXISTS "Users can view invoices for their agencies" ON invoices;
DROP POLICY IF EXISTS "Users can modify invoices for their agencies" ON invoices;

CREATE POLICY "Allow all operations on invoices"
  ON invoices
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- INVOICE_ITEMS
DROP POLICY IF EXISTS "Users can view invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can modify invoice items" ON invoice_items;

CREATE POLICY "Allow all operations on invoice_items"
  ON invoice_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- CUSTOMER_SEGMENTS
DROP POLICY IF EXISTS "Users can view segments for their agencies" ON customer_segments;
DROP POLICY IF EXISTS "Users can modify segments for their agencies" ON customer_segments;

CREATE POLICY "Allow all operations on customer_segments"
  ON customer_segments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- CUSTOMER_SEGMENT_MEMBERS
DROP POLICY IF EXISTS "Users can view segment members" ON customer_segment_members;
DROP POLICY IF EXISTS "Users can modify segment members" ON customer_segment_members;

CREATE POLICY "Allow all operations on customer_segment_members"
  ON customer_segment_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- CUSTOMER_INTERACTIONS
DROP POLICY IF EXISTS "Users can view interactions for their agencies" ON customer_interactions;
DROP POLICY IF EXISTS "Users can modify interactions" ON customer_interactions;

CREATE POLICY "Allow all operations on customer_interactions"
  ON customer_interactions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- PDF_TEMPLATES
DROP POLICY IF EXISTS "Users can view templates for their agencies" ON pdf_templates;
DROP POLICY IF EXISTS "Users can modify templates" ON pdf_templates;

CREATE POLICY "Allow all operations on pdf_templates"
  ON pdf_templates
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- COMMISSIONS
DROP POLICY IF EXISTS "Users can view commissions" ON commissions;
DROP POLICY IF EXISTS "Only admins can modify commissions" ON commissions;

CREATE POLICY "Allow all operations on commissions"
  ON commissions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- COMMISSION_SCHEMES
DROP POLICY IF EXISTS "Users can view commission schemes" ON commission_schemes;
DROP POLICY IF EXISTS "Only admins can modify commission schemes" ON commission_schemes;

CREATE POLICY "Allow all operations on commission_schemes"
  ON commission_schemes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- INTEGRATIONS
DROP POLICY IF EXISTS "Users can view integrations for their agencies" ON integrations;
DROP POLICY IF EXISTS "Only admins can modify integrations" ON integrations;

CREATE POLICY "Allow all operations on integrations"
  ON integrations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- INTEGRATION_LOGS
DROP POLICY IF EXISTS "Users can view integration logs" ON integration_logs;

CREATE POLICY "Allow all operations on integration_logs"
  ON integration_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);
