import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: org } = await admin
    .from("organizations").select("id").eq("slug", "vico-travel").maybeSingle()
  const orgId = (org as any).id

  // Test 1: Insert manual al webhook_event_log
  const { data, error } = await admin.from("webhook_event_log").insert({
    org_id: orgId,
    integration: "callbell-in",
    event_id: "test-direct-insert-" + Date.now(),
    event_type: "test_direct",
    payload: { test: true },
    result: "ok",
  } as never).select().single()
  console.log("Insert result:", { data, error })

  // Test 2: Insert manual al leads
  const { data: agency } = await admin
    .from("agencies").select("id").eq("org_id", orgId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle()
  const { data: funnel } = await admin
    .from("lead_funnels").select("id").eq("org_id", orgId)
    .eq("is_default_new", true).maybeSingle()

  console.log("agency:", agency, "funnel:", funnel)

  const { data: lead, error: leadErr } = await admin.from("leads").insert({
    org_id: orgId,
    agency_id: (agency as any).id,
    source: "Callbell",
    status: "NEW",
    region: "OTROS",
    destination: "A definir",
    contact_name: "DIRECT INSERT TEST " + Date.now(),
    contact_phone: "+5491100000099",
    funnel_id: (funnel as any)?.id ?? null,
    notes: "[direct insert test]",
  } as never).select("id").single()
  console.log("Lead insert result:", { lead, leadErr })

  // Cleanup test rows
  if (lead) {
    await admin.from("leads").delete().eq("id", (lead as any).id)
    console.log("✓ test lead deleted")
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
