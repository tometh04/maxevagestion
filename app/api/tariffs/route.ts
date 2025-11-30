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
    let query = (supabase.from("tariffs") as any)
      .select(`
        *,
        operators:operator_id(id, name),
        agencies:agency_id(id, name),
        tariff_items(*),
        created_by_user:created_by(id, name)
      `)

    // Apply filters
    const operatorId = searchParams.get("operatorId")
    if (operatorId) {
      query = query.eq("operator_id", operatorId)
    }

    const agencyId = searchParams.get("agencyId")
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      // Show global tariffs (agency_id IS NULL) or user's agency tariffs
      query = query.or(`agency_id.in.(${agencyIds.join(",")}),agency_id.is.null`)
    }

    const destination = searchParams.get("destination")
    if (destination) {
      query = query.ilike("destination", `%${destination}%`)
    }

    const region = searchParams.get("region")
    if (region && region !== "ALL") {
      query = query.eq("region", region)
    }

    const isActive = searchParams.get("isActive")
    if (isActive === "true") {
      query = query.eq("is_active", true)
    }

    // Filter by date range if provided
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    if (dateFrom) {
      query = query.lte("valid_from", dateTo || "9999-12-31")
    }
    if (dateTo) {
      query = query.gte("valid_to", dateFrom || "1900-01-01")
    }

    const { data: tariffs, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching tariffs:", error)
      return NextResponse.json({ error: "Error al obtener tarifarios" }, { status: 500 })
    }

    return NextResponse.json({ tariffs: tariffs || [] })
  } catch (error: any) {
    console.error("Error in GET /api/tariffs:", error)
    return NextResponse.json({ error: error.message || "Error al obtener tarifarios" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear tarifarios" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      operator_id,
      agency_id,
      name,
      description,
      destination,
      region,
      valid_from,
      valid_to,
      tariff_type,
      currency,
      is_active,
      notes,
      terms_and_conditions,
      items, // Array de tariff_items
    } = body

    // Validate required fields
    if (!operator_id || !name || !destination || !region || !valid_from || !valid_to || !tariff_type) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Create tariff
    const tariffData: Record<string, any> = {
      operator_id,
      agency_id: agency_id || null,
      name,
      description: description || null,
      destination,
      region,
      valid_from,
      valid_to,
      tariff_type,
      currency: currency || "ARS",
      is_active: is_active !== false,
      notes: notes || null,
      terms_and_conditions: terms_and_conditions || null,
      created_by: user.id,
    }

    const { data: tariff, error: tariffError } = await (supabase.from("tariffs") as any)
      .insert(tariffData)
      .select()
      .single()

    if (tariffError) {
      console.error("Error creating tariff:", tariffError)
      return NextResponse.json({ error: "Error al crear tarifario" }, { status: 500 })
    }

    // Create tariff items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsData = items.map((item: any, index: number) => ({
        tariff_id: tariff.id,
        category: item.category,
        room_type: item.room_type || null,
        occupancy_type: item.occupancy_type || null,
        base_price: item.base_price,
        price_per_night: item.price_per_night || false,
        price_per_person: item.price_per_person !== false,
        discount_percentage: item.discount_percentage || 0,
        commission_percentage: item.commission_percentage || 0,
        min_nights: item.min_nights || null,
        max_nights: item.max_nights || null,
        min_pax: item.min_pax || 1,
        max_pax: item.max_pax || null,
        is_available: item.is_available !== false,
        notes: item.notes || null,
        order_index: index,
      }))

      const { error: itemsError } = await (supabase.from("tariff_items") as any).insert(itemsData)

      if (itemsError) {
        console.error("Error creating tariff items:", itemsError)
        // Delete tariff if items fail
        await (supabase.from("tariffs") as any).delete().eq("id", tariff.id)
        return NextResponse.json({ error: "Error al crear items de tarifario" }, { status: 500 })
      }
    }

    // Fetch complete tariff with items
    const { data: completeTariff } = await (supabase.from("tariffs") as any)
      .select(`
        *,
        tariff_items(*)
      `)
      .eq("id", tariff.id)
      .single()

    return NextResponse.json({ tariff: completeTariff }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/tariffs:", error)
    return NextResponse.json({ error: error.message || "Error al crear tarifario" }, { status: 500 })
  }
}

