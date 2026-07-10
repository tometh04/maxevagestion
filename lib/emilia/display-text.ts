export const EUROVIPS_DESCRIPTION_MAX_LENGTH = 120
export const EUROVIPS_POLICY_MAX_LENGTH = 180
/** Dirección en card de hotel: evita basura concatenada (política/URLs/tel) de EUROVIPS. */
export const EUROVIPS_ADDRESS_MAX_LENGTH = 90

function truncateAtWordBoundary(
  description: string | null | undefined,
  maxLength: number
): string {
  const normalized = String(description ?? "").replace(/\s+/g, " ").trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  if (maxLength <= 3) {
    return normalized.slice(0, Math.max(0, maxLength))
  }

  const hardLimit = maxLength - 3
  const sliced = normalized.slice(0, hardLimit).trimEnd()
  const lastSpace = sliced.lastIndexOf(" ")
  const minUsefulBoundary = Math.floor(hardLimit * 0.7)
  const readableSlice = lastSpace >= minUsefulBoundary ? sliced.slice(0, lastSpace) : sliced

  return `${readableSlice}...`
}

export function truncateEurovipsDescription(
  description: string | null | undefined,
  maxLength = EUROVIPS_DESCRIPTION_MAX_LENGTH
): string {
  return truncateAtWordBoundary(description, maxLength)
}

export function truncateEurovipsPolicy(
  policy: string | null | undefined,
  maxLength = EUROVIPS_POLICY_MAX_LENGTH
): string {
  return truncateAtWordBoundary(policy, maxLength)
}

export function truncateEurovipsAddress(
  address: string | null | undefined,
  maxLength = EUROVIPS_ADDRESS_MAX_LENGTH
): string {
  return truncateAtWordBoundary(address, maxLength)
}
