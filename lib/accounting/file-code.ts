/**
 * Utilidad para generar códigos de archivo únicos para operaciones
 */

/**
 * Genera un código de archivo único para una operación
 * Formato: OP-{YYYYMMDD}-{ID corto}
 * 
 * @param createdAt - Fecha de creación de la operación
 * @param operationId - ID de la operación (opcional, se usará para generar ID corto)
 * @returns Código de archivo único
 */
export function generateFileCode(createdAt?: Date | string, operationId?: string): string {
  const date = createdAt ? new Date(createdAt) : new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD
  
  // Si tenemos operationId, usar los primeros 8 caracteres
  // Si no, generar un ID corto aleatorio
  let idShort = '00000000'
  if (operationId) {
    idShort = operationId.replace(/-/g, '').substring(0, 8).toUpperCase()
  } else {
    // Generar un ID corto aleatorio de 8 caracteres
    idShort = Math.random().toString(36).substring(2, 10).toUpperCase().padStart(8, '0')
  }
  
  return `OP-${dateStr}-${idShort}`
}

/**
 * Genera un código de archivo único basado en un timestamp
 * Útil cuando aún no tenemos el ID de la operación
 */
export function generateFileCodeFromTimestamp(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timeStr = now.getTime().toString().slice(-8)
  return `OP-${dateStr}-${timeStr}`
}

