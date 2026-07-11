/**
 * Resolver + linkear un preapproval de MP a una org, y aplicar la transición.
 *
 * Factoriza la lógica compartida entre:
 *   - app/api/admin/orgs/[id]/mp-relink   (recuperación manual del admin)
 *   - app/api/cron/billing-reconcile      (Fase 3: recuperar orgs sin link)
 *
 * Cubre el caso raíz "el cliente pagó pero la org nunca se linkeó": el flow
 * preapproval_plan depende de que el cliente vuelva a /api/billing/sync; si no
 * vuelve (cierra la pestaña) o falla, la org queda en PENDING_PAYMENT con
 * mp_preapproval_id NULL y ninguna red de contención la ve. Acá la resolvemos
 * buscando en MP por el billing_email de la org.
 *
 * Fuente de verdad de la transición: transitionFromMP (state-machine).
 */

import {
  fetchPreapproval,
  searchPreapprovalsByPayerEmail,
} from "./mercadopago"
import { transitionFromMP, type MPPreapproval } from "./state-machine"

export interface RelinkPreapprovalInput {
  /** Admin/service-role client (bypassa RLS). */
  admin: any
  orgId: string
  /** Si viene, se usa directo (fetchPreapproval). */
  preapprovalId?: string | null
  /** Email a buscar en MP. Si no viene, se usa org.billing_email. */
  payerEmail?: string | null
  /**
   * event_type con el que se audita el link en billing_events.
   * "MANUAL_ADMIN_ADJUSTMENT" para relink manual; "RECONCILED" para el cron.
   */
  auditEventType: "MANUAL_ADMIN_ADJUSTMENT" | "RECONCILED"
  /** Etiqueta de origen para el payload de auditoría. */
  source: string
}

export interface RelinkPreapprovalResult {
  linked: boolean
  reason?: string
  preapproval?: any
  from_status?: string
  to_status?: string
  candidates?: number
}

/**
 * Elige el mejor candidato de una lista de preapprovals para una org:
 *  1. Si alguno tiene external_reference == orgId → ese (match fuerte).
 *  2. Si alguno tiene external_reference de OTRA org → se descarta (cross-tenant).
 *  3. Entre los sin external_reference: preferir authorized, luego el más
 *     recientemente modificado.
 */
function pickCandidate(
  candidates: Array<{ id: string; status?: string; external_reference?: string; last_modified?: string; [k: string]: any }>,
  orgId: string
): { chosen: any | null; ambiguous: boolean } {
  const exact = candidates.find((c) => c.external_reference && c.external_reference === orgId)
  if (exact) return { chosen: exact, ambiguous: false }

  // Descartar los que pertenecen explícitamente a otra org.
  const usable = candidates.filter((c) => !c.external_reference || c.external_reference === orgId)
  if (usable.length === 0) return { chosen: null, ambiguous: false }

  const authorized = usable.filter((c) => c.status === "authorized")
  const pool = authorized.length > 0 ? authorized : usable
  const sorted = [...pool].sort((a, b) => {
    const ta = a.last_modified ? new Date(a.last_modified).getTime() : 0
    const tb = b.last_modified ? new Date(b.last_modified).getTime() : 0
    return tb - ta
  })
  // Ambiguo si hay más de un authorized distinto sin external_reference —
  // no queremos linkear a ciegas.
  const ambiguous = authorized.length > 1
  return { chosen: sorted[0], ambiguous }
}

export async function relinkPreapproval(
  input: RelinkPreapprovalInput
): Promise<RelinkPreapprovalResult> {
  const { admin, orgId, auditEventType, source } = input

  const { data: org } = await admin
    .from("organizations")
    .select(
      "id, name, billing_email, plan, subscription_status, mp_preapproval_id, " +
      "current_period_ends_at, mp_last_synced_at, trial_ends_at"
    )
    .eq("id", orgId)
    .maybeSingle()

  if (!org) return { linked: false, reason: "org_not_found" }

  // 1. Resolver el preapproval
  let preapproval: MPPreapproval | null = null
  let candidatesCount = 0

  if (input.preapprovalId) {
    preapproval = (await fetchPreapproval(input.preapprovalId)) as MPPreapproval
  } else if (org.mp_preapproval_id) {
    preapproval = (await fetchPreapproval(org.mp_preapproval_id)) as MPPreapproval
  } else {
    const email = (input.payerEmail || org.billing_email || "").trim()
    if (!email) return { linked: false, reason: "no_payer_email" }
    const found = await searchPreapprovalsByPayerEmail(email, 10)
    candidatesCount = found.length
    if (found.length === 0) return { linked: false, reason: "no_preapproval_in_mp", candidates: 0 }
    const { chosen, ambiguous } = pickCandidate(found as any[], orgId)
    if (!chosen) return { linked: false, reason: "no_usable_candidate", candidates: found.length }
    if (ambiguous) {
      return { linked: false, reason: "ambiguous_candidates", candidates: found.length }
    }
    preapproval = (await fetchPreapproval(chosen.id)) as MPPreapproval
  }

  if (!preapproval) return { linked: false, reason: "preapproval_unresolved" }

  // 2. Guard cross-tenant: si MP tiene external_reference, debe ser esta org.
  if (preapproval.external_reference && preapproval.external_reference !== orgId) {
    return { linked: false, reason: "external_reference_mismatch", preapproval }
  }

  // 3. Idempotencia: ya linkeado a este preapproval y sincronizado.
  if (
    org.mp_preapproval_id === preapproval.id &&
    org.mp_last_synced_at &&
    preapproval.last_modified &&
    new Date(org.mp_last_synced_at).getTime() >= new Date(preapproval.last_modified).getTime()
  ) {
    return {
      linked: true,
      reason: "already_synced",
      preapproval,
      from_status: org.subscription_status,
      to_status: org.subscription_status,
      candidates: candidatesCount,
    }
  }

  // 4. Transición (fuente de verdad)
  const transition = transitionFromMP(preapproval, undefined, {
    preserved_current_period_ends_at: org.current_period_ends_at,
    trial_ends_at: org.trial_ends_at,
  })

  const updates: Record<string, any> = {
    subscription_status: transition.subscription_status,
    mp_preapproval_id: preapproval.id,
    mp_last_synced_at: preapproval.last_modified ?? new Date().toISOString(),
  }
  if (transition.current_period_ends_at !== undefined) {
    updates.current_period_ends_at = transition.current_period_ends_at
  }

  const { error: updateErr } = await admin
    .from("organizations")
    .update(updates)
    .eq("id", orgId)
  if (updateErr) {
    // Falla contable crítica: no la tragamos.
    console.error("[relink] update org failed", orgId, updateErr)
    return { linked: false, reason: "org_update_failed", preapproval }
  }

  // 5. Auditoría
  const { error: auditErr } = await admin.from("billing_events").insert({
    org_id: orgId,
    event_type: auditEventType,
    external_id: preapproval.id,
    amount_cents: preapproval.auto_recurring?.transaction_amount
      ? Math.round(preapproval.auto_recurring.transaction_amount * 100)
      : null,
    currency: preapproval.auto_recurring?.currency_id ?? null,
    status: preapproval.status,
    payload: {
      source,
      previous_status: org.subscription_status,
      new_status: transition.subscription_status,
      transition_event: transition.event_type,
      mp_status: preapproval.status,
      preapproval,
    },
  })
  if (auditErr) {
    console.error("[relink] audit insert failed (non-blocking)", orgId, auditErr)
  }

  return {
    linked: true,
    preapproval,
    from_status: org.subscription_status,
    to_status: transition.subscription_status,
    candidates: candidatesCount,
  }
}
