import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

function normalizeCode(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
}

export async function GET() {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data, error } = await ((supabase as any).from("lead_regions"))
      .select("*")
      .eq("org_id", user.org_id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Error fetching lead_regions:", error)
      return NextResponse.json({ error: "Error al cargar regiones" }, { status: 500 })
    }

    return NextResponse.json({ regions: data || [] })
  } catch (error) {
    console.error("Error in GET /api/settings/lead-regions:", error)
    return NextResponse.json({ error: "Error al cargar regiones" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN" && user.role !== "ORG_OWNER") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const body = await request.json()
    const name = (body?.name ?? "").toString().trim()
    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })
    }

    const code = body?.code ? normalizeCode(body.code.toString()) : normalizeCode(name)
    if (!code) {
      return NextResponse.json({ error: "El código es inválido" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Calcular position al final
    const { data: maxRow } = await ((supabase as any).from("lead_regions"))
      .select("position")
      .eq("org_id", user.org_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextPosition = ((maxRow?.position as number | undefined) ?? -1) + 1

    const { data, error } = await ((supabase as any).from("lead_regions"))
      .insert({
        org_id: user.org_id,
        code,
        name,
        position: nextPosition,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      if ((error as any).code === "23505") {
        return NextResponse.json({ error: "Ya existe una región con ese código" }, { status: 409 })
      }
      console.error("Error creating lead_region:", error)
      return NextResponse.json({ error: "Error al crear región" }, { status: 500 })
    }

    return NextResponse.json({ region: data })
  } catch (error) {
    console.error("Error in POST /api/settings/lead-regions:", error)
    return NextResponse.json({ error: "Error al crear región" }, { status: 500 })
  }
}
