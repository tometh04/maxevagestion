import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

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
    let query = (supabase.from("quotations") as any)
      .select(`
        *,
        leads:lead_id(id, contact_name, destination, status),
        agencies:agency_id(id, name),
        sellers:seller_id(id, name, email),
        operators:operator_id(id, name),
        operations:operation_id(id, destination, status),
        created_by_user:created_by(id, name, email),
        approved_by_user:approved_by(id, name, email),
        quotation_items(*)
      `)

    // Apply permissions-based filtering
    if (user.role === "SELLER") {
      query = query.eq("seller_id", user.id)
    } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      query = query.in("agency_id", agencyIds)
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

    const leadId = searchParams.get("leadId")
    if (leadId) {
      query = query.eq("lead_id", leadId)
    }

    // Add pagination
    const limit = parseInt(searchParams.get("limit") || "100")
    const offset = parseInt(searchParams.get("offset") || "0")

    const { data: quotations, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching quotations:", error)
      return NextResponse.json({ error: "Error al obtener cotizaciones" }, { status: 500 })
    }

    return NextResponse.json({ quotations: quotations || [] })
  } catch (error: any) {
    console.error("Error in GET /api/quotations:", error)
    return NextResponse.json({ error: error.message || "Error al obtener cotizaciones" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear cotizaciones" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      lead_id,
      agency_id,
      seller_id,
      operator_id,
      destination,
      origin,
      region,
      departure_date,
      return_date,
      valid_until,
      adults,
      children,
      infants,
      subtotal,
      discounts,
      taxes,
      total_amount,
      currency,
      notes,
      terms_and_conditions,
      items, // Array de quotation_items
    } = body

    // Validate required fields
    if (!agency_id || !seller_id || !destination || !departure_date || !valid_until || total_amount === undefined) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Check permissions
    if (user.role === "SELLER" && seller_id !== user.id) {
      return NextResponse.json({ error: "No puedes crear cotizaciones para otros vendedores" }, { status: 403 })
    }

    // Generate quotation number
    let quotationNumber: string
    const { data: numberResult, error: numberError } = await supabase.rpc("generate_quotation_number")

    if (numberError || !numberResult) {
      console.error("Error generating quotation number:", numberError)
      // Fallback: generate manually
      const year = new Date().getFullYear()
      const { count } = await supabase
        .from("quotations")
        .select("*", { count: "exact", head: true })
        .like("quotation_number", `COT-${year}-%`)
      const sequenceNum = (count || 0) + 1
      quotationNumber = `COT-${year}-${String(sequenceNum).padStart(4, "0")}`
    } else {
      quotationNumber = numberResult as string
    }

    // Create quotation
    const quotationData: Record<string, any> = {
      lead_id: lead_id || null,
      agency_id,
      seller_id,
      operator_id: operator_id || null,
      quotation_number: quotationNumber,
      destination,
      origin: origin || null,
      region: region || "OTROS",
      departure_date,
      return_date: return_date || null,
      valid_until,
      adults: adults || 1,
      children: children || 0,
      infants: infants || 0,
      subtotal: subtotal || total_amount,
      discounts: discounts || 0,
      taxes: taxes || 0,
      total_amount,
      currency: currency || "ARS",
      status: "DRAFT",
      notes: notes || null,
      terms_and_conditions: terms_and_conditions || null,
      created_by: user.id,
    }

    const { data: quotation, error: quotationError } = await (supabase.from("quotations") as any)
      .insert(quotationData)
      .select()
      .single()

    if (quotationError) {
      console.error("Error creating quotation:", quotationError)
      return NextResponse.json({ error: "Error al crear cotización" }, { status: 500 })
    }

    // Create quotation items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsData = items.map((item: any, index: number) => ({
        quotation_id: quotation.id,
        item_type: item.item_type,
        description: item.description,
        quantity: item.quantity || 1,
        tariff_id: item.tariff_id || null,
        unit_price: item.unit_price,
        discount_percentage: item.discount_percentage || 0,
        discount_amount: item.discount_amount || 0,
        subtotal: item.subtotal || item.unit_price * (item.quantity || 1),
        currency: item.currency || currency || "ARS",
        notes: item.notes || null,
        order_index: index,
      }))

      const { error: itemsError } = await (supabase.from("quotation_items") as any).insert(itemsData)

      if (itemsError) {
        console.error("Error creating quotation items:", itemsError)
        // Delete quotation if items fail
        await (supabase.from("quotations") as any).delete().eq("id", quotation.id)
        return NextResponse.json({ error: "Error al crear items de cotización" }, { status: 500 })
      }
    }

    // Update lead status to QUOTED if lead_id exists
    if (lead_id) {
      await (supabase.from("leads") as any)
        .update({ status: "QUOTED", updated_at: new Date().toISOString() })
        .eq("id", lead_id)
    }

    // Fetch complete quotation with items
    const { data: completeQuotation } = await (supabase.from("quotations") as any)
      .select(`
        *,
        quotation_items(*)
      `)
      .eq("id", quotation.id)
      .single()

    return NextResponse.json({ quotation: completeQuotation }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/quotations:", error)
    return NextResponse.json({ error: error.message || "Error al crear cotización" }, { status: 500 })
  }
}

