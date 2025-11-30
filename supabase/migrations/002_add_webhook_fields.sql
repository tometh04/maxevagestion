-- Add webhook fields to settings_trello table
ALTER TABLE settings_trello 
ADD COLUMN IF NOT EXISTS webhook_id TEXT,
ADD COLUMN IF NOT EXISTS webhook_url TEXT;

