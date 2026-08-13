/**
 * Diagnóstico read-only para la queja "en Pagos a Operadores figura siempre el
 * mismo operador (ej. Sudamérica) y aparecen repetidos".
 *
 * No modifica nada. Reporta:
 *   A) Concentración: operator_payments agrupados por operador (para ver si la
 *      deuda está anómalamente concentrada en un único operador).
 *   B) Duplicados: operadores cuyo nombre NORMALIZADO (minúsculas, sin acentos,
 *      espacios colapsados) colisiona → mismo operador cargado N veces con
 *      variantes de tilde/mayúscula/espacio, cada uno con su propio id. Muestra
 *      cuántos operator_payments y operation_operators referencia cada variante.
 *
 * Uso:
 *   npx tsx scripts/diagnose-operator-duplicates.ts <orgId>
 *   npx tsx scripts/diagnose-operator-duplicates.ts            # todas las orgs
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local (solo lectura).
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ORG_ID = process.argv.slice(2).find((a) => !a.startsWith("--")) || null

function normalizeName(name: string | null | undefined): string {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sacar acentos
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

async function fetchAll<T>(build: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

;(async () => {
  console.log(`\n=== Diagnóstico operadores duplicados / concentración ${ORG_ID ? `(org ${ORG_ID})` : "(todas las orgs)"} ===\n`)

  type Operator = { id: string; name: string | null; org_id: string | null; agency_id: string | null }
  type OpPay = { operator_id: string; amount: number | string | null; currency: string | null; operation_id: string | null }
  type OpOper = { operator_id: string }

  const operators = await fetchAll<Operator>((from, to) => {
    let q = admin.from("operators").select("id, name, org_id, agency_id").range(from, to)
    if (ORG_ID) q = q.eq("org_id", ORG_ID)
    return q
  })
  const operatorById = new Map(operators.map((o) => [o.id, o]))

  const opPays = await fetchAll<OpPay>((from, to) => {
    let q = admin.from("operator_payments").select("operator_id, amount, currency, operation_id").range(from, to)
    if (ORG_ID) q = q.eq("org_id", ORG_ID)
    return q
  })

  const opOpers = await fetchAll<OpOper>((from, to) => {
    let q = admin.from("operation_operators").select("operator_id").range(from, to)
    if (ORG_ID) q = q.eq("org_id", ORG_ID)
    return q
  })

  // ---- A) Concentración de operator_payments por operador ----
  const payCountByOperator = new Map<string, { count: number; total: number }>()
  for (const p of opPays) {
    const cur = payCountByOperator.get(p.operator_id) || { count: 0, total: 0 }
    cur.count += 1
    cur.total += Number(p.amount || 0)
    payCountByOperator.set(p.operator_id, cur)
  }
  const concentration = Array.from(payCountByOperator.entries())
    .map(([opId, v]) => ({ name: operatorById.get(opId)?.name || "(operador inexistente / otra org)", opId, ...v }))
    .sort((a, b) => b.count - a.count)

  console.log(`A) operator_payments por operador (top 15 de ${opPays.length} pagos, ${concentration.length} operadores):`)
  for (const row of concentration.slice(0, 15)) {
    console.log(`   ${String(row.count).padStart(5)} pagos  |  total ${row.total.toFixed(2)}  |  ${row.name}  [${row.opId.slice(0, 8)}]`)
  }
  const totalPays = opPays.length
  if (concentration.length > 0 && totalPays > 0) {
    const topShare = (concentration[0].count / totalPays) * 100
    console.log(`   → El operador top concentra ${topShare.toFixed(1)}% de los pagos.` +
      (topShare > 60 ? "  ⚠️  Concentración anómala: probable mala asignación de operator_id (ver fix-orphan-operators.ts)." : ""))
  }

  // ---- B) Operadores duplicados por nombre normalizado ----
  const opOperCountByOperator = new Map<string, number>()
  for (const oo of opOpers) opOperCountByOperator.set(oo.operator_id, (opOperCountByOperator.get(oo.operator_id) || 0) + 1)

  const byNormName = new Map<string, Operator[]>()
  for (const o of operators) {
    const key = `${o.org_id || "-"}::${normalizeName(o.name)}`
    const arr = byNormName.get(key) || []
    arr.push(o)
    byNormName.set(key, arr)
  }
  const dupGroups = Array.from(byNormName.entries()).filter(([, arr]) => arr.length > 1)

  console.log(`\nB) Operadores duplicados por nombre normalizado (${dupGroups.length} grupos):`)
  if (dupGroups.length === 0) {
    console.log("   Ninguno. Los 'repetidos' vienen de que la vista lista 1 fila por servicio (no es bug), no de operadores duplicados.")
  }
  for (const [key, arr] of dupGroups.sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
    const norm = key.split("::")[1]
    console.log(`   "${norm}" → ${arr.length} operadores distintos:`)
    for (const o of arr) {
      const pays = payCountByOperator.get(o.id)?.count || 0
      const oos = opOperCountByOperator.get(o.id) || 0
      console.log(`      [${o.id.slice(0, 8)}] "${o.name}"  agency=${o.agency_id?.slice(0, 8) || "-"}  | ${pays} pagos, ${oos} servicios`)
    }
  }

  console.log(`\nSiguiente paso sugerido:`)
  console.log(`  • Si A muestra concentración anómala → npx tsx scripts/fix-orphan-operators.ts   (dry-run)`)
  console.log(`  • Si B muestra duplicados → unificar variantes (revisar antes de mergear ids).`)
  console.log(`  • Reconciliar montos de deuda → npx tsx scripts/reconcile-operator-payments.ts ${ORG_ID || "[orgId]"}   (dry-run)\n`)
})().catch((e) => {
  console.error("Error en diagnóstico:", e)
  process.exit(1)
})
