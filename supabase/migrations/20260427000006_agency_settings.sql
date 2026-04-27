-- Agency Settings table para almacenar configuración por agency en JSONB
-- Principalmente payment_approval_rules

CREATE TABLE IF NOT EXISTS agency_settings (
  agency_id UUID NOT NULL PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_settings_agency_id ON agency_settings(agency_id);

-- RLS: users should only see their own org's agencies
ALTER TABLE agency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read agency_settings from their org"
  ON agency_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agencies a
      INNER JOIN organizations o ON a.org_id = o.id
      INNER JOIN users u ON o.id = u.org_id
      WHERE a.id = agency_settings.agency_id AND u.auth_id = auth.uid()
    )
  );

CREATE POLICY "Users can update agency_settings in their org"
  ON agency_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM agencies a
      INNER JOIN organizations o ON a.org_id = o.id
      INNER JOIN users u ON o.id = u.org_id
      WHERE a.id = agency_settings.agency_id AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies a
      INNER JOIN organizations o ON a.org_id = o.id
      INNER JOIN users u ON o.id = u.org_id
      WHERE a.id = agency_settings.agency_id AND u.auth_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert agency_settings in their org"
  ON agency_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies a
      INNER JOIN organizations o ON a.org_id = o.id
      INNER JOIN users u ON o.id = u.org_id
      WHERE a.id = agency_id AND u.auth_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_agency_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agency_settings_updated_at ON agency_settings;

CREATE TRIGGER trigger_agency_settings_updated_at
  BEFORE UPDATE ON agency_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_agency_settings_updated_at();
