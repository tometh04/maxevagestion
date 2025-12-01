import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: customerId } = await params
    const supabase = await createServerClient()

    // Obtener todas las operaciones donde el cliente es pasajero
    const { data: operationCustomers } = await supabase
      .from("operation_customers")
      .select("operation_id")
      .eq("customer_id", customerId)

    if (!operationCustomers || operationCustomers.length === 0) {
      return NextResponse.json({ payments: [] })
    }

    const operationIds = operationCustomers.map((oc: any) => oc.operation_id)

    // Obtener pagos de esas operaciones (solo INCOME - lo que el cliente debe pagar)
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
      .eq("direction", "INCOME")
      .order("date_due", { ascending: false })

    if (error) {
      console.error("Error fetching customer payments:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payments: payments || [] })
  } catch (error: any) {
    console.error("Error in GET /api/customers/[id]/payments:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

