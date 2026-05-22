import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
;(async () => {
  const { data } = await admin
    .from("organizations")
    .select("name, crm_mode")
    .eq("id", "586bca09-029e-4cc9-8762-2ad01d468428")
    .single()
  console.log("VICO org:", JSON.stringify(data, null, 2))
})()
