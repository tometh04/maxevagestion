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
      return NextResponse.json({ operations: [] })
    }

    const operationIds = operationCustomers.map((oc: any) => oc.operation_id)

    // Obtener las operaciones
    const { data: operations, error } = await supabase
      .from("operations")
      .select(`
        id,
        file_code,
        destination,
        departure_date,
        return_date,
        status,
        type
      `)
      .in("id", operationIds)
      .order("departure_date", { ascending: false })

    if (error) {
      console.error("Error fetching customer operations:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ operations: operations || [] })
  } catch (error: any) {
    console.error("Error in GET /api/customers/[id]/operations:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

