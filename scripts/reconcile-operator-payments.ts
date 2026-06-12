/**
 * Reconciliación integral de operator_payments contra operation_operators.
 *
 * Detecta (y opcionalmente corrige) el drift entre la liquidación intencional
 * (operation_operators = lo que el usuario cargó/editó) y la deuda provisionada
 * (operator_payments = fuente de verdad para reportes y pagos).
 *
 * Aplica las MISMAS reglas que el endpoint de edición de operación
 * (app/api/operations/[id]/route.ts), pero en batch sobre datos ya existentes:
 *
 *   Matching count-based por operator_id (1 operation_operators row ↔ 1 operator_payment).
 *   Solo deudas BASE (excluye operator_payments linkeados a operation_services).
 *
 *   - MISSING   : op_operator sin operator_payment            → crear (amount=cost)
 *   - UNDER     : cost > amount (incluye PAID con costo subido) → subir amount=cost
 *                 (reabre la deuda; paid_amount intacto; pendiente = cost - paid)
 *   - OVER_SAFE : cost < amount y paid_amount <= cost          → bajar amount=cost
 *   - GHOST     : operator_payment sin op_operator que lo matchee, paid=0,
 *                 no linkeado a servicio                        → borrar
 *   - BLOCKED   : cost < paid_amount, o ghost con pagos         → NO tocar, reportar
 *
 * Read-only por defecto. Para aplicar: --apply
 *   Auditar:  npx tsx scripts/reconcile-operator-payments.ts [orgId]
 *   Aplicar:  npx tsx scripts/reconcile-operator-payments.ts [orgId] --apply
 *
 * Sin orgId: todas las orgs.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const ORG_ID = args.find((a) => !a.startsWith("--")) || null

const EPS = 0.005

function statusFromDue(due: string | null): "PENDING" | "OVERDUE" {
  if (!due) return "PENDING"
  const d = new Date(due); d.setHours(0, 0, 0, 0)
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return d < t ? "OVERDUE" : "PENDING"
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
  console.log(`\n=== Reconciliación operator_payments ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ===`)
  console.log(ORG_ID ? `Org: ${ORG_ID}\n` : `Org: TODAS\n`)

  // 1) operation_operators (liquidación intencional)
  const ooFilter = (from: number, to: number) => {
    let q = admin.from("operation_operators")
      .select("operation_id, operator_id, cost, cost_currency, created_at, org_id")
      .range(from, to)
    if (ORG_ID) q = q.eq("org_id", ORG_ID)
    return q
  }
  const opOperators = await fetchAll<any>(ooFilter)

  // 2) operator_payments BASE (excluye los linkeados a servicios)
  const svcLinks = await fetchAll<any>((from, to) =>
    admin.from("operation_services").select("operator_payment_id")
      .not("operator_payment_id", "is", null).range(from, to)
  )
  const serviceLinkedIds = new Set(svcLinks.map((s) => s.operator_payment_id).filter(Boolean))

  const opPaysFilter = (from: number, to: number) => {
    let q = admin.from("operator_payments")
      .select("id, operation_id, operator_id, amount, paid_amount, currency, status, due_date, ledger_movement_id, org_id, created_at")
      .range(from, to)
    if (ORG_ID) q = q.eq("org_id", ORG_ID)
    return q
  }
  const allOpPays = (await fetchAll<any>(opPaysFilter)).filter((p) => !serviceLinkedIds.has(p.id))

  // Solo operaciones que tienen operation_operators (modelo multi-operador).
  // Las legacy single-op sin operation_operators no se reconcilian acá.
  const opsWithOperators = new Set(opOperators.map((r) => r.operation_id))

  // Agrupar por operación
  const ooByOp = new Map<string, any[]>()
  for (const r of opOperators) {
    const a = ooByOp.get(r.operation_id) || []; a.push(r); ooByOp.set(r.operation_id, a)
  }
  const payByOp = new Map<string, any[]>()
  for (const p of allOpPays) {
    if (!opsWithOperators.has(p.operation_id)) continue
    const a = payByOp.get(p.operation_id) || []; a.push(p); payByOp.set(p.operation_id, a)
  }

  type Action = {
    kind: "MISSING" | "UNDER" | "OVER_SAFE" | "GHOST" | "BLOCKED"
    operationId: string
    operatorId: string
    payId?: string
    detail: string
    org_id: string
    // datos para apply
    newAmount?: number
    currency?: string
    dueDate?: string
    createCost?: number
  }
  const actions: Action[] = []

  for (const operationId of ooByOp.keys()) {
    const oos = (ooByOp.get(operationId) || []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    const pays = (payByOp.get(operationId) || []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1))

    const ooByOperator = new Map<string, any[]>()
    for (const r of oos) { const a = ooByOperator.get(r.operator_id) || []; a.push(r); ooByOperator.set(r.operator_id, a) }
    const payByOperator = new Map<string, any[]>()
    for (const p of pays) { const a = payByOperator.get(p.operator_id) || []; a.push(p); payByOperator.set(p.operator_id, a) }

    const matchedPayIds = new Set<string>()

    // Match count-based por operador
    for (const [operatorId, ooRows] of ooByOperator) {
      const payRows = payByOperator.get(operatorId) || []
      for (let i = 0; i < ooRows.length; i++) {
        const cost = Number(ooRows[i].cost || 0)
        const pay = payRows[i]
        if (!pay) {
          if (cost > 0) {
            actions.push({
              kind: "MISSING", operationId, operatorId, org_id: ooRows[i].org_id,
              detail: `falta operator_payment (cost=${cost} ${ooRows[i].cost_currency})`,
              createCost: cost, currency: ooRows[i].cost_currency,
            })
          }
          continue
        }
        matchedPayIds.add(pay.id)
        const amount = Number(pay.amount || 0)
        const paid = Number(pay.paid_amount || 0)
        if (Math.abs(cost - amount) < EPS) continue // ok

        if (cost > amount) {
          actions.push({
            kind: "UNDER", operationId, operatorId, payId: pay.id, org_id: pay.org_id,
            detail: `amount ${amount} < cost ${cost} (status=${pay.status}, paid=${paid}) → pendiente ${cost - paid}`,
            newAmount: cost, currency: ooRows[i].cost_currency, dueDate: pay.due_date,
          })
        } else { // cost < amount
          if (paid <= cost + EPS) {
            actions.push({
              kind: "OVER_SAFE", operationId, operatorId, payId: pay.id, org_id: pay.org_id,
              detail: `amount ${amount} > cost ${cost} (paid=${paid} ok) → bajar amount`,
              newAmount: cost, currency: ooRows[i].cost_currency, dueDate: pay.due_date,
            })
          } else {
            actions.push({
              kind: "BLOCKED", operationId, operatorId, payId: pay.id, org_id: pay.org_id,
              detail: `no se puede bajar amount ${amount}→${cost}: paid_amount ${paid} > cost`,
            })
          }
        }
      }
    }

    // Pagos no matcheados = ghosts (operador removido o row extra)
    for (const pay of pays) {
      if (matchedPayIds.has(pay.id)) continue
      const paid = Number(pay.paid_amount || 0)
      if (pay.status === "PAID" || paid > EPS) {
        actions.push({
          kind: "BLOCKED", operationId, operatorId: pay.operator_id, payId: pay.id, org_id: pay.org_id,
          detail: `ghost con pagos (paid=${paid}, status=${pay.status}) — revisar manualmente`,
        })
      } else {
        actions.push({
          kind: "GHOST", operationId, operatorId: pay.operator_id, payId: pay.id, org_id: pay.org_id,
          detail: `operator_payment sin operador en liquidación, paid=0 → borrar (amount=${pay.amount})`,
        })
      }
    }
  }

  // Enriquecer nombres
  const opIds = Array.from(new Set(actions.map((a) => a.operationId)))
  const opName = new Map<string, string>()
  for (let i = 0; i < opIds.length; i += 300) {
    const { data } = await admin.from("operations").select("id, file_code").in("id", opIds.slice(i, i + 300))
    for (const o of data || []) opName.set((o as any).id, (o as any).file_code)
  }
  const operIds = Array.from(new Set(actions.map((a) => a.operatorId).filter(Boolean)))
  const operName = new Map<string, string>()
  for (let i = 0; i < operIds.length; i += 300) {
    const { data } = await admin.from("operators").select("id, name").in("id", operIds.slice(i, i + 300))
    for (const o of data || []) operName.set((o as any).id, (o as any).name)
  }

  if (actions.length === 0) {
    console.log("✅ Sin drift. operator_payments alineados con operation_operators.")
    return
  }

  const byKind = (k: string) => actions.filter((a) => a.kind === k)
  for (const kind of ["MISSING", "UNDER", "OVER_SAFE", "GHOST", "BLOCKED"]) {
    const list = byKind(kind)
    if (list.length === 0) continue
    console.log(`\n── ${kind} (${list.length}) ──`)
    for (const a of list) {
      console.log(`  ${opName.get(a.operationId) || a.operationId.slice(0, 8)} | ${operName.get(a.operatorId) || (a.operatorId || "-").slice(0, 8)} | ${a.detail}`)
    }
  }

  if (!APPLY) {
    console.log(`\nTotal acciones: ${actions.length}. Dry-run — re-ejecutá con --apply para escribir.`)
    console.log("(BLOCKED nunca se toca automáticamente; requiere revisión manual.)")
    return
  }

  console.log("\n>>> APLICANDO…")
  let ok = 0, fail = 0
  for (const a of actions) {
    try {
      if (a.kind === "GHOST") {
        const { error } = await admin.from("operator_payments").delete().eq("id", a.payId!).eq("org_id", a.org_id)
        if (error) throw error
        ok++
      } else if (a.kind === "UNDER" || a.kind === "OVER_SAFE") {
        const update: any = {
          amount: a.newAmount,
          currency: a.currency,
          updated_at: new Date().toISOString(),
        }
        // Recalcular status: si quedó pendiente, reabrir y soltar ledger del "fully paid".
        // (paid_amount no se toca; lo lee la DB.)
        const { data: cur } = await admin.from("operator_payments").select("paid_amount, due_date").eq("id", a.payId!).single()
        const paid = Number((cur as any)?.paid_amount || 0)
        if (paid + EPS < Number(a.newAmount)) {
          update.status = statusFromDue((cur as any)?.due_date || a.dueDate || null)
          update.ledger_movement_id = null
        } else {
          update.status = "PAID"
        }
        const { error } = await admin.from("operator_payments").update(update).eq("id", a.payId!).eq("org_id", a.org_id)
        if (error) throw error
        ok++
      } else if (a.kind === "MISSING") {
        const { error } = await admin.from("operator_payments").insert({
          operation_id: a.operationId,
          operator_id: a.operatorId,
          amount: a.createCost,
          currency: a.currency || "USD",
          paid_amount: 0,
          status: "PENDING",
          due_date: new Date().toISOString().split("T")[0],
          notes: "Reconciliación: deuda faltante vs operation_operators",
          org_id: a.org_id,
        })
        if (error) throw error
        ok++
      }
      // BLOCKED: no-op
    } catch (e: any) {
      console.error(`  ✗ ${a.kind} ${a.payId || a.operationId}:`, e.message)
      fail++
    }
  }
  console.log(`\nAplicados: ${ok} | Fallidos: ${fail} | BLOCKED (sin tocar): ${byKind("BLOCKED").length}`)
})()
