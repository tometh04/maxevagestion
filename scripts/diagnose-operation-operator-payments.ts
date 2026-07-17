/**
 * Diagnóstico read-only de una operación puntual: muestra la foto completa de
 * operadores/servicios vs deudas vs pagos, para entender los dos síntomas:
 *   - "figura pendiente al operador algo que ya está pago" (settlement no imputado)
 *   - "distintos proveedores figuran todos como Sudameria" (operator_id colapsado)
 *
 * Imprime, para la operación:
 *   1. operation_operators (servicios cargados) con su operador real y costo.
 *   2. operator_payments (deudas) con operador, amount, paid_amount, status, due_date.
 *   3. payments (cobros/egresos) de la operación con operador y estado.
 *   4. Chequeos: deudas cuyo operator_id NO coincide con ningún servicio; egresos
 *      pagados cuyo monto no se ve reflejado en paid_amount.
 *
 * Uso (id completo, prefijo de id, o file_code):
 *   npx tsx scripts/diagnose-operation-operator-payments.ts e7a3e2de
 *   npx tsx scripts/diagnose-operation-operator-payments.ts <file_code>
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

const NEEDLE = process.argv.slice(2).find((a) => !a.startsWith("--"))

function fmt(n: unknown): string {
  return Number(n || 0).toFixed(2)
}

;(async () => {
  if (!NEEDLE) {
    console.error("Falta el argumento: id / prefijo de id / file_code de la operación.")
    process.exit(1)
  }

  // Resolver operación por id exacto, prefijo de id, o file_code.
  let { data: ops } = await admin
    .from("operations")
    .select("id, file_code, destination, operator_id, operator_cost, operator_cost_currency, org_id")
    .or(`file_code.eq.${NEEDLE},id.eq.${NEEDLE}`)
    .limit(5)

  if ((!ops || ops.length === 0) && /^[0-9a-f-]{4,}$/i.test(NEEDLE)) {
    // Prefijo de id: traer un lote y filtrar por startsWith (PostgREST no hace like en uuid).
    const { data: sample } = await admin
      .from("operations")
      .select("id, file_code, destination, operator_id, operator_cost, operator_cost_currency, org_id")
      .limit(10000)
    ops = (sample || []).filter((o: any) => String(o.id).startsWith(NEEDLE.toLowerCase()))
  }

  if (!ops || ops.length === 0) {
    console.error(`No se encontró ninguna operación para "${NEEDLE}".`)
    process.exit(1)
  }
  if (ops.length > 1) {
    console.log(`⚠️  ${ops.length} operaciones matchean; usá el id completo. Coincidencias:`)
    for (const o of ops) console.log(`   ${o.id}  file=${o.file_code}  ${o.destination}`)
    process.exit(1)
  }

  const op = ops[0] as any
  console.log(`\n=== Operación ${op.id} ===`)
  console.log(`file_code=${op.file_code}  destino=${op.destination}  org=${op.org_id}`)
  console.log(`operator_id PRIMARIO=${op.operator_id}  operator_cost=${fmt(op.operator_cost)} ${op.operator_cost_currency || ""}\n`)

  // Cache de nombres de operador.
  const { data: allOps } = await admin.from("operators").select("id, name").eq("org_id", op.org_id).limit(5000)
  const nameById = new Map((allOps || []).map((o: any) => [o.id, o.name]))
  const nm = (id: string | null) => (id ? `${nameById.get(id) || "(desconocido)"} [${String(id).slice(0, 8)}]` : "(sin operador)")

  // 1) Servicios cargados.
  const { data: opOpers } = await admin
    .from("operation_operators")
    .select("id, operator_id, cost, cost_currency, product_type")
    .eq("operation_id", op.id)
  console.log(`1) operation_operators (${(opOpers || []).length} servicios cargados):`)
  const serviceOperatorIds = new Set<string>()
  for (const oo of opOpers || []) {
    serviceOperatorIds.add((oo as any).operator_id)
    console.log(`   ${fmt((oo as any).cost)} ${(oo as any).cost_currency}  ${(oo as any).product_type || "-"}  →  ${nm((oo as any).operator_id)}`)
  }

  // 2) Deudas.
  const { data: opays } = await admin
    .from("operator_payments")
    .select("id, operator_id, amount, paid_amount, status, due_date, created_at")
    .eq("operation_id", op.id)
    .order("created_at", { ascending: true })
  console.log(`\n2) operator_payments (${(opays || []).length} deudas):`)
  for (const p of opays || []) {
    const pend = Number((p as any).amount || 0) - Number((p as any).paid_amount || 0)
    const flag = !serviceOperatorIds.has((p as any).operator_id) ? "  ⚠️ operador NO coincide con ningún servicio" : ""
    console.log(`   [${String((p as any).id).slice(0, 8)}] ${nm((p as any).operator_id)}  amount=${fmt((p as any).amount)} paid=${fmt((p as any).paid_amount)} pend=${fmt(pend)} status=${(p as any).status} venc=${(p as any).due_date}${flag}`)
  }

  // 3) Pagos (cobros/egresos) de la operación.
  const { data: pays } = await admin
    .from("payments")
    .select("*")
    .eq("operation_id", op.id)
    .order("movement_date", { ascending: true })
  console.log(`\n3) payments (${(pays || []).length} movimientos):`)
  for (const p of pays || []) {
    const r = p as any
    const link = r.operator_payment_id ? ` opPay=${String(r.operator_payment_id).slice(0, 8)}` : " opPay=NINGUNO"
    console.log(`   ${r.movement_date || r.created_at}  ${r.direction || ""}/${r.payer_type || ""}  ${fmt(r.amount)} ${r.currency || ""}  ${r.status || ""}  ${r.operator_id ? nm(r.operator_id) : ""}${link}`)
  }

  // 4) Chequeos rápidos.
  console.log(`\n4) Chequeos:`)
  const debtsMismatch = (opays || []).filter((p: any) => !serviceOperatorIds.has(p.operator_id))
  if (debtsMismatch.length > 0) {
    console.log(`   ⚠️ ${debtsMismatch.length} deuda(s) con operator_id que NO está en operation_operators → operador colapsado/mal asignado (Caso B).`)
  } else {
    console.log(`   ✓ Todas las deudas apuntan a un operador que existe como servicio.`)
  }
  const totalPend = (opays || []).reduce((s: number, p: any) => s + (Number(p.amount || 0) - Number(p.paid_amount || 0)), 0)
  const egresosPagados = (pays || []).filter((p: any) => (p.direction === "OUT" || p.payer_type === "OPERATOR") && (p.status === "PAID" || p.status === "Pagado"))
  const totalEgresos = egresosPagados.reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
  const totalPaidField = (opays || []).reduce((s: number, p: any) => s + Number(p.paid_amount || 0), 0)
  console.log(`   Pendiente total (amount-paid): ${fmt(totalPend)}`)
  console.log(`   Suma egresos a operador PAGADOS (payments): ${fmt(totalEgresos)}`)
  console.log(`   Suma paid_amount (operator_payments): ${fmt(totalPaidField)}`)
  if (Math.abs(totalEgresos - totalPaidField) > 0.01) {
    console.log(`   ⚠️ Egresos pagados (${fmt(totalEgresos)}) ≠ paid_amount imputado (${fmt(totalPaidField)}) → hay pagos que no redujeron la deuda (Caso A / settlement drift).`)
  } else {
    console.log(`   ✓ Egresos pagados coinciden con lo imputado a las deudas.`)
  }
  console.log("")
})().catch((e) => {
  console.error("Error en diagnóstico:", e)
  process.exit(1)
})
