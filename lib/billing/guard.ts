/**
 * SaaS Pilar 9 — Guard de acceso al ERP según estado de suscripción.
 *
 * Regla pura (isAccessAllowed) + helper que hace I/O + redirect
 * (assertSubscriptionActive) para usar en layouts server-components y en
 * API routes de negocio.
 *
 * Capa B de defense-in-depth (el middleware es la capa A, RLS la C).
 * El middleware puede bypassearse via CVE-2025-29927, por eso esta capa
 * server-side es la que realmente protege el acceso.
 */

import { cache } from "react"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

export type BillingSubscriptionStatus =
  | "PENDING_PAYMENT"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "SUSPENDED"
  | "TRIAL" // legacy pre-mig157, mantener por backward compat

export interface BillingOrg {
  subscription_status: BillingSubscriptionStatus | string
  current_period_ends_at: string | null
  trial_ends_at: string | null
}

/**
 * Regla pura: ¿este org tiene acceso al ERP ahora mismo?
 *
 * Fuente única de verdad. Usado por middleware (capa A), assertSubscriptionActive
 * (capa B), y tests. Sin I/O.
 */
export function isAccessAllowed(org: BillingOrg): boolean {
  const status = org.subscription_status
  const now = Date.now()

  if (status === "SUSPENDED" || status === "PENDING_PAYMENT") return false

  if (status === "CANCELLED") {
    if (!org.current_period_ends_at) return false
    return new Date(org.current_period_ends_at).getTime() > now
  }

  if (status === "TRIAL") {
    // Legacy pre-mig157. Fallback defensivo: respetar trial_ends_at.
    if (!org.trial_ends_at) return false
    return new Date(org.trial_ends_at).getTime() > now
  }

  // TRIALING, ACTIVE, PAST_DUE → acceso concedido
  // (PAST_DUE muestra banner pero no bloquea — user está en ventana de retry MP)
  return true
}

/**
 * Guard server-side. Llamar desde layout del (dashboard) o API routes de
 * negocio. Si el org no tiene acceso, redirige a /onboarding/billing.
 *
 * Retorna el row de organizations (o null si redirige) para que callers
 * puedan reusar el dato sin re-fetchear (ej. SubscriptionBanner del layout).
 *
 * Wrappeado con React.cache para deduplicar dentro del mismo request.
 * Multi-tenant safe: la query filtra por user.org_id; per-request scope.
 */
export const assertSubscriptionActive = cache(async (): Promise<BillingOrg | null> => {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.org_id) redirect("/onboarding")

  const admin = createAdminClient() as any
  const { data } = await admin
    .from("organizations")
    .select("subscription_status, current_period_ends_at, trial_ends_at")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!data) redirect("/onboarding")

  const org = data as BillingOrg
  if (!isAccessAllowed(org)) {
    redirect("/onboarding/billing")
  }

  return org
})
