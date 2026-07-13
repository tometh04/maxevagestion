import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { fetchPreapproval } from "@/lib/billing/mercadopago"
import { transitionFromMP, type MPPreapproval } from "@/lib/billing/state-machine"
import { relinkPreapproval } from "@/lib/billing/relink-preapproval"
import { isSilentChargeFailure } from "@/lib/billing/payment-health"
import { isAccessAllowed } from "@/lib/billing/access"
import { checkCronAuth } from "@/lib/cron/auth"
import { notifyBillingSlack } from "@/lib/billing/slack-notify"

// Ventana para considerar un CHECKOUT_INITIATED como "reciente" al buscar orgs
// que pagaron pero nunca se linkearon (7 días cubre reintentos y demoras).
const UNLINKED_LOOKBACK_MS = 7 * 24 * 3600 * 1000

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

      // Guard (igual que el webhook): un preapproval PENDING no revoca acceso
      // vigente. Si la org está en gracia/trial/activa, no la bajamos a
      // PENDING_PAYMENT por un intento de pago sin autorizar.
      const pendingWouldRevoke =
        transition.subscription_status === "PENDING_PAYMENT" && isAccessAllowed(org as any)
      const changed =
        transition.subscription_status !== org.subscription_status && !pendingWouldRevoke
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

      // Hardening: cobro de renovación fallido "en silencio". MP puede seguir
      // diciendo authorized aunque un cobro no haya entrado (reintenta días antes
      // de pausar). Alertamos (NO auto-transicionamos) para revisión manual.
      const effectiveStatus = changed ? transition.subscription_status : org.subscription_status
      let silentFailure = false
      if (
        isSilentChargeFailure({
          effectiveStatus,
          mpStatus: pa.status,
          nextPaymentDate: (pa as any).next_payment_date,
          lastChargedDate: (pa as any).summarized?.last_charged_date,
        })
      ) {
        silentFailure = true
        await admin.from("billing_events").insert({
          org_id: org.id,
          event_type: "RECONCILED",
          external_id: org.mp_preapproval_id,
          status: pa.status,
          payload: {
            alert: "silent_charge_failure",
            mp_status: pa.status,
            next_payment_date: (pa as any).next_payment_date,
            last_charged_date: (pa as any).summarized?.last_charged_date ?? null,
            note: "Org figura ACTIVE pero el cobro del ciclo vigente no se ejecutó en MP.",
          },
        })
        notifyBillingSlack({
          event: "BILLING_ALERT",
          orgName: org.name || org.id,
          orgId: org.id,
          details: `Posible cobro de renovación NO ejecutado: MP dice authorized, next_payment_date ${(pa as any).next_payment_date} ya venció y no hay último cobro que lo cubra. Revisar manualmente (no se cambió el estado).`,
          severity: "warning",
        })
      }

      results.push({
        orgId: org.id,
        drifted: changed,
        from: org.subscription_status,
        to: transition.subscription_status,
        mpStatus: pa.status,
        silent_charge_failure: silentFailure,
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

  // --- Fase 3: Recuperar orgs que pagaron pero nunca se linkearon ---
  // El flow preapproval_plan depende de que el cliente vuelva a /api/billing/sync.
  // Si no vuelve (cierra la pestaña) o falla, la org queda PENDING_PAYMENT con
  // mp_preapproval_id NULL — invisible a las Fases 1 y 2 (ambas exigen
  // mp_preapproval_id). Acá las buscamos por su CHECKOUT_INITIATED reciente y
  // resolvemos el preapproval en MP por billing_email. Este es el fix directo
  // del síntoma "el cliente pagó pero no quedó registrado".
  const unlinkedCutoff = new Date(Date.now() - UNLINKED_LOOKBACK_MS).toISOString()
  const { data: pendingCheckouts } = await admin
    .from("billing_events")
    .select("org_id, created_at")
    .eq("event_type", "CHECKOUT_INITIATED")
    .eq("status", "pending")
    .gte("created_at", unlinkedCutoff)
    .order("created_at", { ascending: false })

  const unlinkedOrgIds = Array.from(
    new Set((pendingCheckouts ?? []).map((r: any) => r.org_id).filter(Boolean))
  ) as string[]

  const relinkResults: any[] = []
  for (const candidateOrgId of unlinkedOrgIds) {
    // Solo orgs realmente sin linkear (mp_preapproval_id NULL). Las que ya
    // tienen id se cubren en Fase 1.
    const { data: candidateOrg } = await admin
      .from("organizations")
      .select("id, subscription_status, mp_preapproval_id")
      .eq("id", candidateOrgId)
      .maybeSingle()

    if (!candidateOrg || candidateOrg.mp_preapproval_id) continue
    if (!["PENDING_PAYMENT", "TRIAL"].includes(candidateOrg.subscription_status)) continue

    try {
      const res = await relinkPreapproval({
        admin,
        orgId: candidateOrgId,
        auditEventType: "RECONCILED",
        source: "billing-reconcile:phase3-unlinked",
      })
      relinkResults.push({ orgId: candidateOrgId, ...res })

      if (res.linked && res.to_status && res.to_status !== "PENDING_PAYMENT") {
        notifyBillingSlack({
          event: "RECONCILED",
          orgName: candidateOrgId,
          orgId: candidateOrgId,
          details: `Org sin linkear recuperada: pagó pero nunca volvió a /sync. Estado aplicado: ${res.to_status}.`,
          severity: "warning",
        })
      }
    } catch (err: any) {
      console.error("reconcile: relink phase3 failed for org", candidateOrgId, err?.message)
      relinkResults.push({ orgId: candidateOrgId, error: err?.message || String(err) })
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
    unlinked_recovery: {
      candidates: unlinkedOrgIds.length,
      results: relinkResults,
    },
  })
}
