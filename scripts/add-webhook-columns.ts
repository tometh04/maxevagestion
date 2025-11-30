/**
 * Script to add webhook_id and webhook_url columns to settings_trello table
 * Run this once to update the database schema
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function addWebhookColumns() {
  console.log("🔄 Adding webhook columns to settings_trello table...")

  const { error } = await supabase.rpc("exec_sql", {
    sql: `
      ALTER TABLE settings_trello 
      ADD COLUMN IF NOT EXISTS webhook_id TEXT,
      ADD COLUMN IF NOT EXISTS webhook_url TEXT;
    `,
  })

  if (error) {
    // Try direct SQL execution
    console.log("Trying alternative method...")
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        sql: `
          ALTER TABLE settings_trello 
          ADD COLUMN IF NOT EXISTS webhook_id TEXT,
          ADD COLUMN IF NOT EXISTS webhook_url TEXT;
        `,
      }),
    })

    if (!response.ok) {
      console.error("❌ Error adding columns. Please run this SQL manually in Supabase:")
      console.log(`
ALTER TABLE settings_trello 
ADD COLUMN IF NOT EXISTS webhook_id TEXT,
ADD COLUMN IF NOT EXISTS webhook_url TEXT;
      `)
      process.exit(1)
    }
  }

  console.log("✅ Columns added successfully!")
}

addWebhookColumns().catch(console.error)

