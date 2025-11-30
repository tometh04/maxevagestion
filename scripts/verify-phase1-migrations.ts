import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: "public" },
  auth: { autoRefreshToken: false, persistSession: false },
})

async function verifyMigrations() {
  console.log("🔍 Verificando migraciones de Fase 1...")
  console.log("")

  // Verificar financial_accounts
  try {
    const { data, error } = await supabase.from("financial_accounts").select("id").limit(1)
    if (error) {
      console.log("❌ financial_accounts: NO EXISTE")
      console.log(`   Error: ${error.message}`)
    } else {
      console.log("✅ financial_accounts: EXISTE")
      if (data && data.length > 0) {
        console.log("   ✅ La tabla tiene datos")
      }
    }
  } catch (error: any) {
    console.log("❌ financial_accounts: NO EXISTE")
    console.log(`   Error: ${error.message}`)
  }

  // Verificar ledger_movements
  try {
    const { data, error } = await supabase.from("ledger_movements").select("id").limit(1)
    if (error) {
      console.log("❌ ledger_movements: NO EXISTE")
      console.log(`   Error: ${error.message}`)
    } else {
      console.log("✅ ledger_movements: EXISTE")
      if (data && data.length > 0) {
        console.log("   ✅ La tabla tiene datos")
      }
    }
  } catch (error: any) {
    console.log("❌ ledger_movements: NO EXISTE")
    console.log(`   Error: ${error.message}`)
  }

  console.log("")
  console.log("📝 Si alguna tabla NO EXISTE, ejecuta el SQL manualmente:")
  console.log("   https://supabase.com/dashboard/project/pmqvplyyxiobkllapgjp/sql/new")
}

verifyMigrations().catch(console.error)

