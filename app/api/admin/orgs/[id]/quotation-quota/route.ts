import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { getQuotationQuotaUsage } from "@/lib/quotation-quota/server"
import { logSecurityEvent } from "@/lib/security/audit"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

const overrideSchema = z.object({
  action: z.literal("override"),
  included_documents: z.number().int().min(0).max(1_000_000),
  enforcement_enabled: z.boolean(),
}).strict()
const grantSchema = z.object({
  action: z.literal("grant"),
  units: z.number().int().positive().max(1_000_000),
  reason: z.string().trim().min(3).max(500),
}).strict()

async function requirePlatformAdmin() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  return { user, ok: await isPlatformAdmin(supabase, user.id) }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ok } = await requirePlatformAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Organización inválida" }, { status: 400 })
  }
  const admin = createAdminClient() as any
  const [{ data: override }, usage] = await Promise.all([
    admin.from("quotation_quota_org_overrides").select("*").eq("org_id", id).maybeSingle(),
    getQuotationQuotaUsage(admin, id),
  ])
  return NextResponse.json({ override, usage })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, ok } = await requirePlatformAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id: orgId } = await params
  if (!z.string().uuid().safeParse(orgId).success) {
    return NextResponse.json({ error: "Organización inválida" }, { status: 400 })
  }
  const parsed = z.union([overrideSchema, grantSchema]).safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
  }
  const admin = createAdminClient() as any
  const { data: org } = await admin.from("organizations").select("id").eq("id", orgId).maybeSingle()
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 })

  if (parsed.data.action === "override") {
    await getQuotationQuotaUsage(admin, orgId)
    const { data: previous } = await admin
      .from("quotation_quota_org_overrides")
      .select("enforcement_enabled, enforce_from")
      .eq("org_id", orgId)
      .maybeSingle()
    const enforceFrom = parsed.data.enforcement_enabled
      ? previous?.enforcement_enabled && previous?.enforce_from
        ? previous.enforce_from
        : new Date().toISOString()
      : null
    const { error } = await admin.from("quotation_quota_org_overrides").upsert({
      org_id: orgId,
      included_documents: parsed.data.included_documents,
      enforcement_enabled: parsed.data.enforcement_enabled,
      enforce_from: enforceFrom,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "org_id" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await admin.rpc("grant_manual_quotation_credits", {
      p_org_id: orgId,
      p_units: parsed.data.units,
      p_reason: parsed.data.reason,
      p_actor_id: user.id,
    })
    if (error) {
      const status = error.code === "55000" ? 409 : 500
      return NextResponse.json({
        error: status === 409
          ? "La organización no tiene un cupo de cotizaciones activo"
          : "No se pudieron acreditar los créditos",
      }, { status })
    }
  }

  logSecurityEvent({
    eventType: parsed.data.action === "grant"
      ? "QUOTATION_CREDITS_GRANTED_MANUALLY"
      : "QUOTATION_QUOTA_ORG_OVERRIDE_UPDATED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: user.auth_id,
    targetOrgId: orgId,
    targetEntity: parsed.data.action === "grant"
      ? "quotation_credit_movements"
      : "quotation_quota_org_overrides",
    targetEntityId: orgId,
    details: parsed.data,
  })
  revalidatePath(`/admin/orgs/${orgId}`)
  return NextResponse.json({ ok: true })
}
