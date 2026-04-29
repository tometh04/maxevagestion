export const MP_REAUTH_THRESHOLD_PCT = 20

export interface CustomPlanFeatureExtra {
  key: string
  label: string
  enabled: boolean
}

export interface CustomPlanFeatures {
  extras: CustomPlanFeatureExtra[]
}

export function calculateEffectivePrice(base: number, discountPercent: number): number {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error(`discountPercent inválido: ${discountPercent}. Esperado 0..100.`)
  }
  const raw = base * (1 - discountPercent / 100)
  return Math.round(raw * 100) / 100
}

export function shouldRequireMpReauth(currentAmount: number, newAmount: number): boolean {
  if (newAmount <= currentAmount) return false
  const deltaPct = ((newAmount - currentAmount) / currentAmount) * 100
  return deltaPct > MP_REAUTH_THRESHOLD_PCT + 1e-9
}

export interface MergedFeatures {
  base: string[]
  extras: CustomPlanFeatureExtra[]
}

export function mergeFeatures(
  enterpriseBase: string[],
  custom: CustomPlanFeatures
): MergedFeatures {
  return {
    base: enterpriseBase,
    extras: (custom.extras ?? []).filter((e) => e.enabled),
  }
}
