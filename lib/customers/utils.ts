/**
 * Utilidades para procesar datos de clientes
 */

/**
 * Extrae el nombre del cliente de un string que puede contener información adicional
 * Ejemplos:
 * - "JOSE LUIS-3415 55-2242-CRUCERO" -> "Jose Luis"
 * - "Jime Bert - jime_bert" -> "Jime Bert"
 * - "PASADO A AGUS Maru Gamba - Bariloche - 3467630306" -> "Agus Gamba"
 */
export function extractCustomerName(fullName: string): string {
  if (!fullName) return ""
  
  let name = fullName.trim()
  
  // Detectar prefijos como "PASADO A", "PASADO A AGUS", etc.
  // Ejemplo: "PASADO A AGUS Maru Gamba - Bariloche - 3467630306"
  const passedToMatch = name.match(/^PASADO\s+A\s+(\w+)\s+(.+)$/i)
  if (passedToMatch) {
    const prefixName = passedToMatch[1] // "AGUS"
    const afterPrefix = passedToMatch[2] // "Maru Gamba - Bariloche - 3467630306"
    
    // Extraer el nombre completo (antes del primer guión con destino o teléfono)
    const namePart = afterPrefix.split(/\s*-\s*/)[0].trim() // "Maru Gamba"
    const nameWords = namePart.split(/\s+/)
    
    // Combinar el nombre del prefijo con el apellido
    // "AGUS" + "Gamba" = "Agus Gamba"
    if (nameWords.length >= 2) {
      const lastName = nameWords[nameWords.length - 1]
      return `${prefixName.charAt(0) + prefixName.slice(1).toLowerCase()} ${lastName.charAt(0) + lastName.slice(1).toLowerCase()}`
    }
    
    // Si solo hay una palabra, usar el prefijo + esa palabra
    if (nameWords.length === 1) {
      return `${prefixName.charAt(0) + prefixName.slice(1).toLowerCase()} ${nameWords[0].charAt(0) + nameWords[0].slice(1).toLowerCase()}`
    }
  }
  
  // Detectar formato con números o handles después de guión
  // Ejemplo: "JOSE LUIS-3415 55-2242-CRUCERO" o "Jime Bert - jime_bert"
  const parts = name.split(/\s*-\s*/)
  if (parts.length > 1) {
    const firstPart = parts[0].trim()
    const secondPart = parts[1].trim()
    
    // Si la segunda parte contiene números o es un handle (con _ o @), 
    // la primera parte es el nombre
    if (/[\d@_]/.test(secondPart) || /^\d/.test(secondPart)) {
      // Capitalizar correctamente
      return firstPart
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ")
    }
    
    // Si la segunda parte parece ser un destino o lugar, tomar solo la primera parte
    return firstPart
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
  }
  
  // Si no hay guiones o no se detectó patrón, tomar la primera parte antes de cualquier separador
  const cleanName = name.split(/[-:,\n]/)[0].trim()
  
  // Capitalizar correctamente (primera letra de cada palabra en mayúscula)
  return cleanName
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Normaliza el formato de un teléfono
 * - Elimina espacios y guiones inconsistentes
 * - Formato final: números con formato estándar argentino
 * - Detecta si es una fecha y retorna null
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  
  const phoneStr = phone.trim()
  
  // Detectar si es una fecha (formato YYYY-MM-DD o similar)
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (datePattern.test(phoneStr)) {
    return null
  }
  
  // Detectar si parece ser una fecha en otro formato (DD/MM/YYYY, etc.)
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(phoneStr)) {
    return null
  }
  
  // Extraer solo los dígitos
  const digitsOnly = phoneStr.replace(/\D/g, "")
  
  // Si no tiene suficientes dígitos para ser un teléfono válido (menos de 8), retornar null
  if (digitsOnly.length < 8) {
    return null
  }
  
  // Si tiene más de 15 dígitos, probablemente no es un teléfono válido
  if (digitsOnly.length > 15) {
    return null
  }
  
  // Normalizar: mantener formato consistente
  let normalized = digitsOnly
  
  // Si empieza con código de país argentino (54), formatear como internacional
  if (normalized.startsWith("54") && normalized.length >= 12) {
    // Formato: +54 9 11 1234-5678
    const match = normalized.match(/^54(\d{1})(\d{2})(\d{4})(\d{4})$/)
    if (match) {
      return `+54 ${match[1]} ${match[2]} ${match[3]}-${match[4]}`
    }
    // Si no coincide exactamente, retornar con formato básico
    return `+${normalized.slice(0, 2)} ${normalized.slice(2)}`
  }
  
  // Si empieza con 0 y tiene 11 dígitos, quitar el 0 y formatear
  if (normalized.startsWith("0") && normalized.length === 11) {
    normalized = normalized.slice(1)
  }
  
  // Formato argentino estándar (10 dígitos): 11 1234-5678
  if (normalized.length === 10) {
    return normalized.replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2-$3")
  }
  
  // Formato corto (8 dígitos): 1234-5678
  if (normalized.length === 8) {
    return normalized.replace(/(\d{4})(\d{4})/, "$1-$2")
  }
  
  // Para otros formatos, retornar con espacios cada 4 dígitos
  if (normalized.length > 10) {
    // Formato internacional sin código de país detectado
    return normalized.replace(/(\d{2})(\d{4})(\d{4})(\d+)?/, (match, p1, p2, p3, p4) => {
      if (p4) {
        return `${p1} ${p2}-${p3} ${p4}`
      }
      return `${p1} ${p2}-${p3}`
    })
  }
  
  // Si no se puede formatear, retornar los dígitos sin formato
  return normalized
}

