import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { parsearCamposDelModal } from "@/lib/announcements/modal-payload"

const VALID_TYPES = ["NEW", "IMPROVEMENT", "FIX"]

// PATCH /api/admin/announcements/[id] — editar / publicar / despublicar.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const update: Record<string, unknown> = {}
  if (typeof body.title === "string") update.title = body.title.trim()
  if (typeof body.body === "string") update.body = body.body.trim()
  if (VALID_TYPES.includes(body.type)) update.type = body.type
  if (typeof body.published === "boolean") update.published = body.published

  // Los campos del modal se aplican solo si el cliente los mandó.
  //
  // El PATCH es parcial y el botón de publicar/despublicar del panel manda
  // únicamente `{ published }`. Si se aplicaran siempre, cada vez que alguien
  // despublica y vuelve a publicar una novedad se le borraría la ventana, los
  // roles y el botón sin que nadie lo pidiera.
  if ("modal" in body) {
    const modal = parsearCamposDelModal(body)
    if (!modal.ok) {
      return NextResponse.json({ error: modal.error }, { status: 400 })
    }
    Object.assign(update, modal.campos)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const { data, error } = await admin
    .from("announcements")
    .update(update)
    .eq("id", id)
    .select("id, title, body, type, published, published_at")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "Novedad no existe" }, { status: 404 })
  }

  logSecurityEvent({
    eventType: "ANNOUNCEMENT_UPDATED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetEntity: "announcements",
    targetEntityId: id,
    details: update,
  })

  return NextResponse.json({ announcement: data })
}

// DELETE /api/admin/announcements/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const admin = createAdminClient() as any
  const { error } = await admin.from("announcements").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logSecurityEvent({
    eventType: "ANNOUNCEMENT_DELETED",
    severity: "WARN",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetEntity: "announcements",
    targetEntityId: id,
  })

  return NextResponse.json({ ok: true })
}
