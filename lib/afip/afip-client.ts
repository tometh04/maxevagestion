/**
 * Cliente HTTP para AFIP SDK API REST
 * Documentación: https://afipsdk.com/docs/api-reference/introduction/
 */

import {
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  GetLastVoucherRequest,
  GetLastVoucherResponse,
  GetTaxpayerDataRequest,
  GetTaxpayerDataResponse,
  TipoComprobante,
} from './types'

// Configuración del cliente
const AFIP_SDK_BASE_URL = process.env.AFIP_SDK_BASE_URL || 'https://app.afipsdk.com/api/v1'
const AFIP_SDK_API_KEY = process.env.AFIP_SDK_API_KEY || ''
const AFIP_SDK_ENVIRONMENT = process.env.AFIP_SDK_ENVIRONMENT || 'sandbox' // 'sandbox' | 'production'

// Headers comunes para todas las requests
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AFIP_SDK_API_KEY}`,
})

/**
 * Hace una request a la API de AFIP SDK
 */
async function afipRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, any>
): Promise<T> {
  const url = `${AFIP_SDK_BASE_URL}${endpoint}`
  
  console.log(`[AFIP SDK] ${method} ${url}`)
  
  try {
    const response = await fetch(url, {
      method,
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[AFIP SDK] Error response:', data)
      throw new Error(data.message || data.error || `Error ${response.status}`)
    }

    console.log('[AFIP SDK] Success response:', JSON.stringify(data).substring(0, 200))
    return data
  } catch (error: any) {
    console.error('[AFIP SDK] Request failed:', error)
    throw error
  }
}

/**
 * Obtiene el CUIT configurado para facturación
 */
export function getAfipCuit(): string {
  return process.env.AFIP_CUIT || ''
}

/**
 * Obtiene el punto de venta configurado
 */
export function getAfipPointOfSale(): number {
  return parseInt(process.env.AFIP_POINT_OF_SALE || '1', 10)
}

/**
 * Verifica si la API de AFIP está configurada
 */
export function isAfipConfigured(): boolean {
  return !!AFIP_SDK_API_KEY && !!getAfipCuit()
}

/**
 * Obtiene el último número de comprobante
 */
export async function getLastVoucherNumber(
  ptoVta: number,
  cbteTipo: TipoComprobante
): Promise<GetLastVoucherResponse> {
  try {
    const cuit = getAfipCuit()
    
    const response = await afipRequest<any>(
      `/facturacion/ultimo-comprobante`,
      'POST',
      {
        environment: AFIP_SDK_ENVIRONMENT,
        cuit,
        pto_vta: ptoVta,
        cbte_tipo: cbteTipo,
      }
    )

    return {
      success: true,
      data: {
        CbteNro: response.CbteNro || response.cbte_nro || 0,
        PtoVta: ptoVta,
        CbteTipo: cbteTipo,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al obtener último comprobante',
    }
  }
}

/**
 * Crea una factura electrónica
 */
export async function createInvoice(
  request: CreateInvoiceRequest
): Promise<CreateInvoiceResponse> {
  try {
    const cuit = getAfipCuit()
    
    // Obtener el próximo número de comprobante
    const lastVoucher = await getLastVoucherNumber(request.PtoVta, request.CbteTipo)
    const nextNumber = (lastVoucher.data?.CbteNro || 0) + 1

    const response = await afipRequest<any>(
      `/facturacion/crear`,
      'POST',
      {
        environment: AFIP_SDK_ENVIRONMENT,
        cuit,
        pto_vta: request.PtoVta,
        cbte_tipo: request.CbteTipo,
        cbte_nro: nextNumber,
        concepto: request.Concepto,
        doc_tipo: request.DocTipo,
        doc_nro: request.DocNro,
        cbte_fch: request.CbteFch || formatDate(new Date()),
        imp_total: request.ImpTotal,
        imp_tot_conc: request.ImpTotConc,
        imp_neto: request.ImpNeto,
        imp_op_ex: request.ImpOpEx,
        imp_iva: request.ImpIVA,
        imp_trib: request.ImpTrib,
        fch_serv_desde: request.FchServDesde,
        fch_serv_hasta: request.FchServHasta,
        fch_vto_pago: request.FchVtoPago,
        mon_id: request.MonId || 'PES',
        mon_cotiz: request.MonCotiz || 1,
        iva: request.Iva,
        tributos: request.Tributos,
        cbtes_asoc: request.CbtesAsoc,
        opcionales: request.Opcionales,
      }
    )

    // Parsear respuesta
    if (response.CAE || response.cae) {
      return {
        success: true,
        data: {
          CAE: response.CAE || response.cae,
          CAEFchVto: response.CAEFchVto || response.cae_fch_vto,
          CbteDesde: response.CbteDesde || response.cbte_desde || nextNumber,
          CbteHasta: response.CbteHasta || response.cbte_hasta || nextNumber,
          FchProceso: response.FchProceso || response.fch_proceso || new Date().toISOString(),
          Resultado: response.Resultado || response.resultado || 'A',
          Observaciones: response.Observaciones || response.observaciones,
          Errores: response.Errores || response.errores,
        },
      }
    } else {
      return {
        success: false,
        error: response.error || response.message || 'Error al crear factura',
        data: {
          CAE: '',
          CAEFchVto: '',
          CbteDesde: nextNumber,
          CbteHasta: nextNumber,
          FchProceso: new Date().toISOString(),
          Resultado: 'R',
          Errores: response.Errores || response.errores,
        },
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al crear factura',
    }
  }
}

/**
 * Consulta datos de un contribuyente por CUIT
 */
export async function getTaxpayerData(
  cuit: number
): Promise<GetTaxpayerDataResponse> {
  try {
    const response = await afipRequest<any>(
      `/padron/contribuyente/${cuit}`,
      'GET'
    )

    return {
      success: true,
      data: {
        cuit: response.cuit || cuit,
        nombre: response.nombre || response.razonSocial || '',
        domicilio: response.domicilio?.direccion,
        tipoPersona: response.tipoPersona,
        condicionIva: response.condicionIva,
        monotributo: response.monotributo,
        empleador: response.empleador,
        actividades: response.actividades,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al consultar contribuyente',
    }
  }
}

/**
 * Obtiene los puntos de venta habilitados
 */
export async function getPointsOfSale(): Promise<{
  success: boolean
  data?: Array<{
    numero: number
    tipo: string
    bloqueado: boolean
  }>
  error?: string
}> {
  try {
    const cuit = getAfipCuit()
    
    const response = await afipRequest<any>(
      `/facturacion/puntos-venta`,
      'POST',
      {
        environment: AFIP_SDK_ENVIRONMENT,
        cuit,
      }
    )

    return {
      success: true,
      data: response.puntos_venta || response.PtosVta || [],
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al obtener puntos de venta',
    }
  }
}

/**
 * Verifica la conexión con AFIP
 */
export async function testConnection(): Promise<{
  success: boolean
  message: string
  environment: string
  cuit: string
}> {
  try {
    if (!isAfipConfigured()) {
      return {
        success: false,
        message: 'AFIP SDK no está configurado. Verifique las variables de entorno.',
        environment: AFIP_SDK_ENVIRONMENT,
        cuit: '',
      }
    }

    const cuit = getAfipCuit()
    const ptoVta = getAfipPointOfSale()
    
    // Intentar obtener el último comprobante como test
    const result = await getLastVoucherNumber(ptoVta, 6) // Factura B

    if (result.success) {
      return {
        success: true,
        message: `Conexión exitosa. Último comprobante: ${result.data?.CbteNro || 0}`,
        environment: AFIP_SDK_ENVIRONMENT,
        cuit,
      }
    } else {
      return {
        success: false,
        message: result.error || 'Error de conexión',
        environment: AFIP_SDK_ENVIRONMENT,
        cuit,
      }
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Error de conexión',
      environment: AFIP_SDK_ENVIRONMENT,
      cuit: getAfipCuit(),
    }
  }
}

// Helpers

/**
 * Formatea una fecha para AFIP (YYYYMMDD)
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * Parsea una fecha de AFIP (YYYYMMDD) a Date
 */
export function parseAfipDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4), 10)
  const month = parseInt(dateStr.substring(4, 6), 10) - 1
  const day = parseInt(dateStr.substring(6, 8), 10)
  return new Date(year, month, day)
}

/**
 * Calcula el IVA de un monto
 */
export function calculateIVA(neto: number, porcentaje: number): number {
  return Math.round(neto * (porcentaje / 100) * 100) / 100
}

/**
 * Determina el tipo de factura según la condición IVA del cliente
 * Responsable Inscripto → Factura A
 * Consumidor Final / Monotributo → Factura B
 * Exportación → Factura E
 */
export function determineInvoiceType(
  emisorCondicion: number,
  receptorCondicion: number,
  isExport: boolean = false
): TipoComprobante {
  if (isExport) {
    return 19 // Factura E
  }

  // Si el emisor es Responsable Inscripto
  if (emisorCondicion === 1) {
    // Si el receptor es Responsable Inscripto
    if (receptorCondicion === 1) {
      return 1 // Factura A
    }
    // Consumidor Final, Monotributo, etc.
    return 6 // Factura B
  }

  // Si el emisor es Monotributo
  if (emisorCondicion === 6 || emisorCondicion === 11) {
    return 11 // Factura C
  }

  // Default: Factura B
  return 6
}
