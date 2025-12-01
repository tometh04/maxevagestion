import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { OperatorDetailClient } from "@/components/operators/operator-detail-client"

export default async function OperatorDetailPage({ params }: { params: { id: string } }) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const operatorId = params.id

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

  // Calculate metrics
  const operationsCount = (operations || []).length
  const totalCost = (operations || []).reduce((sum: number, o: any) => sum + (o.operator_cost || 0), 0)

  const paidAmount = (operations || []).reduce((sum: number, o: any) => {
    const payments = (o.payments || []) as any[]
    const paidPayments = payments.filter((p: any) => p.direction === "EXPENSE" && p.status === "PAID")
    return sum + paidPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
  }, 0)

  const balance = totalCost - paidAmount

  // Get pending payments
  const pendingPayments = (operations || [])
    .flatMap((o: any) => (o.payments || []) as any[])
    .filter((p: any) => p.direction === "EXPENSE" && p.status === "PENDING")
    .sort((a: any, b: any) => new Date(a.date_due).getTime() - new Date(b.date_due).getTime())

  const metrics = {
    operationsCount,
    totalCost,
    paidAmount,
    balance,
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
