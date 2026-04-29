/**
 * Convierte mensajes crudos de MP (ej "MP preapproval failed (500): {...}")
 * a mensajes amigables para mostrar al user en el flow de checkout.
 *
 * Input siempre es el .message de un Error lanzado por lib/billing/mercadopago.ts.
 */
export function mpErrorToUserMessage(raw: string): string {
  // Email inválido por MP
  if (/invalid.*email|payer_email.*invalid|email.*format/i.test(raw)) {
    return "El email de facturación es inválido o no existe en Mercado Pago. Verificá el email en Configuración y probá de nuevo."
  }

  // Amount inválido
  if (/invalid.*amount|transaction_amount/i.test(raw)) {
    return "El monto del plan no pudo ser procesado por Mercado Pago. Contactanos a hola@vibook.ai."
  }

  // 500 genérico
  if (/\(500\)|Internal server error/.test(raw)) {
    return "Mercado Pago está teniendo problemas temporales. Reintentá en unos minutos. Si persiste, contactanos a hola@vibook.ai."
  }

  // 401/403 — token mal o sin permisos
  if (/\(40[13]\)|unauthorized|forbidden/i.test(raw)) {
    return "Problema de autorización con Mercado Pago. Contactanos a hola@vibook.ai."
  }

  // 400 con cause
  if (/\(400\)/.test(raw)) {
    return "No pudimos procesar tu pago. Revisá los datos de facturación en Configuración."
  }

  // 502 / network
  if (/\(502\)|network|timeout|ECONNRESET/i.test(raw)) {
    return "No pudimos conectar con Mercado Pago. Reintentá en unos segundos."
  }

  // Default
  return "No pudimos procesar tu pago. Si el problema persiste, contactanos a hola@vibook.ai."
}
