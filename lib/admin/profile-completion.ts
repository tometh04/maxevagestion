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

export function profileBadgeLevel(completion: number): ProfileBadgeLevel {
  if (completion === 0) return "empty"
  if (completion === PROFILE_FIELD_COUNT) return "complete"
  return "partial"
}
