import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { loadFullAgencyMatrix, CONFIGURABLE_ROLES, buildDefaultMatrix, type ResolvedPermissionsMatrix } from "@/lib/permissions-agency"
import type { UserRole } from "@/lib/permissions"

/**
 * GET /api/settings/permissions?agencyId=xxx
 * Retorna la matriz completa de permisos para la agencia (todos los roles × módulos).
 * Módulos sin registro en DB aparecen con sus valores default estáticos.
 * Guard: solo ADMIN / SUPER_ADMIN / ORG_OWNER.
 */
export async function GET(req: Request) {
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
    if (!agencyId) {
      return NextResponse.json({ error: "agencyId requerido" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Verificar que la agencia pertenece a la org del usuario
    const { data: agency } = await supabase
      .from("agencies")
      .select("id")
      .eq("id", agencyId)
      .eq("org_id", user.org_id)
      .maybeSingle()

    if (!agency) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
    }

    const matrix = await loadFullAgencyMatrix(supabase as any, agencyId, user.org_id)

    // Anotar qué módulos están customizados vs defaults
    const customized: Record<string, string[]> = {}
    for (const role of CONFIGURABLE_ROLES) {
      const defaults = buildDefaultMatrix(role as UserRole)
      const roleMatrix = matrix[role]
      customized[role] = Object.keys(roleMatrix).filter((m) => {
        const d = defaults[m]
        const c = roleMatrix[m]
        return (
          d.read !== c.read ||
          d.write !== c.write ||
          d.delete !== c.delete ||
          d.export !== c.export ||
          d.ownDataOnly !== c.ownDataOnly
        )
      })
    }

    return NextResponse.json({ matrix, customized })
  } catch {
    return NextResponse.json({ error: "Error al cargar permisos" }, { status: 500 })
  }
}

type PermissionPayload = {
  agencyId: string
  role: string
  permissions: Record<string, ResolvedPermissionsMatrix[string]>
}

/**
 * PUT /api/settings/permissions
 * Guarda (upsert) la configuración de permisos para una agencia y rol.
 * Body: { agencyId, role, permissions: { [module]: { read, write, delete, export, ownDataOnly } } }
 * Guard: solo ADMIN / SUPER_ADMIN / ORG_OWNER.
 */
export async function PUT(req: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!["SUPER_ADMIN", "ORG_OWNER", "ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const body = (await req.json()) as PermissionPayload
    const { agencyId, role, permissions } = body

    if (!agencyId || !role || !permissions) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (!CONFIGURABLE_ROLES.includes(role as UserRole)) {
      return NextResponse.json({ error: "Rol no configurable" }, { status: 400 })
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

    const rows = Object.entries(permissions).map(([module, perms]) => ({
      org_id: user.org_id as string,
      agency_id: agencyId,
      role,
      module,
      can_read: perms.read,
      can_write: perms.write,
      can_delete: perms.delete,
      can_export: perms.export,
      own_data_only: perms.ownDataOnly,
    }))

    const { error } = await (supabase as any)
      .from("agency_role_permissions")
      .upsert(rows, { onConflict: "agency_id,role,module" })

    if (error) {
      console.error("[permissions] upsert error:", error)
      return NextResponse.json({ error: "Error al guardar permisos" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Error al guardar permisos" }, { status: 500 })
  }
}
