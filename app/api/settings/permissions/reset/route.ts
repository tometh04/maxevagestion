import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { CONFIGURABLE_ROLES } from "@/lib/permissions-agency"
import type { UserRole } from "@/lib/permissions"

/**
 * DELETE /api/settings/permissions/reset?agencyId=xxx[&role=yyy]
 * Elimina los registros personalizados de permisos, volviendo a los defaults estáticos.
 * - Con role: solo resetea ese rol en la agencia
 * - Sin role: resetea todos los roles de la agencia
 * Guard: solo ADMIN / SUPER_ADMIN / ORG_OWNER.
 */
export async function DELETE(req: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!["SUPER_ADMIN", "ORG_OWNER", "ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const agencyId = searchParams.get("agencyId")
    const role = searchParams.get("role")

    if (!agencyId) {
      return NextResponse.json({ error: "agencyId requerido" }, { status: 400 })
    }

    if (role && !CONFIGURABLE_ROLES.includes(role as UserRole)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Verificar que la agencia pertenece a la org del usuario (multi-tenant)
    const { data: agency } = await supabase
      .from("agencies")
      .select("id")
      .eq("id", agencyId)
      .eq("org_id", user.org_id)
      .maybeSingle()

    if (!agency) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
    }

    let query = (supabase as any)
      .from("agency_role_permissions")
      .delete()
      .eq("agency_id", agencyId)
      .eq("org_id", user.org_id)

    if (role) {
      query = query.eq("role", role)
    }

    const { error } = await query

    if (error) {
      console.error("[permissions] reset error:", error)
      return NextResponse.json({ error: "Error al resetear permisos" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Error al resetear permisos" }, { status: 500 })
  }
}
