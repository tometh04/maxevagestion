/**
 * Re-procesa los eventos `unrecognized` del webhook_event_log con el adapter
 * nuevo (que unwrapea el envelope {event, payload}). Crea/actualiza el lead
 * a partir de la conversación que ya fue descartada.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { adaptCallbellWebhook } from "@/lib/integrations/callbell/payload-adapter"
import { processCallbellEvent } from "@/lib/integrations/callbell/sync-handler"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"

  const { data: events } = await admin
    .from("webhook_event_log")
    .select("id, event_id, payload, processed_at")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .eq("event_type", "unrecognized")
    .order("processed_at", { ascending: true })  // procesar en orden cronológico
  if (!events || events.length === 0) {
    console.log("No hay eventos unrecognized para re-procesar")
    return
  }
  console.log(`Procesando ${events.length} eventos...`)

  let processed = 0
  let failed = 0
  for (const e of events as any[]) {
    const adapted = adaptCallbellWebhook(e.payload)
    if (!adapted) {
      console.log(`  ✗ ${e.id} | adapter sigue rechazando`)
      failed++
      continue
    }
    try {
      const result = await processCallbellEvent(
        admin as any,
        orgId,
        adapted,
        { autoCreateLeads: true }
      )
      console.log(
        `  ✓ ${e.processed_at?.slice(11, 19)} | ${adapted.type} | handled=${result.handled} created=${result.created} lead=${result.lead_id?.slice(0, 8)}`
      )
      // Marcar como procesado (cambiar event_type)
      await admin
        .from("webhook_event_log")
        .update({ event_type: "backfilled-" + adapted.type, result: "ok" } as never)
        .eq("id", e.id)
      processed++
    } catch (err: any) {
      console.log(`  ✗ ${e.id} | error:`, err.message)
      failed++
    }
  }
  console.log(`\nResultado: ${processed} ok, ${failed} fail`)
})()
