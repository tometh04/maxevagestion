/**
 * Audit más preciso: para cada evento reciente, extrae contact.createdAt
 * y compara con processed_at. Si contact.createdAt es de hace meses pero
 * el evento llegó hoy → conversación VIEJA, no debería ser lead nuevo.
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

  // Últimas 100 events
  const { data: events } = await admin
    .from("webhook_event_log")
    .select("event_type, payload, processed_at")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .order("processed_at", { ascending: false })
    .limit(100)

  const ageBuckets: Record<string, number> = {
    "<24h": 0,
    "1-7d": 0,
    "7-30d": 0,
    "30-180d": 0,
    ">180d": 0,
    "?": 0,
  }
  const samples: Array<{
    name: string
    phone: string
    cbCreated: string
    age: string
    evType: string
    text: string
  }> = []

  for (const e of (events ?? []) as any[]) {
    const p = e.payload
    const inner = p?.payload ?? p
    const contact = inner?.contact ?? p?.contact ?? inner
    const cbCreatedAt = contact?.createdAt
    let bucket = "?"
    if (cbCreatedAt) {
      const ageDays =
        (Date.now() - new Date(cbCreatedAt).getTime()) / (1000 * 60 * 60 * 24)
      if (ageDays < 1) bucket = "<24h"
      else if (ageDays < 7) bucket = "1-7d"
      else if (ageDays < 30) bucket = "7-30d"
      else if (ageDays < 180) bucket = "30-180d"
      else bucket = ">180d"
    }
    ageBuckets[bucket]++

    if (samples.length < 30) {
      samples.push({
        name: contact?.name ?? "?",
        phone: contact?.phoneNumber ?? "?",
        cbCreated: cbCreatedAt ?? "?",
        age: bucket,
        evType: e.event_type,
        text: (inner?.text ?? inner?.message?.text ?? "").slice(0, 50),
      })
    }
  }

  console.log("Edad del contacto en Callbell (cuándo se creó originalmente):")
  for (const [k, v] of Object.entries(ageBuckets)) {
    console.log(`  ${k}: ${v} eventos`)
  }

  console.log("\nSample 30 eventos:")
  for (const s of samples) {
    console.log(
      `  [${s.age.padEnd(8)}] ${s.evType.padEnd(20).slice(0, 20)} | ${s.name.padEnd(20).slice(0, 20)} | ${s.phone.padEnd(16)} | cb_created=${s.cbCreated.slice(0, 10)} | "${s.text}"`
    )
  }
})()
