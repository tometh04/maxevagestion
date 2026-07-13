/**
 * Detección de cobros de renovación fallidos "en silencio".
 *
 * Gap detectado (2026-07-13): la state machine deriva ACTIVE de un preapproval
 * `authorized`, pero MP NO baja el status a paused/cancelled inmediatamente
 * cuando un cobro de renovación falla — reintenta varios días antes de pausar.
 * En esa ventana, una org queda ACTIVE sin haber pagado el período vigente y el
 * reconcile no lo detecta (transitionFromMP solo mira status + trial).
 *
 * Señal confiable: MP expone `summarized.last_charged_date` (último cobro
 * exitoso) y `next_payment_date` (próximo cobro programado). Si el próximo cobro
 * ya venció (más allá del grace) y no hay un cobro exitoso que cubra ese ciclo,
 * el cobro no se ejecutó.
 *
 * Uso conservador: el reconcile ALERTA (no auto-transiciona) para que un humano
 * verifique — evitamos bloquear a un cliente que sí paga por un dato momentáneo
 * de MP stale o desfasado por timezone.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const GRACE_DAYS = 3

export interface PaymentHealthInput {
  /** status del preapproval en MP (authorized/paused/…). */
  mpStatus: string
  /** next_payment_date del preapproval (ISO) o null. */
  nextPaymentDate: string | null | undefined
  /** summarized.last_charged_date del preapproval (ISO) o null/undefined. */
  lastChargedDate: string | null | undefined
  /** subscription_status que computó la state machine para esta org. */
  effectiveStatus: string
  /** now inyectable para tests. */
  now?: number
}

/**
 * True si la org figura ACTIVE con preapproval authorized, pero el cobro del
 * ciclo vigente venció (superó el grace) y no hay un cobro exitoso que lo cubra.
 */
export function isSilentChargeFailure(input: PaymentHealthInput): boolean {
  if (input.effectiveStatus !== "ACTIVE") return false
  if (input.mpStatus !== "authorized") return false
  if (!input.nextPaymentDate) return false

  const now = input.now ?? Date.now()
  const nextPay = new Date(input.nextPaymentDate).getTime()
  if (Number.isNaN(nextPay)) return false

  // El próximo cobro tiene que estar vencido más allá del grace.
  const overdue = nextPay < now - GRACE_DAYS * DAY_MS
  if (!overdue) return false

  // Sin ningún cobro exitoso → claramente no pagó.
  if (!input.lastChargedDate) return true

  const lastCharged = new Date(input.lastChargedDate).getTime()
  if (Number.isNaN(lastCharged)) return true

  // El último cobro exitoso es anterior al inicio del ciclo vencido
  // (~28 días antes del next_payment_date) → el cobro de este ciclo no entró.
  const cycleStart = nextPay - 28 * DAY_MS
  return lastCharged < cycleStart
}
