/**
 * Backfill de `leads.assigned_seller_id` en VICO a partir del `assignedAgent`
 * presente en el último `message_created` de Callbell para cada lead.
 *
 * Para cada lead VICO:
 *   1. Busca el último message_created en webhook_event_log con su phone
 *   2. Extrae payload.contact.assignedAgent (email string u object con .email)
 *   3. Resuelve user_id en `users` por email + org_id
 *   4. Update leads.assigned_seller_id si difiere del actual
 *
 * Idempotente: si ya está asignado correcto, no toca nada.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ORG_ID = "586bca09-029e-4cc9-8762-2ad01d468428"

function extractAgentEmail(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === "string") return raw
  if (typeof raw === "object" && raw !== null) {
    const r = raw as { email?: unknown }
    if (typeof r.email === "string") return r.email
  }
  return null
}

;(async () => {
  // 1. Cargar todos los leads VICO con su phone + current assigned_seller_id
  const { data: leads } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, assigned_seller_id")
    .eq("org_id", ORG_ID)
    .eq("source", "Callbell")

  console.log(`Procesando ${leads?.length ?? 0} leads VICO...\n`)

  let updated = 0
  let skipped = 0
  let unmatched = 0

  for (const l of (leads ?? []) as any[]) {
    const phone = (l.contact_phone ?? "").replace(/^\+/, "") // sin +
    if (!phone) continue

    // 2. Último message_created event con este phone
    const { data: events } = await admin
      .from("webhook_event_log")
      .select("payload, processed_at")
      .eq("org_id", ORG_ID)
      .eq("integration", "callbell-in")
      .order("processed_at", { ascending: false })
      .limit(200) // safety cap

    let agentEmail: string | null = null
    for (const e of (events ?? []) as any[]) {
      const payload = e.payload
      const text = JSON.stringify(payload)
      if (!text.includes(phone)) continue

      // Caller event shape: { event, payload: { contact: {...} } } o nested
      const inner = (payload?.payload ?? payload) as any
      const contact = inner?.contact ?? inner?.data?.contact
      const candidate = extractAgentEmail(contact?.assignedAgent)
      if (candidate) {
        agentEmail = candidate
        break // primer (más reciente) que tenga agente
      }
    }

    if (!agentEmail) {
      skipped++
      continue
    }

    // 3. Lookup user.id por email + org
    const { data: user } = await admin
      .from("users")
      .select("id, name")
      .ilike("email", agentEmail) // case-insensitive
      .eq("org_id", ORG_ID)
      .maybeSingle()

    if (!user) {
      console.log(
        `  ⚠️ ${l.contact_name.padEnd(20)} | agent=${agentEmail} → NO MATCH en users`
      )
      unmatched++
      continue
    }
    const u = user as { id: string; name: string }

    if (l.assigned_seller_id === u.id) {
      // Ya está OK
      skipped++
      continue
    }

    // 4. Update
    const { error } = await admin
      .from("leads")
      .update({ assigned_seller_id: u.id } as never)
      .eq("id", l.id)

    if (error) {
      console.log(`  ❌ ${l.contact_name} | error: ${error.message}`)
    } else {
      console.log(
        `  ✓ ${l.contact_name.padEnd(20)} → ${u.name} (${agentEmail})`
      )
      updated++
    }
  }

  console.log(
    `\nResultado: ${updated} updated, ${skipped} sin cambio, ${unmatched} agentes sin match en users`
  )
})()
