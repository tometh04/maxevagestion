import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"
  const { data: lead } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, notes, created_at, updated_at")
    .eq("org_id", orgId)
    .eq("contact_phone", "+5492954602920")
    .maybeSingle()

  if (!lead) {
    console.log("No lead found")
    return
  }
  console.log("Lead ID:", (lead as any).id)
  console.log("Created:", (lead as any).created_at)
  console.log("Updated:", (lead as any).updated_at)
  console.log("---Notes---")
  console.log((lead as any).notes)
})()
