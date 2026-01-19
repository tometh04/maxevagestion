/**
 * Automatizaciones de AFIP SDK
 * Documentación: https://afipsdk.com/docs/automations/integrations/api
 * 
 * Las automatizaciones permiten crear certificados, autorizar servicios web, etc.
 * usando CUIT y Clave Fiscal del cliente
 */

import type { AfipConfig } from './afip-config'

const DEFAULT_AFIP_SDK_BASE_URL = 'https://app.afipsdk.com/api/v1'

/**
 * Crea una automatización en AFIP SDK
 * Las automatizaciones son procesos asíncronos que se ejecutan en segundo plano
 */
async function createAutomation(
  apiKey: string,
  automationType: string,
  params: Record<string, any>
): Promise<{
  success: boolean
  automation_id?: string
  status?: string
  error?: string
}> {
  try {
    const url = `${DEFAULT_AFIP_SDK_BASE_URL}/automations`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        type: automationType,
        params,
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
      automation_id: data.id || data.automation_id,
      status: data.status || 'pending',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al crear automatización',
    }
  }
}

/**
 * Consulta el estado de una automatización
 */
async function getAutomationStatus(
  apiKey: string,
  automationId: string
): Promise<{
  success: boolean
  status?: 'pending' | 'in_process' | 'completed' | 'failed'
  result?: any
  error?: string
}> {
  try {
    const url = `${DEFAULT_AFIP_SDK_BASE_URL}/automations/${automationId}`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
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
      status: data.status,
      result: data.result,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al consultar automatización',
    }
  }
}

/**
 * Espera a que una automatización se complete (polling)
 */
async function waitForAutomation(
  apiKey: string,
  automationId: string,
  maxWaitTime: number = 60000, // 60 segundos
  pollInterval: number = 2000 // 2 segundos
): Promise<{
  success: boolean
  status?: string
  result?: any
  error?: string
}> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    const statusResult = await getAutomationStatus(apiKey, automationId)

    if (!statusResult.success) {
      return statusResult
    }

    if (statusResult.status === 'completed') {
      return {
        success: true,
        status: 'completed',
        result: statusResult.result,
      }
    }

    if (statusResult.status === 'failed') {
      return {
        success: false,
        error: 'La automatización falló',
        status: 'failed',
        result: statusResult.result,
      }
    }

    // Esperar antes del siguiente poll
    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  return {
    success: false,
    error: 'Timeout esperando automatización',
  }
}

/**
 * Crea un certificado de desarrollo para un CUIT
 * Documentación: https://afipsdk.com/docs/automations/create-cert-dev/api
 */
export async function createDevelopmentCertificate(
  apiKey: string,
  cuit: string,
  alias?: string
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
    const automation = await createAutomation(apiKey, 'create-cert-dev', {
      cuit,
      alias: alias || `cert-${cuit}`,
    })

    if (!automation.success || !automation.automation_id) {
      return {
        success: false,
        error: automation.error || 'Error al crear automatización de certificado',
      }
    }

    // Esperar a que se complete
    const result = await waitForAutomation(apiKey, automation.automation_id)

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Error al crear certificado',
      }
    }

    // Extraer datos del certificado del resultado
    const certData = result.result?.cert_data || result.result

    return {
      success: true,
      cert_id: certData?.cert_id || certData?.id,
      cert_data: {
        cert: certData?.cert || certData?.certificate,
        key: certData?.key || certData?.private_key,
        alias: certData?.alias || alias || `cert-${cuit}`,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al crear certificado de desarrollo',
    }
  }
}

/**
 * Crea un certificado de producción para un CUIT
 * Requiere username y password (Clave Fiscal)
 * Documentación: https://afipsdk.com/docs/automations/create-cert-prod/api
 */
export async function createProductionCertificate(
  apiKey: string,
  cuit: string,
  username: string,
  password: string,
  alias?: string
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
    const automation = await createAutomation(apiKey, 'create-cert-prod', {
      cuit,
      username,
      password,
      alias: alias || `cert-${cuit}`,
    })

    if (!automation.success || !automation.automation_id) {
      return {
        success: false,
        error: automation.error || 'Error al crear automatización de certificado',
      }
    }

    // Esperar a que se complete (puede tardar más en producción)
    const result = await waitForAutomation(apiKey, automation.automation_id, 120000, 3000)

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Error al crear certificado de producción',
      }
    }

    const certData = result.result?.cert_data || result.result

    return {
      success: true,
      cert_id: certData?.cert_id || certData?.id,
      cert_data: {
        cert: certData?.cert || certData?.certificate,
        key: certData?.key || certData?.private_key,
        alias: certData?.alias || alias || `cert-${cuit}`,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al crear certificado de producción',
    }
  }
}

/**
 * Autoriza un Web Service de desarrollo para un CUIT
 * Documentación: https://afipsdk.com/docs/automations/auth-web-service-dev/api
 */
export async function authorizeDevelopmentWebService(
  apiKey: string,
  cuit: string,
  service: 'wsfe' | 'wsfev1' = 'wsfev1',
  alias?: string
): Promise<{
  success: boolean
  authorized?: boolean
  error?: string
}> {
  try {
    const automation = await createAutomation(apiKey, 'auth-web-service-dev', {
      cuit,
      service,
      alias: alias || `cert-${cuit}`,
    })

    if (!automation.success || !automation.automation_id) {
      return {
        success: false,
        error: automation.error || 'Error al crear automatización de autorización',
      }
    }

    const result = await waitForAutomation(apiKey, automation.automation_id)

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Error al autorizar servicio web',
      }
    }

    return {
      success: true,
      authorized: result.result?.authorized !== false,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al autorizar servicio web de desarrollo',
    }
  }
}

/**
 * Autoriza un Web Service de producción para un CUIT
 * Requiere username y password (Clave Fiscal)
 * Documentación: https://afipsdk.com/docs/automations/auth-web-service-prod/api
 */
export async function authorizeProductionWebService(
  apiKey: string,
  cuit: string,
  username: string,
  password: string,
  service: 'wsfe' | 'wsfev1' = 'wsfev1',
  alias?: string
): Promise<{
  success: boolean
  authorized?: boolean
  error?: string
}> {
  try {
    const automation = await createAutomation(apiKey, 'auth-web-service-prod', {
      cuit,
      username,
      password,
      service,
      alias: alias || `cert-${cuit}`,
    })

    if (!automation.success || !automation.automation_id) {
      return {
        success: false,
        error: automation.error || 'Error al crear automatización de autorización',
      }
    }

    // En producción puede tardar más
    const result = await waitForAutomation(apiKey, automation.automation_id, 120000, 3000)

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Error al autorizar servicio web',
      }
    }

    return {
      success: true,
      authorized: result.result?.authorized !== false,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error al autorizar servicio web de producción',
    }
  }
}

/**
 * Configuración completa automática para un cliente
 * Crea certificado y autoriza servicios en un solo paso
 */
export async function setupAfipAutomatically(
  apiKey: string,
  cuit: string,
  username: string,
  password: string,
  pointOfSale: number,
  environment: 'sandbox' | 'production' = 'sandbox'
): Promise<{
  success: boolean
  config?: Partial<AfipConfig>
  error?: string
  steps?: {
    certificate: boolean
    service: boolean
  }
}> {
  try {
    let certResult
    let authResult

    if (environment === 'sandbox') {
      // Desarrollo: crear certificado de desarrollo
      certResult = await createDevelopmentCertificate(apiKey, cuit)
      
      if (!certResult.success) {
        return {
          success: false,
          error: `Error al crear certificado: ${certResult.error}`,
          steps: { certificate: false, service: false },
        }
      }

      // Autorizar servicio de desarrollo
      authResult = await authorizeDevelopmentWebService(
        apiKey,
        cuit,
        'wsfev1',
        certResult.cert_data?.alias
      )
    } else {
      // Producción: crear certificado de producción (requiere username/password)
      certResult = await createProductionCertificate(apiKey, cuit, username, password)
      
      if (!certResult.success) {
        return {
          success: false,
          error: `Error al crear certificado: ${certResult.error}`,
          steps: { certificate: false, service: false },
        }
      }

      // Autorizar servicio de producción
      authResult = await authorizeProductionWebService(
        apiKey,
        cuit,
        username,
        password,
        'wsfev1',
        certResult.cert_data?.alias
      )
    }

    if (!authResult.success) {
      return {
        success: false,
        error: `Error al autorizar servicio: ${authResult.error}`,
        steps: { certificate: true, service: false },
      }
    }

    // Configuración completa
    const config: Partial<AfipConfig> = {
      api_key: apiKey,
      cuit,
      point_of_sale: pointOfSale,
      environment,
      cert_id: certResult.cert_id,
      // Guardar certificado y key de forma segura (encriptado)
      // Nota: En producción real, estos deberían guardarse encriptados
    }

    return {
      success: true,
      config,
      steps: { certificate: true, service: true },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error en configuración automática',
    }
  }
}
