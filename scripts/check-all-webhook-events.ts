import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const r = await admin
    .from("webhook_event_log")
    .select("org_id, integration, event_type, event_id, result, processed_at", { count: "exact" })
    .order("processed_at", { ascending: false })
    .limit(20)
  console.log("Total:", r.count, "| error:", r.error?.message)
  console.log("Últimos 20 events de TODAS las orgs:")
  for (const e of (r.data as any[]) ?? []) {
    console.log(`  ${e.processed_at} | org=${e.org_id?.slice(0,8)} | ${e.integration} | ${e.event_type} | ${e.result}`)
  }
})()
