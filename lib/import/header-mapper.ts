/**
 * Schema: maps field name → list of accepted synonyms (already normalized)
 */
export type HeaderSchema = Record<string, string[]>

/**
 * Normaliza un header: lowercase, sin acentos, espacios → underscore.
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Remueve combining diacritical marks
    .replace(/[^a-z0-9\s_]/g, "")   // Solo alfanuméricos, espacios, underscores
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

/**
 * Mapea cada índice de columna del CSV a un field name canónico,
 * según los sinónimos del schema.
 */
export function mapHeaders(
  headers: string[],
  schema: HeaderSchema
): Map<number, string> {
  const result = new Map<number, string>()

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    for (const [fieldName, synonyms] of Object.entries(schema)) {
      if (synonyms.includes(normalized)) {
        result.set(index, fieldName)
        return
      }
    }
  })

  return result
}
