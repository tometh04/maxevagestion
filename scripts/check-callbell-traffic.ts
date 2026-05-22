/**
 * scripts/check-callbell-traffic.ts
 *
 * Verifica si Callbell está mandando eventos a Vibook para VICO.
 * Si hay registros en webhook_event_log → el webhook outbound de Callbell ESTÁ configurado.
 *
 * Uso: npx tsx scripts/check-callbell-traffic.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Buscar org VICO
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", "vico-travel")
    .maybeSingle()

  if (!org) {
    console.log("❌ Org vico-travel NO EXISTE")
    return
  }
  const orgId = (org as any).id
  console.log(`✓ Org VICO: ${(org as any).name} (${orgId})\n`)

  // 1. Integraciones activas
  const { data: integs } = await admin
    .from("org_integrations")
    .select("integration, is_active, webhook_token, created_at")
    .eq("org_id", orgId)
  console.log("📡 Integrations:")
  for (const i of ((integs as any[]) ?? [])) {
    console.log(
      `  • ${i.integration}: active=${i.is_active} | token=${i.webhook_token?.slice(0, 12)}... | since=${i.created_at}`
    )
  }

  // 2. Webhook event log - últimos eventos de Callbell
  const { data: events, count } = await admin
    .from("webhook_event_log")
    .select("event_type, created_at, event_id, result", { count: "exact" })
    .eq("org_id", orgId)
    .eq("integration", "callbell-in")
    .order("created_at", { ascending: false })
    .limit(20)
  console.log(`\n📥 Webhook events de Callbell para VICO (total: ${count}):`)
  if (!events || events.length === 0) {
    console.log("  ⚠️  NADA registrado — el webhook outbound de Callbell NO está mandando eventos")
    console.log("     (o nunca lo configuraron en el dashboard de Callbell)")
  } else {
    for (const e of events as any[]) {
      console.log(`  • ${e.created_at} | ${e.event_type} | result=${e.result} | ${e.event_id?.slice(0, 20)}...`)
    }
  }

  // 3. Leads de fuente Callbell en VICO
  const { data: leads, count: leadCount } = await admin
    .from("leads")
    .select("id, contact_name, contact_phone, source, created_at", { count: "exact" })
    .eq("org_id", orgId)
    .eq("source", "Callbell")
    .order("created_at", { ascending: false })
    .limit(10)
  console.log(`\n👥 Leads en VICO con source='Callbell' (total: ${leadCount}):`)
  if (!leads || leads.length === 0) {
    console.log("  (ninguno — esperado si nunca llegó tráfico real)")
  } else {
    for (const l of leads as any[]) {
      console.log(`  • ${l.created_at} | ${l.contact_name} | ${l.contact_phone}`)
    }
  }

  // 4. Leads de cualquier fuente en VICO (para contexto)
  const { count: totalLeads } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
  console.log(`\n📊 Total leads en VICO: ${totalLeads}`)

  // 5. Agencies de VICO
  const { data: agencies } = await admin
    .from("agencies")
    .select("id, name, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
  console.log(`\n🏢 Agencies de VICO (${agencies?.length ?? 0}):`)
  for (const a of (agencies as any[]) ?? []) {
    console.log(`  • ${a.name} (${a.id}) — created ${a.created_at}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
