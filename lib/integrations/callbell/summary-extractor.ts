/**
 * Extractor del mensaje-resumen que el bot v50.2 envía cuando recolectó los
 * datos del cliente. Patrón fijo en el prompt (ver docs/vico-bot-v50.1-prompt.txt):
 *
 *   Perfecto, acá tenés un resumen de los datos que me pasaste:
 *   🌍 Ciudad de salida: [dato]
 *   🌴 Ciudad de destino: [dato]
 *   📆 Fechas: [dato]
 *   👥 Cantidad de pasajeros: [dato]
 *   💵 Presupuesto por persona: [dato]
 *   Te transfiero a un agente que te responderá a la brevedad.
 *
 * Si el texto matchea, devolvemos los campos parseados. Si no matchea (mensaje
 * conversacional normal), devolvemos null y el caller solo agrega a notes.
 */

const MESES_ES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

export type SummaryExtracted = {
  citySalida?: string
  cityDestino?: string
  fechas?: string
  mesDetectado?: string // nombre del mes en minúsculas, ej. "septiembre"
  pasajeros?: string
  presupuesto?: string
  presupuestoNumber?: number // monto numérico (si pudimos parsear)
  presupuestoMoneda?: string // "USD" | "ARS" | "BRL" | "EUR" | "$"
}

/**
 * Si el texto matchea el patrón del resumen del bot, devuelve los campos
 * parseados. Si no, devuelve null.
 */
export function extractBotSummary(text: string): SummaryExtracted | null {
  if (!text || typeof text !== "string") return null
  // Debe contener al menos 3 de los 5 emojis del resumen para ser válido
  const emojiHits = [
    text.includes("Ciudad de salida"),
    text.includes("Ciudad de destino"),
    text.includes("Fechas:"),
    text.includes("Cantidad de pasajeros"),
    text.includes("Presupuesto"),
  ].filter(Boolean).length
  if (emojiHits < 3) return null

  const result: SummaryExtracted = {}

  // Helper para extraer el valor a la derecha del label, hasta fin de línea
  const extract = (label: RegExp): string | undefined => {
    const m = text.match(label)
    if (!m) return undefined
    const v = m[1].trim()
    // Ignorar placeholders del prompt
    if (
      !v ||
      /^\[?(pendiente|dato|a definir|sin especificar|n\/?a)\]?$/i.test(v)
    ) {
      return undefined
    }
    return v
  }

  result.citySalida = extract(/Ciudad de salida:\s*([^\n]+)/i)
  result.cityDestino = extract(/Ciudad de destino:\s*([^\n]+)/i)
  result.fechas = extract(/Fechas:\s*([^\n]+)/i)
  result.pasajeros = extract(/Cantidad de pasajeros:\s*([^\n]+)/i)
  result.presupuesto = extract(/Presupuesto[^:]*:\s*([^\n]+)/i)

  // Detectar mes desde "Fechas: ..."
  if (result.fechas) {
    const lower = result.fechas.toLowerCase()
    for (const [mes] of Object.entries(MESES_ES)) {
      if (lower.includes(mes)) {
        result.mesDetectado = mes
        break
      }
    }
  }

  // Parsear presupuesto: monto + moneda
  if (result.presupuesto) {
    const p = result.presupuesto
    // Detectar moneda
    if (/\busd\b|dólares|dolares|verdes/i.test(p)) {
      result.presupuestoMoneda = "USD"
    } else if (/\beur\b|euros|€/i.test(p)) {
      result.presupuestoMoneda = "EUR"
    } else if (/\bbrl\b|reales|r\$/i.test(p)) {
      result.presupuestoMoneda = "BRL"
    } else if (/\bars\b|pesos/i.test(p)) {
      result.presupuestoMoneda = "ARS"
    } else if (/\$/.test(p)) {
      // "$" sin sufijo → el bot v50.2 omite la moneda solo cuando es USD
      // (regla A del prompt). Default a USD para evitar pérdida de info.
      result.presupuestoMoneda = "USD"
    }
    // Detectar monto (primer número con separadores)
    const numMatch = p.replace(/\./g, "").match(/(\d[\d,]*)/)
    if (numMatch) {
      const n = parseInt(numMatch[1].replace(/,/g, ""), 10)
      if (!isNaN(n) && n > 0) result.presupuestoNumber = n
    }
  }

  // Si nada se pudo extraer (todos placeholders), devolver null
  if (
    !result.cityDestino &&
    !result.citySalida &&
    !result.fechas &&
    !result.presupuesto
  ) {
    return null
  }

  return result
}
