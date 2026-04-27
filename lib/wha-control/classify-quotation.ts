export type ClassificationSource =
  | "heuristic_positive"
  | "heuristic_negative"
  | "llm"
  | "llm_low_confidence"

export type ClassificationResult = {
  is_quotation: boolean
  source: ClassificationSource
  confidence?: number
}

const POSITIVE_RX = /\b(cotiz|presupuesto|quotation|propuesta|cot[-_])/i
const NEGATIVE_RX = /\b(factura|invoice|voucher|recibo|receipt|comprobante|asistencia|seguro|itiner|boleto|ticket|pasaporte|dni|cartilla)/i

export function classifyByFilename(filename: string | null): ClassificationResult | null {
  if (!filename) return null
  if (POSITIVE_RX.test(filename)) {
    return { is_quotation: true, source: "heuristic_positive" }
  }
  if (NEGATIVE_RX.test(filename)) {
    return { is_quotation: false, source: "heuristic_negative" }
  }
  return null
}
