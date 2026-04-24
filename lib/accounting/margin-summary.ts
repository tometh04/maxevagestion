/**
 * Calculadora pura del estado de facturación de una operación.
 *
 * Dado el margen total y las facturas asociadas, determina cuánto
 * queda por facturar y qué razones bloquean la emisión (sin customer,
 * sin AFIP config, ya facturada full, sin margen).
 *
 * Spec: docs/superpowers/specs/2026-04-24-ganancia-facturacion-design.md
 */

export type ReasonDisabled =
  | "no_margin"
  | "no_customer"
  | "no_afip"
  | "already_fully_invoiced"

export interface MarginSummary {
  margin_total: number
  already_invoiced: number
  remaining: number
  can_invoice: boolean
  reason_disabled: ReasonDisabled | null
}

interface OperationForMargin {
  margin_amount: number
  customer_id: string | null
}

interface InvoiceForMargin {
  imp_total: number
  status: string
}

export function calculateMarginSummary(
  operation: OperationForMargin,
  invoices: InvoiceForMargin[],
  hasAfipConfig: boolean
): MarginSummary {
  const margin = Number(operation.margin_amount)

  const already = invoices
    .filter((i) => i.status === "authorized")
    .reduce((acc, i) => acc + Number(i.imp_total), 0)

  // Redondeo a 2 decimales para evitar falsos "remaining" negativos
  // por ruido de IEEE 754 (20000 - 19999.99 = 0.01000000000218...)
  const remainingRaw = margin - already
  const remaining = Math.max(0, Math.round(remainingRaw * 100) / 100)

  let reason: ReasonDisabled | null = null
  if (margin <= 0) {
    reason = "no_margin"
  } else if (!operation.customer_id) {
    reason = "no_customer"
  } else if (!hasAfipConfig) {
    reason = "no_afip"
  } else if (remaining <= 0) {
    reason = "already_fully_invoiced"
  }

  return {
    margin_total: margin,
    already_invoiced: already,
    remaining,
    can_invoice: reason === null,
    reason_disabled: reason,
  }
}
