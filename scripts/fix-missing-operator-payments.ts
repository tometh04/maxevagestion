/**
 * Crea operator_payments faltantes para operation_operators con cost > 0
 * que no tienen su correspondiente operator_payment. Detecta por CONTEO:
 * si un (op_id, operator_id) aparece N veces en operation_operators y M
 * veces en operator_payments, faltan N-M operator_payments para ese par.
 *
 * Los nuevos operator_payments se crean con:
 *   - status = PENDING, paid_amount = 0
 *   - amount = operation_operators.cost
 *   - currency = operation_operators.cost_currency
 *   - due_date = operations.departure_date
 *   - notes = trazabilidad del backfill
 *
 * Run:
 *   npx tsx scripts/fix-missing-operator-payments.ts --dry-run
 *   npx tsx scripts/fix-missing-operator-payments.ts --apply
 *   npx tsx scripts/fix-missing-operator-payments.ts --apply --org-id=<uuid>
 *   npx tsx scripts/fix-missing-operator-payments.ts --apply --operation-id=<uuid>
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
  console.log(`=== Fix operator_payments faltantes (${dryRun ? "DRY-RUN" : "APPLY"}) ===`)
  if (orgIdFilter) console.log(`Filtro org_id=${orgIdFilter}`)
  if (opIdFilter) console.log(`Filtro operation_id=${opIdFilter}`)

  const ops = await fetchAllPages<any>(() => {
    let q = admin
      .from("operations")
      .select("id, file_code, status, departure_date, org_id")
      .neq("status", "CANCELLED")
    if (orgIdFilter) q = q.eq("org_id", orgIdFilter)
    if (opIdFilter) q = q.eq("id", opIdFilter)
    return q
  })
  if (ops.length === 0) {
    console.log("Sin operaciones en scope.")
    return
  }

  const opIds = ops.map((o: any) => o.id)
  const orgIds = Array.from(new Set(ops.map((o: any) => o.org_id).filter(Boolean))) as string[]

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

  const payCount = new Map<string, number>()
  for (const p of opPays) {
    const k = (p as any).operation_id + "::" + (p as any).operator_id
    payCount.set(k, (payCount.get(k) || 0) + 1)
  }

  const byPair = new Map<string, any[]>()
  for (const r of opOps) {
    const k = (r as any).operation_id + "::" + (r as any).operator_id
    const arr = byPair.get(k) || []
    arr.push(r)
    byPair.set(k, arr)
  }

  const opsById = new Map(ops.map((o: any) => [o.id, o]))
  const orgsById = new Map(orgsRows.map((o: any) => [o.id, o]))

  const inserts: any[] = []
  for (const [, rows] of byPair.entries()) {
    const k = rows[0].operation_id + "::" + rows[0].operator_id
    const have = payCount.get(k) || 0
    const need = rows.length
    if (need > have) {
      for (let i = have; i < need; i++) {
        const opData: any = opsById.get(rows[i].operation_id)
        if (!opData?.org_id) continue
        inserts.push({
          operation_id: rows[i].operation_id,
          operator_id: rows[i].operator_id,
          amount: Number(rows[i].cost),
          currency: rows[i].cost_currency || "USD",
          due_date: opData.departure_date || new Date().toISOString().split("T")[0],
          status: "PENDING",
          paid_amount: 0,
          notes: `Backfill: deuda no generada al editar operación (${rows[i].product_type || "BASE"})`,
          org_id: opData.org_id,
          _meta: {
            org: orgsById.get(opData.org_id)?.name || "?",
            file: opData.file_code,
            operator: rows[i].operators?.name,
          },
        })
      }
    }
  }

  console.log(`\nRows a insertar: ${inserts.length}`)
  if (inserts.length === 0) {
    console.log("Nada para hacer.")
    return
  }

  console.table(
    inserts.slice(0, 30).map((i) => ({
      org: i._meta.org,
      file: i._meta.file,
      operator: i._meta.operator,
      amount: i.amount,
      curr: i.currency,
      due: i.due_date,
    }))
  )
  if (inserts.length > 30) {
    console.log(`(... ${inserts.length - 30} rows más no mostradas)`)
  }

  if (dryRun) {
    console.log("\n(dry-run — usá --apply para insertar)")
    return
  }

  let ok = 0
  let err = 0
  for (const row of inserts) {
    const { _meta, ...insertData } = row
    const { error } = await (admin.from("operator_payments") as any).insert(insertData)
    if (error) {
      console.error(`✗ [${_meta.org}] [${_meta.file}] ${_meta.operator}: ${error.message}`)
      err += 1
    } else {
      ok += 1
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Insertados: ${ok}`)
  console.log(`Errores: ${err}`)
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e)
  process.exit(1)
})
