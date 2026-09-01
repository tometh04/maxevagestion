/**
 * MAPEO FISCAL AFIP — condición IVA del receptor → tipo de comprobante y documento
 *
 * (VIB-135) Antes esta lógica vivía inline y duplicada en la pantalla de Nueva
 * Factura (`app/(dashboard)/operations/billing/new/page.tsx`): el `condicion === 1 ? 1 : 6`,
 * el mapeo inverso, la inferencia de DocTipo por cantidad de dígitos y los
 * defaults por documento del cliente. No era reutilizable desde una API ni
 * testeable.
 *
 * Este módulo es la fuente única de ese mapeo. NO cambia el comportamiento:
 * reproduce exactamente lo que hacía la UI, incluidos sus fallbacks.
 *
 * Ojo — ejes distintos, no confundir:
 *  - Acá: condición IVA del RECEPTOR → letra de factura + tipo de documento.
 *  - `lib/invoices/calculation.ts` (`IVA_PORCENTAJE_TO_ID`): alícuota de IVA → Id AFIP.
 *  - `lib/afip/afip-service.ts`: solo transporta `receptor_condicion_iva` al payload.
 */

/** Tipos de documento del receptor (AFIP) */
export const AFIP_DOC_TIPO = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  /** Sin identificar / Consumidor Final */
  SIN_IDENTIFICAR: 99,
} as const

/** Tipos de comprobante (AFIP) */
export const AFIP_CBTE_TIPO = {
  FACTURA_A: 1,
  FACTURA_B: 6,
} as const

/** Condición IVA del receptor (AFIP — CondicionIVAReceptorId) */
export const CONDICION_IVA_RECEPTOR = {
  RESPONSABLE_INSCRIPTO: 1,
  SUJETO_EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
} as const

export type CondicionIvaReceptor =
  (typeof CONDICION_IVA_RECEPTOR)[keyof typeof CONDICION_IVA_RECEPTOR]

/** Opciones para el selector de condición IVA, con la letra que produce cada una. */
export const CONDICION_IVA_OPTIONS: Array<{
  id: CondicionIvaReceptor
  label: string
  letra: "A" | "B"
}> = [
  { id: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL, label: "Consumidor Final", letra: "B" },
  { id: CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO, label: "Responsable Inscripto", letra: "A" },
  { id: CONDICION_IVA_RECEPTOR.SUJETO_EXENTO, label: "Sujeto Exento", letra: "B" },
  { id: CONDICION_IVA_RECEPTOR.MONOTRIBUTO, label: "Monotributista", letra: "B" },
]

interface CustomerDocumentLike {
  document_type?: string | null
  document_number?: string | null
}

/**
 * Condición IVA → tipo de comprobante.
 * Solo Responsable Inscripto emite Factura A; el resto, Factura B.
 */
export function getCbteTipoForCondicion(condicion: number): number {
  return condicion === CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO
    ? AFIP_CBTE_TIPO.FACTURA_A
    : AFIP_CBTE_TIPO.FACTURA_B
}

/**
 * Mapeo inverso: tipo de comprobante → condición IVA.
 *
 * Factura A implica Responsable Inscripto. Al pasar de A a B, si la condición
 * venía siendo RI hay que moverla (queda Consumidor Final); si ya era otra
 * (exento, monotributo), se respeta la que el usuario había elegido.
 */
export function getCondicionForCbteTipo(cbteTipo: number, currentCondicion: number): number {
  if (cbteTipo === AFIP_CBTE_TIPO.FACTURA_A) {
    return CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO
  }
  return currentCondicion === CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO
    ? CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL
    : currentCondicion
}

/** Documento del cliente → DocTipo AFIP. Sin documento cargado: 99. */
export function getCustomerAfipDocType(customer: CustomerDocumentLike): number {
  const docType = customer.document_type?.toUpperCase()
  const hasDocument = Boolean(customer.document_number)

  if (!hasDocument) return AFIP_DOC_TIPO.SIN_IDENTIFICAR
  if (docType === "CUIT") return AFIP_DOC_TIPO.CUIT
  if (docType === "CUIL") return AFIP_DOC_TIPO.CUIL
  if (docType === "DNI") return AFIP_DOC_TIPO.DNI
  return AFIP_DOC_TIPO.SIN_IDENTIFICAR
}

/**
 * Defaults del receptor a partir del documento fiscal del cliente:
 *  - CUIT → Factura A (RI), DocTipo 80
 *  - CUIL → Factura B (CF), DocTipo 86
 *  - DNI  → Factura B (CF), DocTipo 96
 *  - sin documento → Factura B (CF), DocTipo 99, DocNro "0"
 */
export function getReceptorDefaults(customer: CustomerDocumentLike): {
  cbte_tipo: number
  receptor_doc_tipo: number
  receptor_doc_nro: string
  receptor_condicion_iva: number
} {
  const docType = customer.document_type?.toUpperCase()
  const docNumber = customer.document_number || ""
  const cuit = docType === "CUIT" ? docNumber : ""
  const cuil = docType === "CUIL" ? docNumber : ""
  const dni = docType === "DNI" ? docNumber : ""

  if (cuit) {
    return {
      cbte_tipo: AFIP_CBTE_TIPO.FACTURA_A,
      receptor_doc_tipo: AFIP_DOC_TIPO.CUIT,
      receptor_doc_nro: cuit,
      receptor_condicion_iva: CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO,
    }
  }

  if (cuil) {
    return {
      cbte_tipo: AFIP_CBTE_TIPO.FACTURA_B,
      receptor_doc_tipo: AFIP_DOC_TIPO.CUIL,
      receptor_doc_nro: cuil,
      receptor_condicion_iva: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
    }
  }

  return {
    cbte_tipo: AFIP_CBTE_TIPO.FACTURA_B,
    receptor_doc_tipo: dni ? AFIP_DOC_TIPO.DNI : AFIP_DOC_TIPO.SIN_IDENTIFICAR,
    receptor_doc_nro: dni || "0",
    receptor_condicion_iva: CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
  }
}

/**
 * DocTipo inferido mientras el usuario tipea el número de documento.
 *
 * 11 dígitos → CUIT, 7 u 8 → DNI, vacío → sin identificar. Si la condición es
 * Responsable Inscripto se fuerza CUIT aunque todavía no haya terminado de
 * tipear (Factura A obliga DocTipo 80; sin esto AFIP devuelve el error 10013).
 */
export function inferDocTipoFromDocNumber(params: {
  docNro: string
  condicion: number
  currentDocTipo: number
}): number {
  const { docNro, condicion, currentDocTipo } = params

  if (condicion === CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO) {
    return AFIP_DOC_TIPO.CUIT
  }

  const digits = (docNro || "").replace(/\D/g, "")
  if (digits.length === 0) return AFIP_DOC_TIPO.SIN_IDENTIFICAR
  if (digits.length === 11) return AFIP_DOC_TIPO.CUIT
  if (digits.length === 7 || digits.length === 8) return AFIP_DOC_TIPO.DNI
  return currentDocTipo
}

/**
 * DocTipo al cambiar la condición IVA desde el selector.
 *
 * Con Responsable Inscripto se fuerza CUIT. Con el resto se vuelve al documento
 * del cliente seleccionado (o al DocTipo actual si es uno válido), salvo que no
 * haya número cargado, en cuyo caso queda "sin identificar".
 */
export function resolveDocTipoForCondicion(params: {
  condicion: number
  customer?: CustomerDocumentLike | null
  currentDocTipo: number
  currentDocNro: string
}): number {
  const { condicion, customer, currentDocTipo, currentDocNro } = params

  if (condicion === CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO) {
    return AFIP_DOC_TIPO.CUIT
  }

  const fallbackDocType = customer
    ? getCustomerAfipDocType(customer)
    : [AFIP_DOC_TIPO.CUIT, AFIP_DOC_TIPO.CUIL, AFIP_DOC_TIPO.DNI].includes(currentDocTipo as any)
      ? currentDocTipo
      : AFIP_DOC_TIPO.DNI

  return currentDocNro && currentDocNro !== "0"
    ? fallbackDocType
    : AFIP_DOC_TIPO.SIN_IDENTIFICAR
}

/** Factura A exige CUIT del receptor (AFIP error 10013 si falta). */
export function requiresReceptorCuit(cbteTipo: number): boolean {
  return cbteTipo === AFIP_CBTE_TIPO.FACTURA_A
}

/** Etiqueta legible del comprobante ("Factura A" / "Factura B"). */
export function getFacturaLabel(cbteTipo: number): string {
  return cbteTipo === AFIP_CBTE_TIPO.FACTURA_A ? "Factura A" : "Factura B"
}
