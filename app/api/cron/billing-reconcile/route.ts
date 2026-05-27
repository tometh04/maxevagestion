import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { fetchPreapproval } from "@/lib/billing/mercadopago"
import { transitionFromMP, type MPPreapproval } from "@/lib/billing/state-machine"
import { checkCronAuth } from "@/lib/cron/auth"
import { notifyBillingSlack } from "@/lib/billing/slack-notify"

/**
 * POST /api/cron/billing-reconcile
 *
 * Safety net diario para detectar drifts entre nuestra DB y MP cuando
 * se pierden webhooks (outage de MP, timeout en nuestro endpoint, etc).
 *
 * Corre 1x por día vía Railway cron service. Para cada org activa con
 * preapproval:
 *  1. fetchPreapproval(id) — trae estado fresh de MP
 *  2. transitionFromMP → calcula estado esperado
 *  3. Si diverge de DB, aplica update y logea billing_events RECONCILED
 *
 * Auth: Bearer CRON_SECRET en header Authorization.
 */
export async function POST(request: Request) {
  const auth = checkCronAuth(request, "billing-reconcile")
  if (!auth.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, subscription_status, current_period_ends_at, mp_preapproval_id, mp_last_synced_at, trial_ends_at")
    .in("subscription_status", ["TRIAL", "TRIALING", "ACTIVE", "PAST_DUE", "PENDING_PAYMENT"])
    .not("mp_preapproval_id", "is", null)

  const results: any[] = []
  let drifted = 0

  for (const org of orgs || []) {
    try {
      const pa = (await fetchPreapproval(org.mp_preapproval_id)) as MPPreapproval
      const transition = transitionFromMP(pa, undefined, {
        preserved_current_period_ends_at: org.current_period_ends_at,
        trial_ends_at: org.trial_ends_at,
      })

      const changed = transition.subscription_status !== org.subscription_status
      if (changed) {
        drifted += 1
        const updates: Record<string, any> = {
          subscription_status: transition.subscription_status,
          mp_last_synced_at: pa.last_modified,
        }
        if (transition.current_period_ends_at !== undefined) {
          updates.current_period_ends_at =
            transition.current_period_ends_at ?? org.current_period_ends_at
        }
        await admin.from("organizations").update(updates).eq("id", org.id)

        await admin.from("billing_events").insert({
          org_id: org.id,
          event_type: "RECONCILED",
          external_id: org.mp_preapproval_id,
          status: pa.status,
          payload: {
            previous_status: org.subscription_status,
            new_status: transition.subscription_status,
            mp_status: pa.status,
            preapproval: pa,
          },
        })
      } else if (pa.last_modified && pa.last_modified !== org.mp_last_synced_at) {
        // Mismo estado pero MP fue modificado desde nuestro último sync.
        // Actualizamos el timestamp para que próximos webhooks no queden stale.
        await admin.from("organizations")
          .update({ mp_last_synced_at: pa.last_modified })
          .eq("id", org.id)
      }

      if (changed) {
        notifyBillingSlack({
          event: "RECONCILED",
          orgName: org.name || org.id,
          orgId: org.id,
          details: `Drift detectado: DB tenía ${org.subscription_status}, MP dice ${pa.status} → corregido a ${transition.subscription_status}.`,
          severity: "warning",
        })
      }

      results.push({
        orgId: org.id,
        drifted: changed,
        from: org.subscription_status,
        to: transition.subscription_status,
        mpStatus: pa.status,
      })
    } catch (err: any) {
      console.error("reconcile failed for org", org.id, err?.message)
      results.push({ orgId: org.id, error: err?.message || String(err) })
    }
  }

  // --- Fase 2: Detectar TRIALING expirados sin pago exitoso ---
  // Orgs que siguen en TRIALING pero su trial_ends_at ya pasó.
  // No tienen mecanismo automático de transición — la state machine solo
  // evalúa lo que MP dice, y MP sigue diciendo "authorized" incluso si el
  // trial venció y el pago falló. Fix: forzar PAST_DUE.
  const { data: expiredTrials } = await admin
    .from("organizations")
    .select("id, name, subscription_status, trial_ends_at, current_period_ends_at, mp_preapproval_id")
    .eq("subscription_status", "TRIALING")
    .lt("trial_ends_at", new Date().toISOString())

  const expiredResults: any[] = []
  for (const org of expiredTrials || []) {
    try {
      // Guard atómico: solo actualizar si el status sigue siendo TRIALING.
      // Si un webhook de pago aprobado llegó entre el SELECT y este UPDATE,
      // el .eq("subscription_status", "TRIALING") no matchea y no sobrescribe ACTIVE.
      const { data: updated } = await admin.from("organizations")
        .update({
          subscription_status: "PAST_DUE",
          current_period_ends_at: org.trial_ends_at,
        })
        .eq("id", org.id)
        .eq("subscription_status", "TRIALING")
        .select("id")

      if (!updated || updated.length === 0) {
        // Status ya cambió (p.ej. ACTIVE por pago aprobado) — no hacer nada
        expiredResults.push({ orgId: org.id, skipped: true, reason: "status_changed_concurrently" })
        continue
      }

      await admin.from("billing_events").insert({
        org_id: org.id,
        event_type: "TRIAL_EXPIRED",
        external_id: org.mp_preapproval_id,
        status: "expired",
        payload: {
          previous_status: "TRIALING",
          new_status: "PAST_DUE",
          trial_ends_at: org.trial_ends_at,
          reason: "Trial expirado sin pago exitoso — transición automática por billing-reconcile",
        },
      })

      notifyBillingSlack({
        event: "TRIAL_EXPIRED",
        orgName: org.name || org.id,
        orgId: org.id,
        details: `Trial venció el ${new Date(org.trial_ends_at).toLocaleDateString("es-AR")}. Transición automática a PAST_DUE.`,
        severity: "warning",
      })

      expiredResults.push({ orgId: org.id, transitioned: true, from: "TRIALING", to: "PAST_DUE" })
    } catch (err: any) {
      console.error("reconcile: trial expiry failed for org", org.id, err?.message)
      expiredResults.push({ orgId: org.id, error: err?.message || String(err) })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    drifted_count: drifted,
    results,
    expired_trials: {
      processed: expiredResults.length,
      results: expiredResults,
    },
  })
}
