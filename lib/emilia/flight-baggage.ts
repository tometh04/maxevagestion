export interface BaggageAllowance {
  included: boolean | null
  pieces?: number
  weight?: { value: number; unit: "KG" | "LB" }
  weight_description?: string
  dimensions_description?: string
}

export interface SegmentBaggage {
  checked: BaggageAllowance
  carry_on: BaggageAllowance
  personal_item: BaggageAllowance
  by_passenger_type?: Array<{ passenger_type: string; checked: BaggageAllowance }>
}

/** Short display only; detailed allowances remain available in the itinerary. */
export function summarizeSegmentBaggage(segments: Array<{ baggage?: SegmentBaggage }>): string | null {
  if (!segments.some(segment => segment.baggage)) return null
  if (segments.some(segment => !segment.baggage)) return "Equipaje: datos por confirmar por tramo"
  const descriptions = segments.map(segment => formatSegmentBaggage([segment]))
  if (new Set(descriptions).size > 1) return "Equipaje: varía por tramo"
  const baggage = segments[0].baggage!
  const shortStatus = (value?: BaggageAllowance) => value?.included === true ? "incluido" : value?.included === false ? "no incluido" : "a confirmar"
  return `Despachado: ${shortStatus(baggage.checked)} · De mano: ${shortStatus(baggage.carry_on)}`
}

function formatAllowance(label: string, value?: BaggageAllowance): string {
  if (value?.included === false) return `${label}: no incluido`
  const details: string[] = []
  if (typeof value?.pieces === "number") details.push(`${value.pieces} pieza${value.pieces === 1 ? "" : "s"}`)
  if (value?.weight) details.push(`${value.weight.value} ${value.weight.unit.toLowerCase()}`)
  if (value?.weight_description) details.push(value.weight_description)
  if (value?.dimensions_description) details.push(value.dimensions_description)
  const status = value?.included === true ? "incluido" : "a confirmar"
  return `${label}: ${status}${details.length ? ` (${details.join(", ")})` : ""}`
}

/** A connection may have a different allowance; never apply the first segment to the whole leg. */
export function formatSegmentBaggage(segments: Array<{
  departure?: { airport_code?: string | null }
  arrival?: { airport_code?: string | null }
  baggage?: SegmentBaggage
}>): string | null {
  if (!segments.some(segment => segment.baggage)) return null
  return segments.map((segment, index) => {
    const baggage = segment.baggage
    const parts = [formatAllowance("Despachado", baggage?.checked), formatAllowance("Carry-on", baggage?.carry_on)]
    const personal = baggage?.personal_item
    if (personal && (personal.included !== null || personal.pieces !== undefined || personal.weight || personal.weight_description || personal.dimensions_description)) {
      parts.push(formatAllowance("Artículo personal", personal))
    }
    for (const entry of baggage?.by_passenger_type ?? []) {
      const passenger = ({ ADT: "Adulto", CHD: "Menor", INF: "Bebé" } as Record<string, string>)[entry.passenger_type] ?? entry.passenger_type
      parts.push(formatAllowance(`Despachado ${passenger}`, entry.checked))
    }
    const route = segments.length > 1
      ? `${segment.departure?.airport_code || `Tramo ${index + 1}`} → ${segment.arrival?.airport_code || "destino"}: ` : ""
    return route + parts.join(" · ")
  }).join("; ")
}
