/**
 * Armado de CSV para Excel en español (Argentina).
 *
 * Excel-ES usa **punto y coma** como separador de lista y la **coma** como
 * decimal. Un CSV con comas se abre con todas las columnas amontonadas en la
 * celda A — el "archivo todo roto" que reportaron primero en operaciones
 * (VIB-118 / project_csv_excel_es) y después en caja (VIB-146).
 *
 * Cada export lo venía resolviendo por su cuenta: operaciones lo tenía bien,
 * caja había quedado con el formato viejo, y el de clientes iba a ser una
 * tercera copia. Vive acá para que no haya una cuarta.
 *
 * Los exports de operaciones y caja siguen con su implementación propia; migrarlos
 * es mecánico y queda pendiente, pero no se hizo junto con esto para no tocar dos
 * caminos que hoy funcionan.
 */

/** Separador de columnas. Nunca coma: la coma es el decimal. */
export const CSV_DELIMITER = ";"

/**
 * Escapa un valor. Se entrecomilla solo si trae el separador, comillas o saltos
 * de línea — **no** por coma, porque los importes decimales la usan (1234,56).
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  if (/[";\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Decimal argentino: coma, sin separador de miles (rompería el parseo de Excel). */
export function csvNumber(value: unknown, decimals = 2): string {
  if (value === null || value === undefined || value === "") return ""
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toFixed(decimals).replace(".", ",")
}

/** Fecha DATE ("YYYY-MM-DD") a dd/MM/yyyy, sin pasar por Date (evita el corrimiento de timezone). */
export function csvDate(value: unknown): string {
  if (!value) return ""
  const raw = String(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : raw
}

/**
 * Cuerpo del CSV listo para servir.
 *
 * Lleva BOM (sin él Excel rompe los acentos), la directiva `sep=;` que fija el
 * separador en cualquier configuración regional, y CRLF, que es lo que espera
 * Excel en Windows.
 */
export function buildCsvBody(headers: string[], rows: Array<Array<unknown>>): string {
  const BOM = "﻿"
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(CSV_DELIMITER))
  return BOM + "sep=;\r\n" + lines.join("\r\n")
}

/** Headers HTTP de una descarga de CSV. */
export function csvDownloadHeaders(filename: string): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  }
}
