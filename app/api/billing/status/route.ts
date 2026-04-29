import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * GET /api/billing/status
 * Devuelve el estado de suscripción del org del user autenticado.
 * Usado por el polling de /onboarding/billing/return.
 */
export async function GET() {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select(
      "subscription_status, current_period_ends_at, trial_ends_at, " +
      "mp_preapproval_id, plan, has_used_trial"
    )
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: "org not found" }, { status: 404 })
  }

  return NextResponse.json({
    status: org.subscription_status,
    current_period_ends_at: org.current_period_ends_at,
    trial_ends_at: org.trial_ends_at,
    has_preapproval: !!org.mp_preapproval_id,
    plan: org.plan,
    has_used_trial: org.has_used_trial,
  })
}
