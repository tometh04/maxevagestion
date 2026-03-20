/**
 * Cliente AFIP usando @afipsdk/afip.js
 * Documentación: https://docs.afipsdk.com
 */

import {
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  GetLastVoucherResponse,
  GetTaxpayerDataResponse,
  TipoComprobante,
} from './types'
import type { AfipConfig } from './afip-config'

/**
 * Crea una instancia del SDK de AFIP con la configuración de la agencia
 */
function createAfipInstance(config: AfipConfig) {
  // @afipsdk/afip.js está en serverExternalPackages en next.config.js,
  // así Vercel lo incluye en el bundle serverless correctamente
  /* eslint-disable-next-line */
  const Afip = require('@afipsdk/afip.js')
  return new Afip({
    CUIT: Number(config.cuit),
    production: config.environment === 'production',
    access_token: config.api_key,
    // Certificado PEM inline (requerido cuando afipsdk.com no tiene el cert en su servidor)
    ...(config.cert && { cert: config.cert }),
    ...(config.key && { key: config.key }),
  })
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
    const afip = createAfipInstance(config)
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo)
    return {
      success: true,
      data: {
        CbteNro: lastVoucher || 0,
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
 * Crea una factura electrónica usando createNextVoucher
 * (el SDK obtiene automáticamente el próximo número)
 */
export async function createInvoice(
  config: AfipConfig,
  request: CreateInvoiceRequest
): Promise<CreateInvoiceResponse> {
  try {
    const afip = createAfipInstance(config)

    const data: Record<string, any> = {
      CantReg: 1,
      PtoVta: request.PtoVta,
      CbteTipo: request.CbteTipo,
      Concepto: request.Concepto,
      DocTipo: request.DocTipo,
      DocNro: request.DocNro,
      CbteFch: request.CbteFch ? parseInt(request.CbteFch) : parseInt(formatDate(new Date())),
      ImpTotal: request.ImpTotal,
      ImpTotConc: request.ImpTotConc || 0,
      ImpNeto: request.ImpNeto,
      ImpOpEx: request.ImpOpEx || 0,
      ImpIVA: request.ImpIVA || 0,
      ImpTrib: request.ImpTrib || 0,
      MonId: request.MonId || 'PES',
      MonCotiz: request.MonCotiz || 1,
      CondicionIVAReceptorId: request.CondicionIVAReceptorId || 5,
    }

    if (request.Iva && request.Iva.length > 0) {
      data.Iva = request.Iva
    }

    // Concepto 2 o 3 requiere fechas de servicio
    if (request.Concepto === 2 || request.Concepto === 3) {
      data.FchServDesde = request.FchServDesde
      data.FchServHasta = request.FchServHasta
      data.FchVtoPago = request.FchVtoPago || request.FchServHasta
    }

    const res = await afip.ElectronicBilling.createNextVoucher(data)

    if (res?.CAE) {
      return {
        success: true,
        data: {
          CAE: res.CAE,
          CAEFchVto: res.CAEFchVto,
          CbteDesde: res.voucherNumber,
          CbteHasta: res.voucherNumber,
          FchProceso: new Date().toISOString(),
          Resultado: 'A',
        },
      }
    } else {
      return {
        success: false,
        error: res?.error || 'Error al crear factura: sin CAE en respuesta',
        data: {
          CAE: '', CAEFchVto: '', CbteDesde: 0, CbteHasta: 0,
          FchProceso: new Date().toISOString(), Resultado: 'R',
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
    const url = `https://app.afipsdk.com/api/v1/padron/contribuyente/${cuit}`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${config.api_key}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error(`Error ${res.status}`)
    const response = await res.json()

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
 * Obtiene los puntos de venta habilitados para web services (WSFEv1)
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
    const afip = createAfipInstance(config)
    const salesPoints = await afip.ElectronicBilling.getSalesPoints()

    // getSalesPoints devuelve array o null
    const list: any[] = Array.isArray(salesPoints) ? salesPoints : salesPoints ? [salesPoints] : []

    const data = list.map((pv: any) => ({
      numero: Number(pv.Nro ?? pv.numero ?? pv.number),
      tipo: String(pv.EmisionTipo ?? pv.tipo ?? pv.type ?? ''),
      bloqueado: pv.Bloqueado === 'S' || pv.bloqueado === true,
    }))

    console.log('[AFIP] getSalesPoints raw:', JSON.stringify(salesPoints).substring(0, 500))
    return { success: true, data }
  } catch (error: any) {
    console.error('[AFIP] getSalesPoints error:', error.message, error?.data)
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

    const afip = createAfipInstance(config)
    await afip.GetServiceTA('wsfe')

    return {
      success: true,
      message: 'Conexión exitosa con AFIP',
      environment: config.environment,
      cuit: config.cuit,
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

/**
 * Obtiene la configuración AFIP de una agencia desde la BD
 * Usado por los routes de settings/afip
 */
export async function getAgencyAfipConfig(
  supabase: any,
  agencyId: string
): Promise<{ cuit: string; environment: string; punto_venta?: number } | null> {
  const { data } = await supabase
    .from('afip_config')
    .select('cuit, environment, punto_venta')
    .eq('agency_id', agencyId)
    .eq('is_active', true)
    .maybeSingle()
  return data || null
}

/**
 * Stub: Automatización AFIP SDK (pendiente de implementar)
 * Por ahora retorna error indicando que la función no está disponible
 */
export async function runAfipAutomation(
  _cuit: string,
  _password: string
): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error: 'La automatización AFIP no está implementada aún. Configurá las credenciales manualmente.',
  }
}
