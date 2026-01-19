/**
 * Cliente HTTP para AFIP SDK API REST
 * Documentación: https://afipsdk.com/docs/api-reference/introduction/
 * 
 * REFACTORIZADO: Ahora acepta configuración por agencia/cliente
 * en lugar de variables de entorno globales
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
import type { AfipConfig } from './afip-config'

// URL base por defecto (puede ser sobrescrita por config)
const DEFAULT_AFIP_SDK_BASE_URL = 'https://app.afipsdk.com/api/v1'

/**
 * Headers comunes para todas las requests
 */
function getHeaders(config: AfipConfig) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.api_key}`,
  }
}

/**
 * Hace una request a la API de AFIP SDK
 */
async function afipRequest<T>(
  config: AfipConfig,
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, any>
): Promise<T> {
  const baseUrl = config.base_url || DEFAULT_AFIP_SDK_BASE_URL
  const url = `${baseUrl}${endpoint}`
  
  console.log(`[AFIP SDK] ${method} ${url} (CUIT: ${config.cuit})`)
  
  try {
    const response = await fetch(url, {
      method,
      headers: getHeaders(config),
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
 * Verifica si una configuración de AFIP está completa
 */
export function isAfipConfigured(config: Partial<AfipConfig>): boolean {
  return !!(
    config.api_key &&
    config.cuit &&
    config.point_of_sale &&
    config.environment
  )
}

/**
 * Obtiene el último número de comprobante
 */
export async function getLastVoucherNumber(
  config: AfipConfig,
  ptoVta: number,
  cbteTipo: TipoComprobante
): Promise<GetLastVoucherResponse> {
  try {
    const response = await afipRequest<any>(
      config,
      `/facturacion/ultimo-comprobante`,
      'POST',
      {
        environment: config.environment,
        cuit: config.cuit,
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
 * Obtiene el Ticket de Acceso (TA) para un servicio web específico
 * Documentación: https://docs.afipsdk.com/integracion/api
 * AFIP SDK maneja automáticamente el caching y renovación del TA
 */
async function getTicketAcceso(
  config: AfipConfig,
  service: 'wsfe' | 'wsfev1' = 'wsfev1'
): Promise<{
  success: boolean
  token?: string
  sign?: string
  error?: string
}> {
  try {
    const response = await afipRequest<any>(
      config,
      `/afip/auth`,
      'POST',
      {
        environment: config.environment,
        cuit: config.cuit,
        service, // WSID del servicio (wsfe, wsfev1, etc.)
        // Si hay certificado, AFIP SDK lo usa automáticamente
        // Si no, usa el certificado de desarrollo
      }
    )

    return {
      success: true,
      token: response.token || response.Token,
      sign: response.sign || response.Sign,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al obtener Ticket de Acceso',
    }
  }
}

/**
 * Crea una factura electrónica
 * Documentación: https://afipsdk.com/api-factura-electronica/
 */
export async function createInvoice(
  config: AfipConfig,
  request: CreateInvoiceRequest
): Promise<CreateInvoiceResponse> {
  try {
    // Obtener el próximo número de comprobante
    const lastVoucher = await getLastVoucherNumber(config, request.PtoVta, request.CbteTipo)
    const nextNumber = (lastVoucher.data?.CbteNro || 0) + 1

    // Obtener Ticket de Acceso (TA) - AFIP SDK lo cachea automáticamente
    const ta = await getTicketAcceso(config, 'wsfev1')
    if (!ta.success) {
      return {
        success: false,
        error: ta.error || 'Error al obtener Ticket de Acceso',
      }
    }

    // Crear factura usando el Web Service de Facturación Electrónica
    const response = await afipRequest<any>(
      config,
      `/facturacion/crear`,
      'POST',
      {
        environment: config.environment,
        cuit: config.cuit,
        // Ticket de Acceso
        token: ta.token,
        sign: ta.sign,
        // Datos del comprobante
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
  config: AfipConfig,
  cuit: number
): Promise<GetTaxpayerDataResponse> {
  try {
    const response = await afipRequest<any>(
      config,
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
export async function getPointsOfSale(config: AfipConfig): Promise<{
  success: boolean
  data?: Array<{
    numero: number
    tipo: string
    bloqueado: boolean
  }>
  error?: string
}> {
  try {
    const response = await afipRequest<any>(
      config,
      `/facturacion/puntos-venta`,
      'POST',
      {
        environment: config.environment,
        cuit: config.cuit,
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
export async function testConnection(config: AfipConfig): Promise<{
  success: boolean
  message: string
  environment: string
  cuit: string
}> {
  try {
    if (!isAfipConfigured(config)) {
      return {
        success: false,
        message: 'Configuración de AFIP incompleta. Verifique CUIT, API Key y Punto de Venta.',
        environment: config.environment,
        cuit: config.cuit || '',
      }
    }
    
    // Intentar obtener el último comprobante como test
    const result = await getLastVoucherNumber(config, config.point_of_sale, 6) // Factura B

    if (result.success) {
      return {
        success: true,
        message: `Conexión exitosa. Último comprobante: ${result.data?.CbteNro || 0}`,
        environment: config.environment,
        cuit: config.cuit,
      }
    } else {
      return {
        success: false,
        message: result.error || 'Error de conexión',
        environment: config.environment,
        cuit: config.cuit,
      }
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Error de conexión',
      environment: config.environment,
      cuit: config.cuit || '',
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
