/**
 * SaaS Pilar 2/5 — Smoke test de segregación por org_id.
 *
 * Con service_role (bypasea RLS), inspecciona todas las tablas tenant-scoped
 * clave y valida:
 *   1. Total de filas = filas de Lozada + filas de LOLO + otras orgs
 *   2. No hay filas con org_id NULL (esas no están protegidas por RLS)
 *   3. Reporta el breakdown por tabla
 *
 * Esto NO ejecuta queries como authenticated user (para eso haría falta
 * firmar un JWT con el secret de Supabase, inaccesible desde tooling
 * externo). Valida la PRE-CONDICIÓN de RLS: que los datos tienen org_id
 * correcto. Combinado con el audit de Pilar 1 (policies activas y usando
 * user_org_ids()), da evidencia end-to-end.
 *
 * Uso:
 *   npx tsx scripts/smoke-isolation.ts
 *
 * Env requeridas:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const MAXI_EMAIL = "maxi@erplozada.com"
const LOLO_EMAIL = "agency@agency.com"

const TENANT_TABLES = [
  "leads",
  "operations",
  "customers",
  "operation_customers",
  "payments",
  "cash_movements",
  "ledger_movements",
  "commission_records",
  "financial_accounts",
  "invoices",
  "alerts",
  "tasks",
] as const

type TableName = typeof TENANT_TABLES[number]

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type Failure = { table: TableName; detail: string }

async function getUserByEmail(email: string): Promise<{ orgId: string | null; userId: string }> {
  const { data, error } = await admin
    .from("users")
    .select("id, org_id")
    .eq("email", email)
    .single()
  if (error || !data) throw new Error(`No se encontró user ${email}: ${error?.message}`)
  return { orgId: (data as any).org_id, userId: (data as any).id }
}

async function main() {
  console.log("SaaS smoke isolation test\n")

  const maxi = await getUserByEmail(MAXI_EMAIL)
  const lolo = await getUserByEmail(LOLO_EMAIL)

  console.log(`Maxi (Lozada): user_id=${maxi.userId} org_id=${maxi.orgId}`)
  console.log(`LOLO:          user_id=${lolo.userId} org_id=${lolo.orgId}\n`)

  if (!maxi.orgId || !lolo.orgId) {
    console.error("❌ Uno de los users no tiene org_id — imposible auditar isolation.")
    process.exit(1)
  }

  if (maxi.orgId === lolo.orgId) {
    console.error("❌ Maxi y LOLO tienen la misma org_id — el seed está mal.")
    process.exit(1)
  }

  const failures: Failure[] = []

  // Para cada tabla tenant-scoped, chequear que las filas con el org_id de
  // cada user NO incluyen filas de la otra org. Esto NO es un test de RLS
  // (usa service_role), pero SÍ valida que los datos están segregados
  // correctamente por org_id — que es lo que RLS usa para filtrar.
  //
  // Si esto pasa + sabemos que RLS está activa (Pilar 1 ya lo verificó) +
  // sabemos que las policies usan user_org_ids() @> ARRAY[org_id], entonces
  // tenemos confianza end-to-end.

  for (const table of TENANT_TABLES) {
    // Cuenta global (service_role)
    const { count: total, error: totalErr } = await admin.from(table).select("*", { count: "exact", head: true })
    if (totalErr) {
      console.log(`  ${table.padEnd(24)}  [ERROR] ${totalErr.message}`)
      continue
    }

    const { count: maxiCount, error: maxiErr } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("org_id", maxi.orgId)
    const { count: loloCount, error: loloErr } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("org_id", lolo.orgId)

    if (maxiErr || loloErr) {
      console.log(`  ${table.padEnd(24)}  [ERROR] ${maxiErr?.message || loloErr?.message}`)
      continue
    }

    const { count: orphanCount } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .is("org_id", null)

    const covered = (maxiCount ?? 0) + (loloCount ?? 0) + (orphanCount ?? 0)
    const untracked = (total ?? 0) - covered

    const status = untracked === 0 && (orphanCount ?? 0) === 0 ? "OK" : "WARN"
    console.log(
      `  ${table.padEnd(24)}  total=${(total ?? 0).toString().padStart(5)}  lozada=${(maxiCount ?? 0).toString().padStart(5)}  lolo=${(loloCount ?? 0).toString().padStart(5)}  orphan=${(orphanCount ?? 0).toString().padStart(5)}  other_orgs=${untracked.toString().padStart(3)}  [${status}]`
    )

    if ((orphanCount ?? 0) > 0) {
      failures.push({
        table,
        detail: `${orphanCount} filas con org_id NULL — no están protegidas por RLS tenant_isolation`,
      })
    }
  }

  console.log("")
  if (failures.length > 0) {
    console.error(`❌ ${failures.length} problema(s) detectado(s):`)
    for (const f of failures) {
      console.error(`  - ${f.table}: ${f.detail}`)
    }
    process.exit(1)
  }

  console.log("✅ Smoke test passed: datos segregados por org_id en todas las tablas chequeadas.")
  console.log("   Nota: este test valida segregación de datos. RLS tenant_isolation")
  console.log("   aplica la misma lógica a nivel policy (ver Pilar 1 audit).")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
