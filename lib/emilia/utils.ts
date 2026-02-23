/**
 * Utilidades para el sistema de conversaciones de Emilia
 */

// Tipos para el contenido de mensajes
export interface MessageContent {
  text?: string
  cards?: Array<{
    type: "flight" | "hotel"
    data: any
  }>
  metadata?: {
    search_id?: string
    results_count?: number
  }
}

/**
 * Formatea un timestamp en formato relativo en español
 * Ej: "Hace 2 horas", "Ayer", "3 días"
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) {
    return "Ahora"
  } else if (diffMins < 60) {
    return `Hace ${diffMins} min`
  } else if (diffHours < 24) {
    return `Hace ${diffHours} ${diffHours === 1 ? "hora" : "horas"}`
  } else if (diffDays === 1) {
    return "Ayer"
  } else if (diffDays < 7) {
    return `Hace ${diffDays} días`
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `Hace ${weeks} ${weeks === 1 ? "semana" : "semanas"}`
  } else {
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
    })
  }
}

/**
 * Trunca texto a un máximo de caracteres, agregando "..." al final
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return ""
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + "..."
}

/**
 * Extrae un preview de texto del contenido de un mensaje
 */
export function getConversationPreview(
  content: MessageContent,
  maxLength: number = 60
): string {
  if (content.text) {
    return truncateText(content.text, maxLength)
  }

  // Si no hay texto pero hay cards, generar preview descriptivo
  if (content.cards && content.cards.length > 0) {
    const flightCount = content.cards.filter((c) => c.type === "flight").length
    const hotelCount = content.cards.filter((c) => c.type === "hotel").length

    if (flightCount > 0 && hotelCount > 0) {
      return `${flightCount} vuelos y ${hotelCount} hoteles`
    } else if (flightCount > 0) {
      return `${flightCount} vuelo${flightCount > 1 ? "s" : ""}`
    } else if (hotelCount > 0) {
      return `${hotelCount} hotel${hotelCount > 1 ? "es" : ""}`
    }
  }

  return "[Búsqueda de viaje]"
}

/**
 * Genera un título automático para la conversación basado en el parsed_request
 */
export function generateTitle(parsedRequest: any): string {
  if (!parsedRequest) {
    const now = new Date()
    return `Chat ${now.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })}`
  }

  const { type, flights, hotels, itinerary } = parsedRequest

  // Vuelos
  if (type === "flights" && flights) {
    const origin = flights.origin || "?"
    const destination = flights.destination || "?"
    return `Vuelo ${origin} → ${destination}`
  }

  // Hoteles
  if (type === "hotels" && hotels) {
    const city = hotels.city || hotels.destination || "?"
    return `Hotel en ${city}`
  }

  // Combinado (vuelo + hotel)
  if (type === "combined") {
    if (flights?.destination) {
      return `Viaje a ${flights.destination}`
    }
    if (hotels?.city) {
      return `Viaje a ${hotels.city}`
    }
  }

  // Itinerario multi-destino
  if (type === "itinerary" && itinerary?.destinations?.length) {
    const destinations = itinerary.destinations.slice(0, 2).join(", ")
    const more = itinerary.destinations.length > 2 ? "..." : ""
    return `Itinerario ${destinations}${more}`
  }

  // Fallback
  const now = new Date()
  return `Chat ${now.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })}`
}

/**
 * Genera un ID único para request_id
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Genera un ID único para client_id (idempotencia de mensajes)
 */
export function generateClientId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Construye el contenido de texto para el mensaje del asistente
 */
export function buildAssistantContent(data: any): string {
  if (data.status === "error") {
    return data.error?.message || data.error || "Ocurrió un error procesando tu solicitud."
  }

  if (data.status === "incomplete") {
    return (
      data.message || data.error?.message || "Necesito más información para completar la búsqueda."
    )
  }

  // Verificar si hay resultados (incluso si status no es "completed")
  // La API puede devolver resultados en dos formatos:
  // 1. data.results.flights (formato anidado)
  // 2. data.flights (formato plano)
  const flights = data.results?.flights || data.flights
  const hotels = data.results?.hotels || data.hotels
  const hasResults = flights || hotels

  if (hasResults || data.status === "completed") {
    const parts: string[] = []

    if (flights?.count > 0) {
      parts.push(
        `Encontré ${flights.count} vuelo${flights.count > 1 ? "s" : ""} disponible${
          flights.count > 1 ? "s" : ""
        }.`
      )
    }

    if (hotels?.count > 0) {
      parts.push(
        `Encontré ${hotels.count} hotel${hotels.count > 1 ? "es" : ""} disponible${
          hotels.count > 1 ? "s" : ""
        }.`
      )
    }

    if (parts.length > 0) {
      return parts.join(" ")
    }

    // Si hay resultados pero sin count, verificar items
    if ((flights?.items && flights.items.length > 0) || (hotels?.items && hotels.items.length > 0)) {
      const flightCount = flights?.items?.length || 0
      const hotelCount = hotels?.items?.length || 0
      const resultParts: string[] = []
      
      if (flightCount > 0) {
        resultParts.push(`${flightCount} vuelo${flightCount > 1 ? "s" : ""}`)
      }
      if (hotelCount > 0) {
        resultParts.push(`${hotelCount} hotel${hotelCount > 1 ? "es" : ""}`)
      }
      
      if (resultParts.length > 0) {
        return `Encontré ${resultParts.join(" y ")} disponible${resultParts.length > 1 ? "s" : ""}.`
      }
    }

    // Si status es completed pero no hay resultados
    if (data.status === "completed") {
      return "No encontré resultados para tu búsqueda. ¿Querés modificar los criterios?"
    }
  }

  // Si hay un mensaje de la API, usarlo
  if (data.message) {
    return data.message
  }

  // Fallback: intentar construir mensaje desde los datos disponibles
  if (data.results) {
    return "Búsqueda completada. Revisá los resultados a continuación."
  }

  return "Búsqueda procesada correctamente."
}

