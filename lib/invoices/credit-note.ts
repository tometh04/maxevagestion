// Helpers para Notas de Crédito / Débito (NC/ND).
//
// Una NC/ND se emite por el mismo método (Web Service) y contra el mismo punto
// de venta que la factura original, y referencia ese comprobante vía CbtesAsoc.
// La "letra" (A/B/C/E) de la NC/ND se deriva de la factura origen.

export type CreditNoteKind = "NC" | "ND"

// Mapeo factura origen → { NC, ND } según códigos AFIP.
//   1  Factura A  → 3 (NC A) / 2 (ND A)
//   6  Factura B  → 8 (NC B) / 7 (ND B)
//   11 Factura C  → 13 (NC C) / 12 (ND C)
//   19 Factura E  → 21 (NC E) / 20 (ND E)
//   201 Factura A MiPyME → 203 (NC A FCE) / 202 (ND A FCE)
//   206 Factura B MiPyME → 208 (NC B FCE) / 207 (ND B FCE)
//   211 Factura C MiPyME → 213 (NC C FCE) / 212 (ND C FCE)
const CREDIT_NOTE_MAP: Record<number, { NC: number; ND: number }> = {
  1: { NC: 3, ND: 2 },
  6: { NC: 8, ND: 7 },
  11: { NC: 13, ND: 12 },
  19: { NC: 21, ND: 20 },
  201: { NC: 203, ND: 202 },
  206: { NC: 208, ND: 207 },
  211: { NC: 213, ND: 212 },
}

// Tipos de comprobante que son Nota de Crédito.
const CREDIT_NOTE_TYPES = new Set([3, 8, 13, 21, 53, 203, 208, 213])
// Tipos de comprobante que son Nota de Débito.
const DEBIT_NOTE_TYPES = new Set([2, 7, 12, 20, 52, 202, 207, 212])

/**
 * Deriva el cbte_tipo de la NC/ND a partir del tipo de la factura original.
 * Lanza si la factura origen no soporta NC/ND.
 */
export function deriveCreditNoteType(originalCbteTipo: number, kind: CreditNoteKind): number {
  const mapped = CREDIT_NOTE_MAP[originalCbteTipo]
  if (!mapped) {
    throw new Error(
      `No se puede emitir ${kind} para el comprobante tipo ${originalCbteTipo}: no es una factura soportada.`
    )
  }
  return mapped[kind]
}

/** True si el cbte_tipo es una Nota de Crédito. */
export function isCreditNote(cbteTipo: number): boolean {
  return CREDIT_NOTE_TYPES.has(cbteTipo)
}

/** True si el cbte_tipo es una Nota de Débito. */
export function isDebitNote(cbteTipo: number): boolean {
  return DEBIT_NOTE_TYPES.has(cbteTipo)
}

/** True si el cbte_tipo es NC o ND (requiere CbtesAsoc en AFIP). */
export function isCreditOrDebitNote(cbteTipo: number): boolean {
  return isCreditNote(cbteTipo) || isDebitNote(cbteTipo)
}

/**
 * Signo contable del comprobante para el Libro IVA Ventas.
 * Las NC restan del débito fiscal; facturas y ND suman.
 */
export function ledgerSign(cbteTipo: number): 1 | -1 {
  return isCreditNote(cbteTipo) ? -1 : 1
}
