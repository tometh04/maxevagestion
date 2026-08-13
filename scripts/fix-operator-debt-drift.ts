/**
 * Realinea deudas al operador que quedaron con el monto viejo.
 * =============================================================
 *
 * PROBLEMA (reportado por VICO el 29/07, tickets VIB-88/89/90): al editar una
 * operación, si la deuda al operador ya estaba liquidada el sistema no reescribe
 * su monto —regla deliberada, no se toca lo que ya se pagó—. Pero cuando después
 * se revierte ese pago, la deuda vuelve a pendiente con el monto viejo y no hay
 * nada que la vuelva a sincronizar. Queda un pendiente que no coincide con la
 * liquidación, y editar la operación tampoco lo corrige.
 *
 * La causa ya está arreglada en lib/accounting/operator-payment-settlement.ts
 * (`resyncFullyRevertedOperatorPayment`). Este script corrige las deudas que
 * quedaron desalineadas antes del fix.
 *
 * NO replica la lógica: llama a la misma función del lib. Los criterios de
 * seguridad son por lo tanto idénticos a los que corren en producción — nunca
 * toca una deuda con pagos aplicados, ni una que venga de un servicio, ni una de
 * un operador con varias patas en la misma operación.
 *
 * USO
 *   npx tsx scripts/fix-operator-debt-drift.ts --org-id=<uuid>
 *   npx tsx scripts/fix-operator-debt-drift.ts --org-id=<uuid> --apply
 */

import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

import { resyncFullyRevertedOperatorPayment } from "../lib/accounting/operator-payment-settlement"

loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const orgId = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null

const PAGE = 1000

async function fetchAll<T>(table: string, cols: string, build: (q: any) => any): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await build(admin.from(table).select(cols)).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

async function main() {
  if (!orgId) {
    console.error("ERROR: --org-id=<uuid> es obligatorio.")
    process.exit(1)
  }

  console.log(`org_id=${orgId}`)
  console.log(apply ? "MODO: APLICAR" : "MODO: DRY-RUN (no escribe nada)")

  // Todas las deudas de la org, no solo las candidatas: hace falta contar
  // cuántas patas tiene cada operador en cada operación.
  const allDebts = await fetchAll<any>(
    "operator_payments",
    "id, operation_id, operator_id, amount, paid_amount, status, currency",
    (q) => q.eq("org_id", orgId)
  )
  const debts = allDebts.filter((d) => Number(d.paid_amount || 0) === 0)

  const debtsByPair = new Map<string, number>()
  for (const d of allDebts) {
    if (!d.operation_id || !d.operator_id) continue
    const k = `${d.operation_id}|${d.operator_id}`
    debtsByPair.set(k, (debtsByPair.get(k) || 0) + 1)
  }

  const operationIds = Array.from(
    new Set(debts.map((d) => d.operation_id).filter(Boolean))
  ) as string[]

  const costRows: any[] = []
  for (let i = 0; i < operationIds.length; i += 100) {
    const { data, error } = await admin
      .from("operation_operators")
      .select("operation_id, operator_id, cost, cost_currency")
      .in("operation_id", operationIds.slice(i, i + 100))
    if (error) throw new Error(`operation_operators: ${error.message}`)
    costRows.push(...(data || []))
  }

  const fileCodes = new Map<string, string>()
  for (let i = 0; i < operationIds.length; i += 100) {
    const { data } = await admin
      .from("operations")
      .select("id, file_code")
      .in("id", operationIds.slice(i, i + 100))
    for (const o of (data || []) as any[]) fileCodes.set(o.id, o.file_code)
  }

  const operatorNames = new Map<string, string>()
  const { data: operators } = await admin.from("operators").select("id, name").eq("org_id", orgId)
  for (const o of (operators || []) as any[]) operatorNames.set(o.id, o.name)

  const costByPair = new Map<string, Array<{ cost: number; currency: string }>>()
  for (const r of costRows) {
    const k = `${r.operation_id}|${r.operator_id}`
    const arr = costByPair.get(k) || []
    arr.push({ cost: Number(r.cost || 0), currency: String(r.cost_currency || "") })
    costByPair.set(k, arr)
  }

  // El filtro espeja los criterios de resyncFullyRevertedOperatorPayment. Si
  // divergiera, el --apply lo delata: los casos que el lib rechaza salen como
  // OMITIDA en vez de corregirse en silencio.
  const descartadas: string[] = []
  const candidatas = debts.filter((d) => {
    if (!d.operation_id || !d.operator_id) return false
    const k = `${d.operation_id}|${d.operator_id}`
    const costs = costByPair.get(k)
    if (!costs || costs.length !== 1) return false
    if (Math.abs(Number(d.amount || 0) - costs[0].cost) <= 0.01) return false

    if ((debtsByPair.get(k) || 0) !== 1) {
      descartadas.push(
        `${fileCodes.get(d.operation_id) || d.operation_id.slice(0, 8)} — el operador tiene varias deudas en la operación`
      )
      return false
    }
    const dc = String(d.currency || "").toUpperCase()
    const cc = costs[0].currency.toUpperCase()
    if (dc && cc && dc !== cc) {
      descartadas.push(
        `${fileCodes.get(d.operation_id) || d.operation_id.slice(0, 8)} — deuda en ${dc} contra costo en ${cc}`
      )
      return false
    }
    return true
  })

  console.log(`\nDeudas sin pagos aplicados: ${debts.length}`)
  console.log(`Corregibles automáticamente: ${candidatas.length}\n`)

  let corregidas = 0
  let omitidas = 0

  for (const d of candidatas) {
    const costo = costByPair.get(`${d.operation_id}|${d.operator_id}`)![0].cost
    const etiqueta =
      `${String(fileCodes.get(d.operation_id) || d.operation_id.slice(0, 8)).padEnd(22)} ` +
      `${String(operatorNames.get(d.operator_id) || "").trim().padEnd(16)} ` +
      `${Number(d.amount).toFixed(2).padStart(11)} → ${costo.toFixed(2).padStart(11)}`

    if (!apply) {
      console.log(`   ${etiqueta}`)
      continue
    }

    // Misma función que corre en producción al revertir un pago.
    const r = await resyncFullyRevertedOperatorPayment(admin as any, d.id)
    if (r.resynced) {
      corregidas++
      console.log(`   ${etiqueta}   OK`)
    } else {
      omitidas++
      console.log(`   ${etiqueta}   OMITIDA (${r.reason})`)
    }
  }

  if (descartadas.length > 0) {
    // No silenciar lo que se deja afuera: si el informe dijera solo lo que se
    // corrige, se leería como si estuviera todo cubierto.
    console.log(`\nDesalineadas que NO se tocan (requieren revisión manual): ${descartadas.length}`)
    for (const d of descartadas) console.log(`   ${d}`)
  }

  if (!apply) {
    console.log(`\nDRY-RUN: no se escribió nada. Agregá --apply para ejecutar.`)
    return
  }

  console.log(`\nCorregidas: ${corregidas}   Omitidas: ${omitidas}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
