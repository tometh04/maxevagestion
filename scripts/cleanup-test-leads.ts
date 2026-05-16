import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Eliminar leads de test "TEST CLAUDE *" con phones +5491100000xxx
  const { data: testLeads } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone")
    .like("contact_name", "TEST CLAUDE%")
  console.log("Leads test a borrar:", testLeads)

  if (testLeads && testLeads.length > 0) {
    const ids = (testLeads as any[]).map((l) => l.id)
    const { error } = await admin.from("leads").delete().in("id", ids)
    if (error) console.error("Error:", error)
    else console.log(`✓ ${ids.length} leads test borrados`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
