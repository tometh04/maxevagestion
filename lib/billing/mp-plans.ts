import type { SupabaseClient } from "@supabase/supabase-js"
import { createPreapprovalPlan } from "./mercadopago"
import type { PlanId } from "./plans"

export interface BuildPlanKeyInput {
  plan: PlanId | "CUSTOM"
  /** Solo para CUSTOM: slug del org cuyo plan es. */
  orgSlug?: string
  /** Solo para CUSTOM: monto efectivo ARS. */
  amount?: number
}

export function buildPlanKey(input: BuildPlanKeyInput): string {
  if (input.plan === "CUSTOM") {
    if (!input.orgSlug || !input.amount) {
      throw new Error("buildPlanKey CUSTOM requiere orgSlug y amount")
    }
    return `CUSTOM_${input.orgSlug}_${input.amount}`
  }
  return `${input.plan}_STANDARD`
}

export interface EnsureMpPlanInput {
  plan: PlanId | "CUSTOM"
  reason: string
  amount: number
  backUrl: string
  includeFreeTrial: boolean
  /** Solo para CUSTOM. */
  orgSlug?: string
}

export interface EnsureMpPlanResult {
  plan_key: string
  mp_preapproval_plan_id: string
  init_point: string
  cached: boolean
}

/**
 * Get-or-create del preapproval_plan. Si ya existe en mp_plans con misma key,
 * lo devuelve. Si no, lo crea en MP y guarda el ID.
 *
 * Requiere adminClient (service_role) para bypassear RLS de mp_plans.
 */
export async function ensureMpPlan(
  admin: SupabaseClient,
  input: EnsureMpPlanInput
): Promise<EnsureMpPlanResult> {
  const plan_key = buildPlanKey({
    plan: input.plan,
    orgSlug: input.orgSlug,
    amount: input.amount,
  })

  const { data: existing } = await (admin as any)
    .from("mp_plans")
    .select("mp_preapproval_plan_id, init_point")
    .eq("plan_key", plan_key)
    .maybeSingle()

  if (existing) {
    return {
      plan_key,
      mp_preapproval_plan_id: existing.mp_preapproval_plan_id,
      init_point: existing.init_point,
      cached: true,
    }
  }

  const created = await createPreapprovalPlan({
    reason: input.reason,
    amount: input.amount,
    backUrl: input.backUrl,
    includeFreeTrial: input.includeFreeTrial,
  })

  await (admin as any).from("mp_plans").insert({
    plan_key,
    mp_preapproval_plan_id: created.id,
    amount_ars: input.amount,
    include_free_trial: input.includeFreeTrial,
    init_point: created.init_point,
  })

  return {
    plan_key,
    mp_preapproval_plan_id: created.id,
    init_point: created.init_point,
    cached: false,
  }
}
