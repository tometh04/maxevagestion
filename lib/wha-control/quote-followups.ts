/**
 * Seguimiento automático post-cotización en WHA Control.
 *
 * Lógica pura (sin I/O) para:
 * - calcular cuándo debe dispararse el seguimiento respetando la ventana
 *   horaria de envío (hora argentina, UTC-3 fijo, sin DST),
 * - decidir si corresponde enviar o cancelar según los mensajes del chat
 *   posteriores a la marca,
 * - renderizar el texto configurado.
 *
 * El worker del cron y las rutas orquestan I/O alrededor de estas funciones.
 */

export const ARG_UTC_OFFSET_HOURS = -3

/**
 * Mensajes salientes dentro de este buffer después de la marca se consideran
 * parte del envío de la cotización (el echo del propio mensaje, PDFs,
 * aclaraciones inmediatas) y NO cancelan el seguimiento.
 */
export const SELLER_FOLLOWUP_BUFFER_MINUTES = 15

export const MAX_SEND_ATTEMPTS = 5

/**
 * Si un seguimiento no pudo salir (device caído, connector caído) pasadas
 * estas horas desde su vencimiento original, se marca FAILED.
 */
export const MAX_POSTPONE_HOURS = 48

export interface SendWindow {
  /** Hora local ARG desde la que se puede enviar (inclusive), 0-23. */
  from: number
  /** Hora local ARG hasta la que se puede enviar (exclusive), 1-24. */
  to: number
}

export type FollowupCancelReason =
  | "client_replied"
  | "seller_followed_up"
  | "manual"
  | "device_unavailable"

export type FollowupAction =
  | { action: "send" }
  | { action: "cancel"; reason: "client_replied" | "seller_followed_up" }

export interface FollowupMessage {
  direction: "inbound" | "outbound" | "system"
  sent_at: string | Date
}

function argLocalHour(date: Date): number {
  const shifted = new Date(date.getTime() + ARG_UTC_OFFSET_HOURS * 3600_000)
  return shifted.getUTCHours()
}

/** Fija la hora local ARG de `date` a `hour:00:00.000` (mismo día local). */
function atArgHour(date: Date, hour: number): Date {
  const shifted = new Date(date.getTime() + ARG_UTC_OFFSET_HOURS * 3600_000)
  shifted.setUTCHours(hour, 0, 0, 0)
  return new Date(shifted.getTime() - ARG_UTC_OFFSET_HOURS * 3600_000)
}

export function isWithinSendWindow(date: Date, window: SendWindow): boolean {
  const hour = argLocalHour(date)
  return hour >= window.from && hour < window.to
}

/**
 * Próximo instante >= `date` dentro de la ventana: el mismo `date` si ya está
 * adentro, el `from` de hoy si todavía no llegó, o el `from` de mañana si ya
 * pasó el `to`.
 */
export function nextWindowSlot(date: Date, window: SendWindow): Date {
  if (isWithinSendWindow(date, window)) return date
  const hour = argLocalHour(date)
  if (hour < window.from) return atArgHour(date, window.from)
  return new Date(atArgHour(date, window.from).getTime() + 24 * 3600_000)
}

/**
 * Momento del seguimiento: marca + espera, corrido al próximo slot de la
 * ventana horaria si cae afuera.
 */
export function computeScheduledFor(
  markedAt: Date,
  waitHours: number,
  window: SendWindow
): Date {
  const due = new Date(markedAt.getTime() + waitHours * 3600_000)
  return nextWindowSlot(due, window)
}

/**
 * Decide qué hacer con un seguimiento vencido mirando los mensajes del chat
 * posteriores a la marca (de TODAS las filas wa_chats de la conversación).
 *
 * - Cualquier inbound posterior a la marca => el cliente respondió.
 * - Un outbound posterior a marca + buffer => el vendedor ya retomó el
 *   contacto por su cuenta (los outbound dentro del buffer son el envío de la
 *   cotización misma).
 */
export function decideFollowupAction(input: {
  markedAt: Date
  messages: FollowupMessage[]
  sellerBufferMinutes?: number
}): FollowupAction {
  const bufferMs =
    (input.sellerBufferMinutes ?? SELLER_FOLLOWUP_BUFFER_MINUTES) * 60_000
  const markedMs = input.markedAt.getTime()

  let sellerFollowedUp = false
  for (const msg of input.messages) {
    const sentMs = new Date(msg.sent_at).getTime()
    if (Number.isNaN(sentMs) || sentMs <= markedMs) continue
    if (msg.direction === "inbound") {
      return { action: "cancel", reason: "client_replied" }
    }
    if (msg.direction === "outbound" && sentMs > markedMs + bufferMs) {
      sellerFollowedUp = true
    }
  }

  if (sellerFollowedUp) {
    return { action: "cancel", reason: "seller_followed_up" }
  }
  return { action: "send" }
}

/** Reemplaza el token {nombre} por el nombre del contacto (si hay). */
export function renderFollowupText(
  template: string,
  contactName: string | null | undefined
): string {
  const name = (contactName ?? "").trim()
  if (!name) {
    // Sin nombre: limpiar el token y los dobles espacios que deja.
    return template.replace(/\{nombre\}/g, "").replace(/  +/g, " ").trim()
  }
  return template.replace(/\{nombre\}/g, name)
}
