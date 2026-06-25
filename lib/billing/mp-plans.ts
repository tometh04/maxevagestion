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
  /** 2026-05-18: free_trial custom en días (sobreescribe includeFreeTrial si > 0). */
  freeTrialDays?: number
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
  // El estado del trial se incorpora a la cache key: planes con distinto trial
  // son planes DIFERENTES en MP, no podemos reusar el mismo template.
  //   - freeTrialDays > 0      → `_T{n}D`  (trial custom en días)
  //   - includeFreeTrial=true  → ``        (alta normal: 7 días, key histórica)
  //   - includeFreeTrial=false → `_NOTRIAL` (regularización PAST_DUE: cobro inmediato)
  // BUG FIX: antes la key NO distinguía includeFreeTrial, así que "Regularizar
  // pago" (includeFreeTrial=false) reusaba el plan cacheado del alta normal CON
  // trial → MP creaba la suscripción con otro trial de 7 días y NO cobraba al
  // instante (caso Lozada Gualeguaychú, 2026-06-24).
  const trialKeyPart =
    input.freeTrialDays && input.freeTrialDays > 0
      ? `_T${input.freeTrialDays}D`
      : input.includeFreeTrial
        ? ""
        : "_NOTRIAL"
  const plan_key = buildPlanKey({
    plan: input.plan,
    orgSlug: input.orgSlug,
    amount: input.amount,
  }) + trialKeyPart

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
    freeTrialDays: input.freeTrialDays,
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
