import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Query templates
    let query = (supabase.from("message_templates") as any)
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true })

    // Filtrar: templates globales (agency_id IS NULL) + templates de agencias del usuario
    if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      query = query.or(`agency_id.in.(${agencyIds.join(",")}),agency_id.is.null`)
    }

    // Filtros opcionales
    const category = searchParams.get("category")
    if (category && category !== "ALL") {
      query = query.eq("category", category)
    }

    const isActive = searchParams.get("isActive")
    if (isActive === "true") {
      query = query.eq("is_active", true)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error("Error fetching templates:", error)
      return NextResponse.json({ error: "Error al obtener templates" }, { status: 500 })
    }

    return NextResponse.json({ templates: templates || [] })
  } catch (error: any) {
    console.error("Error in GET /api/whatsapp/templates:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    // Solo ADMIN o SUPER_ADMIN pueden crear templates
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { data: template, error } = await (supabase.from("message_templates") as any)
      .insert({
        ...body,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating template:", error)
      return NextResponse.json({ error: "Error al crear template" }, { status: 500 })
    }

    return NextResponse.json({ success: true, template })
  } catch (error: any) {
    console.error("Error in POST /api/whatsapp/templates:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

