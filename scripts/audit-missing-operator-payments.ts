/**
 * Detecta operation_operators con cost > 0 que NO tienen su correspondiente
 * operator_payment. Compara por CONTEO: si un (op_id, operator_id) aparece
 * N veces en operation_operators y M veces en operator_payments, faltan
 * N-M operator_payments para ese par (caso típico: mismo operador en 2
 * product_types distintos dentro de la misma operación).
 *
 * Complementa a `audit-operator-payment-drift.ts`, que solo detecta drift
 * de amount entre rows EXISTENTES — éste detecta los FALTANTES, que el
 * otro no puede ver.
 *
 * Run:
 *   npx tsx scripts/audit-missing-operator-payments.ts
 *   npx tsx scripts/audit-missing-operator-payments.ts --org-id=<uuid>
 *   npx tsx scripts/audit-missing-operator-payments.ts --operation-id=<uuid>
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const orgIdFilter = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null
const opIdFilter = args.find((a) => a.startsWith("--operation-id="))?.split("=")[1] || null

const PAGE_SIZE = 1000

async function fetchAllPages<T>(builderFactory: () => any, label = ""): Promise<T[]> {
  const out: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await builderFactory().range(from, from + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`fetchAllPages(${label}) page from=${from}: ${error.message || JSON.stringify(error)}`)
    }
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return out
}

async function fetchByIdsChunked<T>(
  table: string,
  select: string,
  ids: string[],
  column = "operation_id",
  extra?: (q: any) => any
): Promise<T[]> {
  const CHUNK = 100
  const out: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const rows = await fetchAllPages<T>(
      () => {
        let q = admin.from(table).select(select).in(column, slice)
        if (extra) q = extra(q)
        return q
      },
      `${table} chunk ${i}-${i + slice.length}`
    )
    out.push(...rows)
  }
  return out
}

async function main() {
  console.log("=== Audit operator_payments faltantes ===")
  if (orgIdFilter) console.log(`Filtro org_id=${orgIdFilter}`)
  if (opIdFilter) console.log(`Filtro operation_id=${opIdFilter}`)

  // 1) Cargar operaciones no canceladas (filtradas por org/op si aplica)
  const ops = await fetchAllPages<any>(() => {
    let q = admin
      .from("operations")
      .select("id, file_code, status, departure_date, org_id")
      .neq("status", "CANCELLED")
    if (orgIdFilter) q = q.eq("org_id", orgIdFilter)
    if (opIdFilter) q = q.eq("id", opIdFilter)
    return q
  })
  console.log(`Operaciones (no canceladas) en scope: ${ops.length}`)
  if (ops.length === 0) return

  const opIds = ops.map((o: any) => o.id)
  const orgIds = Array.from(new Set(ops.map((o: any) => o.org_id).filter(Boolean))) as string[]

  // 2) Cargar operation_operators, operator_payments, orgs paginados/chunked
  const [opOps, opPays, orgsRows] = await Promise.all([
    fetchByIdsChunked<any>(
      "operation_operators",
      "operation_id, operator_id, cost, cost_currency, product_type, operators:operator_id(name)",
      opIds,
      "operation_id",
      (q) => q.gt("cost", 0)
    ),
    fetchByIdsChunked<any>("operator_payments", "operation_id, operator_id", opIds),
    fetchByIdsChunked<any>("organizations", "id, name", orgIds, "id"),
  ])

  // 3) Conteo en operator_payments por (op_id, operator_id)
  const payCount = new Map<string, number>()
  for (const p of opPays) {
    const k = (p as any).operation_id + "::" + (p as any).operator_id
    payCount.set(k, (payCount.get(k) || 0) + 1)
  }

  // 4) Agrupar operation_operators por (op_id, operator_id)
  const byPair = new Map<string, any[]>()
  for (const r of opOps) {
    const k = (r as any).operation_id + "::" + (r as any).operator_id
    const arr = byPair.get(k) || []
    arr.push(r)
    byPair.set(k, arr)
  }

  const opsById = new Map(ops.map((o: any) => [o.id, o]))
  const orgsById = new Map(orgsRows.map((o: any) => [o.id, o]))

  const missing: any[] = []
  for (const [pair, rows] of byPair.entries()) {
    const have = payCount.get(pair) || 0
    const need = rows.length
    if (need > have) {
      for (let i = have; i < need; i++) {
        const opData: any = opsById.get(rows[i].operation_id)
        missing.push({
          org_id: opData?.org_id,
          org_name: orgsById.get(opData?.org_id)?.name || "?",
          file: opData?.file_code,
          operator: rows[i].operators?.name,
          cost: Number(rows[i].cost),
          curr: rows[i].cost_currency || "USD",
          product_type: rows[i].product_type,
          op_id: rows[i].operation_id,
          operator_id: rows[i].operator_id,
          due_date: opData?.departure_date,
        })
      }
    }
  }

  console.log(`\noperation_operators SIN operator_payment correspondiente: ${missing.length}`)
  if (missing.length === 0) return

  missing.sort((a, b) => b.cost - a.cost)

  console.log("\nTop 30 por costo (descendente):")
  console.table(
    missing.slice(0, 30).map((m) => ({
      org: m.org_name,
      file: m.file,
      operator: m.operator,
      cost: m.cost,
      curr: m.curr,
      pt: m.product_type,
      due: m.due_date,
    }))
  )

  // Resumen por org
  const byOrg = new Map<string, { rows: number; totalUsd: number; totalArs: number; name: string }>()
  for (const r of missing) {
    const cur = byOrg.get(r.org_id) || { rows: 0, totalUsd: 0, totalArs: 0, name: r.org_name }
    cur.rows += 1
    if (r.curr === "USD") cur.totalUsd += r.cost
    else if (r.curr === "ARS") cur.totalArs += r.cost
    byOrg.set(r.org_id, cur)
  }
  console.log("\nResumen por org:")
  console.table(
    Array.from(byOrg.values())
      .map((v) => ({ org: v.name, rows: v.rows, total_USD: v.totalUsd, total_ARS: v.totalArs }))
      .sort((a, b) => b.rows - a.rows)
  )
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e)
  process.exit(1)
})
