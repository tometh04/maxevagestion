import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Mapeo de item_type de cotización → service_type de operación
const ITEM_TO_SERVICE_TYPE: Record<string, string> = {
  ACCOMMODATION: "HOTEL",
  FLIGHT: "FLIGHT",
  TRANSFER: "TRANSFER",
  ACTIVITY: "EXCURSION",
  INSURANCE: "ASSISTANCE",
  VISA: "VISA",
  OTHER: "SEAT", // fallback
}

// POST — Convertir cotización aprobada a operación
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase: any = await createServerClient()

    // 1. Obtener cotización completa
    const { data: quotation, error: qError } = await supabase
      .from("quotations")
      .select(`
        *,
        lead:lead_id(id, contact_name, contact_phone, contact_email, agency_id),
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", id)
      .single()

    if (qError || !quotation) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // 2. Verificar que esté aprobada
    if (quotation.status !== "APPROVED") {
      return NextResponse.json(
        { error: `La cotización debe estar APPROVED para convertir. Estado actual: ${quotation.status}` },
        { status: 400 }
      )
    }

    // 3. Verificar que no esté ya convertida
    if (quotation.operation_id) {
      return NextResponse.json(
        { error: "Esta cotización ya fue convertida a operación" },
        { status: 400 }
      )
    }

    // 4. Obtener la opción seleccionada
    const selectedOption = (quotation.quotation_options || []).find(
      (opt: any) => opt.is_selected
    )

    if (!selectedOption) {
      return NextResponse.json(
        { error: "No hay opción seleccionada en la cotización" },
        { status: 400 }
      )
    }

    // 5. Obtener items de la opción seleccionada
    const selectedItems = (quotation.quotation_items || [])
      .filter((item: any) => item.option_id === selectedOption.id)
      .sort((a: any, b: any) => a.order_index - b.order_index)

    // 6. Determinar tipo de operación según los items
    const itemTypes = selectedItems.map((i: any) => i.item_type)
    let operationType = "PACKAGE"
    if (itemTypes.length === 1) {
      const typeMap: Record<string, string> = {
        FLIGHT: "FLIGHT",
        ACCOMMODATION: "HOTEL",
        TRANSFER: "TRANSFER",
        INSURANCE: "ASSISTANCE",
      }
      operationType = typeMap[itemTypes[0]] || "PACKAGE"
    } else if (itemTypes.length > 1) {
      operationType = "MIXED"
    }

    // 7. Crear la operación vía API interna (reutiliza toda la lógica existente)
    const operationPayload = {
      lead_id: quotation.lead_id || null,
      agency_id: quotation.agency_id,
      seller_id: quotation.seller_id,
      type: operationType,
      destination: quotation.destination,
      origin: quotation.origin || null,
      departure_date: quotation.departure_date,
      return_date: quotation.return_date || null,
      adults: quotation.adults || 1,
      children: quotation.children || 0,
      infants: quotation.infants || 0,
      sale_amount_total: selectedOption.total_amount,
      currency: quotation.currency,
      sale_currency: quotation.currency,
      operator_cost: 0, // Se llena después con los servicios
      status: "RESERVED",
      notes: quotation.notes || null,
    }

    // Crear operación directamente en la tabla
    const { generateFileCode } = await import("@/lib/accounting/file-code")
    const fileCode = generateFileCode()

    const saleCurrency = quotation.currency || "USD"
    const saleTotal = Number(selectedOption.total_amount)
    const marginAmount = saleTotal // Sin costo de operador por ahora
    const marginPercentage = saleTotal > 0 ? 100 : 0

    const { data: operation, error: opError } = await supabase
      .from("operations")
      .insert({
        ...operationPayload,
        file_code: fileCode,
        operation_date: new Date().toISOString().split("T")[0],
        sale_currency: saleCurrency,
        operator_cost: 0,
        operator_cost_currency: saleCurrency,
        margin_amount: marginAmount,
        margin_percentage: marginPercentage,
        billing_margin_amount: marginAmount,
        billing_margin_percentage: marginPercentage,
      })
      .select()
      .single()

    if (opError || !operation) {
      console.error("Error creating operation from quotation:", opError)
      return NextResponse.json({ error: opError?.message || "Error al crear operación" }, { status: 500 })
    }

    // 8. Crear servicios a partir de los items de la cotización
    for (const item of selectedItems) {
      const serviceType = ITEM_TO_SERVICE_TYPE[item.item_type] || "SEAT"

      const servicePayload: Record<string, any> = {
        operation_id: operation.id,
        agency_id: quotation.agency_id,
        service_type: serviceType,
        description: item.description,
        sale_amount: item.subtotal || item.unit_price || 0,
        sale_currency: item.currency || quotation.currency,
        cost_amount: 0, // El vendedor completará el costo después
        cost_currency: item.currency || quotation.currency,
        generates_commission: ["TRANSFER", "ASSISTANCE"].includes(serviceType),
      }

      // Campos específicos de hotel
      if (item.hotel_name) servicePayload.hotel_name = item.hotel_name
      if (item.hotel_stars) servicePayload.hotel_stars = item.hotel_stars
      if (item.room_type) servicePayload.room_type = item.room_type
      if (item.meal_plan) servicePayload.meal_plan = item.meal_plan
      if (item.checkin_date) servicePayload.checkin_date = item.checkin_date
      if (item.checkout_date) servicePayload.checkout_date = item.checkout_date
      if (item.nights) servicePayload.nights = item.nights

      // Campos específicos de vuelo
      if (item.airline) servicePayload.airline = item.airline
      if (item.flight_route) servicePayload.flight_route = item.flight_route
      if (item.flight_class) servicePayload.flight_class = item.flight_class

      const { error: serviceError } = await supabase
        .from("operation_services")
        .insert(servicePayload)

      if (serviceError) {
        console.error("Error creating service from quotation item:", serviceError)
        // No falla toda la operación por un servicio
      }
    }

    // 9. Vincular cliente del lead a la operación (si existe)
    if (quotation.lead_id && quotation.lead) {
      const lead = quotation.lead as any

      // Buscar si ya existe un cliente con ese email o teléfono
      let customerId = null
      if (lead.contact_email) {
        const { data: existingCustomer } = await supabase
          .from("customers")
          .select("id")
          .eq("email", lead.contact_email)
          .maybeSingle()
        if (existingCustomer) customerId = existingCustomer.id
      }

      if (!customerId && lead.contact_phone) {
        const { data: existingCustomer } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", lead.contact_phone)
          .maybeSingle()
        if (existingCustomer) customerId = existingCustomer.id
      }

      // Si encontramos cliente, vincularlo a la operación
      if (customerId) {
        await supabase.from("operation_customers").insert({
          operation_id: operation.id,
          customer_id: customerId,
          is_primary: true,
        })
      }
    }

    // 10. Marcar cotización como convertida
    await supabase
      .from("quotations")
      .update({
        status: "CONVERTED",
        operation_id: operation.id,
        converted_at: new Date().toISOString(),
      })
      .eq("id", id)

    // 11. Marcar lead como WON
    if (quotation.lead_id) {
      await supabase
        .from("leads")
        .update({ status: "WON" })
        .eq("id", quotation.lead_id)
    }

    // 12. Calcular comisiones
    try {
      const { calculateCommission, createOrUpdateCommissionRecords } = await import("@/lib/commissions/calculate")
      const commissionOp = {
        ...operation,
        seller_id: operation.seller_id,
      }
      const commissionData = await calculateCommission(commissionOp)
      if (commissionData.totalCommission > 0) {
        await createOrUpdateCommissionRecords(commissionOp, commissionData)
      }
    } catch (commError) {
      console.error("Error calculating commissions:", commError)
    }

    return NextResponse.json({
      data: {
        operation_id: operation.id,
        file_code: operation.file_code,
        services_created: selectedItems.length,
      },
    })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error converting quotation:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
