/**
 * Traductor de códigos de error AFIP a mensajes accionables en español.
 *
 * Pendientes 2026-05-06 (GTM piloto): cuando AFIP rechaza un comprobante,
 * antes mostrábamos el mensaje literal del WSFE — útil pero técnico, el
 * tenant no sabe qué hacer. Este helper mapea los códigos más comunes a:
 *   - title: qué pasó (1 frase)
 *   - explanation: por qué pasó
 *   - action: qué hacer ahora (paso concreto)
 *   - severity: 'config' (arregla en setup) | 'data' (arregla en form) | 'transient' (reintentar)
 *
 * Si el código no está mapeado, se devuelve el texto crudo de AFIP +
 * la lista de "causas comunes" (fallback al comportamiento previo).
 *
 * Fuentes: docs WSFE oficiales + casos productivos atendidos hoy
 * (Yami → 10013, 10036).
 */

export interface AfipErrorTranslation {
  code: number | null
  title: string
  explanation: string
  action: string
  severity: 'config' | 'data' | 'transient' | 'unknown'
  rawMessage: string
}

const KNOWN_ERRORS: Record<number, Omit<AfipErrorTranslation, 'code' | 'rawMessage'>> = {
  // Auth / habilitación CUIT
  10000: {
    title: 'CUIT no autorizado en IVA',
    explanation:
      'El CUIT con el que se generó el certificado AFIP no figura como Responsable Inscripto en IVA en el padrón de AFIP, o no tiene autorizado el servicio WSFE.',
    action:
      'Entrá a afip.gob.ar con tu Clave Fiscal → Administrador de Relaciones de Clave Fiscal → verificá que el CUIT esté en alta en IVA. Si recién diste de alta, esperá 24h para que se propague. Después, en Vibook, regenerá la integración AFIP.',
    severity: 'config',
  },
  1018: {
    title: 'CUIT del cert no coincide',
    explanation:
      'El CUIT que estás usando para autorizar es distinto al que figura en el certificado AFIP cargado.',
    action:
      'Verificá en Configuración → Integraciones que el CUIT registrado coincida con el del cert. Si cambió, regenerá la integración con el CUIT correcto.',
    severity: 'config',
  },
  1500: {
    title: 'Token AFIP inválido o expirado',
    explanation:
      'El token de acceso WSFE expiró (válido 12hs) y no se pudo renovar automáticamente.',
    action:
      'Reintentá la emisión en 1 minuto. Si sigue fallando, regenerá la integración AFIP en Configuración → Integraciones.',
    severity: 'transient',
  },

  // Punto de venta
  10015: {
    title: 'Punto de venta inexistente',
    explanation:
      'El punto de venta seleccionado no existe en AFIP para este CUIT, o no está habilitado para WSFE.',
    action:
      'Entrá a AFIP web → Administración de Puntos de Venta → verificá que el PV exista y sea de tipo "RECE para aplicativo y web services" (RI) o "Factura Electrónica - Monotributo - Web Service" (Mono).',
    severity: 'config',
  },
  10016: {
    title: 'Tipo de comprobante no autorizado para este PV',
    explanation:
      'El punto de venta no permite emitir el tipo de factura que estás intentando.',
    action:
      'Verificá en AFIP web que el PV esté habilitado para el tipo de comprobante (ej: PVs de Monotributo solo emiten Factura B/C, no Factura A).',
    severity: 'config',
  },

  // DocTipo / DocNro
  10013: {
    title: 'Factura A requiere CUIT',
    explanation:
      'Para emitir Factura A, AFIP exige que el receptor tenga CUIT (DocTipo 80). DNI o CUIL no son válidos para Factura A.',
    action:
      'Si el cliente es Responsable Inscripto, ingresá su CUIT (11 dígitos) en el campo CUIT/DNI. Si no tiene CUIT, debe ser Factura B (Consumidor Final).',
    severity: 'data',
  },
  10054: {
    title: 'Documento del receptor inválido',
    explanation:
      'El número de documento (CUIT/DNI) del receptor no pasa la validación de AFIP — formato incorrecto o no existe en el padrón.',
    action:
      'Verificá que el CUIT tenga 11 dígitos y dígito verificador correcto, o el DNI tenga 7-8 dígitos.',
    severity: 'data',
  },
  10049: {
    title: 'Falta condición IVA del receptor',
    explanation:
      'AFIP exige especificar la condición fiscal del receptor (RI, Mono, CF, Exento) en cada comprobante desde 2024.',
    action:
      'Asegurate de seleccionar la "Condición IVA del receptor" en el form. Si volvés al listado y reintentás, ya está pre-cargada.',
    severity: 'data',
  },

  // Importes / cálculo
  10017: {
    title: 'Inconsistencia en importes',
    explanation:
      'La suma de ImpNeto + ImpIVA + ImpTotConc + ImpOpEx + ImpTrib no da exactamente ImpTotal. AFIP rechaza por diferencia de centavos.',
    action:
      'Esto indica un bug de redondeo en el cálculo. Avisá a soporte con el número de factura — Vibook va a reabrir el draft con los importes corregidos.',
    severity: 'data',
  },
  10018: {
    title: 'IVA total no coincide con detalle por alícuota',
    explanation:
      'ImpIVA del comprobante no es igual a la suma de los Importes de cada Iva (21%, 10.5%, etc).',
    action:
      'Avisá a soporte. Es un bug de cálculo de Vibook — vamos a abrir el draft y corregir el desglose IVA.',
    severity: 'data',
  },

  // Fechas
  10024: {
    title: 'Fecha del comprobante fuera de rango',
    explanation:
      'AFIP solo acepta CbteFch entre 5 días anteriores y 5 días posteriores a hoy (10 días totales).',
    action:
      'Reintentá ahora — Vibook usa la fecha de hoy automáticamente. Si pasaron días desde que la dejaste como borrador, la fecha vieja está fuera de rango.',
    severity: 'transient',
  },
  10036: {
    title: 'Vencimiento de pago anterior al comprobante',
    explanation:
      'FchVtoPago no puede ser anterior a CbteFch (fecha de emisión = hoy).',
    action:
      'Vibook ahora ajusta automáticamente este caso (commit e4d3fea). Si todavía ves este error, recargá la página y reintentá. Si persiste, avisá a soporte.',
    severity: 'data',
  },
  10043: {
    title: 'Faltan fechas de servicio',
    explanation:
      'Para concepto "Servicios" o "Productos y Servicios", AFIP exige FchServDesde, FchServHasta y FchVtoPago.',
    action:
      'Completá los campos "Fecha Desde (Servicio)" y "Fecha Hasta (Servicio)" en el form. Vibook calcula FchVtoPago automáticamente.',
    severity: 'data',
  },

  // FX
  10042: {
    title: 'Cotización USD inválida',
    explanation:
      'La cotización del USD que se mandó está fuera del rango ±2% del oficial AFIP del día.',
    action:
      'Vibook usa la cotización oficial automáticamente. Si esto falla, puede ser un problema temporal con el web service de cotizaciones de AFIP — reintentá en 5 minutos.',
    severity: 'transient',
  },
}

/**
 * Extrae el código numérico del mensaje de AFIP. Formato típico:
 *   "(10013) Para comprobantes clase 'A' ..."
 * Devuelve null si no encuentra un código en formato (NNNN).
 */
function extractCode(rawMessage: string): number | null {
  const m = rawMessage.match(/\((\d{3,5})\)/)
  if (!m) return null
  const code = parseInt(m[1], 10)
  return Number.isFinite(code) ? code : null
}

/**
 * Traduce un mensaje de error AFIP a uno accionable.
 *
 * @param rawMessage Mensaje literal devuelto por AFIP (puede incluir código).
 * @returns Traducción con título + explicación + acción. Si el código no
 *          está mapeado, devuelve el raw + clasifica como 'unknown'.
 */
export function translateAfipError(rawMessage: string | null | undefined): AfipErrorTranslation {
  const raw = (rawMessage || '').trim()
  const code = extractCode(raw)

  if (code !== null && KNOWN_ERRORS[code]) {
    return {
      code,
      rawMessage: raw,
      ...KNOWN_ERRORS[code],
    }
  }

  return {
    code,
    rawMessage: raw,
    title: 'AFIP rechazó la autorización',
    explanation: raw || 'AFIP rechazó la emisión sin un mensaje específico.',
    action:
      'Causas comunes: cotización USD fuera del rango ±2% oficial, certificado AFIP vencido, punto de venta no autorizado, o campos obligatorios faltantes según la condición IVA del receptor. Si el problema persiste, contactá a soporte con el código de error.',
    severity: 'unknown',
  }
}
