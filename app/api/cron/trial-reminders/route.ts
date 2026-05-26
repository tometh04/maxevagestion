import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { sendTrialExpiringEmail } from "@/lib/email/email-service"
import { logSecurityEvent } from "@/lib/security/audit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/cron/trial-reminders
 *
 * Recordatorio de trial por vencer. Pensado para correr 1 vez al día
 * (Railway Cron Service). Encuentra orgs en estado TRIAL cuya
 * trial_ends_at cae en los próximos 2 días y les manda un email
 * recordándoles que conecten MP / elijan plan.
 *
 * Idempotencia: agregamos un flag `trial_reminder_sent_at` (timestamp
 * del último envío) en organizations para no spamear si el cron corre
 * múltiples veces el mismo día. Solo enviamos si el último envío fue
 * hace >12hs O nunca.
 *
 * Auth: Bearer $CRON_SECRET (mismo patrón que los otros 8 crons).
 */
export async function POST(request: Request) {
  const auth = checkCronAuth(request, "trial-reminders")
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const now = new Date()
  const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString()

  // Orgs en TRIAL cuyo trial vence en las próximas 48h y que no fueron
  // notificadas en las últimas 12h.
  // OR sintaxis Postgrest: trial_reminder_sent_at IS NULL OR < hace 12h.
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, billing_email, trial_ends_at, trial_reminder_sent_at")
    .in("subscription_status", ["TRIAL", "TRIALING"])
    .gte("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", inTwoDays.toISOString())
    .or(`trial_reminder_sent_at.is.null,trial_reminder_sent_at.lt.${twelveHoursAgo}`)

  if (error) {
    console.error("trial-reminders: query failed", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const candidates = (orgs || []) as Array<{
    id: string
    name: string
    billing_email: string | null
    trial_ends_at: string
    trial_reminder_sent_at: string | null
  }>

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const org of candidates) {
    if (!org.billing_email) {
      skipped++
      continue
    }

    const trialEnds = new Date(org.trial_ends_at)
    const daysLeft = Math.max(1, Math.ceil((trialEnds.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))

    const result = await sendTrialExpiringEmail(
      org.billing_email,
      org.name,
      trialEnds,
      daysLeft
    )

    if (result.success) {
      // Marcar enviado para no spamear
      await admin
        .from("organizations")
        .update({ trial_reminder_sent_at: now.toISOString() })
        .eq("id", org.id)
      sent++

      logSecurityEvent({
        eventType: "trial_reminder_sent",
        severity: "INFO",
        targetOrgId: org.id,
        targetEntity: "organization",
        targetEntityId: org.id,
        details: { days_left: daysLeft, billing_email: org.billing_email },
      })
    } else {
      failed++
      console.warn("trial-reminders: send failed", { orgId: org.id, error: result.error })
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent,
    failed,
    skipped,
  })
}
