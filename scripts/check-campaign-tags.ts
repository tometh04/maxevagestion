import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"
  const { data: tags } = await admin
    .from("lead_tags")
    .select("id, label")
    .eq("org_id", orgId)
    .or(
      "label.ilike.%mundial%,label.ilike.%qatar%,label.ilike.%formula%,label.ilike.%f1%"
    )
  console.log("Tags campaña en VICO:", JSON.stringify(tags, null, 2))
})()
