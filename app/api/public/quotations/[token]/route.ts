import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { normalizeQuotationForPresentation } from "@/lib/quotations/presentation"

export const dynamic = "force-dynamic"

// GET — Vista pública de cotización (sin auth)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = await createServerClient()

    const { data: rawData, error } = await (supabase
      .from("quotations") as any)
      .select(`
        id, quotation_number, destination, origin, region,
        departure_date, return_date, valid_until,
        adults, children, infants,
        total_amount, currency, pricing_mode, status,
        notes, terms_and_conditions,
        created_at,
        seller:seller_id(name, email),
        agency:agency_id(name),
        quotation_options(*),
        quotation_items(
          id, item_type, description, quantity, subtotal, currency,
          order_index, notes, provider, option_id,
          checkin_date, checkout_date, nights, destination_city,
          hotel_name, hotel_stars, room_type, meal_plan, hotel_address, hotel_photo_url, rooms,
          airline, flight_route, flight_class, flight_stops, flight_date, flight_return_date, flight_screenshot_url,
          transfer_description,
          unit_price
        )
      `)
      .eq("public_token", token)
      .single()

    const data = rawData as any

    if (error || !data) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // Verificar si está vencida
    if (data.status === "SENT" || data.status === "PENDING_APPROVAL") {
      const validUntil = new Date(data.valid_until + "T23:59:59")
      if (validUntil < new Date()) {
        // Marcar como expirada
        await (supabase
          .from("quotations") as any)
          .update({ status: "EXPIRED" })
          .eq("id", data.id)
        data.status = "EXPIRED"
      }
    }

    const publicData = normalizeQuotationForPresentation({
      ...data,
      seller_name: (data.seller as any)?.name || "",
      agency_name: (data.agency as any)?.name || "",
    })

    return NextResponse.json({ data: publicData })
  } catch (error: any) {
    console.error("Error in public quotation GET:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// POST — Cliente acepta una opción (sin auth)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = await createServerClient()
    const body = await request.json()

    const { option_id } = body

    if (!option_id) {
      return NextResponse.json({ error: "option_id es requerido" }, { status: 400 })
    }

    // Buscar cotización por token
    const { data: quotation } = await (supabase
      .from("quotations") as any)
      .select("id, status, valid_until, seller_id, lead_id, destination, quotation_number, org_id")
      .eq("public_token", token)
      .single()

    if (!quotation) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // Verificar que esté en estado aceptable
    if (!["SENT", "PENDING_APPROVAL"].includes(quotation.status)) {
      return NextResponse.json(
        { error: "Esta cotización ya no puede ser aceptada" },
        { status: 400 }
      )
    }

    // Verificar vencimiento
    const validUntil = new Date(quotation.valid_until + "T23:59:59")
    if (validUntil < new Date()) {
      await (supabase.from("quotations") as any)
        .update({ status: "EXPIRED" })
        .eq("id", quotation.id)
      return NextResponse.json({ error: "La cotización ha vencido" }, { status: 400 })
    }

    // Marcar opción como seleccionada
    // Primero deseleccionar todas
    await (supabase.from("quotation_options") as any)
      .update({ is_selected: false })
      .eq("quotation_id", quotation.id)

    // Seleccionar la elegida
    await (supabase.from("quotation_options") as any)
      .update({ is_selected: true })
      .eq("id", option_id)
      .eq("quotation_id", quotation.id)

    // Marcar cotización como aprobada
    await (supabase.from("quotations") as any)
      .update({
        status: "APPROVED",
        approved_at: new Date().toISOString(),
      })
      .eq("id", quotation.id)

    // Crear alerta para el seller — usa admin client porque el endpoint es público
    // (sin auth) y RLS bloquearía el insert. Fire-and-forget.
    if (quotation.seller_id) {
      try {
        const admin = createAdminClient() as any
        const description = `Cliente aceptó cotización ${quotation.quotation_number || ""} ${quotation.destination ? `a ${quotation.destination}` : ""}`.trim()
        await admin.from("alerts").insert({
          user_id: quotation.seller_id,
          org_id: quotation.org_id,
          type: "QUOTATION_ACCEPTED",
          description,
          date_due: new Date().toISOString().split("T")[0],
          status: "PENDING",
        })
      } catch (alertErr: any) {
        console.warn("[public/quotations] Alert insert failed:", alertErr?.message)
      }
    }

    return NextResponse.json({ success: true, message: "Cotización aceptada" })
  } catch (error: any) {
    console.error("Error in public quotation POST:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
