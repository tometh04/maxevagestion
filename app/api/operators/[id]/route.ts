import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: operatorId } = await params

    // Get operator details
    const { data: operator, error: operatorError } = await supabase
      .from("operators")
      .select("*")
      .eq("id", operatorId)
      .single()

    if (operatorError || !operator) {
      return NextResponse.json({ error: "Operador no encontrado" }, { status: 404 })
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
          date_paid
        )
      `,
      )
      .eq("operator_id", operatorId)
      .order("created_at", { ascending: false })

    if (operationsError) {
      console.error("Error fetching operations:", operationsError)
      return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
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

    return NextResponse.json({
      operator,
      operations: operations || [],
      metrics: {
        operationsCount,
        totalCost,
        paidAmount,
        balance,
        pendingPaymentsCount: pendingPayments.length,
        nextPaymentDate: pendingPayments[0]?.date_due || null,
      },
      pendingPayments,
    })
  } catch (error) {
    console.error("Error in GET /api/operators/[id]:", error)
    return NextResponse.json({ error: "Error al obtener operador" }, { status: 500 })
  }
}

