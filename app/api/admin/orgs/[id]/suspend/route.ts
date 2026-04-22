import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

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
    .select("subscription_status")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  await admin
    .from("organizations")
    .update({ subscription_status: "SUSPENDED" })
    .eq("id", orgId)

  logSecurityEvent({
    eventType: "TENANT_SUSPENDED",
    severity: "WARN",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: { reason: body.reason ?? null, previous_status: org.subscription_status },
  })

  return NextResponse.json({ ok: true })
}
