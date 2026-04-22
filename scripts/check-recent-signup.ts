/**
 * Check: últimos signups + billing events para diagnosticar "nada pasó"
 * después de crear cuenta desde la landing.
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import * as path from "path"

config({ path: path.join(__dirname, "../.env.local") })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Últimos 5 signups
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, subscription_status, mp_preapproval_id, billing_email, created_at")
    .order("created_at", { ascending: false })
    .limit(5)
  console.log("\n=== Últimas 5 orgs (por created_at) ===")
  console.table(orgs)

  // Últimos 5 billing_events
  const { data: events } = await supabase
    .from("billing_events")
    .select("id, org_id, event_type, external_id, status, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(5)
  console.log("\n=== Últimos 5 billing_events ===")
  if (events && events.length) {
    events.forEach((e: any) => {
      console.log(`- ${e.created_at} | ${e.event_type} | org=${e.org_id} | ext=${e.external_id} | status=${e.status}`)
      if (e.payload) console.log(`    payload:`, JSON.stringify(e.payload).slice(0, 200))
    })
  } else {
    console.log("  (ninguno)")
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
