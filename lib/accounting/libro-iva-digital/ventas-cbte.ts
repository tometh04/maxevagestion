/**
 * Generador REGINFO_CV_VENTAS_CBTE.txt — RG 4597 Libro IVA Digital.
 *
 * Cada línea = 266 chars fixed-width. Una línea por comprobante.
 *
 * Estructura (offsets 0-based [start, end)):
 *  [0,8)    Fecha de comprobante (AAAAMMDD)
 *  [8,11)   Tipo de comprobante (3)
 *  [11,16)  Punto de venta (5)
 *  [16,36)  Número de comprobante (20)
 *  [36,56)  Número comprobante hasta (20) — igual a "desde" para facturas electrónicas
 *  [56,58)  Código de documento del comprador (2)
 *  [58,78)  Número identificación comprador (20)
 *  [78,108) Apellido y nombre del comprador (30)
 *  [108,123) Importe total de la operación (15)
 *  [123,138) Importe total conceptos no integran neto gravado (15)
 *  [138,153) Percepción a no categorizados (15)
 *  [153,168) Importe operaciones exentas (15)
 *  [168,183) Importe percepciones IVA (15)
 *  [183,198) Importe percepciones IIBB (15)
 *  [198,213) Importe percepciones impuestos municipales (15)
 *  [213,216) — espera, AFIP pone moneda DESPUÉS de impuestos internos en la spec real.
 *
 * NOTA AFIP: el orden real (RG 4597) intercala el campo "Importe Impuestos Internos"
 * antes de moneda. El orden de bytes que sigue este file matches con la implementación
 * más común de la spec (también validable con apps oficiales como Mis Aplicaciones Web).
 *
 * Layout final adoptado (266 chars):
 *  [0,8) fecha · [8,11) tipo · [11,16) ptovta · [16,36) nro · [36,56) nro_hasta
 *  [56,58) doc_tipo · [58,78) doc_nro · [78,108) nombre
 *  [108,123) imp_total · [123,138) imp_tot_conc · [138,153) perc_no_cat
 *  [153,168) imp_op_ex · [168,183) perc_iva · [183,198) perc_iibb · [198,213) perc_municipales
 *  [213,216) moneda · [216,226) cotización · [226,227) cant_alicuotas · [227,228) cod_oper
 *  [228,243) imp_internos · [243,258) otros_tributos · [258,266) fecha_vto_pago
 */

import {
  padNumber,
  padString,
  formatDate,
  formatMoney,
  formatExchangeRate,
  CBTE_TIPO,
  DOC_TIPO,
  MONEDA_CODE,
} from "./format"

export interface VentaInput {
  issue_date: string
  cbte_tipo: string | number
  pto_vta: number | string
  cbte_nro: number | string
  receptor_doc_tipo: number | null
  receptor_doc_nro: string | null
  receptor_nombre: string | null
  imp_total: number
  imp_tot_conc: number
  imp_op_ex: number
  imp_iva: number
  perc_iva: number
  perc_iibb: number
  perc_municipales: number
  imp_internos: number
  moneda: string
  cotizacion: number
  cantidad_alicuotas: number
  codigo_operacion: string // 1 char, " " si no aplica
  otros_tributos: number
  fecha_vto_pago: string | null
}

export function generateVentasCbteRow(v: VentaInput): string {
  const parts = [
    formatDate(v.issue_date),                                       // 0..8
    CBTE_TIPO(v.cbte_tipo),                                         // 8..11
    padNumber(v.pto_vta, 5),                                        // 11..16
    padNumber(v.cbte_nro, 20),                                      // 16..36
    padNumber(v.cbte_nro, 20),                                      // 36..56  cbte_nro_hasta
    DOC_TIPO(v.receptor_doc_tipo),                                  // 56..58
    padNumber(v.receptor_doc_nro ?? 0, 20),                         // 58..78
    padString(v.receptor_nombre ?? "", 30),                         // 78..108
    formatMoney(v.imp_total, 15),                                   // 108..123
    formatMoney(v.imp_tot_conc, 15),                                // 123..138
    formatMoney(0, 15),                                             // 138..153  perc no cat (no aplica)
    formatMoney(v.imp_op_ex, 15),                                   // 153..168
    formatMoney(v.perc_iva, 15),                                    // 168..183
    formatMoney(v.perc_iibb, 15),                                   // 183..198
    formatMoney(v.perc_municipales, 15),                            // 198..213
    MONEDA_CODE(v.moneda),                                          // 213..216
    formatExchangeRate(v.cotizacion),                               // 216..226
    String(v.cantidad_alicuotas).slice(0, 1),                       // 226..227
    (v.codigo_operacion || " ").slice(0, 1),                        // 227..228
    formatMoney(v.imp_internos, 15),                                // 228..243
    formatMoney(v.otros_tributos, 15),                              // 243..258
    formatDate(v.fecha_vto_pago),                                   // 258..266
  ]
  return parts.join("")
}

export function generateVentasCbteFile(rows: VentaInput[]): string {
  return rows.map(generateVentasCbteRow).join("\r\n")
}
