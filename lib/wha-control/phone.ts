/**
 * Normalización de teléfonos para WHA Control.
 *
 * WhatsApp identifica los chats por JID: <dígitos con código de país>@s.whatsapp.net.
 * Los celulares argentinos van como 549 + área + número (sin 15 ni 0).
 * Los teléfonos cargados en leads/clientes vienen en cualquier formato
 * ("+54 9 341...", "0341 15...", "341..."), así que acá se limpia y se
 * completa el prefijo cuando falta.
 */

/** Solo dígitos, sin 00 internacional ni 0 de área ni 15 local. */
export function normalizePhoneDigits(phone: string): string {
  let digits = (phone || "").replace(/\D/g, "")
  if (digits.startsWith("00")) digits = digits.slice(2)
  return digits
}

/**
 * Convierte un teléfono libre en JID de WhatsApp.
 * Heurística argentina:
 * - ya viene con 549... => se usa tal cual.
 * - viene con 54 sin 9 (celular cargado sin el 9) => se inserta el 9.
 * - viene local ("0341 15 5551234", "341 5551234") => se saca 0/15 y se
 *   prefija 549.
 * - otro código de país (larga distancia) => se usa tal cual.
 */
export function phoneToWaJid(phone: string): string | null {
  let digits = normalizePhoneDigits(phone)
  if (!digits) return null

  if (digits.startsWith("549")) {
    // ok
  } else if (digits.startsWith("54")) {
    digits = `549${digits.slice(2)}`
  } else if (digits.startsWith("0")) {
    // 0 de área => número local argentino seguro.
    digits = `549${digits.slice(1)}`
  } else if (digits.length >= 11) {
    // Ya trae código de país no argentino (ej. 5989..., 1305...).
  } else {
    // Número local argentino sin 0.
    digits = `549${digits}`
  }

  if (digits.length < 10 || digits.length > 15) return null
  return `${digits}@s.whatsapp.net`
}

/**
 * Fragmento para buscar el chat de un teléfono en wa_chats (contact_phone /
 * remote_jid tienen formatos dispares): los últimos 8 dígitos alcanzan para
 * matchear sin depender del prefijo.
 */
export function phoneSearchFragment(phone: string): string {
  const digits = normalizePhoneDigits(phone)
  return digits.slice(-8)
}
