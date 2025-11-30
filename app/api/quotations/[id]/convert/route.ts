import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { generateFileCode } from "@/lib/accounting/file-code"
import { getOrCreateDefaultAccount, transferLeadToOperation } from "@/lib/accounting/ledger"

/**
 * Convierte una cotización aprobada en una operación
 * Sincroniza con: Operaciones, Pagos, Cupos, Ledger
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para convertir cotizaciones" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const quotationId = id
    const body = await request.json()

    // Get quotation with items
    const { data: quotation, error: quotationError } = await (supabase.from("quotations") as any)
      .select(`
        *,
        quotation_items(*),
        leads:lead_id(*),
        operators:operator_id(*)
      `)
      .eq("id", quotationId)
      .single()

    if (quotationError || !quotation) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    const quot = quotation as any

    // Check if quotation is approved
    if (quot.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Solo se pueden convertir cotizaciones aprobadas" },
        { status: 400 }
      )
    }

    // Check if already converted
    if (quot.operation_id) {
      return NextResponse.json(
        { error: "Esta cotización ya fue convertida a operación" },
        { status: 400 }
      )
    }

    // Validate required fields for operation
    if (!quot.agency_id || !quot.seller_id || !quot.destination || !quot.departure_date) {
      return NextResponse.json(
        { error: "La cotización no tiene todos los datos necesarios para crear una operación" },
        { status: 400 }
      )
    }

    // Calculate operator cost from quotation items or use provided value
    const operatorCost = body.operator_cost || quot.total_amount * 0.7 // Default 70% if not provided
    const saleAmount = quot.total_amount
    const marginAmount = saleAmount - operatorCost
    const marginPercentage = saleAmount > 0 ? (marginAmount / saleAmount) * 100 : 0

    // Create operation
    const operationData: Record<string, any> = {
      agency_id: quot.agency_id,
      lead_id: quot.lead_id,
      seller_id: quot.seller_id,
      operator_id: quot.operator_id,
      type: body.type || "PACKAGE",
      origin: quot.origin,
      destination: quot.destination,
      departure_date: quot.departure_date,
      return_date: quot.return_date,
      adults: quot.adults || 1,
      children: quot.children || 0,
      infants: quot.infants || 0,
      status: "PRE_RESERVATION",
      sale_amount_total: saleAmount,
      operator_cost: operatorCost,
      currency: quot.currency || "ARS",
      margin_amount: marginAmount,
      margin_percentage: marginPercentage,
    }

    const { data: operation, error: operationError } = await (supabase.from("operations") as any)
      .insert(operationData)
      .select()
      .single()

    if (operationError) {
      console.error("Error creating operation:", operationError)
      return NextResponse.json({ error: "Error al crear operación" }, { status: 500 })
    }

    // Update quotation with operation_id and status
    await (supabase.from("quotations") as any)
      .update({
        operation_id: operation.id,
        status: "CONVERTED",
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", quotationId)

    // Update lead status to WON if lead exists
    if (quot.lead_id) {
      await (supabase.from("leads") as any)
        .update({ status: "WON", updated_at: new Date().toISOString() })
        .eq("id", quot.lead_id)

      // Transfer all ledger_movements from lead to operation
      try {
        const result = await transferLeadToOperation(quot.lead_id, operation.id, supabase)
        console.log(`✅ Transferred ${result.transferred} ledger movements from lead ${quot.lead_id} to operation ${operation.id}`)
      } catch (error) {
        console.error("Error transferring ledger movements:", error)
        // No lanzamos error para no romper la conversión
      }
    }

    // Confirm quota reservations if they exist
    if (body.confirm_quotas !== false) {
      await (supabase.from("quota_reservations") as any)
        .update({ status: "CONFIRMED", operation_id: operation.id })
        .eq("quotation_id", quotationId)
        .eq("status", "RESERVED")
    }

    // Create initial payments if provided
    if (body.initial_payments && Array.isArray(body.initial_payments)) {
      for (const payment of body.initial_payments) {
        await (supabase.from("payments") as any).insert({
          operation_id: operation.id,
          payer_type: payment.payer_type || "CUSTOMER",
          direction: payment.direction || "INCOME",
          method: payment.method,
          amount: payment.amount,
          currency: payment.currency || quot.currency,
          date_due: payment.date_due,
          status: "PENDING",
          reference: payment.reference || null,
        })
      }
    }

    // Fetch complete operation
    const { data: completeOperation } = await supabase
      .from("operations")
      .select(`
        *,
        sellers:seller_id(id, name, email),
        operators:operator_id(id, name),
        agencies:agency_id(id, name),
        leads:lead_id(id, contact_name, destination)
      `)
      .eq("id", operation.id)
      .single()

    return NextResponse.json(
      {
        success: true,
        operation: completeOperation,
        quotation: {
          ...quot,
          operation_id: operation.id,
          status: "CONVERTED",
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error in POST /api/quotations/[id]/convert:", error)
    return NextResponse.json({ error: error.message || "Error al convertir cotización" }, { status: 500 })
  }
}

