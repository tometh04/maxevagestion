/**
 * Configuración de AFIP por agencia/cliente
 * Cada cliente tiene su propia configuración almacenada en la tabla integrations
 */

export interface AfipConfig {
  api_key: string
  cuit: string
  point_of_sale: number
  environment: 'sandbox' | 'production'
  base_url?: string
  // Tokens y certificados (generados automáticamente)
  access_token?: string
  token_expires_at?: string
  cert_id?: string
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
