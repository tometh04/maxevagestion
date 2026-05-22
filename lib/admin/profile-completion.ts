export const TENANT_PROFILE_FIELDS = [
  "company_name",
  "tax_id",
  "legajo",
  "address",
  "phone",
  "email",
  "website",
  "instagram",
] as const

export const PROFILE_FIELD_COUNT = TENANT_PROFILE_FIELDS.length // 8

export type ProfileBadgeLevel = "empty" | "partial" | "complete"

export function computeProfileCompletion(
  settings: Partial<Record<(typeof TENANT_PROFILE_FIELDS)[number], string | null | undefined>>,
): number {
  return TENANT_PROFILE_FIELDS.reduce((acc, key) => {
    const value = settings[key]
    if (value !== null && value !== undefined && value !== "") return acc + 1
    return acc
  }, 0)
}

// Umbrales semáforo del perfil tenant (8 campos totales):
//   0-3 → rojo (empty)     — perfil pelado o casi pelado
//   4-5 → amarillo (partial) — info parcial, falta lo básico
//   6-8 → verde (complete)   — listo o casi listo
// Antes: solo 0 era rojo y solo 8 era verde, el resto era amarillo →
// llamaba "complete" solo al 100% lo cual era info inútil para triage rápido.
export function profileBadgeLevel(completion: number): ProfileBadgeLevel {
  if (completion <= 3) return "empty"
  if (completion <= 5) return "partial"
  return "complete"
}
