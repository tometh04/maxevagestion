import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

/**
 * PATCH /api/admin/orgs/[id]/members/[memberId]
 * Activa / desactiva a un miembro de una org desde el panel de plataforma.
 *
 * Desactivar = users.is_active=false (lib/auth.ts lo redirige a /login en cada
 * request) + ban en Supabase Auth (invalida refresh tokens / bloquea re-login).
 * NO borra la fila ni el auth user: preserva la evidencia/auditoría.
 *
 * Reactivar hace lo inverso (is_active=true + quita el ban).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: orgId, memberId } = await params

  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Campo 'active' (boolean) requerido" }, { status: 400 })
  }
  const active = body.active

  // No permitir que un admin se desactive a sí mismo por accidente.
  if (memberId === user.id && !active) {
    return NextResponse.json(
      { error: "No podés desactivar tu propia cuenta desde acá" },
      { status: 400 },
    )
  }

  const admin = createAdminClient() as any

  // Traer el miembro y verificar que pertenece a esta org (404 enmascarado si no).
  const { data: member } = await admin
    .from("users")
    .select("id, auth_id, email, name, role, is_active, org_id")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 })
  }

  // Actualizar is_active en users.
  const { error: updErr } = await admin
    .from("users")
    .update({ is_active: active })
    .eq("id", memberId)
    .eq("org_id", orgId)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Ban / unban en Supabase Auth para cortar (o restaurar) sesiones.
  let authWarning: string | null = null
  if (member.auth_id) {
    const { error: banErr } = await admin.auth.admin.updateUserById(member.auth_id, {
      ban_duration: active ? "none" : "876000h", // ~100 años
    })
    if (banErr) {
      authWarning = `Usuario ${active ? "reactivado" : "desactivado"} en la app, pero no se pudo ${active ? "quitar el ban" : "banear"} en auth: ${banErr.message}`
    }
  }

  logSecurityEvent({
    eventType: active ? "MEMBER_REACTIVATED_BY_ADMIN" : "MEMBER_DEACTIVATED_BY_ADMIN",
    severity: active ? "INFO" : "WARN",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "users",
    targetEntityId: memberId,
    requestPath: req.url,
    details: {
      email: member.email,
      role: member.role,
      before: { is_active: member.is_active },
      after: { is_active: active },
    },
  })

  return NextResponse.json({ ok: true, active, ...(authWarning ? { warning: authWarning } : {}) })
}
