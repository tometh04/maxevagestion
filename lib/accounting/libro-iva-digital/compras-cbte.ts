/**
 * Generador REGINFO_CV_COMPRAS_CBTE.txt — RG 4597 Libro IVA Digital.
 *
 * Cada línea = 325 chars fixed-width. Una línea por comprobante recibido.
 *
 * Layout (offsets 0-based [start, end)):
 *  [0,8)     Fecha de comprobante (AAAAMMDD)
 *  [8,11)    Tipo de comprobante (3)
 *  [11,16)   Punto de venta (5)
 *  [16,36)   Número de comprobante (20)
 *  [36,52)   Despacho importación (16)
 *  [52,54)   Código documento vendedor (2)
 *  [54,74)   Número identificación vendedor (20)
 *  [74,104)  Apellido y nombre vendedor (30)
 *  [104,119) Importe total operación (15)
 *  [119,134) Importe total conceptos no integran neto (15)
 *  [134,149) Importe operaciones exentas (15)
 *  [149,164) Importe percepciones IVA (15)
 *  [164,179) Importe percepciones no categorizados (15)
 *  [179,194) Importe percepciones IIBB (15)
 *  [194,209) Importe percepciones impuestos municipales (15)
 *  [209,212) Código moneda (3)
 *  [212,222) Tipo de cambio (10)
 *  [222,223) Cantidad alícuotas IVA (1)
 *  [223,224) Código operación (1)
 *  [224,239) Crédito fiscal computable (15)
 *  [239,254) Otros tributos (15)
 *  [254,265) CUIT corredor (11) — 0s si no aplica
 *  [265,295) Denominación corredor (30) — espacios si no aplica
 *  [295,310) IVA comisión (15)
 *  [310,325) Importe impuestos internos (15)
 *
 * Total: 325 chars
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
  cuitClean,
} from "./format"

export interface CompraInput {
  issue_date: string
  cbte_tipo: string | number
  pto_vta: number | string
  cbte_nro: number | string
  despacho_importacion: string | null
  emitter_doc_tipo: number | null
  emitter_cuit: string | null
  emitter_name: string | null
  imp_total: number
  imp_tot_conc: number
  imp_op_ex: number
  perc_iva: number
  perc_no_categorizados: number
  perc_iibb: number
  perc_municipales: number
  imp_internos: number
  moneda: string
  cotizacion: number
  cantidad_alicuotas: number
  codigo_operacion: string
  credito_fiscal_computable: number
  otros_tributos: number
  cuit_corredor: string | null
  denominacion_corredor: string | null
  iva_comision: number
}

export function generateComprasCbteRow(c: CompraInput): string {
  const parts = [
    formatDate(c.issue_date),                                            // 0..8
    CBTE_TIPO(c.cbte_tipo),                                              // 8..11
    padNumber(c.pto_vta, 5),                                             // 11..16
    padNumber(c.cbte_nro, 20),                                           // 16..36
    padString(c.despacho_importacion, 16),                               // 36..52
    DOC_TIPO(c.emitter_doc_tipo),                                        // 52..54
    padNumber(cuitClean(c.emitter_cuit) || 0, 20),                       // 54..74
    padString(c.emitter_name, 30),                                       // 74..104
    formatMoney(c.imp_total, 15),                                        // 104..119
    formatMoney(c.imp_tot_conc, 15),                                     // 119..134
    formatMoney(c.imp_op_ex, 15),                                        // 134..149
    formatMoney(c.perc_iva, 15),                                         // 149..164
    formatMoney(c.perc_no_categorizados, 15),                            // 164..179
    formatMoney(c.perc_iibb, 15),                                        // 179..194
    formatMoney(c.perc_municipales, 15),                                 // 194..209
    MONEDA_CODE(c.moneda),                                               // 209..212
    formatExchangeRate(c.cotizacion),                                    // 212..222
    String(c.cantidad_alicuotas).slice(0, 1),                            // 222..223
    (c.codigo_operacion || " ").slice(0, 1),                             // 223..224
    formatMoney(c.credito_fiscal_computable, 15),                        // 224..239
    formatMoney(c.otros_tributos, 15),                                   // 239..254
    padNumber(cuitClean(c.cuit_corredor) || 0, 11),                      // 254..265
    padString(c.denominacion_corredor, 30),                              // 265..295
    formatMoney(c.iva_comision, 15),                                     // 295..310
    formatMoney(c.imp_internos, 15),                                     // 310..325
  ]
  return parts.join("")
}

export function generateComprasCbteFile(rows: CompraInput[]): string {
  return rows.map(generateComprasCbteRow).join("\r\n")
}
