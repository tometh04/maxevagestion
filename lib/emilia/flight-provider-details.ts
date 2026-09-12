export interface FlightProviderSection {
  title: string
  fields: Array<{ label: string; value: string }>
}

/** Persist only the public display contract; render all values as text. */
export function flightProviderSections(value: unknown): FlightProviderSection[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap(section => {
    if (!section || typeof section.title !== "string" || !Array.isArray(section.fields)) return []
    return [{ title: section.title, fields: section.fields.flatMap((field: unknown) => {
      if (!field || typeof field !== "object") return []
      const row = field as Record<string, unknown>
      return typeof row.label === "string" && typeof row.value === "string" ? [{ label: row.label, value: row.value }] : []
    }) }]
  })
}
