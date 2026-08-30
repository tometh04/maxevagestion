/**
 * Cadencia de cobranza (dunning) para orgs en PAST_DUE.
 *
 * Contexto (2026-08-30): cuando MP rechaza la renovación NO reintenta el ciclo
 * caído — lo saltea y reprograma `next_payment_date` al mes siguiente. Nuestra
 * state machine sostiene bien el acceso (no estira `current_period_ends_at`,
 * ver `isCurrentCycleUnpaid`), pero hasta ahora el único aviso al cliente era un
 * banner adentro de la app: si el dueño no entraba durante la gracia, se
 * enteraba cuando se le cortaba, y el mes quedaba sin facturar para siempre.
 *
 * MP no expone "cobrar ahora" sobre un preapproval, así que no podemos forzar el
 * débito. Lo único que mueve la aguja es que el cliente entre y complete el
 * checkout de regularización. Esto define CUÁNDO golpearle la puerta.
 *
 * Función pura: el cron hace el I/O.
 */
import { PAST_DUE_GRACE_DAYS } from "./access"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Días de la gracia en los que mandamos aviso.
 *  -1 → el cobro falló pero el período todavía no venció (aviso temprano).
 *   0 → venció el período, arranca la gracia.
 *   2 → mitad de la gracia.
 *   4 → último día útil antes del corte.
 * Cuatro toques como máximo por episodio: suficiente para que no se pase por
 * alto, poco para que no sea spam.
 */
export const DUNNING_SLOTS = [-1, 0, 2, 4]

export interface DunningInput {
  /** current_period_ends_at de la org (ISO). */
  currentPeriodEndsAt: string | null
  /** now inyectable para tests. */
  now?: number
}

export interface DunningStep {
  /**
   * "send"    → toca aviso al cliente en este slot.
   * "expired" → se agotó la gracia sin pago: escalada interna, ya no hay acceso.
   * "none"    → día intermedio, no hacer nada.
   * "unknown" → sin current_period_ends_at no se puede calcular la ventana.
   */
  action: "send" | "expired" | "none" | "unknown"
  /**
   * Slot de la cadencia. Es parte de la clave de idempotencia, así que dos
   * corridas del cron el mismo día resuelven al mismo valor.
   */
  slot: number | null
  /** Fin de la gracia = current_period_ends_at + PAST_DUE_GRACE_DAYS. */
  graceEndsAt: Date | null
  /** Días que le quedan de acceso (mínimo 0). */
  daysLeft: number
}

export function computeDunningStep(input: DunningInput): DunningStep {
  const { currentPeriodEndsAt } = input
  if (!currentPeriodEndsAt) {
    return { action: "unknown", slot: null, graceEndsAt: null, daysLeft: 0 }
  }
  const periodEnd = new Date(currentPeriodEndsAt).getTime()
  if (Number.isNaN(periodEnd)) {
    return { action: "unknown", slot: null, graceEndsAt: null, daysLeft: 0 }
  }

  const now = input.now ?? Date.now()
  const graceEndsMs = periodEnd + PAST_DUE_GRACE_DAYS * DAY_MS
  const graceEndsAt = new Date(graceEndsMs)
  const daysLeft = Math.max(0, Math.ceil((graceEndsMs - now) / DAY_MS))

  if (now >= graceEndsMs) {
    return { action: "expired", slot: null, graceEndsAt, daysLeft: 0 }
  }

  const rawDay = Math.floor((now - periodEnd) / DAY_MS)
  // Cualquier día ANTES del vencimiento colapsa al slot -1: si no, un rechazo
  // que llega con una semana de anticipación mandaría un mail por día.
  const slot = rawDay < 0 ? -1 : rawDay

  if (DUNNING_SLOTS.includes(slot)) {
    return { action: "send", slot, graceEndsAt, daysLeft }
  }
  return { action: "none", slot, graceEndsAt, daysLeft }
}

/**
 * Clave de idempotencia del aviso. Va en `billing_events.external_id`, que tiene
 * UNIQUE parcial junto a event_type: si dos corridas del cron se pisan, la
 * segunda choca con 23505 y el cliente no recibe el mail duplicado.
 *
 * Incluye el `current_period_ends_at` para que un episodio PAST_DUE posterior
 * (otro ciclo impago) arranque la cadencia de cero en vez de quedar mudo.
 */
export function dunningIdempotencyKey(
  orgId: string,
  currentPeriodEndsAt: string,
  slot: number | "expired"
): string {
  return `${orgId}:past_due:${currentPeriodEndsAt}:${slot}`
}
