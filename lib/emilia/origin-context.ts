export interface EmiliaDefaultOrigin {
  city: string
  country?: string
}

export function hasExplicitOrigin(message: string): boolean {
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

  return (
    /\b(?:saliendo|partiendo|salida)\s+desde\b/.test(normalized) ||
    /\b(?:origen|aeropuerto de salida)\s*[:=]/.test(normalized) ||
    /\bdesde\s+[a-z .'-]{2,60}\s+(?:a|hacia|hasta)\s+/.test(normalized) ||
    /^desde\s+[a-z .'-]{2,60}(?:[.!?,]|$)/.test(normalized)
  )
}

export function withDefaultOrigin(
  message: string,
  origin?: EmiliaDefaultOrigin | null
): string {
  const city = origin?.city?.trim()
  if (!city || hasExplicitOrigin(message)) return message

  const country = origin?.country?.trim()
  const suffix = `Saliendo desde ${city}${country ? `, ${country}` : ""}.`
  return `${message.trim()} ${suffix}`.trim()
}
