import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: customerId } = await params

    // Get customer
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    // Get operations for this customer
    const { data: operationCustomers } = await supabase
      .from("operation_customers")
      .select(`
        *,
        operations:operation_id(
          *,
          sellers:seller_id(id, name),
          operators:operator_id(id, name),
          agencies:agency_id(id, name)
        )
      `)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })

    // Get payments related to customer's operations
    const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id)
    let payments: any[] = []
    if (operationIds.length > 0) {
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("*")
        .in("operation_id", operationIds)
        .eq("payer_type", "CUSTOMER")
        .order("date_due", { ascending: true })
      payments = paymentsData || []
    }

    // Get documents
    const { data: documents } = await supabase
      .from("documents")
      .select("*")
      .eq("customer_id", customerId)
      .order("uploaded_at", { ascending: false })

    return NextResponse.json({
      customer,
      operations: operationCustomers || [],
      payments,
      documents: documents || [],
    })
  } catch (error) {
    console.error("Error in GET /api/customers/[id]:", error)
    return NextResponse.json({ error: "Error al obtener cliente" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: customerId } = await params
    const body = await request.json()

    // Update customer
    const updateData: any = {
      ...body,
      updated_at: new Date().toISOString(),
    }

    const { data: customer, error: updateError } = await (supabase.from("customers") as any)
      .update(updateData)
      .eq("id", customerId)
      .select()
      .single()

    if (updateError || !customer) {
      console.error("Error updating customer:", updateError)
      return NextResponse.json({ error: "Error al actualizar cliente" }, { status: 400 })
    }

    return NextResponse.json({ success: true, customer })
  } catch (error) {
    console.error("Error in PATCH /api/customers/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar cliente" }, { status: 500 })
  }
}

