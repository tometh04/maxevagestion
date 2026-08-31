import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { parsearCamposDelModal } from "@/lib/announcements/modal-payload"

const VALID_TYPES = ["NEW", "IMPROVEMENT", "FIX"] as const

// GET /api/admin/announcements — lista todas (publicadas y no) para el panel admin.
export async function GET() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const admin = createAdminClient() as any
  const { data, error } = await admin
    .from("announcements")
    .select("id, title, body, type, published, published_at, created_at, updated_at, modal, modal_starts_at, modal_ends_at, modal_roles, modal_cta_label, modal_cta_href")
    .order("published_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ announcements: data || [] })
}

// POST /api/admin/announcements — crear una novedad.
export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const text = typeof body.body === "string" ? body.body.trim() : ""
  const type = VALID_TYPES.includes(body.type) ? body.type : "NEW"
  const published = body.published !== false

  if (!title || !text) {
    return NextResponse.json({ error: "Título y texto son obligatorios" }, { status: 400 })
  }

  const modal = parsearCamposDelModal(body)
  if (!modal.ok) {
    return NextResponse.json({ error: modal.error }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const { data, error } = await admin
    .from("announcements")
    .insert({ title, body: text, type, published, created_by: user.id, ...modal.campos })
    .select("id, title, body, type, published, published_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logSecurityEvent({
    eventType: "ANNOUNCEMENT_PUBLISHED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetEntity: "announcements",
    targetEntityId: data.id,
    details: { title, type, published },
  })

  return NextResponse.json({ announcement: data })
}
