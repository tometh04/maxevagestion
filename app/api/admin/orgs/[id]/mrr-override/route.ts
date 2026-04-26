import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params

  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { amount?: unknown }
  try {
    body = (await req.json()) as { amount?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  let amount: number | null
  if (body.amount === null) {
    amount = null
  } else if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    if (body.amount < 0) {
      return NextResponse.json({ error: "amount no puede ser negativo" }, { status: 400 })
    }
    amount = body.amount
  } else {
    return NextResponse.json(
      { error: "amount debe ser number o null" },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  const { data: before } = await (admin.from("organizations") as any)
    .select("manual_mrr_override_ars")
    .eq("id", orgId)
    .maybeSingle()

  if (!before) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  const { data: updated, error } = await (admin.from("organizations") as any)
    .update({ manual_mrr_override_ars: amount })
    .eq("id", orgId)
    .select("manual_mrr_override_ars")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logSecurityEvent({
    eventType: "MRR_OVERRIDE_UPDATED_BY_ADMIN",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    requestPath: req.url,
    details: {
      before: { amount: (before as any).manual_mrr_override_ars ?? null },
      after: { amount: (updated as any).manual_mrr_override_ars ?? null },
    },
  })

  return NextResponse.json({ ok: true, amount: (updated as any).manual_mrr_override_ars })
}
