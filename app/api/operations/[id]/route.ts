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
    const { id: operationId } = await params

    // Get operation with related data
    const { data: operation, error: operationError } = await supabase
      .from("operations")
      .select(`
        *,
        sellers:seller_id(id, name, email),
        operators:operator_id(id, name, contact_email, contact_phone),
        agencies:agency_id(id, name, city),
        leads:lead_id(id, contact_name, destination, status)
      `)
      .eq("id", operationId)
      .single()

  if (operationError || !operation) {
    return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
  }

  // Type assertion for operation
  const op = operation as any

  // Check permissions
  const userRole = user.role as string
  if (userRole === "SELLER" && op.seller_id !== user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

    // Get customers
    const { data: operationCustomers } = await supabase
      .from("operation_customers")
      .select(`
        *,
        customers:customer_id(*)
      `)
      .eq("operation_id", operationId)

    // Get documents
    const { data: documents } = await supabase
      .from("documents")
      .select("*")
      .eq("operation_id", operationId)
      .order("uploaded_at", { ascending: false })

    // Get payments
    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("operation_id", operationId)
      .order("date_due", { ascending: true })

    // Get alerts
    const { data: alerts } = await supabase
      .from("alerts")
      .select("*")
      .eq("operation_id", operationId)
      .order("date_due", { ascending: true })

    return NextResponse.json({
      operation,
      customers: operationCustomers || [],
      documents: documents || [],
      payments: payments || [],
      alerts: alerts || [],
    })
  } catch (error) {
    console.error("Error in GET /api/operations/[id]:", error)
    return NextResponse.json({ error: "Error al obtener operación" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: operationId } = await params
    const body = await request.json()

    // Get current operation to check permissions
    const { data: currentOperation } = await supabase
      .from("operations")
      .select("seller_id, agency_id")
      .eq("id", operationId)
      .single()

    if (!currentOperation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // Type assertion for operation
    const currentOp = currentOperation as any

    // Check permissions
    const userRole = user.role as string
    if (userRole === "SELLER" && currentOp.seller_id !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Calculate margin if amounts changed
    let updateData: any = { ...body }
    if (body.sale_amount_total !== undefined || body.operator_cost !== undefined) {
      const saleAmount = body.sale_amount_total ?? currentOp.sale_amount_total
      const operatorCost = body.operator_cost ?? currentOp.operator_cost
      updateData.margin_amount = saleAmount - operatorCost
      updateData.margin_percentage = saleAmount > 0 ? (updateData.margin_amount / saleAmount) * 100 : 0
    }

    updateData.updated_at = new Date().toISOString()

    // Update operation
    const { data: operation, error: updateError } = await (supabase.from("operations") as any)
      .update(updateData)
      .eq("id", operationId)
      .select()
      .single()

    if (updateError || !operation) {
      console.error("Error updating operation:", updateError)
      return NextResponse.json({ error: "Error al actualizar operación" }, { status: 400 })
    }

    // Si el status cambió a CONFIRMED o RESERVED, generar alerta de documentación faltante
    const op = operation as any
    if (body.status === "CONFIRMED" || body.status === "RESERVED" || op.status === "CONFIRMED" || op.status === "RESERVED") {
      try {
        const { generateMissingDocsAlert } = await import("@/lib/alerts/accounting-alerts")
        await generateMissingDocsAlert(supabase, op.agency_id, operationId, op.seller_id)
      } catch (error) {
        console.error("Error generating missing docs alert:", error)
        // No lanzamos error para no romper la actualización
      }
    }

    return NextResponse.json({ success: true, operation })
  } catch (error) {
    console.error("Error in PATCH /api/operations/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar operación" }, { status: 500 })
  }
}

