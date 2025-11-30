import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const type = searchParams.get("type") // SELLER | AGENCY
    const agencyId = searchParams.get("agencyId")

    let query = supabase.from("commission_rules").select("*").order("valid_from", { ascending: false })

    if (type) {
      query = query.eq("type", type)
    }

    if (agencyId) {
      query = query.eq("agency_id", agencyId)
    }

    const { data: rules, error } = await query

    if (error) {
      console.error("Error fetching commission rules:", error)
      return NextResponse.json({ error: "Error al obtener reglas de comisión" }, { status: 500 })
    }

    return NextResponse.json({ rules: rules || [] })
  } catch (error) {
    console.error("Error in GET /api/settings/commissions:", error)
    return NextResponse.json({ error: "Error al obtener reglas de comisión" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { type, basis, value, destination_region, agency_id, valid_from, valid_to } = body

    if (!type || !basis || value === undefined || !valid_from) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    const ruleData: Record<string, any> = {
      type,
      basis,
      value: Number(value),
      valid_from,
      valid_to: valid_to || null,
      destination_region: destination_region || null,
      agency_id: agency_id || null,
    }

    const { data: rule, error } = await (supabase.from("commission_rules") as any).insert(ruleData).select().single()

    if (error) {
      console.error("Error creating commission rule:", error)
      return NextResponse.json({ error: "Error al crear regla de comisión" }, { status: 500 })
    }

    return NextResponse.json({ rule })
  } catch (error) {
    console.error("Error in POST /api/settings/commissions:", error)
    return NextResponse.json({ error: "Error al crear regla de comisión" }, { status: 500 })
  }
}

