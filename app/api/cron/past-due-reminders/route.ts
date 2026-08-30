import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { sendPaymentFailedEmail } from "@/lib/email/email-service"
import { computeDunningStep, dunningIdempotencyKey } from "@/lib/billing/dunning"
import { parseRejectionReason } from "@/lib/billing/rejection-reason"
import { notifyBillingSlack } from "@/lib/billing/slack-notify"
import { logSecurityEvent } from "@/lib/security/audit"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/cron/past-due-reminders
 *
 * Cobranza (dunning) de orgs en PAST_DUE. Corre 1x por día (Railway Cron).
 *
 * Por qué existe: cuando MP rechaza la renovación no reintenta el ciclo caído,
 * lo saltea y reprograma al mes siguiente. El acceso lo cortamos bien (gracia de
 * PAST_DUE_GRACE_DAYS y `current_period_ends_at` sin estirar), pero el único
 * aviso al cliente era un banner adentro de la app: si no entraba durante la
 * gracia se enteraba cuando se le cortaba, y ese mes no se facturaba nunca.
 *
 * Qué hace, por org PAST_DUE:
 *  - dentro de la gracia y en un slot de la cadencia → mail con el MOTIVO real
 *    del rechazo y el link a regularizar.
 *  - agotada la gracia sin pago → escalada a Slack (una sola vez).
 *
 * Idempotencia: `billing_events` es el ledger. Reclamamos el slot con un insert
 * cuyo external_id es único (UNIQUE parcial con event_type) ANTES de mandar el
 * mail; si otra corrida ya lo reclamó, el insert choca con 23505 y salimos. Si
 * el envío falla, liberamos el slot para poder reintentarlo.
 *
 * Cross-tenant por diseño (como el resto de los crons de billing): admin client,
 * pero todo write lleva org_id explícito.
 *
 * Auth: Bearer $CRON_SECRET.
 */
export async function POST(request: Request) {
  const auth = checkCronAuth(request, "past-due-reminders")
  if (!auth.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const now = Date.now()

  const { data: orgs, error } = await admin
    .from("organizations")
    .select(
      "id, name, billing_email, plan, subscription_status, " +
      "current_period_ends_at, agreed_plan_price_ars"
    )
    .eq("subscription_status", "PAST_DUE")
    .not("current_period_ends_at", "is", null)

  if (error) {
    console.error("past-due-reminders: query failed", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const candidates = (orgs ?? []) as Array<{
    id: string
    name: string | null
    billing_email: string | null
    plan: string | null
    current_period_ends_at: string
    agreed_plan_price_ars: number | null
  }>

  let sent = 0
  let escalated = 0
  let failed = 0
  let skipped = 0
  const details: any[] = []

  for (const org of candidates) {
    const step = computeDunningStep({
      currentPeriodEndsAt: org.current_period_ends_at,
      now,
    })

    if (step.action === "none" || step.action === "unknown") {
      skipped++
      continue
    }

    const slotKey = step.action === "expired" ? "expired" : step.slot!
    const eventType = step.action === "expired" ? "PAST_DUE_GRACE_EXPIRED" : "PAST_DUE_REMINDER"
    const externalId = dunningIdempotencyKey(org.id, org.current_period_ends_at, slotKey)

    // Reclamar el slot. Si ya está reclamado (23505), otra corrida lo hizo.
    const claim = await admin
      .from("billing_events")
      .insert({
        org_id: org.id,
        event_type: eventType,
        external_id: externalId,
        status: "pending",
        payload: {
          slot: slotKey,
          days_left: step.daysLeft,
          grace_ends_at: step.graceEndsAt?.toISOString() ?? null,
          current_period_ends_at: org.current_period_ends_at,
        },
      })
      .select("id")
      .single()

    if (claim.error) {
      if (claim.error.code !== "23505") {
        // Un 23514 acá significa que falta el event_type en el CHECK. No lo
        // tragamos: sin el ledger no hay dunning y nadie se entera.
        console.error("past-due-reminders: claim failed", org.id, claim.error)
        failed++
      } else {
        skipped++
      }
      continue
    }

    if (step.action === "expired") {
      notifyBillingSlack({
        event: "BILLING_ALERT",
        orgName: org.name || org.id,
        orgId: org.id,
        amount: org.agreed_plan_price_ars
          ? `$${Number(org.agreed_plan_price_ars).toLocaleString("es-AR")}`
          : undefined,
        details:
          `Se agotó la gracia de PAST_DUE sin pago: el acceso quedó cortado. ` +
          `MP no reintenta el ciclo caído, así que este mes no se factura salvo ` +
          `que el cliente regularice. Contactar.`,
        severity: "error",
      })
      await admin.from("billing_events").update({ status: "processed" }).eq("id", claim.data.id)
      escalated++
      details.push({ org_id: org.id, action: "escalated" })
      continue
    }

    if (!org.billing_email) {
      await admin
        .from("billing_events")
        .update({ status: "skipped_no_email" })
        .eq("id", claim.data.id)
      // Sin mail no hay forma de avisarle: que lo vea un humano.
      notifyBillingSlack({
        event: "BILLING_ALERT",
        orgName: org.name || org.id,
        orgId: org.id,
        details: `Cobro rechazado y la org no tiene billing_email: no se le puede avisar. Contactar a mano (quedan ${step.daysLeft} días de acceso).`,
        severity: "warning",
      })
      skipped++
      continue
    }

    // Motivo real del último rechazo, para que el mail sea accionable.
    const { data: lastRejection } = await admin
      .from("billing_events")
      .select("payload")
      .eq("org_id", org.id)
      .in("event_type", ["PAYMENT_REJECTED", "PAYMENT_MISSED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const reason = parseRejectionReason(lastRejection?.payload?.payment_event?.status_detail)

    const result = await sendPaymentFailedEmail(org.billing_email, org.name || "tu agencia", {
      amountArs: org.agreed_plan_price_ars,
      graceEndsAt: step.graceEndsAt!,
      daysLeft: step.daysLeft,
      reasonLabel: reason?.label ?? null,
      reasonAction: reason?.action ?? null,
    })

    if (result.success) {
      await admin.from("billing_events").update({ status: "processed" }).eq("id", claim.data.id)
      sent++
      details.push({ org_id: org.id, action: "sent", slot: slotKey })
      logSecurityEvent({
        eventType: "past_due_reminder_sent",
        severity: "INFO",
        targetOrgId: org.id,
        targetEntity: "organization",
        targetEntityId: org.id,
        requestPath: "/api/cron/past-due-reminders",
        details: {
          slot: slotKey,
          days_left: step.daysLeft,
          billing_email: org.billing_email,
          reason: reason?.code ?? null,
        },
      })
    } else {
      // Liberar el slot: el mail no salió, queremos poder reintentarlo.
      await admin.from("billing_events").delete().eq("id", claim.data.id)
      failed++
      console.warn("past-due-reminders: send failed", { orgId: org.id, error: result.error })
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent,
    escalated,
    failed,
    skipped,
    details,
  })
}
