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
import { headers } from "next/headers"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import {
  isTransientPostgrestError,
  retryTransient,
  describeError,
} from "@/lib/auth/transient"
import { isAccessAllowed, type BillingOrg } from "@/lib/billing/access"

// Re-export para no romper importadores existentes (`@/lib/billing/guard`).
// La regla pura vive en access.ts (sin deps de React/Next) para poder usarla
// desde route handlers (webhook, reconcile) y tests en entorno node.
export { isAccessAllowed } from "@/lib/billing/access"
export type { BillingSubscriptionStatus, BillingOrg } from "@/lib/billing/access"

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
/**
 * Lo que devuelve el guard: la regla de acceso más el plan.
 *
 * `plan` NO va en `BillingOrg` a propósito: ese tipo modela la regla pura de
 * acceso (`isAccessAllowed`), que no mira el plan. Acá se agrega solo para que
 * el layout del dashboard pueda segmentar telemetría por plan sin pagar una
 * query extra por navegación.
 */
export type BillingOrgWithPlan = BillingOrg & { plan?: string | null }

export const assertSubscriptionActive = cache(async (): Promise<BillingOrgWithPlan | null> => {
  // BYPASS LOGIN EN DESARROLLO - TODO: Remover antes de producción
  // Mismo patrón que lib/auth.ts: si DISABLE_AUTH=true en dev, no chequeamos
  // suscripción ni org_id (el user mock tiene org_id=null y forzaría redirect
  // a /onboarding).
  if (process.env.DISABLE_AUTH === "true" && process.env.NODE_ENV === "development") {
    return {
      subscription_status: "ACTIVE",
      current_period_ends_at: null,
      trial_ends_at: null,
    }
  }

  const { user } = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.org_id) redirect("/onboarding")

  const admin = createAdminClient() as any
  // Mismo criterio que `getCurrentUser()`: una query que fallo no es una org
  // que no existe. Sin esto un timeout de Postgres manda a /onboarding a una
  // agencia con la suscripcion al dia, que se lee como "se me cayo la sesion".
  const { data, error } = await retryTransient<{
    data: BillingOrgWithPlan | null
    error: { code?: string; message?: string } | null
  }>(
    () =>
      admin
        .from("organizations")
        .select("subscription_status, current_period_ends_at, trial_ends_at, plan")
        .eq("id", user.org_id)
        .maybeSingle(),
    isTransientPostgrestError,
    "select organizations"
  )

  if (error && isTransientPostgrestError(error)) {
    throw new Error(`[billing] no se pudo leer la organizacion: ${describeError(error)}`)
  }

  if (!data) {
    console.warn(
      `[billing] redirect a /onboarding: org ${user.org_id.slice(0, 8)} sin fila — ${describeError(error)}`
    )
    redirect("/onboarding")
  }

  const org = data as BillingOrgWithPlan
  if (!isAccessAllowed(org)) {
    // PAST_DUE bloqueado → /settings/subscription (tiene botón "Regularizar pago")
    // Resto → /onboarding/billing (checkout estándar)
    if (org.subscription_status === "PAST_DUE") {
      // Leer pathname desde el header que setea el middleware para evitar el
      // loop infinito: si ya estamos en /settings/subscription no redirigir.
      const pathname = (await headers()).get("x-pathname") ?? ""
      if (!pathname.startsWith("/settings/subscription")) {
        redirect("/settings/subscription")
      }
      return org
    }
    redirect("/onboarding/billing")
  }

  return org
})
