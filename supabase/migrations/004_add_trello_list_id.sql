-- Add trello_list_id to leads table to store the Trello list ID
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS trello_list_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_trello_list_id ON leads(trello_list_id);

