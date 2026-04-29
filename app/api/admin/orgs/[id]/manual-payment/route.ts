// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/manual-payment/route.ts

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
  const { amount_ars, paid_at, covers_from, covers_to, payment_method, receipt_ref } = body

  if (!amount_ars || amount_ars <= 0 || !paid_at || !covers_from || !covers_to) {
    return NextResponse.json(
      { error: "amount_ars (>0), paid_at, covers_from, covers_to son requeridos" },
      { status: 400 }
    )
  }
  if (new Date(covers_to).getTime() < new Date(covers_from).getTime()) {
    return NextResponse.json({ error: "covers_to debe ser >= covers_from" }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const { data: payment, error } = await admin
    .from("manual_payments")
    .insert({
      org_id: orgId,
      amount_ars,
      paid_at,
      covers_from,
      covers_to,
      payment_method: payment_method ?? null,
      receipt_ref: receipt_ref ?? null,
      registered_by: user.id,
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cargar status actual — no queremos levantar suspensiones o cancelaciones por política
  // con un pago manual. Si el admin suspendió por razones no-de-pago, tiene que desuspender
  // explícitamente antes de que el manual payment surta efecto en el status.
  const { data: orgCurr } = await admin
    .from("organizations")
    .select("subscription_status")
    .eq("id", orgId)
    .maybeSingle()

  const currentStatus = orgCurr?.subscription_status as string | null
  const skipStatusChange = currentStatus === "SUSPENDED" || currentStatus === "CANCELLED"

  const orgUpdatePatch: Record<string, unknown> = {
    current_period_ends_at: new Date(covers_to).toISOString(),
  }
  if (!skipStatusChange) {
    orgUpdatePatch.subscription_status = "ACTIVE"
  }

  const { error: orgErr } = await admin
    .from("organizations")
    .update(orgUpdatePatch)
    .eq("id", orgId)
  if (orgErr) console.error("manual-payment: org update failed:", orgErr)

  logSecurityEvent({
    eventType: "MANUAL_PAYMENT_REGISTERED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "manual_payments",
    targetEntityId: payment.id,
    details: { payment },
  })

  return NextResponse.json({
    ok: true,
    payment,
    status_preserved: skipStatusChange ? currentStatus : null,
  })
}
