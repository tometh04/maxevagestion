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
          <h1 className="text-2xl font-semibold tracking-tight">Operadores</h1>
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

  // Calculate initial stats. Regla: separar por moneda (no mezclar ARS+USD).
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

