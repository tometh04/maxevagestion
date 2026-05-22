/**
 * Re-procesa los eventos message_created de VICO con la lógica nueva del
 * sync-handler (detectCampaignFromClientMessage). Esto va a popular
 * `destination` con "Mundial" o "Formula 1" + tag para los leads cuyo
 * cliente eligió opción 4 o 5 del menú del bot (ej. Diego).
 *
 * NO crea leads nuevos (los leads ya fueron creados por la primera pasada);
 * solo aplica el efecto secundario de la detección de campaña sobre leads
 * existentes con destination en placeholder.
 *
 * Idempotente: si destination ya está seteado a algo distinto de "A definir"/
 * "OTROS", el script no toca nada. La asignación de tags también es idempotente.
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
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428" // VICO

  // Eventos backfilled o nativos de message_created — los procesamos todos
  // de nuevo. processCallbellEvent es idempotente: solo updatea destination
  // si está en placeholder, y los tags hacen upsert.
  const { data: events } = await admin
    .from("webhook_event_log")
    .select("id, event_id, payload, processed_at, event_type")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .in("event_type", [
      "message_created",
      "backfilled-message_created",
      "backfilled-contact_created",
    ])
    .order("processed_at", { ascending: true })
  if (!events || events.length === 0) {
    console.log("No hay eventos para re-procesar")
    return
  }
  console.log(`Procesando ${events.length} eventos message_created...`)

  let updated = 0
  let skipped = 0
  for (const e of events as any[]) {
    const adapted = adaptCallbellWebhook(e.payload)
    if (!adapted) {
      skipped++
      continue
    }
    try {
      const result = await processCallbellEvent(
        admin as any,
        orgId,
        adapted,
        { autoCreateLeads: true }
      )
      const text =
        (adapted.data as { message?: { text?: string } }).message?.text ?? ""
      if (text) {
        console.log(
          `  ${e.processed_at?.slice(0, 16)} | "${text.slice(0, 40)}" → lead ${result.lead_id?.slice(0, 8)}`
        )
      }
      updated++
    } catch (err: any) {
      console.log(`  ✗ ${e.id} | error:`, err.message)
      skipped++
    }
  }
  console.log(`\nResultado: ${updated} procesados, ${skipped} skip`)

  // Verificación final: ver el estado actual de los leads VICO
  console.log("\n--- Snapshot leads VICO ---")
  const { data: leads } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, destination, quoted_price, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10)
  for (const l of (leads ?? []) as any[]) {
    console.log(
      `  ${l.contact_name} (${l.contact_phone}) → destination="${l.destination}" quoted=${l.quoted_price ?? "-"}`
    )
  }
})()
