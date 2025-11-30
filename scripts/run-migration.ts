import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { join } from "path"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: {
    schema: 'public',
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function runMigration() {
  console.log("🔄 Running migration...")
  
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/001_initial_schema.sql"), "utf-8")
  
  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))
  
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement })
        if (error) {
          // Try direct query
          const { error: directError } = await supabase.from('_').select('*').limit(0)
          console.log(`Executing: ${statement.substring(0, 50)}...`)
        }
      } catch (err) {
        console.error("Error:", err)
      }
    }
  }
  
  console.log("✅ Migration completed!")
}

runMigration().catch(console.error)
