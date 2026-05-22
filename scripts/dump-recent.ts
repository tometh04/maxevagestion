import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const { data } = await admin
    .from("webhook_event_log")
    .select("event_type, payload, processed_at")
    .eq("org_id", "586bca09-029e-4cc9-8762-2ad01d468428")
    .eq("integration", "callbell-in")
    .order("processed_at", { ascending: false })
    .limit(3)
  for (const e of (data ?? []) as any[]) {
    console.log("====", e.event_type, e.processed_at, "====")
    console.log(JSON.stringify(e.payload, null, 2))
  }
})()
