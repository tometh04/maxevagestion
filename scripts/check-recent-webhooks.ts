import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "vico-travel")
    .maybeSingle()
  const orgId = (org as any).id

  // Re-leer config para verificar persistencia
  const { data: integ } = await admin
    .from("org_integrations")
    .select("config, is_active")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .maybeSingle()
  console.log("Config en BD:", JSON.stringify((integ as any).config))
  console.log("is_active:", (integ as any).is_active)

  // Últimos eventos
  const { data: events } = await admin
    .from("webhook_event_log")
    .select("event_id, event_type, result, created_at, payload")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .order("created_at", { ascending: false })
    .limit(5)
  console.log("\nÚltimos 5 eventos:")
  for (const e of (events as any[]) ?? []) {
    console.log(`  ${e.created_at} | ${e.event_type} | ${e.event_id} | result=${e.result}`)
  }

  // Leads test
  const { data: leads } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, source, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5)
  console.log("\nÚltimos 5 leads VICO:")
  for (const l of (leads as any[]) ?? []) {
    console.log(`  ${l.created_at} | ${l.contact_name} | ${l.contact_phone} | source=${l.source}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
