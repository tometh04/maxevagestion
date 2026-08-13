/**
 * Verificación de las RPCs del CRM lazy (VIB-61). Correr DESPUÉS de deployar
 * la migración 20260724000001_crm_kanban_lazy_rpcs.sql.
 *
 * Chequea contra datos reales de Lozada Rosario que:
 *   - crm_kanban_column_counts devuelve columnas cuyo total == leads activos.
 *   - "Campaña - EE UU" tiene el count real (~228 en Rosario), no el 20 roto.
 *   - crm_kanban_column_leads pagina una columna.
 *   - El scope por org NO deja pedir agencias de otra org.
 *
 * Uso: npx tsx scripts/verify-crm-kanban-rpcs.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const ORG = "1b326d20-d133-4112-a798-f54b5af7e7cb" // Lozada Rosario
const ROSARIO = "66563aeb-4e8b-40ee-a622-b39defb380dd"

;(async () => {
  // Conteos por columna (Rosario).
  const { data: counts, error: e1 } = await (admin as any).rpc("crm_kanban_column_counts", {
    p_org_id: ORG,
    p_agency_ids: [ROSARIO],
    p_status: null, p_region: null, p_search: null, p_created_from: null, p_created_to: null,
  })
  if (e1) { console.error("❌ crm_kanban_column_counts:", e1.message); process.exit(1) }

  const cols = ((counts || []) as any[]).map((r) => ({ key: r.column_key, count: Number(r.cnt) })).sort((a, b) => b.count - a.count)
  const sum = cols.reduce((s, c) => s + c.count, 0)

  const { count: activeTotal } = await (admin.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("org_id", ORG).eq("agency_id", ROSARIO).is("archived_at", null)

  console.log(`\ncrm_kanban_column_counts (Rosario): ${cols.length} columnas, suma=${sum}, activos reales=${activeTotal}`)
  console.log(`  ${sum === activeTotal ? "✅ suma == total" : "❌ NO cuadra"}`)
  console.log("  Top columnas:")
  for (const c of cols.slice(0, 8)) console.log(`    ${String(c.count).padStart(5)}  ${c.key}`)

  // Paginado de una columna.
  const key = cols.find((c) => c.key.toLowerCase().includes("ee uu"))?.key || cols[0].key
  const { data: leads, error: e2 } = await (admin as any).rpc("crm_kanban_column_leads", {
    p_org_id: ORG, p_agency_ids: [ROSARIO], p_column_key: key,
    p_limit: 5, p_offset: 0,
    p_status: null, p_region: null, p_search: null, p_created_from: null, p_created_to: null,
  })
  if (e2) { console.error("❌ crm_kanban_column_leads:", e2.message); process.exit(1) }
  console.log(`\ncrm_kanban_column_leads key="${key}": ${(leads || []).length} leads (pág 1 de 5)`)
  for (const l of (leads || []) as any[]) console.log(`    - ${l.contact_name} (${l.status}) ${l.updated_at}`)

  // Scope de org: pedir con una agencia que NO es de la org → debe dar 0.
  const { data: cross } = await (admin as any).rpc("crm_kanban_column_counts", {
    p_org_id: ORG, p_agency_ids: ["00000000-0000-0000-0000-000000000000"],
    p_status: null, p_region: null, p_search: null, p_created_from: null, p_created_to: null,
  })
  console.log(`\nScope: agencia foránea → ${((cross || []) as any[]).length} columnas (esperado 0) ${((cross || []).length === 0) ? "✅" : "❌"}`)
  console.log("")
})()
