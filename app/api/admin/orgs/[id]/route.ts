import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

const VALID_PLANS = ["STARTER", "PRO", "ENTERPRISE"]
const VALID_STATUS = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const isAdmin = await isPlatformAdmin(supabase, user.id)
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const update: Record<string, any> = {}
  if (body.plan !== undefined) {
    if (!VALID_PLANS.includes(body.plan)) {
      return NextResponse.json({ error: `plan debe ser uno de ${VALID_PLANS.join(", ")}` }, { status: 400 })
    }
    update.plan = body.plan
  }
  if (body.subscription_status !== undefined) {
    if (!VALID_STATUS.includes(body.subscription_status)) {
      return NextResponse.json({ error: `status debe ser uno de ${VALID_STATUS.join(", ")}` }, { status: 400 })
    }
    update.subscription_status = body.subscription_status
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
  }

  // Platform admin legítimo cross-org — usamos admin client con whitelist.
  const admin = createAdminClient() as any
  const { data: before } = await admin
    .from("organizations")
    .select("plan, subscription_status")
    .eq("id", id)
    .maybeSingle()

  const { error } = await admin.from("organizations").update(update).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logSecurityEvent({
    eventType: "TENANT_PLAN_CHANGE",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: id,
    targetEntity: "organizations",
    targetEntityId: id,
    details: { before, after: update },
  })

  return NextResponse.json({ ok: true })
}
