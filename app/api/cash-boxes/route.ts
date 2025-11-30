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
    let query = (supabase.from("cash_boxes") as any).select("*")

    // Apply filters
    const agencyId = searchParams.get("agencyId")
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      query = query.in("agency_id", agencyIds)
    }

    const currency = searchParams.get("currency")
    if (currency && currency !== "ALL") {
      query = query.eq("currency", currency)
    }

    const isActive = searchParams.get("isActive")
    if (isActive === "true") {
      query = query.eq("is_active", true)
    }

    const { data: cashBoxes, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching cash boxes:", error)
      return NextResponse.json({ error: "Error al obtener cajas" }, { status: 500 })
    }

    return NextResponse.json({ cashBoxes: cashBoxes || [] })
  } catch (error: any) {
    console.error("Error in GET /api/cash-boxes:", error)
    return NextResponse.json({ error: error.message || "Error al obtener cajas" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear cajas" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      agency_id,
      name,
      description,
      box_type,
      currency,
      initial_balance,
      is_active,
      is_default,
      notes,
    } = body

    // Validate required fields
    if (!agency_id || !name || !box_type || !currency) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // If this is set as default, unset other defaults for this agency
    if (is_default) {
      await (supabase.from("cash_boxes") as any)
        .update({ is_default: false })
        .eq("agency_id", agency_id)
        .eq("is_default", true)
    }

    // Create cash box
    const cashBoxData: Record<string, any> = {
      agency_id,
      name,
      description: description || null,
      box_type,
      currency,
      initial_balance: initial_balance || 0,
      current_balance: initial_balance || 0,
      is_active: is_active !== false,
      is_default: is_default || false,
      notes: notes || null,
      created_by: user.id,
    }

    const { data: cashBox, error } = await (supabase.from("cash_boxes") as any)
      .insert(cashBoxData)
      .select()
      .single()

    if (error) {
      console.error("Error creating cash box:", error)
      return NextResponse.json({ error: "Error al crear caja" }, { status: 500 })
    }

    return NextResponse.json({ cashBox }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/cash-boxes:", error)
    return NextResponse.json({ error: error.message || "Error al crear caja" }, { status: 500 })
  }
}

