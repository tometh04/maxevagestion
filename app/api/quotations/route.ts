import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { normalizeQuotationPricingMode } from "@/lib/quotations/presentation"
import { prepareQuotationOptionsForPersistence } from "@/lib/quotations/persistence"

export const dynamic = "force-dynamic"

// GET — Listar cotizaciones con filtros
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase: any = await createServerClient()
    const { searchParams } = new URL(request.url)

    let query = supabase
      .from("quotations")
      .select(`
        *,
        lead:lead_id(id, contact_name, contact_phone, contact_email, destination, status),
        seller:seller_id(id, name, email),
        quotation_options(*)
      `)
      .order("created_at", { ascending: false })

    // Filtro por vendedor (SELLER solo ve las suyas)
    if (user.role === "SELLER") {
      query = query.eq("seller_id", user.id)
    } else {
      const sellerId = searchParams.get("seller_id")
      if (sellerId && sellerId !== "ALL") {
        query = query.eq("seller_id", sellerId)
      }
    }

    // Filtro por lead
    const leadId = searchParams.get("lead_id")
    if (leadId) {
      query = query.eq("lead_id", leadId)
    }

    // Filtro por estado
    const status = searchParams.get("status")
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    // Filtro por agencia
    const agencyId = searchParams.get("agency_id")
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }

    // Paginación
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")
    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query

    if (error) {
      console.error("Error fetching quotations:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotations GET:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// POST — Crear cotización
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase: any = await createServerClient()
    const body = await request.json()

    const {
      lead_id,
      agency_id,
      destination,
      origin,
      region,
      departure_date,
      return_date,
      adults,
      children,
      infants,
      currency,
      pricing_mode,
      notes,
      terms_and_conditions,
      options, // Array de opciones: [{ title, total_amount, manual_total_amount?, items: [...] }]
    } = body

    // Validaciones básicas
    if (!agency_id) return NextResponse.json({ error: "agency_id es requerido" }, { status: 400 })
    if (!destination) return NextResponse.json({ error: "destination es requerido" }, { status: 400 })
    if (!departure_date) return NextResponse.json({ error: "departure_date es requerido" }, { status: 400 })
    if (!options || !Array.isArray(options) || options.length === 0) {
      return NextResponse.json({ error: "Se requiere al menos una opción" }, { status: 400 })
    }

    let preparedOptions
    try {
      preparedOptions = prepareQuotationOptionsForPersistence(options, currency || "USD")
    } catch (error: any) {
      return NextResponse.json({ error: error.message || "Opciones inválidas" }, { status: 400 })
    }
    if (preparedOptions.length === 0) {
      return NextResponse.json({ error: "Se requiere al menos una opción válida" }, { status: 400 })
    }

    // Generar número de cotización
    const { data: quotationNumber } = await supabase.rpc("generate_quotation_number")

    // Calcular vencimiento (24hs desde ahora)
    const validUntil = new Date()
    validUntil.setHours(validUntil.getHours() + 24)

    // El total de la cotización es el de la primera opción (referencial)
    const firstOption = preparedOptions[0]

    // Crear cotización
    const { data: quotation, error: quotationError } = await supabase
      .from("quotations")
      .insert({
        lead_id: lead_id || null,
        agency_id,
        seller_id: user.id,
        quotation_number: quotationNumber || `COT-${new Date().getFullYear()}-${Date.now()}`,
        destination,
        origin: origin || null,
        region: region || "OTROS",
        departure_date,
        return_date: return_date || null,
        valid_until: validUntil.toISOString().split("T")[0],
        adults: adults || 1,
        children: children || 0,
        infants: infants || 0,
        subtotal: firstOption.total_amount,
        total_amount: firstOption.total_amount,
        currency: currency || "USD",
        pricing_mode: normalizeQuotationPricingMode(pricing_mode ?? "PER_PERSON"),
        status: "DRAFT",
        notes: notes || null,
        terms_and_conditions: terms_and_conditions || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (quotationError) {
      console.error("Error creating quotation:", quotationError)
      return NextResponse.json({ error: quotationError.message }, { status: 500 })
    }

    // Crear opciones con sus items
    for (let i = 0; i < preparedOptions.length; i++) {
      const opt = preparedOptions[i]

      // Crear opción
      const { data: option, error: optionError } = await supabase
        .from("quotation_options")
        .insert({
          quotation_id: quotation.id,
          option_number: i + 1,
          title: opt.title || `Opción ${i + 1}`,
          total_amount: opt.total_amount,
          calculated_total_amount: opt.calculated_total_amount,
          manual_total_amount: opt.manual_total_amount,
        })
        .select()
        .single()

      if (optionError) {
        console.error("Error creating option:", optionError)
        continue
      }

      // Crear items de la opción
      if (opt.items && Array.isArray(opt.items)) {
        const itemsToInsert = opt.items.map((item: any, idx: number) => ({
          quotation_id: quotation.id,
          option_id: option.id,
          item_type: item.item_type || "OTHER",
          description: item.description || "",
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.sale_amount || 0,
          sale_amount: item.sale_amount || item.unit_price || 0,
          cost_amount: item.cost_amount || 0,
          cost_currency: item.cost_currency || currency || "USD",
          subtotal: item.subtotal || 0,
          currency: currency || "USD",
          operator_id: item.operator_id || null,
          generates_commission: item.generates_commission || false,
          order_index: idx,
          notes: item.notes || null,
          // Hotel
          destination_city: item.destination_city || null,
          hotel_name: item.hotel_name || null,
          hotel_stars: item.hotel_stars || null,
          hotel_address: item.hotel_address || null,
          hotel_phone: item.hotel_phone || null,
          hotel_photo_url: item.hotel_photo_url || null,
          room_type: item.room_type || null,
          meal_plan: item.meal_plan || null,
          checkin_date: item.checkin_date || null,
          checkout_date: item.checkout_date || null,
          nights: item.nights || null,
          rooms: item.rooms || 1,
          // Flight
          airline: item.airline || null,
          flight_route: item.flight_route || null,
          flight_date: item.flight_date || null,
          flight_return_date: item.flight_return_date || null,
          flight_stops: item.flight_stops != null ? Number(item.flight_stops) : 0,
          flight_class: item.flight_class || null,
          flight_screenshot_url: item.flight_screenshot_url || null,
          // Transfer
          transfer_description: item.transfer_description || null,
        }))

        const { error: itemsError } = await supabase
          .from("quotation_items")
          .insert(itemsToInsert)

        if (itemsError) {
          console.error("Error creating items:", itemsError)
        }
      }
    }

    // Devolver cotización completa con opciones e items
    const { data: fullQuotation } = await supabase
      .from("quotations")
      .select(`
        *,
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", quotation.id)
      .single()

    return NextResponse.json({ data: fullQuotation }, { status: 201 })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotations POST:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
