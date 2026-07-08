/**
 * Configuración de AFIP por agencia/cliente
 * Cada cliente tiene su propia configuración almacenada en la tabla integrations
 */

export interface AfipConfig {
  api_key: string
  /**
   * CUIT del TITULAR del certificado / login. Es quien entra a AFIP con Clave
   * Fiscal y con quien se genera el certificado (WSAA autentica con este CUIT).
   * En el caso normal (persona física que factura para sí misma) es también el
   * emisor. En el caso "representada" es la persona física apoderada.
   */
  cuit: string
  /**
   * CUIT EMISOR de la factura cuando una persona física factura EN NOMBRE DE una
   * sociedad (persona jurídica). Si está seteado, este es el CUIT que aparece en
   * el comprobante, en el QR de AFIP y en el campo Auth.Cuit del WSFE
   * (representada). Requiere que la sociedad haya delegado el servicio "wsfe" al
   * computador fiscal del titular (`cuit`) en el Administrador de Relaciones.
   * Si está vacío/ausente, el emisor es el mismo `cuit` (comportamiento legacy).
   */
  cuit_representada?: string
  point_of_sale: number
  environment: 'sandbox' | 'production'
  base_url?: string
  // Tokens y certificados (generados automáticamente)
  access_token?: string
  token_expires_at?: string
  cert_id?: string
  // Certificado digital PEM (para autenticación inline con afipsdk.com)
  cert?: string
  key?: string
}

/**
 * Devuelve el CUIT que EMITE la factura (el que va en el comprobante, el QR
 * AFIP y como Auth.Cuit/representada en el WSFE).
 *
 * - Sin representación: es el mismo CUIT del certificado (`cuit`).
 * - Con representación (persona física facturando por una sociedad): es
 *   `cuit_representada`.
 *
 * OJO: la AUTENTICACIÓN (WSAA, generación de certificado, login de portal)
 * usa SIEMPRE `config.cuit` (el titular del cert), NUNCA el emisor. Solo el
 * emisor de la factura cambia.
 */
export function getEmisorCuit(
  config: Pick<AfipConfig, 'cuit' | 'cuit_representada'>
): string {
  const rep = (config.cuit_representada || '').trim()
  return rep || config.cuit
}

/**
 * Valida que una configuración de AFIP esté completa
 */
export function isAfipConfigValid(config: Partial<AfipConfig>): boolean {
  return !!(
    config.api_key &&
    config.cuit &&
    config.point_of_sale &&
    config.environment
  )
}

/**
 * Formatea CUIT removiendo guiones y espacios
 */
export function formatCuit(cuit: string): string {
  return cuit.replace(/[-\s]/g, '')
}

/**
 * Valida formato de CUIT (11 dígitos)
 */
export function isValidCuit(cuit: string): boolean {
  const formatted = formatCuit(cuit)
  return /^\d{11}$/.test(formatted)
}
