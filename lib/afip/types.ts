// Tipos para la integración con AFIP SDK
// Documentación: https://afipsdk.com/docs/api-reference/introduction/

// Tipos de comprobante AFIP
export type TipoComprobante = 
  | 1   // Factura A
  | 2   // Nota de Débito A
  | 3   // Nota de Crédito A
  | 6   // Factura B
  | 7   // Nota de Débito B
  | 8   // Nota de Crédito B
  | 11  // Factura C
  | 12  // Nota de Débito C
  | 13  // Nota de Crédito C
  | 19  // Factura E (Exportación)
  | 20  // Nota de Débito E
  | 21  // Nota de Crédito E
  | 201 // Factura de Crédito MiPyME A
  | 206 // Factura de Crédito MiPyME B
  | 211 // Factura de Crédito MiPyME C

// Tipos de documento
export type TipoDocumento =
  | 80  // CUIT
  | 86  // CUIL
  | 87  // CDI
  | 89  // LE
  | 90  // LC
  | 91  // CI Extranjera
  | 92  // En trámite
  | 93  // Acta Nacimiento
  | 95  // CI Buenos Aires
  | 96  // DNI
  | 99  // Doc. (Otro)
  | 0   // CI Policía Federal

// Tipos de IVA
export type TipoIVA =
  | 3   // 0%
  | 4   // 10.5%
  | 5   // 21%
  | 6   // 27%
  | 8   // 5%
  | 9   // 2.5%

// Tipos de condición frente al IVA
export type CondicionIVA =
  | 1   // Responsable Inscripto
  | 2   // Responsable No Inscripto
  | 3   // No Responsable
  | 4   // Exento
  | 5   // Consumidor Final
  | 6   // Monotributista
  | 7   // Sujeto No Categorizado
  | 8   // Proveedor del Exterior
  | 9   // Cliente del Exterior
  | 10  // IVA Liberado
  | 11  // Responsable Monotributo
  | 12  // Pequeño Contribuyente Eventual
  | 13  // Monotributista Social

// Request para crear factura
export interface CreateInvoiceRequest {
  // Identificación del comprobante
  CbteTipo: TipoComprobante
  PtoVta: number
  Concepto: 1 | 2 | 3 // 1: Productos, 2: Servicios, 3: Productos y Servicios
  
  // Datos del receptor
  DocTipo: TipoDocumento
  DocNro: number // Número de documento (CUIT sin guiones)
  
  // Datos del comprobante
  CbteFch?: string // Fecha del comprobante (YYYYMMDD) - opcional, por defecto hoy
  ImpTotal: number // Importe total
  ImpTotConc: number // Importe total de conceptos no gravados
  ImpNeto: number // Importe neto gravado
  ImpOpEx: number // Importe operaciones exentas
  ImpIVA: number // Importe total de IVA
  ImpTrib: number // Importe total de tributos
  
  // Fechas para servicios (requerido si Concepto = 2 o 3)
  FchServDesde?: string // Fecha desde (YYYYMMDD)
  FchServHasta?: string // Fecha hasta (YYYYMMDD)
  FchVtoPago?: string // Fecha vencimiento pago (YYYYMMDD)
  
  // Moneda
  MonId?: string // Código de moneda (PES, DOL, etc.) - default PES
  MonCotiz?: number // Cotización - default 1
  
  // Detalle de IVA (array de alícuotas)
  Iva?: Array<{
    Id: TipoIVA
    BaseImp: number // Base imponible
    Importe: number // Importe de IVA
  }>
  
  // Tributos opcionales
  Tributos?: Array<{
    Id: number
    Desc: string
    BaseImp: number
    Alic: number
    Importe: number
  }>
  
  // Comprobantes asociados (para notas de crédito/débito)
  CbtesAsoc?: Array<{
    Tipo: TipoComprobante
    PtoVta: number
    Nro: number
    Cuit?: number
    CbteFch?: string
  }>
  
  // Opcional: Items para Factura de Crédito MiPyME
  Opcionales?: Array<{
    Id: string
    Valor: string
  }>
}

// Respuesta de AFIP al crear factura
export interface CreateInvoiceResponse {
  success: boolean
  data?: {
    CAE: string // Código de Autorización Electrónico
    CAEFchVto: string // Fecha de vencimiento del CAE (YYYYMMDD)
    CbteDesde: number // Número de comprobante desde
    CbteHasta: number // Número de comprobante hasta
    FchProceso: string // Fecha de procesamiento
    Resultado: 'A' | 'R' // A: Aprobado, R: Rechazado
    Observaciones?: Array<{
      Code: number
      Msg: string
    }>
    Errores?: Array<{
      Code: number
      Msg: string
    }>
  }
  error?: string
}

// Request para consultar último comprobante
export interface GetLastVoucherRequest {
  PtoVta: number
  CbteTipo: TipoComprobante
}

// Respuesta de último comprobante
export interface GetLastVoucherResponse {
  success: boolean
  data?: {
    CbteNro: number // Último número de comprobante
    PtoVta: number
    CbteTipo: TipoComprobante
  }
  error?: string
}

// Request para consultar datos de contribuyente
export interface GetTaxpayerDataRequest {
  cuit: number
}

// Respuesta de datos de contribuyente
export interface GetTaxpayerDataResponse {
  success: boolean
  data?: {
    cuit: number
    nombre: string
    domicilio?: string
    tipoPersona?: string
    condicionIva?: CondicionIVA
    monotributo?: boolean
    empleador?: boolean
    actividades?: Array<{
      codigo: string
      descripcion: string
    }>
  }
  error?: string
}

// Estado de factura en el sistema
export type InvoiceStatus = 
  | 'draft'      // Borrador
  | 'pending'    // Pendiente de envío
  | 'sent'       // Enviada a AFIP
  | 'authorized' // Autorizada (tiene CAE)
  | 'rejected'   // Rechazada por AFIP
  | 'cancelled'  // Anulada

// Modelo de factura en la base de datos
export interface Invoice {
  id: string
  agency_id: string
  operation_id?: string
  customer_id?: string
  
  // Datos AFIP
  cbte_tipo: TipoComprobante
  pto_vta: number
  cbte_nro?: number
  cae?: string
  cae_fch_vto?: string
  
  // Datos del receptor
  receptor_doc_tipo: TipoDocumento
  receptor_doc_nro: string
  receptor_nombre: string
  receptor_domicilio?: string
  receptor_condicion_iva?: CondicionIVA
  
  // Montos
  imp_neto: number
  imp_iva: number
  imp_total: number
  moneda: string
  cotizacion: number
  
  // Concepto
  concepto: 1 | 2 | 3
  fch_serv_desde?: string
  fch_serv_hasta?: string
  
  // Estado y fechas
  status: InvoiceStatus
  fecha_emision?: string
  fecha_vto_pago?: string
  
  // Metadata
  afip_response?: Record<string, any>
  pdf_url?: string
  notes?: string
  
  // Auditoría
  created_at: string
  updated_at: string
  created_by?: string
}

// Modelo de item de factura
export interface InvoiceItem {
  id: string
  invoice_id: string
  
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  
  // IVA
  iva_id: TipoIVA
  iva_porcentaje: number
  iva_importe: number
  
  total: number
}

// Labels para tipos de comprobante
export const COMPROBANTE_LABELS: Record<TipoComprobante, string> = {
  1: 'Factura A',
  2: 'Nota de Débito A',
  3: 'Nota de Crédito A',
  6: 'Factura B',
  7: 'Nota de Débito B',
  8: 'Nota de Crédito B',
  11: 'Factura C',
  12: 'Nota de Débito C',
  13: 'Nota de Crédito C',
  19: 'Factura E (Exportación)',
  20: 'Nota de Débito E',
  21: 'Nota de Crédito E',
  201: 'Factura de Crédito MiPyME A',
  206: 'Factura de Crédito MiPyME B',
  211: 'Factura de Crédito MiPyME C',
}

// Labels para condición IVA
export const CONDICION_IVA_LABELS: Record<CondicionIVA, string> = {
  1: 'Responsable Inscripto',
  2: 'Responsable No Inscripto',
  3: 'No Responsable',
  4: 'Exento',
  5: 'Consumidor Final',
  6: 'Monotributista',
  7: 'Sujeto No Categorizado',
  8: 'Proveedor del Exterior',
  9: 'Cliente del Exterior',
  10: 'IVA Liberado',
  11: 'Responsable Monotributo',
  12: 'Pequeño Contribuyente Eventual',
  13: 'Monotributista Social',
}

// Labels para tipo de documento
export const DOCUMENTO_LABELS: Record<TipoDocumento, string> = {
  80: 'CUIT',
  86: 'CUIL',
  87: 'CDI',
  89: 'LE',
  90: 'LC',
  91: 'CI Extranjera',
  92: 'En trámite',
  93: 'Acta Nacimiento',
  95: 'CI Buenos Aires',
  96: 'DNI',
  99: 'Doc. (Otro)',
  0: 'CI Policía Federal',
}

// IVA porcentajes
export const IVA_PORCENTAJES: Record<TipoIVA, number> = {
  3: 0,
  4: 10.5,
  5: 21,
  6: 27,
  8: 5,
  9: 2.5,
}
