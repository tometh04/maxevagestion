/**
 * DIAGNÓSTICO READ-ONLY — VIB-61 "CRM Ventas Error Leads".
 *
 * No escribe NADA. Solo lee y reporta por qué los conteos de leads no cierran:
 *   - La suma por agencia no da el total ("todas las agencias" > suma).
 *   - Un lead aparece solo con "todas las agencias" (ej: Jul +5493416204845).
 *   - Cada perfil ve cantidades distintas.
 *
 * Hipótesis que verifica (ver lib/manychat/sync.ts::determineAgencyId y
 * app/api/leads/route.ts / app/(dashboard)/sales/crm-manychat/page.tsx):
 *   A) Leads con org_id de la org pero agency_id que NO pertenece a la org
 *      (o NULL) → suman en "todas" pero no en ninguna agencia individual.
 *   B) Leads con agency_id de una agencia de la org pero org_id NULL / de otra
 *      org → aparecen en el render inicial (filtra por agency, sin org) pero no
 *      en el refetch de la API (filtra por org_id). Este es el patrón "Jul".
 *   C) Nombres de agencia ambiguos entre orgs (el ilike sin scope de org que usa
 *      determineAgencyId puede matchear la agencia de otro tenant).
 *
 * Uso:
 *   npx tsx scripts/diagnose-leads-agency-assignment.ts --org="Lozada Rosario"
 *   npx tsx scripts/diagnose-leads-agency-assignment.ts --org=<orgId> --phone=3416204845
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const ORG_ARG = (args.find((a) => a.startsWith("--org=")) || "").split("=").slice(1).join("=").replace(/^["']|["']$/g, "") || null
// Default: teléfono de Jul reportado en la issue (matcheamos por sufijo).
const PHONE_ARG = (args.find((a) => a.startsWith("--phone=")) || "").split("=")[1] || "3416204845"

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

type LeadRow = {
  id: string
  org_id: string | null
  agency_id: string | null
  region: string | null
  status: string | null
  source: string | null
  list_name: string | null
  contact_phone: string | null
  contact_name: string | null
  assigned_seller_id: string | null
  archived_at: string | null
  created_at: string | null
}

const LEAD_COLS =
  "id, org_id, agency_id, region, status, source, list_name, contact_phone, contact_name, assigned_seller_id, archived_at, created_at"

/** Trae todas las filas de leads que matchean un builder, paginando de a 1000. */
async function fetchAllLeads(build: (q: any) => any): Promise<LeadRow[]> {
  const out: LeadRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(
      (admin.from("leads") as any).select(LEAD_COLS)
    ).range(from, from + PAGE - 1)
    if (error) {
      console.error("Error leyendo leads:", error.message)
      break
    }
    const rows = (data || []) as LeadRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function tally(rows: LeadRow[], keyFn: (r: LeadRow) => string) {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = keyFn(r)
    m.set(k, (m.get(k) || 0) + 1)
  }
  return m
}

function printTable(title: string, m: Map<string, number>) {
  console.log(`\n${title}`)
  const entries = Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) {
    console.log("  (sin filas)")
    return
  }
  for (const [k, v] of entries) console.log(`  ${String(v).padStart(6)}  ${k}`)
  console.log(`  ${String(entries.reduce((s, [, v]) => s + v, 0)).padStart(6)}  TOTAL`)
}

;(async () => {
  if (!ORG_ARG) {
    console.error('Uso: --org="<nombre o id>" [--phone=<sufijo>]')
    process.exit(1)
  }

  // 1. Resolver org.
  let orgId: string
  let orgName: string
  if (isUuid(ORG_ARG)) {
    const { data } = await admin.from("organizations").select("id, name").eq("id", ORG_ARG).maybeSingle()
    if (!data) { console.error(`No existe org ${ORG_ARG}`); process.exit(1) }
    orgId = (data as any).id; orgName = (data as any).name
  } else {
    const { data } = await admin.from("organizations").select("id, name").ilike("name", `%${ORG_ARG}%`)
    const list = (data || []) as any[]
    if (list.length === 0) { console.error(`No hay org que matchee "${ORG_ARG}"`); process.exit(1) }
    if (list.length > 1) {
      console.error(`Múltiples orgs matchean "${ORG_ARG}": ${list.map((o) => `${o.name} [${o.id}]`).join(", ")}. Usá --org=<id>.`)
      process.exit(1)
    }
    orgId = list[0].id; orgName = list[0].name
  }

  console.log(`\n======================================================================`)
  console.log(`  DIAGNÓSTICO LEADS — org: ${orgName} [${orgId}]`)
  console.log(`======================================================================`)

  // 2. Agencias de la org (lo que ve el dropdown / getUserAgencyIds para SUPER_ADMIN).
  const { data: agRows } = await admin.from("agencies").select("id, name, org_id").eq("org_id", orgId).order("name")
  const orgAgencies = (agRows || []) as any[]
  const orgAgencyIds = new Set(orgAgencies.map((a) => a.id))
  const agName = new Map<string, string>(orgAgencies.map((a) => [a.id, a.name]))
  console.log(`\nAgencias de la org (${orgAgencies.length}):`)
  for (const a of orgAgencies) console.log(`  - ${a.name} [${a.id}]`)

  // 3. Conjunto A: leads con org_id = org (lo que devuelve la API en "todas").
  const setA = await fetchAllLeads((q) => q.eq("org_id", orgId))
  // 4. Conjunto B: leads con agency_id de una agencia de la org (lo que filtra el
  //    render inicial del server component, que NO filtra por org_id).
  const setB = orgAgencyIds.size
    ? await fetchAllLeads((q) => q.in("agency_id", Array.from(orgAgencyIds)))
    : []

  const activeA = setA.filter((r) => r.archived_at == null)
  const label = (id: string | null) =>
    id == null ? "(NULL agency_id)" : `${agName.get(id) || "‹agencia de OTRA org / inexistente›"} [${id.slice(0, 8)}]`

  console.log(`\n----------------------------------------------------------------------`)
  console.log(`  CONJUNTO A: leads con org_id = ${orgName} (lo que cuenta la API)`)
  console.log(`  total=${setA.length}  activos(no archivados)=${activeA.length}`)
  console.log(`----------------------------------------------------------------------`)
  printTable("Leads activos por AGENCIA (org_id = org):", tally(activeA, (r) => label(r.agency_id)))
  printTable("Leads activos por REGIÓN (org_id = org):", tally(activeA, (r) => r.region || "(sin región)"))

  // Reconciliación: leads del org cuya agencia NO es del org (o es NULL).
  const aForeignAgency = activeA.filter((r) => r.agency_id == null || !orgAgencyIds.has(r.agency_id))
  console.log(`\n>>> HALLAZGO A (suma por agencia < total): ${aForeignAgency.length} leads activos tienen org_id=${orgName} pero agency_id NULL o de otra org.`)
  console.log(`    Estos suman en "todas las agencias" pero NO aparecen al filtrar por ninguna agencia del dropdown.`)
  printTable("    Desglose por agency_id problemático:", tally(aForeignAgency, (r) => label(r.agency_id)))

  // 5. Conjunto B \ A: agency_id de la org pero org_id NULL / de otra org → patrón "Jul".
  const bWrongOrg = setB.filter((r) => r.org_id !== orgId)
  const bWrongActive = bWrongOrg.filter((r) => r.archived_at == null)
  console.log(`\n>>> HALLAZGO B (patrón "solo aparece con todas las agencias"): ${bWrongActive.length} leads activos con agency_id de una agencia de ${orgName} pero org_id ${'NULL/otra org'}.`)
  console.log(`    Aparecen en el render inicial (filtra por agency, sin org) pero NO en el refetch de la API (filtra por org_id).`)
  printTable("    Desglose por org_id real:", tally(bWrongActive, (r) => r.org_id == null ? "(NULL org_id)" : r.org_id))
  printTable("    Desglose por agencia:", tally(bWrongActive, (r) => label(r.agency_id)))

  // 6. Lookup del teléfono (Jul por defecto).
  console.log(`\n----------------------------------------------------------------------`)
  console.log(`  LOOKUP por teléfono (sufijo "${PHONE_ARG}")`)
  console.log(`----------------------------------------------------------------------`)
  const { data: phoneRows } = await (admin.from("leads") as any)
    .select(LEAD_COLS)
    .ilike("contact_phone", `%${PHONE_ARG}%`)
  const phoneLeads = (phoneRows || []) as LeadRow[]
  if (phoneLeads.length === 0) console.log("  (sin coincidencias)")
  for (const l of phoneLeads) {
    const inOrg = l.org_id === orgId
    const agencyInOrg = l.agency_id != null && orgAgencyIds.has(l.agency_id)
    console.log(`  • ${l.contact_name || "(sin nombre)"}  tel=${l.contact_phone}  región=${l.region}  status=${l.status}  archivado=${l.archived_at ? "sí" : "no"}`)
    console.log(`      lead_id=${l.id}`)
    console.log(`      org_id=${l.org_id ?? "NULL"} ${inOrg ? "(= org)" : "(≠ org)"}   agency=${label(l.agency_id)} ${agencyInOrg ? "(en org)" : "(NO en org)"}`)
    console.log(`      source=${l.source}  list_name=${l.list_name}  assigned_seller_id=${l.assigned_seller_id ?? "NULL"}`)
  }

  // 7. Ambigüedad de nombres entre orgs (riesgo del ilike sin scope en determineAgencyId).
  console.log(`\n----------------------------------------------------------------------`)
  console.log(`  AMBIGÜEDAD DE NOMBRES (riesgo cross-tenant de determineAgencyId)`)
  console.log(`----------------------------------------------------------------------`)
  for (const term of ["rosario", "madero"]) {
    const { data: matches } = await admin.from("agencies").select("id, name, org_id").ilike("name", `%${term}%`)
    const ms = (matches || []) as any[]
    console.log(`  ilike "%${term}%" → ${ms.length} agencia(s) en TODA la base:`)
    for (const m of ms) console.log(`      - ${m.name} [${m.id.slice(0, 8)}] org=${m.org_id}${m.org_id === orgId ? " (esta org)" : ""}`)
  }

  console.log(`\n======================================================================`)
  console.log(`  RESUMEN`)
  console.log(`  A) org=${orgName} · leads activos con agencia NULL/foránea: ${aForeignAgency.length}`)
  console.log(`  B) agency de la org con org_id NULL/foráneo (patrón Jul): ${bWrongActive.length}`)
  console.log(`  → suma-por-agencia visible = ${activeA.length - aForeignAgency.length}, total "todas" (API) = ${activeA.length}`)
  console.log(`======================================================================\n`)
})()
