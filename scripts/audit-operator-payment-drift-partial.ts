/**
 * Audit: detecta drift entre operator_payments.amount y operation_operators.cost
 * para rows PENDING/OVERDUE con paid_amount > 0 (parcialmente pagados).
 *
 * Complementa a audit-operator-payment-drift.ts (que solo cubre paid_amount=0).
 *
 * Solo reporta casos donde new_cost >= paid_amount — esos son arreglables sin
 * romper el balance. new_cost < paid_amount queda como drift no resoluble vía
 * automático (requeriría reverso parcial de pagos aplicados).
 *
 * Run:
 *   npx tsx scripts/audit-operator-payment-drift-partial.ts
 *   npx tsx scripts/audit-operator-payment-drift-partial.ts --org-id=<uuid>
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

const PAGE_SIZE = 1000

async function fetchAllPages<T>(builderFactory: () => any, label = ""): Promise<T[]> {
  const out: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await builderFactory().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label} from=${from}: ${error.message || JSON.stringify(error)}`)
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

const EPS = 0.01

async function main() {
  console.log("=== Audit drift en operator_payments parcialmente pagados ===")
  if (orgIdFilter) console.log(`Filtro org_id=${orgIdFilter}`)

  // Paso 1: identificar los (op_id, operator_id) que tienen al menos un
  // operator_payment PENDING/OVERDUE con paid_amount > 0. Esos son los pares
  // candidatos a tener drift de tipo "parcialmente pagado".
  let candidateQuery = admin
    .from("operator_payments")
    .select("operation_id, operator_id, org_id")
    .in("status", ["PENDING", "OVERDUE"])
    .gt("paid_amount", 0)
    .not("operation_id", "is", null)

  if (orgIdFilter) candidateQuery = candidateQuery.eq("org_id", orgIdFilter)

  const candidates = await fetchAllPages<any>(() => candidateQuery, "candidates")
  console.log(`Candidatos (op_id, operator_id) con al menos un PENDING+paid>0: ${candidates.length}`)
  if (candidates.length === 0) return

  const operationIds = Array.from(new Set(candidates.map((c: any) => c.operation_id))) as string[]
  const orgIds = Array.from(new Set(candidates.map((c: any) => c.org_id).filter(Boolean))) as string[]

  // Paso 2: cargar TODOS los operator_payments de esas operations
  // (incluyendo PAID), TODOS los operation_operators, orgs y operators.
  // Indexar después por orden de created_at — match 1:1 con
  // operation_operators del mismo par.
  const [allOpPays, opOpsRows, opsRows, orgsRows, operatorsRowsRaw] = await Promise.all([
    fetchByIdsChunked<any>(
      "operator_payments",
      "id, operation_id, operator_id, amount, currency, paid_amount, status, org_id, created_at",
      operationIds
    ),
    fetchByIdsChunked<any>(
      "operation_operators",
      "operation_id, operator_id, cost, cost_currency, created_at",
      operationIds
    ),
    fetchByIdsChunked<any>(
      "operations",
      "id, file_code, org_id",
      operationIds,
      "id"
    ),
    fetchByIdsChunked<any>("organizations", "id, name", orgIds, "id"),
    fetchByIdsChunked<any>(
      "operators",
      "id, name",
      Array.from(new Set(candidates.map((c: any) => c.operator_id))) as string[],
      "id"
    ),
  ])

  // operation_operators sin orden estable en DB → ordenar por created_at para
  // que el índice sea reproducible. Si created_at es igual, ordenar por id.
  const opOpsByPair = new Map<string, any[]>()
  for (const r of opOpsRows) {
    const k = (r as any).operation_id + "::" + (r as any).operator_id
    const arr = opOpsByPair.get(k) || []
    arr.push(r)
    opOpsByPair.set(k, arr)
  }
  for (const arr of opOpsByPair.values()) {
    arr.sort((a: any, b: any) => {
      const t = (a.created_at || "").localeCompare(b.created_at || "")
      if (t !== 0) return t
      return String(a.operator_id).localeCompare(String(b.operator_id))
    })
  }

  const opsById = new Map(opsRows.map((r: any) => [r.id, r]))
  const orgsById = new Map(orgsRows.map((r: any) => [r.id, r]))
  const operatorsById = new Map(operatorsRowsRaw.map((r: any) => [r.id, r]))

  // Asignar índice a TODOS los operator_payments por (op_id, operator_id)
  // por created_at ascendente. Eso preserva el match 1:1 con operation_operators.
  allOpPays.sort((a: any, b: any) => {
    if (a.operation_id !== b.operation_id) return a.operation_id.localeCompare(b.operation_id)
    if (a.operator_id !== b.operator_id) return a.operator_id.localeCompare(b.operator_id)
    return (a.created_at || "").localeCompare(b.created_at || "")
  })

  const indexByPair = new Map<string, number>()
  const indexedPays = allOpPays.map((p: any) => {
    const k = p.operation_id + "::" + p.operator_id
    const i = indexByPair.get(k) || 0
    indexByPair.set(k, i + 1)
    return { ...p, _idx: i }
  })

  type Row = {
    org_id: string
    org_name: string
    file: string | null
    op_payment_id: string
    operator_id: string
    operator_name: string
    current_amount: number
    expected_cost: number
    drift: number
    paid_amount: number
    safe_to_apply: boolean
    currency: string
  }

  const drifts: Row[] = []
  for (const p of indexedPays) {
    // Solo nos interesan los PENDING/OVERDUE con paid_amount > 0 — los demás
    // se cargaron solo para preservar el orden de índice 1:1.
    if (p.status === "PAID") continue
    if (Number(p.paid_amount || 0) <= 0) continue

    const op = opsById.get(p.operation_id) as any
    if (!op) continue
    const k = p.operation_id + "::" + p.operator_id
    const opOpsList = opOpsByPair.get(k) || []
    const match = opOpsList[p._idx]
    if (!match) continue

    const expected = Number(match.cost || 0)
    const current = Number(p.amount || 0)
    const drift = current - expected
    if (Math.abs(drift) <= EPS) continue

    drifts.push({
      org_id: p.org_id,
      org_name: (orgsById.get(p.org_id) as any)?.name || "?",
      file: op.file_code,
      op_payment_id: p.id,
      operator_id: p.operator_id,
      operator_name: (operatorsById.get(p.operator_id) as any)?.name || "?",
      current_amount: current,
      expected_cost: expected,
      drift,
      paid_amount: Number(p.paid_amount || 0),
      safe_to_apply: expected >= Number(p.paid_amount || 0),
      currency: p.currency,
    })
  }

  console.log(`Drifts detectados: ${drifts.length}`)
  if (drifts.length === 0) return

  drifts.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))

  console.log("\nTop 30 por drift (abs):")
  console.table(
    drifts.slice(0, 30).map((r) => ({
      org: r.org_name,
      file: r.file,
      operator: r.operator_name,
      amount: r.current_amount,
      expected: r.expected_cost,
      drift: r.drift,
      paid: r.paid_amount,
      safe: r.safe_to_apply,
      curr: r.currency,
    }))
  )

  // Resumen por org y por status seguro/inseguro
  const byOrg = new Map<string, { rows: number; safe: number; unsafe: number; name: string }>()
  for (const r of drifts) {
    const cur = byOrg.get(r.org_id) || { rows: 0, safe: 0, unsafe: 0, name: r.org_name }
    cur.rows += 1
    if (r.safe_to_apply) cur.safe += 1
    else cur.unsafe += 1
    byOrg.set(r.org_id, cur)
  }
  console.log("\nResumen por org:")
  console.table(
    Array.from(byOrg.values())
      .map((v) => ({ org: v.name, rows: v.rows, safe: v.safe, unsafe: v.unsafe }))
      .sort((a, b) => b.rows - a.rows)
  )
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e)
  process.exit(1)
})
