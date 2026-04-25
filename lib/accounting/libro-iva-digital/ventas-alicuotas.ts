/**
 * Generador REGINFO_CV_VENTAS_ALICUOTAS.txt — RG 4597 Libro IVA Digital.
 *
 * Una línea por (comprobante × alícuota IVA gravada). Si el comprobante tiene
 * IVA al 21% y al 10.5%, son 2 líneas. Alícuotas con monto 0 NO se incluyen
 * (regla AFIP: solo grabados con neto > 0).
 *
 * Estructura (62 chars):
 *  [0,3)   Tipo de comprobante
 *  [3,8)   Punto de venta
 *  [8,28)  Número de comprobante
 *  [28,43) Importe neto gravado (15)
 *  [43,47) Alícuota IVA (4) — código AFIP (2100, 1050, etc.)
 *  [47,62) Impuesto liquidado (15)
 */

import {
  padNumber,
  formatMoney,
  formatRate,
  CBTE_TIPO,
} from "./format"

export interface VentaAlicuotaInput {
  cbte_tipo: string | number
  pto_vta: number | string
  cbte_nro: number | string
  /** Map alícuota → { neto, iva } */
  iva_breakdown: Record<string | number, { neto: number; iva: number }>
}

const VALID_RATES = [27, 21, 10.5, 5, 2.5] as const

export function generateVentasAlicuotasRows(v: VentaAlicuotaInput): string[] {
  const rows: string[] = []
  for (const rate of VALID_RATES) {
    const breakdown = v.iva_breakdown[rate] ?? v.iva_breakdown[String(rate)]
    if (!breakdown) continue
    const neto = Number(breakdown.neto) || 0
    const iva = Number(breakdown.iva) || 0
    if (neto <= 0 && iva <= 0) continue

    const row = [
      CBTE_TIPO(v.cbte_tipo),
      padNumber(v.pto_vta, 5),
      padNumber(v.cbte_nro, 20),
      formatMoney(neto, 15),
      formatRate(rate),
      formatMoney(iva, 15),
    ].join("")
    rows.push(row)
  }
  return rows
}

export function generateVentasAlicuotasFile(inputs: VentaAlicuotaInput[]): string {
  const allRows: string[] = []
  for (const v of inputs) {
    allRows.push(...generateVentasAlicuotasRows(v))
  }
  return allRows.join("\r\n")
}
