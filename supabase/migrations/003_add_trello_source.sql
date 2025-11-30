-- Add 'Trello' as a valid source value for leads
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (source IN ('Instagram', 'WhatsApp', 'Meta Ads', 'Other', 'Trello'));

