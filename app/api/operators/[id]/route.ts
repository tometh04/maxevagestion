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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: operatorId } = await params
    const body = await request.json()

    const { name, contact_name, contact_email, contact_phone, credit_limit } = body

    // Validations
    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })
    }

    // Update operator
    const { data: operator, error: updateError } = await supabase
      .from("operators")
      .update({
        name,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        credit_limit: credit_limit || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", operatorId)
      .select()
      .single()

    if (updateError || !operator) {
      console.error("Error updating operator:", updateError)
      return NextResponse.json({ error: "Error al actualizar operador" }, { status: 400 })
    }

    return NextResponse.json({ success: true, operator })
  } catch (error) {
    console.error("Error in PATCH /api/operators/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar operador" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: operatorId } = await params

    // Check if operator has operations
    const { data: operations, error: checkError } = await supabase
      .from("operations")
      .select("id")
      .eq("operator_id", operatorId)
      .limit(1)

    if (checkError) {
      console.error("Error checking operator operations:", checkError)
      return NextResponse.json({ error: "Error al verificar operador" }, { status: 500 })
    }

    if (operations && operations.length > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar el operador porque tiene operaciones asociadas" },
        { status: 400 }
      )
    }

    // Delete operator
    const { error: deleteError } = await supabase
      .from("operators")
      .delete()
      .eq("id", operatorId)

    if (deleteError) {
      console.error("Error deleting operator:", deleteError)
      return NextResponse.json({ error: "Error al eliminar operador" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/operators/[id]:", error)
    return NextResponse.json({ error: "Error al eliminar operador" }, { status: 500 })
  }
}

