/**
 * Auditoría: por qué hay 87 leads en VICO. Hipótesis: Callbell está enviando
 * webhooks por mensajes en conversaciones VIEJAS (contactos pre-existentes
 * que mandaron algo recientemente), y con auto_create_leads=true se crean
 * leads frescos para todos.
 *
 * Investiga:
 *  1. Cuándo se crearon los leads (timestamps)
 *  2. Cuándo se creó el CONTACTO en Callbell (event.data.contact.createdAt
 *     vs lead.created_at)
 *  3. Si hay customers existentes con esos phones (es decir, clientes
 *     antiguos que NO deberían ser leads nuevos)
 *  4. Cuántos eventos hubo y de qué tipo
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

  // 1. Total leads + distribución temporal
  const { data: leads, count } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, created_at, source", {
      count: "exact",
    })
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200)

  console.log(`Total leads VICO: ${count}`)

  // Agrupar por hora de creación
  const byHour: Record<string, number> = {}
  for (const l of (leads ?? []) as any[]) {
    const hour = l.created_at?.slice(0, 13) ?? "?"
    byHour[hour] = (byHour[hour] ?? 0) + 1
  }
  console.log("\nDistribución por hora (más reciente primero):")
  Object.entries(byHour)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 20)
    .forEach(([h, n]) => console.log(`  ${h}: ${n} leads`))

  // 2. Eventos en webhook_event_log
  const { count: eventCount } = await admin
    .from("webhook_event_log")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
  console.log(`\nTotal eventos en webhook_event_log: ${eventCount}`)

  // Eventos del último día por tipo
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentEvents } = await admin
    .from("webhook_event_log")
    .select("event_type, processed_at")
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .gte("processed_at", yesterday)
    .order("processed_at", { ascending: false })
  const eventsByType: Record<string, number> = {}
  for (const e of (recentEvents ?? []) as any[]) {
    eventsByType[e.event_type] = (eventsByType[e.event_type] ?? 0) + 1
  }
  console.log("\nEventos últimas 24h por tipo:")
  Object.entries(eventsByType)
    .sort(([, a], [, b]) => b - a)
    .forEach(([t, n]) => console.log(`  ${t}: ${n}`))

  // 3. Para los últimos 20 leads, ver el contact.createdAt de Callbell
  // (en payload de un event de ese phone)
  console.log("\nÚltimos 20 leads — comparar lead.created_at vs Callbell contact.createdAt:")
  for (const l of (leads ?? []).slice(0, 20) as any[]) {
    const phone = l.contact_phone?.replace("+", "")
    if (!phone) continue
    const { data: events } = await admin
      .from("webhook_event_log")
      .select("payload, processed_at")
      .eq("org_id", orgId)
      .eq("integration", "callbell-in")
      .order("processed_at", { ascending: true })
      .limit(2000)
    const matchingEvent = (events ?? []).find((e: any) =>
      JSON.stringify(e.payload).includes(phone)
    )
    let cbContactCreatedAt = "?"
    if (matchingEvent) {
      const p = (matchingEvent as any).payload
      const inner = p?.payload ?? p
      cbContactCreatedAt =
        inner?.contact?.createdAt ??
        inner?.createdAt ??
        "?"
    }
    const leadCreated = l.created_at?.slice(0, 19) ?? "?"
    const cbDate = cbContactCreatedAt.slice(0, 19)
    const ageDays = cbContactCreatedAt !== "?"
      ? Math.floor(
          (Date.now() - new Date(cbContactCreatedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : "?"
    console.log(
      `  ${l.contact_name.padEnd(25).slice(0, 25)} | lead_created=${leadCreated} | cb_contact_created=${cbDate} | age=${ageDays}d`
    )
  }

  // 4. Customers existentes con esos phones
  const phones = (leads ?? []).map((l: any) => l.contact_phone).filter(Boolean)
  if (phones.length > 0) {
    const { data: matchingCustomers } = await admin
      .from("customers")
      .select("id, first_name, last_name, phone, agency_id")
      .in("phone", phones)
    console.log(
      `\nLeads cuyo phone YA EXISTE como customer en alguna org: ${matchingCustomers?.length ?? 0}`
    )
    if (matchingCustomers && matchingCustomers.length > 0) {
      for (const c of matchingCustomers.slice(0, 10) as any[]) {
        console.log(
          `  customer ${c.id.slice(0, 8)} | ${c.first_name} ${c.last_name} | phone=${c.phone} | agency=${c.agency_id?.slice(0, 8)}`
        )
      }
    }
  }
})()
