import Papa from "papaparse"
import type { z } from "zod"

export interface ParsedRow<T> {
  rowNumber: number
  data: T
  errors: string[]
  warnings: string[]
}

export interface ParseResult<T> {
  rows: ParsedRow<T>[]
  headerError: string | null
}

/**
 * Parsea CSV strict con Zod. Requiere headers exactos (case-insensitive trim).
 * Devuelve rows con errores/warnings por fila, o headerError si los headers no matchean.
 */
export async function parseCsv<T>(
  csv: string,
  schema: z.ZodType<T>,
  expectedHeaders: readonly string[]
): Promise<ParseResult<T>> {
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const actualHeaders = parsed.meta.fields?.map((h) => h.toLowerCase()) ?? []
  const expected = expectedHeaders.map((h) => h.toLowerCase())

  const missing = expected.filter((h) => !actualHeaders.includes(h))
  const extra = actualHeaders.filter((h) => !expected.includes(h))

  if (missing.length > 0 || extra.length > 0) {
    const parts: string[] = []
    if (missing.length > 0) parts.push(`faltan: ${missing.join(", ")}`)
    if (extra.length > 0) parts.push(`sobran: ${extra.join(", ")}`)
    return {
      rows: [],
      headerError: `Headers no coinciden con la plantilla. ${parts.join(". ")}. Descargá la plantilla de nuevo.`,
    }
  }

  const rows: ParsedRow<T>[] = (parsed.data as Record<string, string>[]).map((raw, i) => {
    const result = schema.safeParse(raw)
    if (result.success) {
      return { rowNumber: i + 2, data: result.data, errors: [], warnings: [] }
    }
    const errors = result.error.issues.map(
      (iss) => `${iss.path.join(".")}: ${iss.message}`
    )
    return { rowNumber: i + 2, data: raw as unknown as T, errors, warnings: [] }
  })

  return { rows, headerError: null }
}
