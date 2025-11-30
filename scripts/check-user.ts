import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkUser() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", "maxi@erplozada.com")
    .maybeSingle()

  if (error) {
    console.error("Error:", error)
    return
  }

  if (data) {
    console.log("✅ Usuario encontrado:")
    console.log("   Email:", data.email)
    console.log("   Nombre:", data.name)
    console.log("   Rol:", data.role)
    console.log("   Activo:", data.is_active)
  } else {
    console.log("❌ Usuario NO encontrado")
    console.log("   Necesitas ejecutar: npm run db:seed")
  }
}

checkUser().catch(console.error)
