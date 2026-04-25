/**
 * Generador REGINFO_CV_COMPRAS_ALICUOTAS.txt — RG 4597 Libro IVA Digital.
 *
 * Una línea por (compra × alícuota IVA gravada). Como ventas-alicuotas pero
 * incluye CUIT del vendedor (las compras requieren identificar emisor).
 *
 * Estructura (73 chars):
 *  [0,3)   Tipo de comprobante
 *  [3,8)   Punto de venta
 *  [8,28)  Número de comprobante
 *  [28,39) CUIT vendedor (11)
 *  [39,54) Importe neto gravado (15)
 *  [54,58) Alícuota IVA (4)
 *  [58,73) Impuesto liquidado (15)
 */

import {
  padNumber,
  formatMoney,
  formatRate,
  CBTE_TIPO,
  cuitClean,
} from "./format"

export interface CompraAlicuotaInput {
  cbte_tipo: string | number
  pto_vta: number | string
  cbte_nro: number | string
  emitter_cuit: string | null
  iva_breakdown: Record<string | number, { neto: number; iva: number }>
}

const VALID_RATES = [27, 21, 10.5, 5, 2.5] as const

export function generateComprasAlicuotasRows(c: CompraAlicuotaInput): string[] {
  const rows: string[] = []
  const cleanCuit = cuitClean(c.emitter_cuit)
  const cuitPadded = cleanCuit ? cleanCuit.padStart(11, "0").slice(-11) : "00000000000"

  for (const rate of VALID_RATES) {
    const breakdown = c.iva_breakdown[rate] ?? c.iva_breakdown[String(rate)]
    if (!breakdown) continue
    const neto = Number(breakdown.neto) || 0
    const iva = Number(breakdown.iva) || 0
    if (neto <= 0 && iva <= 0) continue

    const row = [
      CBTE_TIPO(c.cbte_tipo),
      padNumber(c.pto_vta, 5),
      padNumber(c.cbte_nro, 20),
      cuitPadded,
      formatMoney(neto, 15),
      formatRate(rate),
      formatMoney(iva, 15),
    ].join("")
    rows.push(row)
  }
  return rows
}

export function generateComprasAlicuotasFile(inputs: CompraAlicuotaInput[]): string {
  const allRows: string[] = []
  for (const c of inputs) {
    allRows.push(...generateComprasAlicuotasRows(c))
  }
  return allRows.join("\r\n")
}
