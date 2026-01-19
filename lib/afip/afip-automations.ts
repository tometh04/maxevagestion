/**
 * Automatizaciones de AFIP SDK
 * Funciones para crear certificados, autorizar servicios y obtener tokens automáticamente
 * usando solo CUIT y Clave Fiscal del cliente
 */

import type { AfipConfig } from './afip-config'

const DEFAULT_AFIP_SDK_BASE_URL = 'https://app.afipsdk.com/api/v1'

/**
 * Crea un certificado digital para un CUIT usando automatización de AFIP SDK
 * Esto requiere que el cliente haya autorizado el servicio en AFIP
 */
export async function createCertificate(
  apiKey: string,
  cuit: string,
  claveFiscal: string,
  environment: 'sandbox' | 'production' = 'sandbox'
): Promise<{
  success: boolean
  cert_id?: string
  cert_data?: {
    cert: string
    key: string
    alias: string
  }
  error?: string
}> {
  try {
    const url = `${DEFAULT_AFIP_SDK_BASE_URL}/automatizaciones/crear-certificado`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        cuit,
        clave_fiscal: claveFiscal,
        environment,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || `Error ${response.status}`,
      }
    }

    return {
      success: true,
      cert_id: data.cert_id || data.certId,
      cert_data: data.cert_data || data.certData,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al crear certificado',
    }
  }
}

/**
 * Autoriza el servicio de Facturación Electrónica para un CUIT
 * Esto requiere que el cliente haya autorizado el servicio en AFIP Clave Fiscal
 */
export async function authorizeService(
  apiKey: string,
  cuit: string,
  claveFiscal: string,
  service: 'wsfe' | 'wsfev1' = 'wsfev1',
  environment: 'sandbox' | 'production' = 'sandbox'
): Promise<{
  success: boolean
  authorized?: boolean
  token?: string
  expires_at?: string
  error?: string
}> {
  try {
    const url = `${DEFAULT_AFIP_SDK_BASE_URL}/automatizaciones/autorizar-servicio`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        cuit,
        clave_fiscal: claveFiscal,
        service,
        environment,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || `Error ${response.status}`,
      }
    }

    return {
      success: true,
      authorized: data.authorized || data.authorized === true,
      token: data.token || data.access_token,
      expires_at: data.expires_at || data.expiresAt,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al autorizar servicio',
    }
  }
}

/**
 * Obtiene un token de acceso para un CUIT ya configurado
 */
export async function getAccessToken(
  apiKey: string,
  cuit: string,
  certId?: string,
  environment: 'sandbox' | 'production' = 'sandbox'
): Promise<{
  success: boolean
  token?: string
  expires_at?: string
  error?: string
}> {
  try {
    const url = `${DEFAULT_AFIP_SDK_BASE_URL}/automatizaciones/obtener-token`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        cuit,
        cert_id: certId,
        environment,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || `Error ${response.status}`,
      }
    }

    return {
      success: true,
      token: data.token || data.access_token,
      expires_at: data.expires_at || data.expiresAt,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al obtener token',
    }
  }
}

/**
 * Configuración completa automática para un cliente
 * Crea certificado, autoriza servicio y obtiene token en un solo paso
 */
export async function setupAfipAutomatically(
  apiKey: string,
  cuit: string,
  claveFiscal: string,
  pointOfSale: number,
  environment: 'sandbox' | 'production' = 'sandbox'
): Promise<{
  success: boolean
  config?: Partial<AfipConfig>
  error?: string
  steps?: {
    certificate: boolean
    service: boolean
    token: boolean
  }
}> {
  try {
    // Paso 1: Crear certificado
    const certResult = await createCertificate(apiKey, cuit, claveFiscal, environment)
    if (!certResult.success) {
      return {
        success: false,
        error: `Error al crear certificado: ${certResult.error}`,
        steps: { certificate: false, service: false, token: false },
      }
    }

    // Paso 2: Autorizar servicio
    const authResult = await authorizeService(apiKey, cuit, claveFiscal, 'wsfev1', environment)
    if (!authResult.success) {
      return {
        success: false,
        error: `Error al autorizar servicio: ${authResult.error}`,
        steps: { certificate: true, service: false, token: false },
      }
    }

    // Paso 3: Obtener token
    const tokenResult = await getAccessToken(
      apiKey,
      cuit,
      certResult.cert_id,
      environment
    )
    if (!tokenResult.success) {
      return {
        success: false,
        error: `Error al obtener token: ${tokenResult.error}`,
        steps: { certificate: true, service: true, token: false },
      }
    }

    // Configuración completa
    const config: Partial<AfipConfig> = {
      api_key: apiKey,
      cuit,
      point_of_sale: pointOfSale,
      environment,
      cert_id: certResult.cert_id,
      access_token: tokenResult.token,
      token_expires_at: tokenResult.expires_at,
    }

    return {
      success: true,
      config,
      steps: { certificate: true, service: true, token: true },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error en configuración automática',
    }
  }
}
