import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"
  const { data } = await admin
    .from("webhook_event_log")
    .select("event_type, result, error_detail, payload, processed_at")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .order("processed_at", { ascending: false })
    .limit(5)
  console.log("Últimos 5 eventos:")
  for (const e of (data as any[]) ?? []) {
    console.log(`\n--- ${e.processed_at} | type=${e.event_type} | result=${e.result}`)
    console.log("error_detail:", e.error_detail)
    console.log("payload (first 1500 chars):", JSON.stringify(e.payload).slice(0, 1500))
  }
})()
