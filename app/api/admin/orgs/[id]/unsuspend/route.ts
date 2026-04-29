import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id: orgId } = await params

  const admin = createAdminClient() as any

  // Buscar el último TENANT_SUSPENDED para recuperar previous_status.
  const { data: lastSusp } = await admin
    .from("security_audit_log")
    .select("details")
    .eq("event_type", "TENANT_SUSPENDED")
    .eq("target_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const previous = (lastSusp?.details as any)?.previous_status ?? "ACTIVE"

  await admin
    .from("organizations")
    .update({ subscription_status: previous })
    .eq("id", orgId)

  logSecurityEvent({
    eventType: "TENANT_UNSUSPENDED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: { restored_to: previous },
  })

  return NextResponse.json({ ok: true, status: previous })
}
