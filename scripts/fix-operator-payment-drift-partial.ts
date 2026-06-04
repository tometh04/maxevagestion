/**
 * Fix data: sincroniza operator_payments.amount con operation_operators.cost
 * para rows PENDING/OVERDUE con paid_amount > 0, cuando es SEGURO hacerlo
 * (new_cost >= paid_amount).
 *
 * Complementa a fix-operator-payment-drift.ts (paid_amount=0).
 *
 * Run:
 *   npx tsx scripts/fix-operator-payment-drift-partial.ts --dry-run
 *   npx tsx scripts/fix-operator-payment-drift-partial.ts --apply
 *   npx tsx scripts/fix-operator-payment-drift-partial.ts --apply --org-id=<uuid>
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const dryRun = !args.includes("--apply")
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
  console.log(`=== Fix drift partial (${dryRun ? "DRY-RUN" : "APPLY"}) ===`)
  if (orgIdFilter) console.log(`Filtro org_id=${orgIdFilter}`)

  let candidateQuery = admin
    .from("operator_payments")
    .select("operation_id, operator_id, org_id")
    .in("status", ["PENDING", "OVERDUE"])
    .gt("paid_amount", 0)
    .not("operation_id", "is", null)

  if (orgIdFilter) candidateQuery = candidateQuery.eq("org_id", orgIdFilter)

  const candidates = await fetchAllPages<any>(() => candidateQuery, "candidates")
  if (candidates.length === 0) {
    console.log("Nada para procesar.")
    return
  }

  const operationIds = Array.from(new Set(candidates.map((c: any) => c.operation_id))) as string[]

  const [allOpPays, opOpsRows, opsRows] = await Promise.all([
    fetchByIdsChunked<any>(
      "operator_payments",
      "id, operation_id, operator_id, amount, currency, paid_amount, status, created_at",
      operationIds
    ),
    fetchByIdsChunked<any>(
      "operation_operators",
      "operation_id, operator_id, cost, cost_currency, created_at",
      operationIds
    ),
    fetchByIdsChunked<any>(
      "operations",
      "id, file_code",
      operationIds,
      "id"
    ),
  ])

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

  let toFix = 0
  let skippedUnsafe = 0
  let skippedNoMatch = 0
  let applied = 0
  let applyErrors = 0

  for (const p of indexedPays) {
    if (p.status === "PAID") continue
    if (Number(p.paid_amount || 0) <= 0) continue

    const op = opsById.get(p.operation_id) as any
    if (!op) continue
    const k = p.operation_id + "::" + p.operator_id
    const opOpsList = opOpsByPair.get(k) || []
    const match = opOpsList[p._idx]
    if (!match) {
      skippedNoMatch += 1
      continue
    }

    const expected = Number(match.cost || 0)
    const current = Number(p.amount || 0)
    const drift = current - expected
    if (Math.abs(drift) <= EPS) continue

    const paid = Number(p.paid_amount || 0)
    if (expected < paid) {
      skippedUnsafe += 1
      continue
    }

    toFix += 1
    console.log(
      `[${op.file_code || op.id.slice(0, 8)}] ${p.id.slice(0, 8)} amount ${current} → ${expected} ${match.cost_currency || "USD"} (drift ${drift.toFixed(2)}, paid=${paid})`
    )

    if (!dryRun) {
      const { error } = await (admin.from("operator_payments") as any)
        .update({
          amount: expected,
          currency: match.cost_currency || p.currency,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id)
      if (error) {
        console.error(`  ✗ Error: ${error.message}`)
        applyErrors += 1
      } else {
        applied += 1
      }
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Drifts a fixear (safe): ${toFix}`)
  console.log(`Skipped (unsafe: new_cost < paid): ${skippedUnsafe}`)
  console.log(`Skipped (no match en operation_operators): ${skippedNoMatch}`)
  if (!dryRun) {
    console.log(`Applied: ${applied}`)
    console.log(`Errors: ${applyErrors}`)
  } else {
    console.log("(dry-run — usá --apply para aplicar)")
  }
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e)
  process.exit(1)
})
