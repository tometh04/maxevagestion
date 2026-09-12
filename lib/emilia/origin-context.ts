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

  // El origen puede aparecer después del destino y antes de fechas o pasajeros.
  // No exigir "desde X a Y": ante un origen escrito, no agregar otro por GPS.
  const hasFromLocation = Array.from(normalized.matchAll(/\bdesde\s+([^,;!?]+)/g)).some((match) => {
    const value = match[1]
    const isDateTimeOrPrice = /^(?:(?:el|la|los|las|este|esta|estos|estas)\s+)?(?:\d|hoy\b|ayer\b|manana\b|ahora\b|lunes\b|martes\b|miercoles\b|jueves\b|viernes\b|sabado\b|domingo\b|enero\b|febrero\b|marzo\b|abril\b|mayo\b|junio\b|julio\b|agosto\b|septiembre\b|octubre\b|noviembre\b|diciembre\b|dia\b|mes\b|semana\b|ano\b|usd\b|ars\b|eur\b|dolares\b|pesos\b|euros\b)/.test(value)
    return !isDateTimeOrPrice && /^[a-z][a-z.'-]+\b/.test(value)
  })

  return (
    /\b(?:saliendo|partiendo|salida)\s+desde\b/.test(normalized) ||
    /\b(?:origen|aeropuerto de salida)\s*[:=]/.test(normalized) ||
    hasFromLocation
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
