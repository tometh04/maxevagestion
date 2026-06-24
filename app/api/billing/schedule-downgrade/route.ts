import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { notifyBillingSlack } from "@/lib/billing/slack-notify"
import { validateScheduleDowngrade } from "@/lib/billing/scheduled-downgrade"

/**
 * POST /api/billing/schedule-downgrade
 * Body: { targetPlan: "PRO" }
 *
 * Programa la baja a PRO de una org Enterprise al fin del período pagado.
 * NO cambia plan/status/límites ni toca MercadoPago — solo marca la intención:
 *   scheduled_plan = "PRO"
 *   scheduled_plan_effective_at = current_period_ends_at
 * El cron apply-scheduled-downgrades aplica el cambio cuando vence el período.
 *
 * Auth: solo SUPER_ADMIN/ADMIN del tenant. Scopeado por user.org_id (anti-forge,
 * nunca acepta org_id del body), como /api/billing/cancel.
 *
 * DELETE /api/billing/schedule-downgrade
 * Deshace el downgrade programado mientras el período siga vigente.
 */
export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const role = (user as any).role

  const body = await request.json().catch(() => ({}))
  const targetPlan = body?.targetPlan

  // adminDb justificado (caso C billing): organizations + billing_events están
  // escritas por webhooks de MP también. El UPDATE acotado por user.org_id
  // (anti-forge) — no aceptamos org_id del body.
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select(
      "id, name, plan, subscription_status, custom_plan_id, current_period_ends_at, scheduled_plan"
    )
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 })

  const result = validateScheduleDowngrade(org, role, targetPlan)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  if (result.alreadyScheduled) {
    return NextResponse.json({
      ok: true,
      already_scheduled: true,
      scheduled_plan: "PRO",
      scheduled_plan_effective_at: result.effectiveAt,
    })
  }

  // UPDATE guardado por subscription_status=ACTIVE (anti-race): si el estado
  // cambió entre el SELECT y acá (webhook concurrente), no programamos.
  const { data: updated, error: updateErr } = await admin
    .from("organizations")
    .update({
      scheduled_plan: "PRO",
      scheduled_plan_effective_at: result.effectiveAt,
    })
    .eq("id", user.org_id)
    .eq("subscription_status", "ACTIVE")
    .select("id")

  if (updateErr) {
    console.error("schedule-downgrade: update failed", updateErr.message)
    return NextResponse.json({ error: "No se pudo programar el downgrade" }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "El estado de tu suscripción cambió. Recargá e intentá de nuevo." },
      { status: 409 }
    )
  }

  await admin.from("billing_events").insert({
    org_id: user.org_id,
    event_type: "DOWNGRADE_SCHEDULED",
    payload: {
      scheduled_by_user_id: user.id,
      from_plan: org.plan,
      to_plan: "PRO",
      effective_at: result.effectiveAt,
      had_custom_plan: !!org.custom_plan_id,
    },
  })

  // Alerta a ventas: una cuenta Enterprise se va a PRO (churn/MRR).
  notifyBillingSlack({
    event: "BILLING_ALERT",
    orgName: org.name,
    orgId: org.id,
    details: `Downgrade Enterprise→PRO programado para el ${result.effectiveAt}. La cuenta sigue en Enterprise hasta esa fecha.`,
    severity: "warning",
  })

  return NextResponse.json({
    ok: true,
    scheduled_plan: "PRO",
    scheduled_plan_effective_at: result.effectiveAt,
  })
}

export async function DELETE() {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const role = (user as any).role
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, scheduled_plan, scheduled_plan_effective_at")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 })

  if (!org.scheduled_plan) {
    return NextResponse.json({ ok: true, not_scheduled: true })
  }

  // Solo se puede deshacer mientras el período Enterprise siga vigente. Si ya
  // venció (el cron aplicó o está por aplicar el cambio) → 409.
  if (
    org.scheduled_plan_effective_at &&
    new Date(org.scheduled_plan_effective_at).getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { error: "El downgrade ya se aplicó o está en proceso." },
      { status: 409 }
    )
  }

  const { data: updated, error: updateErr } = await admin
    .from("organizations")
    .update({ scheduled_plan: null, scheduled_plan_effective_at: null })
    .eq("id", user.org_id)
    .not("scheduled_plan", "is", null)
    .select("id")

  if (updateErr) {
    console.error("schedule-downgrade DELETE: update failed", updateErr.message)
    return NextResponse.json({ error: "No se pudo deshacer el downgrade" }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ ok: true, not_scheduled: true })
  }

  await admin.from("billing_events").insert({
    org_id: user.org_id,
    event_type: "DOWNGRADE_CANCELLED",
    payload: { cancelled_by_user_id: user.id },
  })

  return NextResponse.json({ ok: true, reverted: true })
}
