import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Build query
    let query = (supabase.from("quotas") as any)
      .select(`
        *,
        operators:operator_id(id, name),
        tariffs:tariff_id(id, name, destination)
      `)

    // Apply filters
    const operatorId = searchParams.get("operatorId")
    if (operatorId) {
      query = query.eq("operator_id", operatorId)
    }

    const tariffId = searchParams.get("tariffId")
    if (tariffId) {
      query = query.eq("tariff_id", tariffId)
    }

    const destination = searchParams.get("destination")
    if (destination) {
      query = query.ilike("destination", `%${destination}%`)
    }

    const dateFrom = searchParams.get("dateFrom")
    if (dateFrom) {
      query = query.gte("date_to", dateFrom)
    }

    const dateTo = searchParams.get("dateTo")
    if (dateTo) {
      query = query.lte("date_from", dateTo)
    }

    const isActive = searchParams.get("isActive")
    if (isActive === "true") {
      query = query.eq("is_active", true)
    }

    const availableOnly = searchParams.get("availableOnly")
    if (availableOnly === "true") {
      query = query.gt("available_quota", 0)
    }

    const { data: quotas, error } = await query.order("date_from", { ascending: true })

    if (error) {
      console.error("Error fetching quotas:", error)
      return NextResponse.json({ error: "Error al obtener cupos" }, { status: 500 })
    }

    return NextResponse.json({ quotas: quotas || [] })
  } catch (error: any) {
    console.error("Error in GET /api/quotas:", error)
    return NextResponse.json({ error: error.message || "Error al obtener cupos" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear cupos" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const {
      tariff_id,
      operator_id,
      destination,
      accommodation_name,
      room_type,
      date_from,
      date_to,
      total_quota,
      is_active,
      notes,
    } = body

    // Validate required fields
    if (!operator_id || !destination || !date_from || !date_to || total_quota === undefined) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Create quota
    const quotaData: Record<string, any> = {
      tariff_id: tariff_id || null,
      operator_id,
      destination,
      accommodation_name: accommodation_name || null,
      room_type: room_type || null,
      date_from,
      date_to,
      total_quota,
      reserved_quota: 0,
      is_active: is_active !== false,
      notes: notes || null,
      created_by: user.id,
    }

    const { data: quota, error } = await (supabase.from("quotas") as any)
      .insert(quotaData)
      .select()
      .single()

    if (error) {
      console.error("Error creating quota:", error)
      return NextResponse.json({ error: "Error al crear cupo" }, { status: 500 })
    }

    return NextResponse.json({ quota }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/quotas:", error)
    return NextResponse.json({ error: error.message || "Error al crear cupo" }, { status: 500 })
  }
}

