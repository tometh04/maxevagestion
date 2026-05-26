import { OperatorsPageClient } from "@/components/operators/operators-page-client"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { canAccessModule } from "@/lib/permissions"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"

export default async function OperatorsPage() {
  const { user } = await getCurrentUser()

  // Verificar permiso de acceso
  if (!canAccessModule(user.role as any, "operators")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operadores</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a operadores</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()
  const orgId = (user as any).org_id as string

  const useOperatorPaymentsAsSource = await getOrgFeatureFlag(
    supabase,
    orgId,
    "features.operator_debt_from_operator_payments"
  )

  if (useOperatorPaymentsAsSource) {
    return await renderFromOperatorPayments(supabase, orgId)
  }

  return await renderLegacy(supabase, orgId)
}

// ─── Modelo NUEVO (opt-in): operator_payments como fuente de verdad ────────
// Mismo patrón que operators/[id]/page.tsx renderFromOperatorPayments pero
// agrupado por operator_id para la vista de lista.
async function renderFromOperatorPayments(supabase: any, orgId: string) {
  // Fetch operadores básicos
  const { data: operators } = await supabase
    .from("operators")
    .select("id, name, contact_name, contact_email, contact_phone, credit_limit")
    .eq("org_id", orgId)
    .order("name")

  // Fetch TODOS los operator_payments de la org en un solo query
  const { data: allPaymentsRaw } = await supabase
    .from("operator_payments")
    .select("id, operator_id, amount, paid_amount, currency, status, due_date")
    .eq("org_id", orgId)

  const allPayments = (allPaymentsRaw || []) as any[]

  // Agrupar pagos por operator_id
  const paymentsByOperator: Record<string, any[]> = {}
  for (const p of allPayments) {
    if (!p.operator_id) continue
    if (!paymentsByOperator[p.operator_id]) paymentsByOperator[p.operator_id] = []
    paymentsByOperator[p.operator_id].push(p)
  }

  // Contar operaciones por operador (para el badge de "X operaciones")
  const { data: opCountsRaw } = await supabase
    .from("operations")
    .select("operator_id")
    .eq("org_id", orgId)
    .not("operator_id", "is", null)

  const opCountByOperator: Record<string, number> = {}
  for (const row of (opCountsRaw || []) as any[]) {
    opCountByOperator[row.operator_id] = (opCountByOperator[row.operator_id] || 0) + 1
  }

  const initialOperators = (operators || []).map((op: any) => {
    const payments = paymentsByOperator[op.id] || []

    const totalCostByCurrency: Record<string, number> = {}
    const paidAmountByCurrency: Record<string, number> = {}

    for (const p of payments) {
      const cur = (p.currency || "ARS") as string
      totalCostByCurrency[cur] = (totalCostByCurrency[cur] || 0) + (Number(p.amount) || 0)
      paidAmountByCurrency[cur] = (paidAmountByCurrency[cur] || 0) + (Number(p.paid_amount) || 0)
    }

    const balanceByCurrency: Record<string, number> = {}
    const allCurrencies = Array.from(
      new Set([...Object.keys(totalCostByCurrency), ...Object.keys(paidAmountByCurrency)])
    )
    for (const cur of allCurrencies) {
      balanceByCurrency[cur] = Math.max(0, (totalCostByCurrency[cur] || 0) - (paidAmountByCurrency[cur] || 0))
    }

    // Próximo pago pendiente (status != PAID con saldo restante)
    const nextPayment = payments
      .filter((p: any) => {
        if (p.status === "PAID") return false
        const remaining = (Number(p.amount) || 0) - (Number(p.paid_amount) || 0)
        return remaining > 0.001
      })
      .sort((a: any, b: any) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      })[0]

    return {
      id: op.id,
      name: op.name,
      contact_name: op.contact_name,
      contact_email: op.contact_email,
      contact_phone: op.contact_phone,
      credit_limit: op.credit_limit,
      operationsCount: opCountByOperator[op.id] || 0,
      totalCostByCurrency,
      paidAmountByCurrency,
      balanceByCurrency,
      nextPaymentDate: nextPayment?.due_date || null,
    }
  })

  return <OperatorsPageClient initialOperators={initialOperators} />
}

// ─── Modelo LEGACY (default): operations.operator_cost − payments PAID ─────
// Preservado para orgs que no tienen la flag activada.
async function renderLegacy(supabase: any, orgId: string) {
  const { data: operators } = await supabase
    .from("operators")
    .select(
      `
      *,
      operations:operations!operator_id (
        id,
        operator_cost,
        currency,
        status,
        payments:payments!operation_id (
          id,
          amount,
          currency,
          status,
          direction,
          date_due,
          date_paid
        )
      )
    `,
    )
    .eq("org_id", orgId)
    .order("name")

  const initialOperators = (operators || []).map((op: any) => {
    const operations = (op.operations || []) as any[]
    const operationsCount = operations.length

    const totalCostByCurrency: Record<string, number> = {}
    const paidAmountByCurrency: Record<string, number> = {}

    for (const o of operations) {
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
    const allCurrencies = Array.from(new Set([...Object.keys(totalCostByCurrency), ...Object.keys(paidAmountByCurrency)]))
    for (const cur of allCurrencies) {
      balanceByCurrency[cur] = (totalCostByCurrency[cur] || 0) - (paidAmountByCurrency[cur] || 0)
    }

    const nextPayment = operations
      .flatMap((o: any) => (o.payments || []) as any[])
      .filter((p: any) => p.direction === "EXPENSE" && p.status === "PENDING")
      .sort((a: any, b: any) => new Date(a.date_due).getTime() - new Date(b.date_due).getTime())[0]

    return {
      id: op.id,
      name: op.name,
      contact_name: op.contact_name,
      contact_email: op.contact_email,
      contact_phone: op.contact_phone,
      credit_limit: op.credit_limit,
      operationsCount,
      totalCostByCurrency,
      paidAmountByCurrency,
      balanceByCurrency,
      nextPaymentDate: nextPayment?.date_due || null,
    }
  })

  return <OperatorsPageClient initialOperators={initialOperators} />
}

