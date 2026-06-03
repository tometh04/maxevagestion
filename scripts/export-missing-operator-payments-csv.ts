/**
 * Exporta a CSV el listado de operator_payments faltantes, con contexto
 * adicional para que el equipo de la org pueda validar caso por caso
 * antes de aplicar el fix masivo.
 *
 * Columnas:
 *   - org, file_code, status, departure_date, destination
 *   - customer (cliente principal de la operación)
 *   - operator, cost, currency, product_type
 *   - expense_payments_existing: SUM de payments EXPENSE existentes
 *     hacia ese operador en esa operación. Si > 0, sospecha de que
 *     ya se pagó por otra vía.
 *   - has_purchase_invoice: 'sí' si hay factura del operador cargada
 *     (señal de que efectivamente hay deuda).
 *   - sugerencia: acción propuesta para la org.
 *
 * Output: scripts/out/missing-operator-payments-<org-slug>.csv
 *
 * Run:
 *   npx tsx scripts/export-missing-operator-payments-csv.ts --org-id=<uuid>
 *   npx tsx scripts/export-missing-operator-payments-csv.ts            (cross-org)
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
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
    if (error) throw new Error(`${label} from=${from}: ${error.message}`)
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

function csvEscape(v: any): string {
  if (v === null || v === undefined) return ""
  const s = String(v)
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

async function main() {
  console.log("=== Export CSV: operator_payments faltantes ===")
  if (orgIdFilter) console.log(`Filtro org_id=${orgIdFilter}`)

  const ops = await fetchAllPages<any>(() => {
    let q = admin
      .from("operations")
      .select("id, file_code, status, departure_date, destination, org_id")
      .neq("status", "CANCELLED")
    if (orgIdFilter) q = q.eq("org_id", orgIdFilter)
    return q
  })
  if (ops.length === 0) {
    console.log("Sin operaciones en scope.")
    return
  }

  const opIds = ops.map((o: any) => o.id)
  const orgIds = Array.from(new Set(ops.map((o: any) => o.org_id).filter(Boolean))) as string[]

  const [opOps, opPays, orgsRows, payments, purchaseInvoices, operationCustomers] = await Promise.all([
    fetchByIdsChunked<any>(
      "operation_operators",
      "operation_id, operator_id, cost, cost_currency, product_type, operators:operator_id(name)",
      opIds,
      "operation_id",
      (q) => q.gt("cost", 0)
    ),
    fetchByIdsChunked<any>("operator_payments", "operation_id, operator_id", opIds),
    fetchByIdsChunked<any>("organizations", "id, name", orgIds, "id"),
    fetchByIdsChunked<any>(
      "payments",
      "operation_id, operator_id, amount, currency, status, direction",
      opIds,
      "operation_id",
      (q) => q.eq("direction", "EXPENSE")
    ),
    fetchByIdsChunked<any>(
      "purchase_invoices",
      "operation_id, operator_id",
      opIds,
      "operation_id"
    ),
    fetchByIdsChunked<any>(
      "operation_customers",
      "operation_id, customers:customer_id(first_name, last_name)",
      opIds,
      "operation_id"
    ),
  ])

  const payCount = new Map<string, number>()
  for (const p of opPays) {
    const k = (p as any).operation_id + "::" + (p as any).operator_id
    payCount.set(k, (payCount.get(k) || 0) + 1)
  }

  // Pagos EXPENSE hacia (op, operator)
  const expensePaidMap = new Map<string, number>()
  for (const p of payments as any[]) {
    if (!p.operator_id) continue
    const k = p.operation_id + "::" + p.operator_id
    expensePaidMap.set(k, (expensePaidMap.get(k) || 0) + Number(p.amount || 0))
  }

  // Purchase invoices por (op, operator)
  const piMap = new Set<string>()
  for (const r of purchaseInvoices as any[]) {
    if (!r.operator_id) continue
    piMap.add(r.operation_id + "::" + r.operator_id)
  }

  // Cliente principal por operación (primero alfabético si hay varios)
  const customerByOp = new Map<string, string>()
  for (const r of operationCustomers as any[]) {
    const c = r.customers
    if (!c?.first_name && !c?.last_name) continue
    const full = `${c.first_name || ""} ${c.last_name || ""}`.trim()
    const existing = customerByOp.get(r.operation_id)
    if (!existing || full < existing) {
      customerByOp.set(r.operation_id, full)
    }
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

  const rows: any[] = []
  for (const [, items] of byPair.entries()) {
    const k = items[0].operation_id + "::" + items[0].operator_id
    const have = payCount.get(k) || 0
    const need = items.length
    if (need > have) {
      for (let i = have; i < need; i++) {
        const opData: any = opsById.get(items[i].operation_id)
        if (!opData?.org_id) continue
        const expensePaid = expensePaidMap.get(k) || 0
        const hasPI = piMap.has(k)

        let suggestion = "Crear como PENDING"
        if (expensePaid > 0 && Math.abs(expensePaid - Number(items[i].cost)) < 1) {
          suggestion = "Probablemente YA PAGADO — crear como PAID con paid_amount=cost"
        } else if (expensePaid > 0) {
          suggestion = `Verificar: hay USD ${expensePaid.toFixed(2)} en payments EXPENSE no conciliados`
        }
        if (!hasPI && !opData.departure_date) {
          suggestion += " | sin purchase_invoice ni fecha de salida — revisar antes de cargar"
        }

        rows.push({
          org: orgsById.get(opData.org_id)?.name || "?",
          file: opData.file_code,
          status: opData.status,
          departure: opData.departure_date,
          destination: opData.destination,
          customer: customerByOp.get(opData.id) || "",
          operator: items[i].operators?.name,
          cost: items[i].cost,
          currency: items[i].cost_currency || "USD",
          product_type: items[i].product_type || "",
          expense_payments_existing: expensePaid > 0 ? expensePaid : "",
          has_purchase_invoice: hasPI ? "sí" : "no",
          sugerencia: suggestion,
          _operation_id: opData.id,
          _operator_id: items[i].operator_id,
        })
      }
    }
  }

  if (rows.length === 0) {
    console.log("Nada para exportar.")
    return
  }

  // Ordenar por org luego file luego cost desc
  rows.sort((a, b) => {
    if (a.org !== b.org) return a.org.localeCompare(b.org)
    if (a.file !== b.file) return (a.file || "").localeCompare(b.file || "")
    return Number(b.cost) - Number(a.cost)
  })

  const outDir = join(process.cwd(), "scripts", "out")
  mkdirSync(outDir, { recursive: true })

  const orgsInOutput = Array.from(new Set(rows.map((r) => r.org)))
  const fileSuffix = orgsInOutput.length === 1 ? slugify(orgsInOutput[0]) : "all-orgs"
  const filename = `missing-operator-payments-${fileSuffix}-${new Date().toISOString().split("T")[0]}.csv`
  const outPath = join(outDir, filename)

  const headers = [
    "org",
    "file",
    "status",
    "departure",
    "destination",
    "customer",
    "operator",
    "cost",
    "currency",
    "product_type",
    "expense_payments_existing",
    "has_purchase_invoice",
    "sugerencia",
    "operation_id",
    "operator_id",
  ]

  const lines = [headers.join(",")]
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.org),
        csvEscape(r.file),
        csvEscape(r.status),
        csvEscape(r.departure),
        csvEscape(r.destination),
        csvEscape(r.customer),
        csvEscape(r.operator),
        csvEscape(r.cost),
        csvEscape(r.currency),
        csvEscape(r.product_type),
        csvEscape(r.expense_payments_existing),
        csvEscape(r.has_purchase_invoice),
        csvEscape(r.sugerencia),
        csvEscape(r._operation_id),
        csvEscape(r._operator_id),
      ].join(",")
    )
  }

  writeFileSync(outPath, lines.join("\n"), "utf8")
  console.log(`\n✓ Exportado a: ${outPath}`)
  console.log(`Total filas: ${rows.length}`)

  const byOrg = new Map<string, number>()
  for (const r of rows) byOrg.set(r.org, (byOrg.get(r.org) || 0) + 1)
  console.log("Por org:")
  for (const [org, count] of byOrg.entries()) {
    console.log(`  - ${org}: ${count}`)
  }
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e)
  process.exit(1)
})
