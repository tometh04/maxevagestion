import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { cancelPreapproval } from "@/lib/billing/mercadopago"
import { notifyBillingSlack } from "@/lib/billing/slack-notify"
import { buildDowngradeUpdate } from "@/lib/billing/scheduled-downgrade"
import { checkCronAuth } from "@/lib/cron/auth"

export const dynamic = "force-dynamic"

/**
 * POST /api/cron/apply-scheduled-downgrades
 *
 * Aplica los downgrades Enterprise→PRO programados cuyo período ya venció.
 * Por cada org con scheduled_plan IS NOT NULL AND scheduled_plan_effective_at <= now:
 *   1. Cancela el preapproval Enterprise en MP (si existe), best-effort.
 *   2. UPDATE atómico (guardado por scheduled_plan='PRO', anti-race con un
 *      "deshacer" concurrente): plan=PRO + límites PRO, custom_plan_id=null,
 *      mp_preapproval_id=null, status=PAST_DUE, congela current_period_ends_at,
 *      limpia las columnas de scheduling.
 *   3. El row de custom_plans se conserva (queda huérfano para auditoría/re-upgrade).
 *
 * Tras esto la org cae en el flujo PAST_DUE → "Regularizar pago" del PRO.
 *
 * Auth: Bearer CRON_SECRET (Railway Cron Service).
 */
export async function POST(request: Request) {
  const auth = checkCronAuth(request, "apply-scheduled-downgrades")
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const now = new Date()
  const summary = { applied: 0, skipped: 0, errors: [] as string[] }

  const { data: dueRows } = await admin
    .from("organizations")
    .select(
      "id, name, plan, subscription_status, custom_plan_id, mp_preapproval_id, current_period_ends_at, scheduled_plan_effective_at"
    )
    .not("scheduled_plan", "is", null)
    .lte("scheduled_plan_effective_at", now.toISOString())

  for (const org of dueRows ?? []) {
    try {
      // 1. Cancelar el preapproval Enterprise en MP (best-effort, no bloqueante).
      if (org.mp_preapproval_id) {
        try {
          await cancelPreapproval(org.mp_preapproval_id)
        } catch (err: any) {
          // Si ya estaba cancelado o no existe, seguimos igual (el nuevo PRO se
          // crea al regularizar). Mismo patrón que checkout regularize.
          console.warn(
            `[apply-scheduled-downgrades] cancel preapproval failed (non-blocking) org=${org.id}:`,
            err?.message
          )
        }
      }

      // 2. UPDATE atómico guardado por scheduled_plan='PRO' (anti-race con DELETE).
      const update = buildDowngradeUpdate(org)
      const { data: updated, error: updateErr } = await admin
        .from("organizations")
        .update(update)
        .eq("id", org.id)
        .eq("scheduled_plan", "PRO")
        .select("id")

      if (updateErr) {
        throw new Error(`org update failed: ${updateErr.message}`)
      }
      if (!updated || updated.length === 0) {
        // El downgrade fue deshecho concurrentemente entre el SELECT y el UPDATE.
        summary.skipped++
        continue
      }

      await admin.from("billing_events").insert({
        org_id: org.id,
        event_type: "DOWNGRADE_APPLIED",
        external_id: org.mp_preapproval_id,
        payload: {
          from_plan: org.plan,
          to_plan: "PRO",
          cancelled_preapproval: org.mp_preapproval_id,
          new_status: "PAST_DUE",
          had_custom_plan: !!org.custom_plan_id,
        },
      })

      notifyBillingSlack({
        event: "BILLING_ALERT",
        orgName: org.name,
        orgId: org.id,
        details:
          "Downgrade Enterprise→PRO aplicado. La org quedó en PAST_DUE — debe regularizar el pago de PRO.",
        severity: "warning",
      })

      summary.applied++
    } catch (err: any) {
      summary.errors.push(`org=${org.id}: ${err.message}`)
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}
