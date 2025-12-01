import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: operatorId } = await params
    const supabase = await createServerClient()

    // Obtener todas las operaciones de este operador
    const { data: operations } = await supabase
      .from("operations")
      .select("id")
      .eq("operator_id", operatorId)

    if (!operations || operations.length === 0) {
      return NextResponse.json({ payments: [] })
    }

    const operationIds = operations.map((op: any) => op.id)

    // Obtener pagos de esas operaciones (solo EXPENSE - lo que se le debe al operador)
    const { data: payments, error } = await (supabase.from("payments") as any)
      .select(`
        id,
        amount,
        currency,
        direction,
        status,
        date_due,
        date_paid,
        method,
        payer_type,
        operations:operation_id (
          id,
          destination,
          file_code
        )
      `)
      .in("operation_id", operationIds)
      .eq("payer_type", "OPERATOR")
      .order("date_due", { ascending: false })

    if (error) {
      console.error("Error fetching operator payments:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payments: payments || [] })
  } catch (error: any) {
    console.error("Error in GET /api/operators/[id]/payments:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

