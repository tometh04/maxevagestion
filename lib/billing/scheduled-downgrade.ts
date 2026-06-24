/**
 * Downgrade programado Enterprise → PRO (self-serve, al fin del período).
 *
 * Lógica pura (sin I/O) para validar la programación/deshacer y para construir
 * el UPDATE que aplica el cron al vencer el período. Mantener puro permite
 * testear sin mockear Supabase, igual que `isAccessAllowed` / `transitionFromMP`.
 *
 * Flujo: el endpoint POST /api/billing/schedule-downgrade marca
 * scheduled_plan='PRO' + scheduled_plan_effective_at=current_period_ends_at.
 * El cron apply-scheduled-downgrades aplica buildDowngradeUpdate() cuando vence.
 */

import { PLANS } from "./plans"

/** Único plan destino soportado hoy en el downgrade self-serve. */
export const DOWNGRADE_TARGET_PLAN = "PRO" as const

export interface ScheduleDowngradeOrg {
  plan: string | null
  subscription_status: string | null
  custom_plan_id: string | null
  current_period_ends_at: string | null
  scheduled_plan: string | null
}

export type ScheduleDowngradeResult =
  | { ok: true; alreadyScheduled?: boolean; effectiveAt: string }
  | { ok: false; status: number; error: string }

/**
 * ¿Puede esta org (y este rol) programar un downgrade a PRO ahora mismo?
 *
 * Reglas:
 *  - Solo ADMIN / SUPER_ADMIN.
 *  - targetPlan debe ser 'PRO'.
 *  - La org debe ser Enterprise: plan === 'ENTERPRISE' o tiene custom_plan_id.
 *  - subscription_status debe ser ACTIVE (hay un período vigente que respetar).
 *  - current_period_ends_at debe existir y ser futuro (ancla temporal del downgrade).
 *  - Si ya hay scheduled_plan → idempotente (alreadyScheduled).
 */
export function validateScheduleDowngrade(
  org: ScheduleDowngradeOrg,
  role: string | null | undefined,
  targetPlan: unknown,
  now: number = Date.now()
): ScheduleDowngradeResult {
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return { ok: false, status: 403, error: "forbidden" }
  }

  if (targetPlan !== DOWNGRADE_TARGET_PLAN) {
    return { ok: false, status: 400, error: "Solo se puede bajar al plan PRO" }
  }

  const isEnterprise = org.plan === "ENTERPRISE" || !!org.custom_plan_id
  if (!isEnterprise) {
    return {
      ok: false,
      status: 400,
      error: "Solo los planes Enterprise pueden bajar a PRO",
    }
  }

  if (org.subscription_status !== "ACTIVE") {
    return {
      ok: false,
      status: 400,
      error: "Solo se puede programar el downgrade con la suscripción activa",
    }
  }

  if (!org.current_period_ends_at) {
    return {
      ok: false,
      status: 409,
      error:
        "Tu plan no tiene un fin de período definido. Contactá a ventas@vibook.ai para bajar de plan.",
    }
  }

  const effectiveAt = org.current_period_ends_at
  if (new Date(effectiveAt).getTime() <= now) {
    return {
      ok: false,
      status: 400,
      error: "El período actual ya venció. Contactá a soporte para regularizar tu plan.",
    }
  }

  if (org.scheduled_plan) {
    return { ok: true, alreadyScheduled: true, effectiveAt }
  }

  return { ok: true, effectiveAt }
}

export interface DowngradeUpdate {
  plan: string
  max_users: number
  max_agencies: number
  max_operations_per_month: number
  custom_plan_id: null
  mp_preapproval_id: null
  subscription_status: string
  current_period_ends_at: string | null
  scheduled_plan: null
  scheduled_plan_effective_at: null
}

/**
 * UPDATE que aplica el cron cuando vence el período Enterprise.
 *
 * - Baja a PRO con los límites del plan PRO (de PLANS).
 * - Limpia custom_plan_id (el row de custom_plans queda huérfano a propósito,
 *   para auditoría/re-upgrade) y mp_preapproval_id (el preapproval viejo ya se
 *   cancela en MP por separado; el nuevo PRO se crea al regularizar).
 * - Deja PAST_DUE para forzar la regularización manual del PRO. Congela
 *   current_period_ends_at = scheduled_plan_effective_at como inicio de la
 *   gracia de 3 días del guard.
 * - Limpia las columnas de scheduling.
 */
export function buildDowngradeUpdate(org: {
  scheduled_plan_effective_at: string | null
}): DowngradeUpdate {
  const pro = PLANS.PRO
  return {
    plan: DOWNGRADE_TARGET_PLAN,
    max_users: pro.limits.maxUsers,
    max_agencies: pro.limits.maxAgencies,
    max_operations_per_month: pro.limits.maxOperationsPerMonth,
    custom_plan_id: null,
    mp_preapproval_id: null,
    subscription_status: "PAST_DUE",
    current_period_ends_at: org.scheduled_plan_effective_at,
    scheduled_plan: null,
    scheduled_plan_effective_at: null,
  }
}
