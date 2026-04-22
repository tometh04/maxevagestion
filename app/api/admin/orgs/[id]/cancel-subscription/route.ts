import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { cancelPreapproval } from "@/lib/billing/mercadopago"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id: orgId } = await params
  const body = await request.json().catch(() => ({}))

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("mp_preapproval_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  if (org.mp_preapproval_id) {
    try {
      await cancelPreapproval(org.mp_preapproval_id)
    } catch (err) {
      console.warn("cancelPreapproval falló (continuando cancel):", err)
    }
  }

  const graceEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await admin
    .from("organizations")
    .update({
      subscription_status: "CANCELLED",
      grace_period_ends_at: graceEnds,
      mp_preapproval_id: null,
    })
    .eq("id", orgId)

  logSecurityEvent({
    eventType: "SUBSCRIPTION_CANCELLED_BY_ADMIN",
    severity: "WARN",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: { reason: body.reason ?? null, grace_ends: graceEnds },
  })

  return NextResponse.json({ ok: true, grace_period_ends_at: graceEnds })
}
