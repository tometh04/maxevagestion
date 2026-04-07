import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { normalizeQuotationPricingMode } from "@/lib/quotations/presentation"
import { prepareQuotationOptionsForPersistence } from "@/lib/quotations/persistence"

export const dynamic = "force-dynamic"

// GET — Detalle de cotización con opciones e items
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase: any = await createServerClient()

    const { data, error } = await supabase
      .from("quotations")
      .select(`
        *,
        lead:lead_id(id, contact_name, contact_phone, contact_email, destination, status, contact_instagram),
        seller:seller_id(id, name, email),
        agency:agency_id(id, name),
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // SELLER solo ve las suyas
    if (user.role === "SELLER" && data.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso" }, { status: 403 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation GET:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// PATCH — Actualizar cotización (datos, estado, opciones)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase: any = await createServerClient()
    const body = await request.json()

    // Verificar que existe y que el usuario tiene acceso
    const { data: existing } = await supabase
      .from("quotations")
      .select("id, seller_id, status, currency")
      .eq("id", id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    if (user.role === "SELLER" && existing.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso" }, { status: 403 })
    }

    // Campos actualizables
    const updateData: Record<string, any> = {}
    const allowedFields = [
      "destination", "origin", "region", "departure_date", "return_date",
      "valid_until", "adults", "children", "infants", "currency",
      "notes", "terms_and_conditions", "status",
      "subtotal", "total_amount", "pricing_mode",
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (body.pricing_mode !== undefined) {
      updateData.pricing_mode = normalizeQuotationPricingMode(body.pricing_mode)
    }

    let preparedOptions: ReturnType<typeof prepareQuotationOptionsForPersistence> | null = null
    if (body.options && Array.isArray(body.options)) {
      try {
        preparedOptions = prepareQuotationOptionsForPersistence(body.options, body.currency || existing.currency || "USD")
      } catch (error: any) {
        return NextResponse.json({ error: error.message || "Opciones inválidas" }, { status: 400 })
      }

      if (preparedOptions.length === 0) {
        return NextResponse.json({ error: "Se requiere al menos una opción válida" }, { status: 400 })
      }

      updateData.subtotal = preparedOptions[0].total_amount
      updateData.total_amount = preparedOptions[0].total_amount
    }

    // Lógica de cambio de estado
    if (body.status === "SENT" && existing.status === "DRAFT") {
      updateData.status = "SENT"
    }

    if (body.status === "APPROVED") {
      updateData.status = "APPROVED"
      updateData.approved_by = user.id
      updateData.approved_at = new Date().toISOString()
    }

    if (body.status === "REJECTED") {
      updateData.status = "REJECTED"
      updateData.rejection_reason = body.rejection_reason || null
    }

    // Actualizar cotización
    const { data: updated, error } = await supabase
      .from("quotations")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating quotation:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Si se enviaron opciones nuevas, reemplazarlas
    if (preparedOptions) {
      // Borrar opciones e items anteriores (cascade borra los items vinculados)
      await supabase.from("quotation_options").delete().eq("quotation_id", id)
      // Borrar items sin opción
      await supabase.from("quotation_items").delete().eq("quotation_id", id)

      for (let i = 0; i < preparedOptions.length; i++) {
        const opt = preparedOptions[i]

        const { data: option, error: optError } = await supabase
          .from("quotation_options")
          .insert({
            quotation_id: id,
            option_number: i + 1,
            title: opt.title || `Opción ${i + 1}`,
            total_amount: opt.total_amount,
            calculated_total_amount: opt.calculated_total_amount,
            manual_total_amount: opt.manual_total_amount,
          })
          .select()
          .single()

        if (optError || !option) continue

        if (opt.items && Array.isArray(opt.items)) {
          const itemsToInsert = opt.items.map((item: any, idx: number) => ({
            quotation_id: id,
            option_id: option.id,
            item_type: item.item_type || "OTHER",
            description: item.description || "",
            quantity: item.quantity || 1,
            unit_price: item.unit_price || item.sale_amount || 0,
            sale_amount: item.sale_amount || item.unit_price || 0,
            cost_amount: item.cost_amount || 0,
            cost_currency: item.cost_currency || updated.currency || "USD",
            subtotal: item.subtotal || 0,
            currency: updated.currency || "USD",
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

          await supabase.from("quotation_items").insert(itemsToInsert)
        }
      }
    }

    // Devolver cotización actualizada completa
    const { data: fullQuotation } = await supabase
      .from("quotations")
      .select(`
        *,
        quotation_options(*),
        quotation_items(*)
      `)
      .eq("id", id)
      .single()

    return NextResponse.json({ data: fullQuotation })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation PATCH:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// DELETE — Eliminar cotización (solo borradores)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase: any = await createServerClient()

    const { data: existing } = await supabase
      .from("quotations")
      .select("id, seller_id, status")
      .eq("id", id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    if (user.role === "SELLER" && existing.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso" }, { status: 403 })
    }

    // Solo se pueden eliminar borradores
    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar cotizaciones en estado DRAFT" },
        { status: 400 }
      )
    }

    const { error } = await supabase.from("quotations").delete().eq("id", id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation DELETE:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
