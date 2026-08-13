/**
 * Helpers de exportación CSV, pensados para que Excel en español (Argentina)
 * abra el archivo bien sin tocar nada.
 *
 * Convención (la misma que `app/api/operations/export-csv`):
 * - Separador `;` — Excel-ES usa el punto y coma como separador de lista y la
 *   coma como decimal. Con `,` mete todas las columnas en la celda A.
 * - Directiva `sep=;` en la 1ra línea: fija el separador en cualquier locale.
 * - BOM UTF-8: sin esto los acentos se rompen ("Comisión" → "ComisiÃ³n").
 * - Line endings CRLF: es lo que espera Excel en Windows.
 * - Montos con coma decimal y sin separador de miles (`numEs`).
 */

/** BOM UTF-8. */
const BOM = String.fromCharCode(0xfeff)

/** Separador de columnas. */
export const CSV_DELIMITER = ";"

export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""

  const stringValue = String(value)
  // Escapar si contiene el separador (;), comillas o saltos de línea.
  // NO se escapa por coma: los montos decimales usan coma (1234,56).
  if (/[";\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

/**
 * Formatea un número con decimal argentino (coma) para que Excel-ES lo
 * interprete como número. Sin separador de miles — rompería el parseo.
 */
export function numEs(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return ""
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return String(n).replace(".", ",")
}

export type CsvCell = string | number | null | undefined

/** Arma el CSV completo, listo para Excel. */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCsvValue(cell)).join(CSV_DELIMITER)
  )

  return BOM + `sep=${CSV_DELIMITER}\r\n` + lines.join("\r\n")
}

/** Respuesta HTTP lista para descargar como archivo. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
