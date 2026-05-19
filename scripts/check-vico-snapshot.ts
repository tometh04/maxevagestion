import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"

  // 1. Todos los leads VICO
  const { data: leads, count: leadCount } = await admin
    .from("leads")
    .select(
      "id, contact_name, contact_phone, source, destination, quoted_price, created_at",
      { count: "exact" }
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
  console.log(`📊 Total leads VICO: ${leadCount}`)
  for (const l of (leads as any[]) ?? []) {
    console.log(
      `  ${l.created_at?.slice(0, 19)} | ${l.contact_name} | ${l.contact_phone} | dest=${l.destination} | $${l.quoted_price} | src=${l.source}`
    )
  }

  // 2. Webhook events totales
  const { count: eventCount } = await admin
    .from("webhook_event_log")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
  console.log(`\n📥 Total webhook events callbell-in: ${eventCount}`)

  // 3. Tags asignadas al lead Tomas
  const { data: leadTomas } = await admin
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("contact_phone", "+5492954602920")
    .maybeSingle()
  if (leadTomas) {
    const { data: assignments } = await admin
      .from("lead_tag_assignments")
      .select("tag:tag_id(label, category:category_id(name))")
      .eq("lead_id", (leadTomas as any).id)
    console.log(`\n🏷️  Tags del lead Tomas:`)
    for (const a of (assignments as any[]) ?? []) {
      console.log(`  ${a.tag?.category?.name}: ${a.tag?.label}`)
    }
  }
})()
