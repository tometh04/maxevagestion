import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { calculateEffectivePrice } from "@/lib/billing/custom-plans"
import { applyPriceChange } from "@/lib/billing/mp-update"
import { logSecurityEvent } from "@/lib/security/audit"

export const dynamic = "force-dynamic"

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return unauthorized()
  const auth = request.headers.get("authorization") ?? ""
  if (auth !== `Bearer ${secret}`) return unauthorized()

  const admin = createAdminClient() as any
  const now = new Date()
  const summary = { expired: 0, notified: 0, errors: [] as string[] }

  // Pasada 1: descuentos vencidos
  const { data: expiredRows } = await admin
    .from("custom_plans")
    .select("*, organizations!inner(id, mp_preapproval_id, billing_email)")
    .lte("discount_ends_at", now.toISOString())
    .gt("discount_percent", 0)

  for (const cp of expiredRows ?? []) {
    try {
      const orgRow = cp.organizations
      const currentEffective = calculateEffectivePrice(
        Number(cp.base_price_ars),
        cp.discount_percent
      )
      const newAmount = Number(cp.base_price_ars)

      let mpResult: any = null
      if (cp.billing_method === "MP" && orgRow.mp_preapproval_id) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
        mpResult = await applyPriceChange({
          preapprovalId: orgRow.mp_preapproval_id,
          currentAmount: currentEffective,
          newAmount,
          recreateParams: {
            orgId: orgRow.id,
            plan: "CUSTOM",
            payerEmail: orgRow.billing_email!,
            backUrl: `${appUrl}/settings/subscription?custom=reauth`,
            customAmount: newAmount,
            customReason: `Vibook — ${cp.display_name}`,
            includeFreeTrial: false,
          },
        })
      }

      await admin
        .from("custom_plans")
        .update({ discount_percent: 0, discount_ends_at: null })
        .eq("id", cp.id)

      if (mpResult?.action === "REAUTH_REQUIRED" && mpResult.newPreapprovalId) {
        await admin
          .from("organizations")
          .update({
            mp_preapproval_id: mpResult.newPreapprovalId,
            subscription_status: "PAST_DUE",
          })
          .eq("id", orgRow.id)
      }

      logSecurityEvent({
        eventType: "CUSTOM_PLAN_DISCOUNT_EXPIRED",
        severity: "INFO",
        actorUserId: null,
        actorAuthId: null,
        targetOrgId: orgRow.id,
        targetEntity: "custom_plans",
        targetEntityId: cp.id,
        details: { currentEffective, newAmount, mpResult },
      })
      summary.expired++
    } catch (err: any) {
      summary.errors.push(`cp=${cp.id}: ${err.message}`)
    }
  }

  // Pasada 2: notificación preventiva (7 días antes)
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const { data: upcomingRows } = await admin
    .from("custom_plans")
    .select("*, organizations!inner(id, billing_email)")
    .gt("discount_ends_at", now.toISOString())
    .lte("discount_ends_at", weekAhead.toISOString())
    .gt("discount_percent", 0)

  for (const cp of upcomingRows ?? []) {
    // Check si ya se notificó en los últimos 14 días
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data: priorNotice } = await admin
      .from("security_audit_log")
      .select("id")
      .eq("event_type", "CUSTOM_PLAN_DISCOUNT_EXPIRY_NOTICE_SENT")
      .eq("target_org_id", cp.organizations.id)
      .gte("created_at", twoWeeksAgo)
      .maybeSingle()
    if (priorNotice) continue

    // TODO Resend integration — por ahora loguear en audit (Resend es Prio 3b).
    logSecurityEvent({
      eventType: "CUSTOM_PLAN_DISCOUNT_EXPIRY_NOTICE_SENT",
      severity: "INFO",
      actorUserId: null,
      actorAuthId: null,
      targetOrgId: cp.organizations.id,
      targetEntity: "custom_plans",
      targetEntityId: cp.id,
      details: {
        discount_ends_at: cp.discount_ends_at,
        base_price_ars: cp.base_price_ars,
        billing_email: cp.organizations.billing_email,
        note: "Resend no integrado aún — notificación solo logueada. Avisar manualmente por WA/email.",
      },
    })
    summary.notified++
  }

  return NextResponse.json({ ok: true, ...summary })
}
