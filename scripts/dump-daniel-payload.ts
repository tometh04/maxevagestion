import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"

  // Buscar eventos de Daniel (5492995189991 con o sin +)
  const { data: events } = await admin
    .from("webhook_event_log")
    .select("id, event_type, payload, processed_at")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .order("processed_at", { ascending: true })

  const matching = (events ?? []).filter((e: any) => {
    const t = JSON.stringify(e.payload)
    return t.includes("5492616640330") // Marcela
  })

  console.log(`Total eventos para Daniel: ${matching.length}\n`)
  for (const e of matching.slice(0, 3) as any[]) {
    console.log(`--- ${e.processed_at} | ${e.event_type} ---`)
    console.log(JSON.stringify(e.payload, null, 2))
  }
})()
