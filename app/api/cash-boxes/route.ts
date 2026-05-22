import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Bug fix 2026-05-15 (P0 cross-tenant): SUPER_ADMIN bypaseaba el filtro
    // → veía cash boxes de todos los tenants. Scopear siempre por org.
    const userOrgId = (user as any).org_id as string | null
    if (!userOrgId) {
      return NextResponse.json({ cashBoxes: [] })
    }

    // Get user agencies (de SU org)
    const { data: orgAgencies } = await supabase
      .from("agencies")
      .select("id")
      .eq("org_id", userOrgId)
    const orgAgencyIds = (orgAgencies || []).map((a: any) => a.id)

    // Build query — siempre scopear por las agencias de la org
    let query = (supabase.from("cash_boxes") as any)
      .select("*")
      .in("agency_id", orgAgencyIds.length > 0 ? orgAgencyIds : ["00000000-0000-0000-0000-000000000000"])

    // Apply filters
    const agencyId = searchParams.get("agencyId")
    if (agencyId && agencyId !== "ALL" && orgAgencyIds.includes(agencyId)) {
      query = query.eq("agency_id", agencyId)
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

    // Cross-tenant fix (2026-05-18): validar que la agency_id pertenezca al
    // org del user, para evitar que un user de org A cree cash boxes en
    // una agency de org B.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const { data: agencyCheck } = await (supabase.from("agencies") as any)
      .select("id")
      .eq("id", agency_id)
      .eq("org_id", (user as any).org_id)
      .maybeSingle()
    if (!agencyCheck) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
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

