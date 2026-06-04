import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

interface RouteContext {
  params: Promise<{ id: string }>
}

async function ensureAdmin() {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return { error: NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 }) }
  }
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN" && user.role !== "ORG_OWNER") {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) }
  }
  return { user }
}

export async function PATCH(request: Request, ctx: RouteContext) {
  try {
    const auth = await ensureAdmin()
    if ("error" in auth) return auth.error
    const { user } = auth
    const { id } = await ctx.params

    const body = await request.json()
    const updates: Record<string, any> = {}
    if (typeof body?.name === "string") {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: "El nombre no puede estar vacío" }, { status: 400 })
      updates.name = name
    }
    if (typeof body?.is_active === "boolean") {
      updates.is_active = body.is_active
    }
    if (typeof body?.position === "number" && Number.isFinite(body.position)) {
      updates.position = Math.trunc(body.position)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data, error } = await ((supabase as any).from("lead_regions"))
      .update(updates)
      .eq("id", id)
      .eq("org_id", user.org_id)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Región no encontrada" }, { status: 404 })
    }

    return NextResponse.json({ region: data })
  } catch (error) {
    console.error("Error in PATCH /api/settings/lead-regions/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar región" }, { status: 500 })
  }
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  try {
    const auth = await ensureAdmin()
    if ("error" in auth) return auth.error
    const { user } = auth
    const { id } = await ctx.params

    const supabase = await createServerClient()

    // Validar pertenencia y obtener code antes de borrar
    const { data: region } = await ((supabase as any).from("lead_regions"))
      .select("id, code")
      .eq("id", id)
      .eq("org_id", user.org_id)
      .maybeSingle()
    if (!region) {
      return NextResponse.json({ error: "Región no encontrada" }, { status: 404 })
    }

    // Si hay leads usando este code, no permitir delete — sugerir desactivar.
    const { count } = await (supabase.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.org_id)
      .eq("region", region.code)

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar: ${count} lead${count === 1 ? "" : "s"} usan esta región. Desactivala para ocultarla del CRM sin perder los datos históricos.`,
        },
        { status: 409 },
      )
    }

    const { error } = await ((supabase as any).from("lead_regions"))
      .delete()
      .eq("id", id)
      .eq("org_id", user.org_id)

    if (error) {
      console.error("Error deleting lead_region:", error)
      return NextResponse.json({ error: "Error al eliminar región" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/settings/lead-regions/[id]:", error)
    return NextResponse.json({ error: "Error al eliminar región" }, { status: 500 })
  }
}
