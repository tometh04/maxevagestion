import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { generateFileCode } from "@/lib/accounting/file-code"
import { transferLeadToOperation, getOrCreateDefaultAccount } from "@/lib/accounting/ledger"
import { createSaleIVA, createPurchaseIVA } from "@/lib/accounting/iva"
import { createOperatorPayment, calculateDueDate } from "@/lib/accounting/operator-payments"
import { canPerformAction } from "@/lib/permissions-api"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Verificar permiso de escritura
    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear operaciones" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      lead_id,
      agency_id,
      seller_id,
      seller_secondary_id,
      operator_id,
      type,
      product_type,
      origin,
      destination,
      departure_date,
      return_date,
      checkin_date,
      checkout_date,
      adults,
      children,
      infants,
      passengers,
      status,
      sale_amount_total,
      operator_cost,
      currency,
      sale_currency,
      operator_cost_currency,
    } = body

    // Validate required fields
    if (!agency_id || !seller_id || !type || !destination || !departure_date || sale_amount_total === undefined || operator_cost === undefined) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Check permissions
    if (user.role === "SELLER" && seller_id !== user.id) {
      return NextResponse.json({ error: "No puedes crear operaciones para otros vendedores" }, { status: 403 })
    }

    // Calculate margin
    const marginAmount = sale_amount_total - operator_cost
    const marginPercentage = sale_amount_total > 0 ? (marginAmount / sale_amount_total) * 100 : 0

    // Infer product_type from type if not provided
    const inferredProductType = product_type || (type === 'FLIGHT' ? 'AEREO' : type === 'HOTEL' ? 'HOTEL' : type === 'PACKAGE' ? 'PAQUETE' : type === 'CRUISE' ? 'CRUCERO' : 'OTRO')

    // Use sale_currency and operator_cost_currency, fallback to currency
    const finalSaleCurrency = sale_currency || currency || "ARS"
    const finalOperatorCostCurrency = operator_cost_currency || currency || "ARS"

    const operationData: Record<string, any> = {
      agency_id,
      lead_id: lead_id || null,
      seller_id,
      seller_secondary_id: seller_secondary_id || null,
      operator_id: operator_id || null,
      type,
      product_type: inferredProductType,
      origin: origin || null,
      destination,
      departure_date,
      return_date: return_date || null,
      checkin_date: checkin_date || null,
      checkout_date: checkout_date || null,
      adults: adults || 1,
      children: children || 0,
      infants: infants || 0,
      passengers: passengers ? JSON.stringify(passengers) : null,
      status: status || "PRE_RESERVATION",
      sale_amount_total,
      operator_cost,
      currency: currency || "ARS", // Mantener para compatibilidad
      sale_currency: finalSaleCurrency,
      operator_cost_currency: finalOperatorCostCurrency,
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

    // Auto-generate file_code after operation is created (so we can use the real ID)
    const op = operation as any
    const fileCode = generateFileCode(op.created_at, op.id)
    await (supabase.from("operations") as any)
      .update({ file_code: fileCode })
      .eq("id", op.id)
    
    // Update operation object with file_code
    op.file_code = fileCode

    // Auto-generate IVA records
    try {
      if (sale_amount_total > 0) {
        await createSaleIVA(
          supabase,
          op.id,
          sale_amount_total,
          finalSaleCurrency,
          departure_date
        )
        console.log(`✅ Created sale IVA record for operation ${operation.id}`)
      }

      if (operator_cost > 0 && operator_id) {
        await createPurchaseIVA(
          supabase,
          op.id,
          operator_id,
          operator_cost,
          finalOperatorCostCurrency,
          departure_date
        )
        console.log(`✅ Created purchase IVA record for operation ${operation.id}`)
      }
    } catch (error) {
      console.error("Error creating IVA records:", error)
      // No lanzamos error para no romper la creación de la operación
    }

    // Auto-generate operator payment
    if (operator_id && operator_cost > 0) {
      try {
        const dueDate = calculateDueDate(
          inferredProductType,
          departure_date, // purchase_date (usar departure_date como aproximación)
          checkin_date || undefined,
          departure_date
        )

        await createOperatorPayment(
          supabase,
          op.id,
          operator_id,
          operator_cost,
          finalOperatorCostCurrency,
          dueDate,
          `Pago automático generado para operación ${operation.id}`
        )
        console.log(`✅ Created operator payment for operation ${operation.id}, due: ${dueDate}`)
      } catch (error) {
        console.error("Error creating operator payment:", error)
        // No lanzamos error para no romper la creación de la operación
      }
    }

    // Auto-generate payments
    const departureDate = new Date(departure_date)
    const customerPaymentDate = new Date(departureDate)
    customerPaymentDate.setDate(departureDate.getDate() - 15)

    const operatorPaymentDate = new Date(departureDate)
    operatorPaymentDate.setDate(departureDate.getDate() - 7)

    const paymentsData = [
      {
        operation_id: operation.id,
        payer_type: "CUSTOMER",
        direction: "INCOME",
        method: "Transferencia",
        amount: Math.floor(sale_amount_total * 0.5),
        currency: currency || "ARS",
        date_due: customerPaymentDate.toISOString().split("T")[0],
        status: "PENDING",
      },
      {
        operation_id: operation.id,
        payer_type: "CUSTOMER",
        direction: "INCOME",
        method: "Transferencia",
        amount: sale_amount_total - Math.floor(sale_amount_total * 0.5),
        currency: currency || "ARS",
        date_due: new Date(departureDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        status: "PENDING",
      },
      {
        operation_id: operation.id,
        payer_type: "OPERATOR",
        direction: "EXPENSE",
        method: "Transferencia",
        amount: Math.floor(operator_cost * 0.6),
        currency: currency || "ARS",
        date_due: operatorPaymentDate.toISOString().split("T")[0],
        status: "PENDING",
      },
      {
        operation_id: operation.id,
        payer_type: "OPERATOR",
        direction: "EXPENSE",
        method: "Transferencia",
        amount: operator_cost - Math.floor(operator_cost * 0.6),
        currency: currency || "ARS",
        date_due: departure_date,
        status: "PENDING",
      },
    ]

    await (supabase.from("payments") as any).insert(paymentsData)

    // Auto-generate alerts
    const alertsData = [
      {
        operation_id: operation.id,
        user_id: seller_id,
        type: "PAYMENT_DUE",
        description: `Pago pendiente de cliente: ${Math.floor(sale_amount_total * 0.5)} ${currency || "ARS"}`,
        date_due: customerPaymentDate.toISOString(),
        status: "PENDING",
      },
      {
        operation_id: operation.id,
        user_id: seller_id,
        type: "UPCOMING_TRIP",
        description: `Viaje próximo: ${destination} - Salida: ${departure_date}`,
        date_due: departure_date,
        status: "PENDING",
      },
    ]

    await (supabase.from("alerts") as any).insert(alertsData)

    // Generar alerta de documentación faltante si la operación está confirmada
    if (status === "CONFIRMED" || status === "RESERVED") {
      try {
        const { generateMissingDocsAlert } = await import("@/lib/alerts/accounting-alerts")
        await generateMissingDocsAlert(supabase, agency_id, operation.id, seller_id)
      } catch (error) {
        console.error("Error generating missing docs alert:", error)
        // No lanzamos error para no romper la creación de la operación
      }
    }

    // Update lead status to WON if lead_id exists
    if (lead_id) {
      await (supabase.from("leads") as any).update({ status: "WON" }).eq("id", lead_id)
      
      // Transfer all ledger_movements from lead to operation
      try {
        const result = await transferLeadToOperation(lead_id, operation.id, supabase)
        console.log(`✅ Transferred ${result.transferred} ledger movements from lead ${lead_id} to operation ${operation.id}`)
      } catch (error) {
        console.error("Error transferring ledger movements:", error)
        // No lanzamos error para no romper la creación de la operación
        // pero lo registramos para debugging
      }
    }

    return NextResponse.json({ operation })
  } catch (error) {
    console.error("Error in POST /api/operations:", error)
    return NextResponse.json({ error: "Error al crear operación" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Get user agencies
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Build query
    let query = supabase
      .from("operations")
      .select("*, sellers:seller_id(name), operators:operator_id(name), agencies:agency_id(name)")

    // Apply permissions-based filtering
    const { applyOperationsFilters } = await import("@/lib/permissions-api")
    try {
      query = applyOperationsFilters(query, user, agencyIds)
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    // Apply filters
    const status = searchParams.get("status")
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    const sellerId = searchParams.get("sellerId")
    if (sellerId && sellerId !== "ALL") {
      query = query.eq("seller_id", sellerId)
    }

    const agencyId = searchParams.get("agencyId")
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }

    const dateFrom = searchParams.get("dateFrom")
    if (dateFrom) {
      query = query.gte("departure_date", dateFrom)
    }

    const dateTo = searchParams.get("dateTo")
    if (dateTo) {
      query = query.lte("departure_date", dateTo)
    }

    // Add pagination with reasonable limits
    const requestedLimit = parseInt(searchParams.get("limit") || "100")
    const limit = Math.min(requestedLimit, 200) // Máximo 200 para mejor rendimiento
    const offset = parseInt(searchParams.get("offset") || "0")
    
    const { data: operations, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching operations:", error)
      return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("operations")
      .select("*", { count: "exact", head: true })
    
    try {
      countQuery = applyOperationsFilters(countQuery, user, agencyIds)
    } catch {
      // Ignore if filtering fails
    }
    
    const { count } = await countQuery

    return NextResponse.json({ 
      operations: operations || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      }
    })
  } catch (error) {
    console.error("Error in GET /api/operations:", error)
    return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
  }
}
