import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { cancelPreapproval } from "@/lib/billing/mercadopago"

/**
 * POST /api/billing/cancel
 *
 * Cancela la suscripción activa:
 *  1. PUT MP /preapproval/{id} status=cancelled
 *  2. DB: subscription_status = CANCELLED, freeze current_period_ends_at
 *  3. Log billing_events SUBSCRIPTION_CANCELLED_BY_USER
 *
 * Usuario mantiene acceso hasta current_period_ends_at. Para TRIALING,
 * freezeamos a trial_ends_at. Para ACTIVE/PAST_DUE, el current_period_ends_at
 * ya es el correcto (= next_payment_date o el último valor conocido).
 *
 * Auth: solo roles OWNER/SUPER_ADMIN/ADMIN del tenant.
 */
export async function POST() {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const role = (user as any).role
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // adminDb justificado (caso C billing): organizations + billing_events
  // están escritas por webhooks de MP también. El UPDATE acotado por
  // user.org_id (anti-forge) — no aceptamos org_id del body.
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, subscription_status, mp_preapproval_id, current_period_ends_at, trial_ends_at")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 })

  if (org.subscription_status === "CANCELLED") {
    return NextResponse.json({ ok: true, already_cancelled: true })
  }

  if (!org.mp_preapproval_id) {
    // Sin preapproval activo (PENDING_PAYMENT) — marcamos CANCELLED sin pasar por MP.
    await admin.from("organizations")
      .update({ subscription_status: "CANCELLED" })
      .eq("id", user.org_id)
    return NextResponse.json({ ok: true, no_mp_preapproval: true })
  }

  try {
    await cancelPreapproval(org.mp_preapproval_id)
  } catch (err: any) {
    console.error("cancel: MP failed", err?.message)
    return NextResponse.json(
      { error: `No se pudo cancelar en MercadoPago: ${err?.message}` },
      { status: 502 }
    )
  }

  // Freeze del fin de período: TRIALING usa trial_ends_at, resto usa el valor actual.
  const frozenPeriodEnd =
    org.subscription_status === "TRIALING" && org.trial_ends_at
      ? org.trial_ends_at
      : org.current_period_ends_at

  await admin
    .from("organizations")
    .update({
      subscription_status: "CANCELLED",
      current_period_ends_at: frozenPeriodEnd,
    })
    .eq("id", user.org_id)

  await admin.from("billing_events").insert({
    org_id: user.org_id,
    event_type: "SUBSCRIPTION_CANCELLED_BY_USER",
    external_id: org.mp_preapproval_id,
    payload: {
      cancelled_by_user_id: user.id,
      previous_status: org.subscription_status,
      frozen_period_end: frozenPeriodEnd,
    },
  })

  return NextResponse.json({
    ok: true,
    current_period_ends_at: frozenPeriodEnd,
  })
}
