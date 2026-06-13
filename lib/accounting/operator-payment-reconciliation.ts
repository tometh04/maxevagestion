/**
 * RECONCILIACIÓN DE OPERATOR_PAYMENTS — camino único de PROVISIONING.
 *
 * Esta es la ÚNICA pieza que decide crear / sincronizar amount / borrar / reabrir
 * operator_payments para que reflejen la liquidación intencional de una operación:
 *   - base    = operation_operators (modelo multi-operador), o el legacy single-op
 *               (operations.operator_id + operator_cost) si no hay rows.
 *   - service = operation_services con cost_amount>0 y operator_id (1:1 con la fila,
 *               linkeado vía operation_services.operator_payment_id).
 *
 * NO toca paid_amount ni aplica pagos: eso es SETTLEMENT y vive en
 * `operator-payment-settlement.ts` (único escritor de paid_amount). Esta función
 * solo provisiona la deuda. Reusa los helpers de status/balance de ese módulo.
 *
 * Contexto: históricamente la lógica de reconciliación estaba inline y duplicada
 * en el PATCH de operación, el create, los endpoints de servicios y la conversión
 * de cotización, y cada uno se desincronizaba distinto en producción. Centralizar
 * acá + tests del clasificador puro evita esa clase de bug.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { getOpenOperatorPaymentStatus } from "@/lib/accounting/operator-payment-settlement"

type AppSupabaseClient = SupabaseClient<Database>

const EPS = 0.005

// ─── Tipos de entrada/salida ────────────────────────────────────────────────

export interface IntendedBaseOperator {
  operatorId: string
  cost: number
  currency: string
}

export interface IntendedService {
  serviceId: string
  operatorId: string | null
  cost: number
  currency: string
  operatorPaymentId: string | null
}

export interface ExistingOperatorPayment {
  id: string
  operatorId: string
  amount: number
  paidAmount: number
  currency: string
  status: "PENDING" | "PAID" | "OVERDUE"
  dueDate: string | null
  ledgerMovementId: string | null
  createdAt: string | null
}

export interface ReconcileInput {
  /** Operadores base de la liquidación. Vacío = op solo-servicios. */
  baseOperators: IntendedBaseOperator[]
  /** true si la op tiene rows en operation_operators (modelo multi-operador).
   *  false = legacy single-op: NO se borran fantasmas base (la deuda base vive
   *  en operations.operator_cost, no en operation_operators). */
  hasOperationOperators: boolean
  services: IntendedService[]
  existingPayments: ExistingOperatorPayment[]
  /** due_date a usar para deudas nuevas / reabiertas sin due propio. */
  defaultDueDate: string
}

export type ReconcileActionKind =
  | "MISSING"     // falta operator_payment → crear
  | "UNDER"       // amount < cost → subir amount
  | "OVER_SAFE"   // amount > cost y paid_amount <= cost → bajar amount
  | "REOPEN"      // estaba PAID y el costo subió → reabrir por la diferencia
  | "REASSIGN"    // legacy: mover la deuda base al nuevo operador
  | "GHOST"       // operator_payment sin respaldo en la liquidación → borrar
  | "BLOCKED"     // no se puede tocar sin romper balance → reportar, no aplicar

export interface ReconcileAction {
  kind: ReconcileActionKind
  scope: "BASE" | "SERVICE"
  operatorId: string | null
  payId?: string
  serviceId?: string
  newAmount?: number
  newOperatorId?: string
  currency?: string
  dueDate?: string
  createCost?: number
  /** status a setear cuando se reabre/baja una deuda y queda saldo pendiente. */
  newStatus?: "PENDING" | "OVERDUE"
  /** true cuando hay que soltar el ledger del "fully paid" (vuelve a pendiente). */
  clearLedger?: boolean
  detail: string
}

export interface ReconcileResult {
  operationId: string
  actions: ReconcileAction[]
  appliedCount: number
  blockedCount: number
  warnings: string[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function money(v: number | string | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

// ─── Clasificador PURO (sin DB) ───────────────────────────────────────────────

/**
 * Decide qué acciones hacen falta para alinear operator_payments con la
 * liquidación intencional. Sin efectos de lado: solo computa.
 *
 * Fases:
 *   0. Partición: SERVICE (id linkeado a un operation_service) vs BASE.
 *   1. SERVICE 1:1 por fila de operation_services.
 *   2. BASE count-based por operator_id.
 *   3. Limpieza de fantasmas BASE (solo si hasOperationOperators).
 */
export function classifyReconciliation(input: ReconcileInput): ReconcileAction[] {
  const actions: ReconcileAction[] = []
  const { baseOperators, services, existingPayments, hasOperationOperators, defaultDueDate } = input

  const byId = new Map(existingPayments.map((p) => [p.id, p]))
  const serviceLinkedIds = new Set(
    services.map((s) => s.operatorPaymentId).filter((x): x is string => !!x)
  )
  const claimed = new Set<string>() // payments ya resueltos (no re-procesar en base)

  // ── Fase 1: SERVICE ──────────────────────────────────────────────────────
  for (const svc of services) {
    if (!svc.operatorId || svc.cost <= 0) {
      // Servicio sin operador o sin costo: si tenía deuda linkeada sin pagos, es fantasma.
      if (svc.operatorPaymentId) {
        const pay = byId.get(svc.operatorPaymentId)
        if (pay) {
          claimed.add(pay.id)
          if (money(pay.paidAmount) === 0) {
            actions.push({
              kind: "GHOST", scope: "SERVICE", operatorId: pay.operatorId, payId: pay.id,
              serviceId: svc.serviceId,
              detail: `servicio sin costo/operador, deuda ${pay.amount} sin pagos → borrar`,
            })
          } else {
            actions.push({
              kind: "BLOCKED", scope: "SERVICE", operatorId: pay.operatorId, payId: pay.id,
              serviceId: svc.serviceId,
              detail: `servicio sin costo/operador pero la deuda tiene pagos (${pay.paidAmount}) — revisar`,
            })
          }
        }
      }
      continue
    }

    const pay = svc.operatorPaymentId ? byId.get(svc.operatorPaymentId) : undefined

    if (!pay) {
      // Sin deuda linkeada → crear y vincular.
      actions.push({
        kind: "MISSING", scope: "SERVICE", operatorId: svc.operatorId, serviceId: svc.serviceId,
        createCost: svc.cost, currency: svc.currency, dueDate: defaultDueDate,
        detail: `servicio sin operator_payment → crear (${svc.currency} ${svc.cost})`,
      })
      continue
    }

    claimed.add(pay.id)
    const amount = money(pay.amount)
    const paid = money(pay.paidAmount)
    const cost = svc.cost

    // Operador del servicio cambió → reasignar la deuda al nuevo operador.
    if (pay.operatorId !== svc.operatorId) {
      actions.push({
        kind: "REASSIGN", scope: "SERVICE", operatorId: pay.operatorId, payId: pay.id,
        serviceId: svc.serviceId, newOperatorId: svc.operatorId,
        detail: `servicio cambió de operador ${pay.operatorId.slice(0, 8)} → ${svc.operatorId.slice(0, 8)}`,
      })
    }

    pushAmountSyncAction(actions, "SERVICE", pay, cost, svc.currency, svc.serviceId)
  }

  // ── Fase 2: BASE (count-based por operador) ──────────────────────────────
  const basePayments = existingPayments.filter(
    (p) => !serviceLinkedIds.has(p.id) && !claimed.has(p.id)
  )

  // Legacy single-op con reasignación: un solo operador base sintético y una
  // sola deuda base existente con OTRO operator_id → reasignar (no fantasmear).
  if (
    !hasOperationOperators &&
    baseOperators.length === 1 &&
    basePayments.length === 1 &&
    basePayments[0].operatorId !== baseOperators[0].operatorId
  ) {
    const pay = basePayments[0]
    claimed.add(pay.id)
    actions.push({
      kind: "REASSIGN", scope: "BASE", operatorId: pay.operatorId, payId: pay.id,
      newOperatorId: baseOperators[0].operatorId,
      detail: `legacy single-op cambió de operador ${pay.operatorId.slice(0, 8)} → ${baseOperators[0].operatorId.slice(0, 8)}`,
    })
    pushAmountSyncAction(actions, "BASE", pay, baseOperators[0].cost, baseOperators[0].currency)
  }

  const baseByOperator = new Map<string, IntendedBaseOperator[]>()
  for (const b of baseOperators) {
    const arr = baseByOperator.get(b.operatorId) || []
    arr.push(b)
    baseByOperator.set(b.operatorId, arr)
  }
  const payByOperator = new Map<string, ExistingOperatorPayment[]>()
  for (const p of basePayments) {
    if (claimed.has(p.id)) continue
    const arr = payByOperator.get(p.operatorId) || []
    arr.push(p)
    payByOperator.set(p.operatorId, arr)
  }
  // Orden estable por created_at para el matching posicional.
  for (const arr of Array.from(payByOperator.values())) {
    arr.sort((a: ExistingOperatorPayment, b: ExistingOperatorPayment) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
  }

  for (const [operatorId, intendedRows] of Array.from(baseByOperator.entries())) {
    const payRows = payByOperator.get(operatorId) || []
    for (let i = 0; i < intendedRows.length; i++) {
      const cost = money(intendedRows[i].cost)
      const pay = payRows[i]
      if (!pay) {
        if (cost > 0) {
          actions.push({
            kind: "MISSING", scope: "BASE", operatorId,
            createCost: cost, currency: intendedRows[i].currency, dueDate: defaultDueDate,
            detail: `falta operator_payment base (${intendedRows[i].currency} ${cost})`,
          })
        }
        continue
      }
      claimed.add(pay.id)
      pushAmountSyncAction(actions, "BASE", pay, cost, intendedRows[i].currency)
    }
  }

  // ── Fase 3: fantasmas BASE (solo modelo multi-operador) ──────────────────
  if (hasOperationOperators) {
    for (const pay of basePayments) {
      if (claimed.has(pay.id)) continue
      if (money(pay.paidAmount) === 0 && pay.status !== "PAID") {
        actions.push({
          kind: "GHOST", scope: "BASE", operatorId: pay.operatorId, payId: pay.id,
          detail: `operador ${pay.operatorId.slice(0, 8)} ya no está en la liquidación, sin pagos → borrar (amount=${pay.amount})`,
        })
      } else {
        actions.push({
          kind: "BLOCKED", scope: "BASE", operatorId: pay.operatorId, payId: pay.id,
          detail: `operador ${pay.operatorId.slice(0, 8)} fuera de la liquidación pero conserva pagos (${pay.paidAmount}) — revisar manualmente`,
        })
      }
    }
  }

  return actions
}

/**
 * Empuja la acción de sincronización de amount para un payment matcheado.
 * Reglas (idénticas al endpoint de edición):
 *  - PAID + costo subió → REOPEN (reabre por la diferencia).
 *  - PAID + costo bajó/igual → conservar (drift histórico, solo warning si cambió).
 *  - abierto + cost > amount → UNDER (subir).
 *  - abierto + cost < amount + paid<=cost → OVER_SAFE (bajar).
 *  - abierto + cost < paid_amount → BLOCKED (rompería balance).
 *  - solo cambió moneda → actualizar currency.
 */
function pushAmountSyncAction(
  actions: ReconcileAction[],
  scope: "BASE" | "SERVICE",
  pay: ExistingOperatorPayment,
  cost: number,
  currency: string,
  serviceId?: string
) {
  const amount = money(pay.amount)
  const paid = money(pay.paidAmount)
  const amountChanged = Math.abs(amount - cost) >= EPS
  const currencyChanged = (pay.currency || "") !== currency
  const newStatus = getOpenOperatorPaymentStatus(pay.dueDate)

  if (!amountChanged && !currencyChanged) return

  if (pay.status === "PAID") {
    if (cost <= amount + EPS) {
      if (amountChanged) {
        actions.push({
          kind: "BLOCKED", scope, operatorId: pay.operatorId, payId: pay.id, serviceId,
          detail: `conserva amount ${amount} (status=PAID, costo no aumentó)`,
        })
      }
      return
    }
    // Costo subió sobre una deuda ya pagada → reabrir.
    actions.push({
      kind: "REOPEN", scope, operatorId: pay.operatorId, payId: pay.id, serviceId,
      newAmount: cost, currency, newStatus, clearLedger: true,
      detail: `reabrir: amount ${amount}→${cost} (costo aumentó tras pago completo)`,
    })
    return
  }

  // Abierto (PENDING/OVERDUE)
  if (cost + EPS < paid) {
    actions.push({
      kind: "BLOCKED", scope, operatorId: pay.operatorId, payId: pay.id, serviceId,
      detail: `no se puede bajar amount ${amount}→${cost}: paid_amount ${paid} > cost`,
    })
    return
  }

  const stillPending = paid + EPS < cost
  actions.push({
    kind: cost > amount ? "UNDER" : "OVER_SAFE",
    scope, operatorId: pay.operatorId, payId: pay.id, serviceId,
    newAmount: cost, currency,
    newStatus: stillPending ? newStatus : undefined,
    clearLedger: stillPending ? true : false,
    detail: `sync amount ${amount}→${cost}${currencyChanged ? ` (+moneda ${pay.currency}→${currency})` : ""}`,
  })
}

// ─── Wrapper con I/O ──────────────────────────────────────────────────────────

/**
 * Lee el estado actual de la operación y reconcilia operator_payments.
 * @param options.dryRun  si true, no escribe; solo devuelve las acciones.
 */
export async function reconcileOperatorPayments(
  supabase: AppSupabaseClient,
  operationId: string,
  options?: { orgId?: string | null; dryRun?: boolean; defaultDueDate?: string | null }
): Promise<ReconcileResult> {
  const orgId = options?.orgId ?? null
  const warnings: string[] = []

  // Operación (legacy single-op fallback) + operadores base + servicios + deudas.
  const [opRes, ooRes, svcRes, payRes] = await Promise.all([
    (supabase.from("operations") as any)
      .select("id, operator_id, operator_cost, operator_cost_currency, sale_currency, currency, departure_date, operation_date, created_at")
      .eq("id", operationId)
      .maybeSingle(),
    (supabase.from("operation_operators") as any)
      .select("operator_id, cost, cost_currency")
      .eq("operation_id", operationId),
    (supabase.from("operation_services") as any)
      .select("id, operator_id, cost_amount, cost_currency, operator_payment_id")
      .eq("operation_id", operationId),
    (supabase.from("operator_payments") as any)
      .select("id, operator_id, amount, paid_amount, currency, status, due_date, ledger_movement_id, created_at")
      .eq("operation_id", operationId),
  ])

  const op = opRes?.data
  if (!op) {
    return { operationId, actions: [], appliedCount: 0, blockedCount: 0, warnings: ["operación no encontrada"] }
  }

  const fallbackCurrency = op.operator_cost_currency || op.sale_currency || op.currency || "USD"
  const defaultDueDate =
    options?.defaultDueDate || op.departure_date || new Date().toISOString().split("T")[0]

  const ooRows = (ooRes?.data || []) as any[]
  const hasOperationOperators = ooRows.length > 0

  let baseOperators: IntendedBaseOperator[]
  if (hasOperationOperators) {
    baseOperators = ooRows
      .filter((r) => r.operator_id)
      .map((r) => ({
        operatorId: r.operator_id as string,
        cost: money(r.cost),
        currency: (r.cost_currency || fallbackCurrency) as string,
      }))
  } else if (op.operator_id && money(op.operator_cost) > 0) {
    // Legacy single-op: operador sintético desde operations.
    baseOperators = [{
      operatorId: op.operator_id as string,
      cost: money(op.operator_cost),
      currency: fallbackCurrency,
    }]
  } else {
    baseOperators = []
  }

  // Incluimos servicios con costo/operador, Y también los que ya tienen una deuda
  // linkeada aunque hoy no tengan costo/operador: el clasificador la fantasmea.
  const services: IntendedService[] = (svcRes?.data || [])
    .filter((s: any) => (money(s.cost_amount) > 0 && s.operator_id) || s.operator_payment_id)
    .map((s: any) => ({
      serviceId: s.id as string,
      operatorId: s.operator_id as string,
      cost: money(s.cost_amount),
      currency: (s.cost_currency || fallbackCurrency) as string,
      operatorPaymentId: s.operator_payment_id || null,
    }))

  const existingPayments: ExistingOperatorPayment[] = (payRes?.data || []).map((p: any) => ({
    id: p.id,
    operatorId: p.operator_id,
    amount: money(p.amount),
    paidAmount: money(p.paid_amount),
    currency: p.currency,
    status: p.status,
    dueDate: p.due_date,
    ledgerMovementId: p.ledger_movement_id,
    createdAt: p.created_at,
  }))

  const actions = classifyReconciliation({
    baseOperators,
    hasOperationOperators,
    services,
    existingPayments,
    defaultDueDate,
  })

  const blockedCount = actions.filter((a) => a.kind === "BLOCKED").length
  for (const a of actions) {
    if (a.kind === "BLOCKED") warnings.push(`[${a.scope}] ${a.detail}`)
  }

  if (options?.dryRun) {
    return { operationId, actions, appliedCount: 0, blockedCount, warnings }
  }

  let appliedCount = 0
  for (const a of actions) {
    try {
      if (a.kind === "BLOCKED") continue

      if (a.kind === "GHOST") {
        let del = (supabase.from("operator_payments") as any).delete().eq("id", a.payId)
        if (orgId) del = del.eq("org_id", orgId)
        const { error } = await del
        if (error) throw error
        if (a.scope === "SERVICE" && a.serviceId) {
          await (supabase.from("operation_services") as any)
            .update({ operator_payment_id: null })
            .eq("id", a.serviceId)
        }
        appliedCount++
        continue
      }

      if (a.kind === "MISSING") {
        const { data: created, error } = await (supabase.from("operator_payments") as any)
          .insert({
            operation_id: operationId,
            operator_id: a.operatorId,
            amount: a.createCost,
            currency: a.currency || fallbackCurrency,
            paid_amount: 0,
            status: getOpenOperatorPaymentStatus(a.dueDate || defaultDueDate),
            due_date: a.dueDate || defaultDueDate,
            org_id: orgId,
          })
          .select("id")
          .single()
        if (error || !created) throw error || new Error("no se creó operator_payment")
        if (a.scope === "SERVICE" && a.serviceId) {
          await (supabase.from("operation_services") as any)
            .update({ operator_payment_id: created.id })
            .eq("id", a.serviceId)
        }
        appliedCount++
        continue
      }

      if (a.kind === "REASSIGN") {
        let upd = (supabase.from("operator_payments") as any)
          .update({ operator_id: a.newOperatorId, updated_at: new Date().toISOString() })
          .eq("id", a.payId)
        if (orgId) upd = upd.eq("org_id", orgId)
        const { error } = await upd
        if (error) throw error
        appliedCount++
        continue
      }

      // UNDER / OVER_SAFE / REOPEN → update amount/currency/status
      const update: any = {
        amount: a.newAmount,
        currency: a.currency,
        updated_at: new Date().toISOString(),
      }
      if (a.newStatus) {
        update.status = a.newStatus
        if (a.clearLedger) update.ledger_movement_id = null
      } else {
        // saldo cubierto por lo ya pagado → queda PAID
        update.status = "PAID"
      }
      let upd = (supabase.from("operator_payments") as any).update(update).eq("id", a.payId)
      if (orgId) upd = upd.eq("org_id", orgId)
      const { error } = await upd
      if (error) throw error
      appliedCount++
    } catch (e: any) {
      warnings.push(`error aplicando ${a.kind}/${a.scope} ${a.payId || a.serviceId || ""}: ${e?.message || e}`)
    }
  }

  return { operationId, actions, appliedCount, blockedCount, warnings }
}
