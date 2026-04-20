import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

/**
 * SaaS Pilar 7 — Enforcement de límites por plan.
 *
 * Los límites vienen de `organizations.max_users|max_agencies|max_operations_per_month`.
 * Son nullables (NULL = sin límite). Las rutas de POST deben llamar a
 * `assertUnderLimit` antes de crear recursos nuevos.
 */

export type LimitKey = "max_users" | "max_agencies" | "max_operations_per_month"

export type LimitCheckResult =
  | { ok: true; current: number; limit: number | null }
  | { ok: false; current: number; limit: number; message: string }

export async function checkLimit(
  supabase: SupabaseClient<Database>,
  orgId: string,
  key: LimitKey
): Promise<LimitCheckResult> {
  const { data: org } = await (supabase.from("organizations") as any)
    .select(`${key}, subscription_status`)
    .eq("id", orgId)
    .maybeSingle()

  if (!org) {
    return { ok: false, current: 0, limit: 0, message: "Organización no encontrada" }
  }

  const status = (org as any).subscription_status as string | null
  if (status === "SUSPENDED") {
    return {
      ok: false,
      current: 0,
      limit: 0,
      message: "Suscripción suspendida. Contactá soporte para reactivar.",
    }
  }

  const limit = (org as any)[key] as number | null | undefined
  if (limit == null) {
    return { ok: true, current: 0, limit: null }
  }

  let current = 0
  if (key === "max_users") {
    const { count } = await (supabase.from("users") as any)
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("is_active", true)
    current = count ?? 0
  } else if (key === "max_agencies") {
    const { count } = await (supabase.from("agencies") as any)
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
    current = count ?? 0
  } else if (key === "max_operations_per_month") {
    const since = new Date()
    since.setDate(1)
    since.setHours(0, 0, 0, 0)
    const { count } = await (supabase.from("operations") as any)
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", since.toISOString())
    current = count ?? 0
  }

  if (current >= limit) {
    return {
      ok: false,
      current,
      limit,
      message: `Alcanzaste el límite de ${label(key)} (${limit}). Actualizá el plan para crear más.`,
    }
  }
  return { ok: true, current, limit }
}

function label(key: LimitKey): string {
  switch (key) {
    case "max_users": return "usuarios"
    case "max_agencies": return "agencias"
    case "max_operations_per_month": return "operaciones por mes"
  }
}

/**
 * Versión que lanza si el límite fue alcanzado. Cómodo en POST routes:
 *   await assertUnderLimit(supabase, orgId, "max_operations_per_month")
 */
export async function assertUnderLimit(
  supabase: SupabaseClient<Database>,
  orgId: string,
  key: LimitKey
): Promise<void> {
  const result = await checkLimit(supabase, orgId, key)
  if (!result.ok) {
    const err = new Error(result.message)
    ;(err as any).status = 403
    ;(err as any).limitInfo = result
    throw err
  }
}
