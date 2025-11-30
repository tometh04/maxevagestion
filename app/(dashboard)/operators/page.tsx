import { OperatorsPageClient } from "@/components/operators/operators-page-client"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { canAccessModule } from "@/lib/permissions"

export default async function OperatorsPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  if (!canAccessModule(user.role as any, "operators")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Operadores</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a operadores</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  // Fetch initial data
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
    .order("name")

  // Calculate initial stats
  const initialOperators = (operators || []).map((op: any) => {
    const operations = (op.operations || []) as any[]
    const operationsCount = operations.length
    const totalCost = operations.reduce((sum: number, o: any) => sum + (o.operator_cost || 0), 0)
    const paidAmount = operations.reduce((sum: number, o: any) => {
      const payments = (o.payments || []) as any[]
      const paidPayments = payments.filter((p: any) => p.direction === "EXPENSE" && p.status === "PAID")
      return sum + paidPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
    }, 0)
    const balance = totalCost - paidAmount
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
      totalCost,
      paidAmount,
      balance,
      nextPaymentDate: nextPayment?.date_due || null,
    }
  })

  return <OperatorsPageClient initialOperators={initialOperators} />
}

