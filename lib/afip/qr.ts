/**
 * QR AFIP (RG 4291) — generador de payload y URL para validación.
 *
 * El QR oficial AFIP contiene un JSON codificado en base64 URL-safe,
 * prependido con la URL del validador de AFIP. Cuando el receptor escanea
 * el QR con la cámara, va al validador oficial y confirma autenticidad.
 *
 * Spec: https://www.afip.gob.ar/fe/qr/especificaciones.asp (RG 4291)
 */

export interface AfipQrPayload {
  ver: 1
  fecha: string      // YYYY-MM-DD
  cuit: number       // CUIT emisor
  ptoVta: number
  tipoCmp: number    // tipo comprobante AFIP (1=A, 6=B, 11=C, 19=E...)
  nroCmp: number
  importe: number    // ImpTotal
  moneda: string     // "PES" | "DOL" | etc
  ctz: number        // cotización
  tipoDocRec: number // tipo documento receptor
  nroDocRec: number
  tipoCodAut: "E" | "A" // E=CAE, A=CAEA
  codAut: number
}

interface InvoiceForQr {
  fecha_emision: string
  pto_vta: number
  cbte_tipo: number
  cbte_nro: number
  imp_total: number
  moneda: string
  cotizacion: number
  receptor_doc_tipo: number
  receptor_doc_nro: string
  cae: string
}

/**
 * Construye el payload AFIP QR desde los campos de una factura autorizada.
 * El CUIT del emisor viene del afip config de la agencia, no de la factura.
 */
export function buildAfipQrPayload(
  invoice: InvoiceForQr,
  emisorCuit: string
): AfipQrPayload {
  return {
    ver: 1,
    fecha: invoice.fecha_emision,
    cuit: Number(emisorCuit),
    ptoVta: invoice.pto_vta,
    tipoCmp: invoice.cbte_tipo,
    nroCmp: invoice.cbte_nro,
    importe: Number(invoice.imp_total),
    moneda: invoice.moneda,
    ctz: Number(invoice.cotizacion),
    tipoDocRec: invoice.receptor_doc_tipo,
    nroDocRec: Number(invoice.receptor_doc_nro) || 0,
    tipoCodAut: "E",
    codAut: Number(invoice.cae),
  }
}

/**
 * Codifica el payload en base64 URL-safe y arma la URL de validación.
 * base64 URL-safe: + → -, / → _, sin padding = (RFC 4648 §5).
 */
export function buildAfipQrUrl(payload: AfipQrPayload): string {
  const json = JSON.stringify(payload)
  const base64 = Buffer.from(json, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`
}
