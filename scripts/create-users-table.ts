import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createUsersTable() {
  console.log("🔄 Creating users table...")
  
  // First, let's check if we can use the management API
  // We'll use a workaround: create the user record directly if table exists, or show instructions
  
  try {
    // Try to query the table to see if it exists
    const { data, error } = await supabase.from("users").select("id").limit(1)
    
    if (error && error.code === 'PGRST205') {
      console.log("❌ La tabla 'users' no existe.")
      console.log("")
      console.log("📝 INSTRUCCIONES:")
      console.log("1. Ve a: https://supabase.com/dashboard/project/pmqvplyyxiobkllapgjp/sql/new")
      console.log("2. Copia y pega el contenido del archivo: supabase/migrations/001_initial_schema.sql")
      console.log("3. Haz clic en 'Run' o presiona Cmd+Enter")
      console.log("4. Espera a que se ejecute correctamente")
      console.log("5. Luego ejecuta este script de nuevo: npm run db:seed")
      process.exit(1)
    } else if (error) {
      console.error("Error:", error)
    } else {
      console.log("✅ La tabla 'users' existe!")
      console.log("Ahora ejecutando seed...")
    }
  } catch (err) {
    console.error("Error:", err)
  }
}

createUsersTable().catch(console.error)
