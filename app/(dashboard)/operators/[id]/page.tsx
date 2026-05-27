import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { OperatorDetailClient } from "@/components/operators/operator-detail-client"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"

// =========================================================================
// 2026-05-22 — Cálculo de deuda al operador.
// =========================================================================
//
// Hay DOS modelos coexistiendo:
//
//   A. LEGACY (default off): suma operations.operator_cost vs payments con
//      direction=EXPENSE/status=PAID. Lo que usaron históricamente todas las
//      orgs. Tiene drift latente porque mezcla dos modelos de costo
//      (legacy single-operator + multi-operator) con un modelo de pagos
//      que puede tener orphans (payments PAID sin operator_payment settleado).
//
//   B. NUEVO (opt-in per-tenant via `features.operator_debt_from_operator_payments`):
//      suma operator_payments.amount vs operator_payments.paid_amount. Esta
//      tabla es la fuente de verdad real — todos los caminos productivos de
//      cancelación (registrar pago desde operación, mark-paid, bulk masivo
//      de Finanzas, reconciliación orphans, edit operation, recurring
//      payments) actualizan paid_amount vía applyOperatorPaymentSettlement.
//
// Bug VICO/FREE WAY (2026-05-22): el modelo A reportaba USD 74.731 de saldo
// pendiente cuando la deuda real era USD 6.168. Activamos B solo para VICO
// (`organization_settings.features.operator_debt_from_operator_payments=true`)
// porque Lozada tiene drift histórico grande entre operation_operators.cost
// y operator_payments.amount que requiere auditoría antes de migrar.
//
// El cron `/api/cron/audit-operator-debt-drift` detecta y alerta cuando una
// org acumula drift suficiente como para reportar a contabilidad antes de
// que escale a un usuario.
// =========================================================================

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

const MONEY_EPSILON = 0.005

export default async function OperatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await getCurrentUser()
  if (!user.org_id) notFound()

  const supabase = await createServerClient()
  const operatorId = id
  const orgId = (user as any).org_id as string

  // Cross-tenant fix: scopear operator por org. Antes el SELECT inicial
  // no tenía .eq("org_id", ...) → leak latente si un user de Org A conocía
  // el id de un operator de Org B.
  const { data: operator, error: operatorError } = await supabase
    .from("operators")
    .select("*")
    .eq("id", operatorId)
    .eq("org_id", orgId)
    .single()

  if (operatorError || !operator) {
    notFound()
  }

  const useOperatorPaymentsAsSource = await getOrgFeatureFlag(
    supabase,
    orgId,
    "features.operator_debt_from_operator_payments"
  )

  if (useOperatorPaymentsAsSource) {
    // ─── Modelo NUEVO (opt-in) ───────────────────────────────────────────
    return await renderFromOperatorPayments({
      operator,
      operatorId,
      orgId,
      supabase,
      userRole: user.role,
    })
  }

  // ─── Modelo LEGACY (default) ─────────────────────────────────────────
  // Preservado EXACTO igual al comportamiento histórico para no romper
  // contabilidades existentes. Si reportan un bug similar al de VICO,
  // se activa la flag para esa org y se compara.
  return await renderLegacy({ operator, operatorId, orgId, supabase, userRole: user.role })
}

// =========================================================================
// MODELO LEGACY — sin cambios respecto al cálculo histórico.
// Solo se agregó el filtro cross-tenant `.eq("org_id", orgId)` que faltaba.
// =========================================================================
async function renderLegacy({
  operator,
  operatorId,
  orgId,
  supabase,
  userRole,
}: {
  operator: any
  operatorId: string
  orgId: string
  supabase: any
  userRole: string
}) {
  const { data: operations, error: operationsError } = await supabase
    .from("operations")
    .select(
      `
      *,
      sellers:seller_id(id, name),
      agencies:agency_id(id, name),
      payments:payments!operation_id(
        id,
        amount,
        currency,
        status,
        direction,
        date_due,
        date_paid,
        operation_id
      )
    `,
    )
    .eq("operator_id", operatorId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  if (operationsError) {
    console.error("Error fetching operations:", operationsError)
  }

  const operationsCount = (operations || []).length
  const totalCostByCurrency: Record<string, number> = {}
  const paidAmountByCurrency: Record<string, number> = {}

  for (const o of (operations || []) as any[]) {
    const opCur = o.currency || "ARS"
    totalCostByCurrency[opCur] = (totalCostByCurrency[opCur] || 0) + (Number(o.operator_cost) || 0)

    const payments = (o.payments || []) as any[]
    for (const p of payments) {
      if (p.direction === "EXPENSE" && p.status === "PAID") {
        const payCur = p.currency || opCur
        paidAmountByCurrency[payCur] = (paidAmountByCurrency[payCur] || 0) + (Number(p.amount) || 0)
      }
    }
  }

  const balanceByCurrency: Record<string, number> = {}
  const allCurrencies = Array.from(
    new Set([...Object.keys(totalCostByCurrency), ...Object.keys(paidAmountByCurrency)]),
  )
  for (const cur of allCurrencies) {
    balanceByCurrency[cur] = (totalCostByCurrency[cur] || 0) - (paidAmountByCurrency[cur] || 0)
  }

  const pendingPayments = (operations || [])
    .flatMap((o: any) => (o.payments || []) as any[])
    .filter((p: any) => p.direction === "EXPENSE" && p.status === "PENDING")
    .sort((a: any, b: any) => new Date(a.date_due).getTime() - new Date(b.date_due).getTime())

  const metrics = {
    operationsCount,
    totalCostByCurrency,
    paidAmountByCurrency,
    balanceByCurrency,
    pendingPaymentsCount: pendingPayments.length,
    nextPaymentDate: pendingPayments[0]?.date_due || null,
  }

  // Cargar ajustes/créditos del operador (compartido con modelo nuevo)
  const { data: adjustmentsRaw } = await (supabase as any)
    .from("operator_adjustments")
    .select("id, amount, currency, reason, created_at, created_by, users:created_by(name)")
    .eq("operator_id", operatorId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  const adjustments = (adjustmentsRaw || []) as any[]
  const adjustmentsTotalByCurrency: Record<string, number> = {}
  for (const adj of adjustments) {
    const cur = (adj.currency || "USD") as string
    adjustmentsTotalByCurrency[cur] = (adjustmentsTotalByCurrency[cur] || 0) + (Number(adj.amount) || 0)
  }

  const canCreateAdjustments = userRole === "SUPER_ADMIN" || userRole === "ORG_OWNER"

  return (
    <OperatorDetailClient
      operator={operator as any}
      operations={operations || []}
      pendingPayments={pendingPayments}
      metrics={metrics}
      adjustments={adjustments}
      adjustmentsTotalByCurrency={adjustmentsTotalByCurrency}
      canCreateAdjustments={canCreateAdjustments}
    />
  )
}

// =========================================================================
// MODELO NUEVO (opt-in) — operator_payments como fuente única.
// =========================================================================
async function renderFromOperatorPayments({
  operator,
  operatorId,
  orgId,
  supabase,
  userRole,
}: {
  operator: any
  operatorId: string
  orgId: string
  supabase: any
  userRole: string
}) {
  // 1. operator_payments scopeado por operator + org. Captura multi-operator
  //    (vía operation_operators) porque operator_payments tiene operator_id
  //    directo en cada row, no depende del "operador principal" de operations.
  const { data: operatorPaymentsRaw } = await supabase
    .from("operator_payments")
    .select("id, operation_id, operator_id, amount, paid_amount, currency, status, due_date")
    .eq("operator_id", operatorId)
    .eq("org_id", orgId)
    .order("due_date", { ascending: true })

  const operatorPayments = (operatorPaymentsRaw || []) as any[]

  // 2. Métricas por currency (sin mezclar USD con ARS).
  const totalCostByCurrency: Record<string, number> = {}
  const paidAmountByCurrency: Record<string, number> = {}

  for (const p of operatorPayments) {
    const cur = (p.currency || "ARS") as string
    totalCostByCurrency[cur] = (totalCostByCurrency[cur] || 0) + (Number(p.amount) || 0)
    paidAmountByCurrency[cur] = (paidAmountByCurrency[cur] || 0) + (Number(p.paid_amount) || 0)
  }

  for (const cur of Object.keys(totalCostByCurrency)) {
    totalCostByCurrency[cur] = roundMoney(totalCostByCurrency[cur])
  }
  for (const cur of Object.keys(paidAmountByCurrency)) {
    paidAmountByCurrency[cur] = roundMoney(paidAmountByCurrency[cur])
  }

  const balanceByCurrency: Record<string, number> = {}
  const allCurrencies = Array.from(
    new Set([...Object.keys(totalCostByCurrency), ...Object.keys(paidAmountByCurrency)]),
  )
  for (const cur of allCurrencies) {
    // max(0, ...) por seguridad ante redondeo / overpay.
    const bal = (totalCostByCurrency[cur] || 0) - (paidAmountByCurrency[cur] || 0)
    balanceByCurrency[cur] = roundMoney(Math.max(0, bal))
  }

  // 3. Lista de pendientes: status != PAID y todavía hay saldo.
  //    El monto mostrado es el SALDO RESTANTE, no el original.
  const pendingPayments = operatorPayments
    .filter((p) => {
      if (p.status === "PAID") return false
      const remaining = (Number(p.amount) || 0) - (Number(p.paid_amount) || 0)
      return remaining > MONEY_EPSILON
    })
    .map((p) => ({
      id: p.id,
      operation_id: p.operation_id,
      amount: roundMoney((Number(p.amount) || 0) - (Number(p.paid_amount) || 0)),
      original_amount: roundMoney(Number(p.amount) || 0),
      paid_amount: roundMoney(Number(p.paid_amount) || 0),
      currency: p.currency,
      date_due: p.due_date,
      status: p.status,
    }))
    .sort((a, b) => {
      if (!a.date_due && !b.date_due) return 0
      if (!a.date_due) return 1
      if (!b.date_due) return -1
      return new Date(a.date_due).getTime() - new Date(b.date_due).getTime()
    })

  // 4. Operaciones donde el operador tiene deuda registrada + drift check.
  const operationIds = Array.from(
    new Set(operatorPayments.map((p) => p.operation_id).filter(Boolean) as string[]),
  )

  let operationsRaw: any[] = []
  const opOperatorsByOpId: Record<string, { cost: number; cost_currency: string }> = {}

  if (operationIds.length > 0) {
    const [opsRes, opOpsRes] = await Promise.all([
      supabase
        .from("operations")
        .select(`
          id, destination, departure_date, status, currency, operator_cost,
          operator_cost_currency, created_at, seller_id, agency_id,
          sellers:seller_id(id, name),
          agencies:agency_id(id, name)
        `)
        .in("id", operationIds)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("operation_operators")
        .select("operation_id, cost, cost_currency")
        .eq("operator_id", operatorId)
        .in("operation_id", operationIds),
    ])

    operationsRaw = (opsRes.data || []) as any[]
    for (const r of (opOpsRes.data || []) as any[]) {
      opOperatorsByOpId[r.operation_id] = {
        cost: Number(r.cost) || 0,
        cost_currency: r.cost_currency || "USD",
      }
    }
  }

  const sumOpPaymentsByOperation: Record<string, { amount: number; currency: string }> = {}
  for (const p of operatorPayments) {
    const opId = p.operation_id
    if (!opId) continue
    const cur = (p.currency || "ARS") as string
    const prev = sumOpPaymentsByOperation[opId]
    if (!prev) {
      sumOpPaymentsByOperation[opId] = { amount: Number(p.amount) || 0, currency: cur }
    } else {
      prev.amount += Number(p.amount) || 0
    }
  }

  const operations = operationsRaw.map((op) => {
    const sumOp = sumOpPaymentsByOperation[op.id]
    const operatorCostForThisOperator = roundMoney(sumOp?.amount || 0)
    const operatorCostCurrency = sumOp?.currency || op.operator_cost_currency || op.currency || "USD"

    const opOpRow = opOperatorsByOpId[op.id]
    let costMismatch = false
    if (opOpRow) {
      costMismatch = Math.abs(operatorCostForThisOperator - opOpRow.cost) > 0.01
    }

    return {
      id: op.id,
      destination: op.destination,
      departure_date: op.departure_date,
      status: op.status,
      sellers: op.sellers,
      agencies: op.agencies,
      operator_cost: operatorCostForThisOperator,
      currency: operatorCostCurrency,
      cost_mismatch: costMismatch,
      declared_cost: opOpRow?.cost ?? null,
    }
  })

  // Cargar ajustes/créditos del operador
  const { data: adjustmentsRaw } = await (supabase as any)
    .from("operator_adjustments")
    .select("id, amount, currency, reason, created_at, created_by, users:created_by(name)")
    .eq("operator_id", operatorId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  const adjustments = (adjustmentsRaw || []) as any[]

  const adjustmentsTotalByCurrency: Record<string, number> = {}
  for (const adj of adjustments) {
    const cur = (adj.currency || "USD") as string
    adjustmentsTotalByCurrency[cur] = (adjustmentsTotalByCurrency[cur] || 0) + (Number(adj.amount) || 0)
  }

  const metrics = {
    operationsCount: operations.length,
    totalCostByCurrency,
    paidAmountByCurrency,
    balanceByCurrency,
    pendingPaymentsCount: pendingPayments.length,
    nextPaymentDate: pendingPayments[0]?.date_due || null,
  }

  const canCreateAdjustments = userRole === "SUPER_ADMIN" || userRole === "ORG_OWNER"

  return (
    <OperatorDetailClient
      operator={operator as any}
      operations={operations}
      pendingPayments={pendingPayments}
      metrics={metrics}
      adjustments={adjustments}
      adjustmentsTotalByCurrency={adjustmentsTotalByCurrency}
      canCreateAdjustments={canCreateAdjustments}
    />
  )
}
