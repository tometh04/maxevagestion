const FIELDS = [
  "contact_name",
  "contact_phone",
  "cuit",
  "tax_category",
  "billing_email",
  "address_street",
  "address_city",
  "address_province",
  "address_postal_code",
] as const

export const PROFILE_FIELD_COUNT = FIELDS.length

export type ProfileBadgeLevel = "empty" | "partial" | "complete"

export function computeProfileCompletion(
  org: Partial<Record<(typeof FIELDS)[number], string | null | undefined>>,
): number {
  return FIELDS.reduce((acc, key) => {
    const value = org[key]
    if (value !== null && value !== undefined && value !== "") return acc + 1
    return acc
  }, 0)
}

export function profileBadgeLevel(completion: number): ProfileBadgeLevel {
  if (completion === 0) return "empty"
  if (completion === PROFILE_FIELD_COUNT) return "complete"
  return "partial"
}
