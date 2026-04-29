/**
 * Helpers de formato para Libro IVA Digital RG 4597.
 *
 * Los archivos REGINFO son fixed-width text. Un bug de padding rompe
 * la importación entera en AFIP — por eso tests estrictos por helper.
 */

export function padNumber(value: number | string, length: number): string {
  const str = String(Math.abs(Math.trunc(Number(value) || 0)))
  if (str.length >= length) return str.slice(-length)
  return str.padStart(length, "0")
}

export function padString(value: string | null | undefined, length: number): string {
  const str = value ?? ""
  if (str.length >= length) return str.slice(0, length)
  return str.padEnd(length, " ")
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "00000000"
  // Acepta "YYYY-MM-DD" o ISO datetime
  const datePart = value.includes("T") ? value.split("T")[0] : value
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return "00000000"
  return `${match[1]}${match[2]}${match[3]}`
}

/**
 * Formatea monto a fixed-width sin punto decimal (2 decimales implícitos).
 * Ej: 12345.67 con length=15 → "000000001234567"
 * Negativos: signo "-" en posición 0 + zero-pad
 */
export function formatMoney(amount: number, length: number): string {
  const value = Number(amount) || 0
  const cents = Math.round(Math.abs(value) * 100)
  const isNegative = value < 0
  const numStr = String(cents)

  if (isNegative) {
    // signo + zero-pad para llegar al length total
    return "-" + numStr.padStart(length - 1, "0")
  }
  return numStr.padStart(length, "0")
}

/**
 * Tipo de cambio a fixed-width 10 chars con 4 decimales implícitos.
 * Ej: 1.0 → "0010000000", 1234.5 → "0012345000"
 */
export function formatExchangeRate(rate: number): string {
  const cents = Math.round(rate * 10000)
  return String(cents).padStart(10, "0")
}

/**
 * Alícuota IVA a 4 chars con 2 decimales implícitos (formato AFIP).
 * Ej: 21 → "2100", 10.5 → "1050", 5 → "0500"
 */
export function formatRate(rate: number): string {
  const cents = Math.round(rate * 100)
  return String(cents).padStart(4, "0")
}

export function cuitClean(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/[\s-]/g, "")
}

const CBTE_TIPO_BY_NAME: Record<string, string> = {
  FACTURA_A: "001",
  NOTA_DEBITO_A: "002",
  NOTA_CREDITO_A: "003",
  RECIBO_A: "004",
  NOTA_VENTA_AL_CONTADO_A: "005",
  FACTURA_B: "006",
  NOTA_DEBITO_B: "007",
  NOTA_CREDITO_B: "008",
  RECIBO_B: "009",
  NOTA_VENTA_AL_CONTADO_B: "010",
  FACTURA_C: "011",
  NOTA_DEBITO_C: "012",
  NOTA_CREDITO_C: "013",
  RECIBO_C: "015",
  NOTA_DEBITO_M: "052",
  NOTA_CREDITO_M: "053",
  FACTURA_M: "051",
  T: "195", // factura T turismo
  FACTURA_T: "195",
}

export function CBTE_TIPO(input: string | number | null | undefined): string {
  if (input == null) return "000"
  if (typeof input === "number") {
    return String(input).padStart(3, "0")
  }
  return CBTE_TIPO_BY_NAME[input] ?? "000"
}

const DOC_TIPO_VALID = new Set([80, 86, 96, 87, 89, 90, 94, 99])

export function DOC_TIPO(input: number | null | undefined): string {
  if (!input) return "99"
  if (DOC_TIPO_VALID.has(input)) return String(input)
  return "99"
}

const MONEDA_BY_CODE: Record<string, string> = {
  ARS: "PES",
  PES: "PES",
  USD: "DOL",
  DOL: "DOL",
  EUR: "060",
  BRL: "012",
}

export function MONEDA_CODE(input: string | null | undefined): string {
  if (!input) return "PES"
  return MONEDA_BY_CODE[input.toUpperCase()] ?? "PES"
}
