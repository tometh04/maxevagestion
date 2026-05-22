/**
 * URGENTE: disable auto_create_leads para VICO. Para la sangría de leads
 * mientras implemento filtro por contact.createdAt + assignedAgent.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"
  const { data: integ } = await admin
    .from("org_integrations")
    .select("id, config")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .maybeSingle()
  if (!integ) {
    console.log("No hay integration callbell-in para VICO")
    return
  }
  const oldConfig = (integ as any).config ?? {}
  const newConfig = { ...oldConfig, auto_create_leads: false }
  const { error } = await admin
    .from("org_integrations")
    .update({ config: newConfig } as never)
    .eq("id", (integ as any).id)
  if (error) {
    console.error("Error:", error)
    process.exit(1)
  }
  console.log("✓ auto_create_leads = false (VICO)")
  console.log("Config anterior:", oldConfig)
  console.log("Config nuevo:", newConfig)
})()
