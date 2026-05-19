import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"

  // Diego — verificar destination + tags
  const { data: diego } = await admin
    .from("leads")
    .select(`
      id, contact_name, contact_phone, destination, quoted_price, source, created_at,
      tag_assignments:lead_tag_assignments(tag:tag_id(label))
    `)
    .eq("org_id", orgId)
    .eq("contact_phone", "+5492323534418")
    .maybeSingle()
  console.log("DIEGO:")
  console.log(JSON.stringify(diego, null, 2))

  // Tomas — sanity
  const { data: tomas } = await admin
    .from("leads")
    .select(`
      id, contact_name, contact_phone, destination, quoted_price,
      tag_assignments:lead_tag_assignments(tag:tag_id(label))
    `)
    .eq("org_id", orgId)
    .eq("contact_phone", "+5492954602920")
    .maybeSingle()
  console.log("\nTOMAS:")
  console.log(JSON.stringify(tomas, null, 2))

  // Daniel — duplicados?
  const { data: daniels } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, destination, created_at")
    .eq("org_id", orgId)
    .eq("contact_phone", "+5492995189991")
    .order("created_at", { ascending: true })
  console.log(`\nDANIEL (${daniels?.length ?? 0} filas):`)
  for (const d of (daniels ?? []) as any[]) {
    console.log(`  ${d.id.slice(0, 8)} | ${d.created_at} | dest=${d.destination}`)
  }
})()
