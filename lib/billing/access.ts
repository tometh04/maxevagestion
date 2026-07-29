/**
 * Regla pura de acceso al ERP según estado de suscripción.
 *
 * Separada de guard.ts a propósito: guard.ts hace I/O y usa React.cache /
 * next/headers, lo que lo hace inimportable desde route handlers y tests en
 * entorno node. Esta función es pura (sin imports pesados) y la reusan el
 * webhook, el reconcile y guard.ts.
 */

export type BillingSubscriptionStatus =
  | "PENDING_PAYMENT"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "SUSPENDED"
  | "TRIAL" // legacy pre-mig157

export interface BillingOrg {
  subscription_status: BillingSubscriptionStatus | string
  current_period_ends_at: string | null
  trial_ends_at: string | null
}

/**
 * Grace period para PAST_DUE: 5 días desde current_period_ends_at.
 * FUENTE ÚNICA de la gracia: la importan payment-health, middleware y el banner.
 * Si cambia acá, cambia en todos lados (no volver a hardcodear el número).
 */
export const PAST_DUE_GRACE_DAYS = 5

/**
 * ¿Este org tiene acceso al ERP ahora mismo? Fuente única de verdad, sin I/O.
 * Usada por middleware, assertSubscriptionActive (guard.ts), webhook, reconcile
 * y tests.
 */
export function isAccessAllowed(org: BillingOrg): boolean {
  const status = org.subscription_status
  const now = Date.now()

  if (status === "SUSPENDED" || status === "PENDING_PAYMENT") return false

  if (status === "CANCELLED") {
    if (!org.current_period_ends_at) return false
    return new Date(org.current_period_ends_at).getTime() > now
  }

  if (status === "PAST_DUE") {
    // Grace period: 3 días después de que venció el período.
    if (!org.current_period_ends_at) return false
    const graceDeadline =
      new Date(org.current_period_ends_at).getTime() +
      PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000
    return now < graceDeadline
  }

  if (status === "TRIAL") {
    if (!org.trial_ends_at) return false
    return new Date(org.trial_ends_at).getTime() > now
  }

  if (status === "TRIALING") {
    if (!org.trial_ends_at) return true
    return new Date(org.trial_ends_at).getTime() > now
  }

  // ACTIVE → acceso concedido
  return true
}
