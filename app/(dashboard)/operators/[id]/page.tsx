import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { OperatorDetailClient } from "@/components/operators/operator-detail-client"

export default async function OperatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const operatorId = id

  // Get operator details
  const { data: operator, error: operatorError } = await supabase
    .from("operators")
    .select("*")
    .eq("id", operatorId)
    .single()

  if (operatorError || !operator) {
    notFound()
  }

  // Get all operations for this operator
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
    .order("created_at", { ascending: false })

  if (operationsError) {
    console.error("Error fetching operations:", operationsError)
  }

  // Calculate metrics separados por moneda (mezclar USD con ARS daba numeros falsos)
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
  const allCurrencies = Array.from(new Set([...Object.keys(totalCostByCurrency), ...Object.keys(paidAmountByCurrency)]))
  for (const cur of allCurrencies) {
    balanceByCurrency[cur] = (totalCostByCurrency[cur] || 0) - (paidAmountByCurrency[cur] || 0)
  }

  // Get pending payments
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

  return (
    <OperatorDetailClient
      operator={operator as any}
      operations={operations || []}
      pendingPayments={pendingPayments}
      metrics={metrics}
    />
  )
}
