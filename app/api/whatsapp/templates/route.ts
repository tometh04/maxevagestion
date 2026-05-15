import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Bug fix 2026-05-15 (P0 cross-tenant): SUPER_ADMIN bypaseaba el filtro
    // → veía templates de otros tenants. Scopear por agencias de la org.
    const userOrgId = (user as any).org_id as string | null
    if (!userOrgId) {
      return NextResponse.json({ templates: [] })
    }

    const { data: orgAgencies } = await supabase
      .from("agencies")
      .select("id")
      .eq("org_id", userOrgId)
    const orgAgencyIds = (orgAgencies || []).map((a: any) => a.id)

    // Query templates
    let query = (supabase.from("message_templates") as any)
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true })

    // Filtrar: templates de agencias de la org + templates globales (agency_id NULL)
    if (orgAgencyIds.length > 0) {
      query = query.or(`agency_id.in.(${orgAgencyIds.join(",")}),agency_id.is.null`)
    } else {
      // Sin agencias en la org → solo globales
      query = query.is("agency_id", null)
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

