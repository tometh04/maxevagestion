import type { SupabaseClient } from "@supabase/supabase-js"
import type { ApprovalRule } from "./approval"

const FALLBACK_USD_RATE = 1000

/**
 * Lee las reglas de aprobación de pagos para una agency.
 * Si no hay row en agency_settings o la key no está, retorna [].
 */
export async function loadApprovalRules(
  agencyId: string,
  supabase: SupabaseClient,
): Promise<ApprovalRule[]> {
  const { data } = await (supabase.from("agency_settings") as any)
    .select("data")
    .eq("agency_id", agencyId)
    .maybeSingle()

  const rules = data?.data?.payment_approval_rules
  if (!Array.isArray(rules)) return []
  return rules.filter(
    (r): r is ApprovalRule =>
      typeof r === "object" &&
      typeof r.role === "string" &&
      (r.max_amount_ars === null || typeof r.max_amount_ars === "number"),
  )
}

/**
 * Obtiene el tipo de cambio actual ARS/USD del último mes registrado.
 * Si no hay datos, fallback a FALLBACK_USD_RATE.
 */
export async function getCurrentArsPerUsd(
  supabase: SupabaseClient,
): Promise<number> {
  const { data } = await (supabase.from("monthly_exchange_rates") as any)
    .select("usd_to_ars_rate")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle()

  const rate = data?.usd_to_ars_rate ? Number(data.usd_to_ars_rate) : 0
  if (rate > 0) return rate

  console.warn("[payment-approval] No exchange rate found, using fallback", FALLBACK_USD_RATE)
  return FALLBACK_USD_RATE
}
