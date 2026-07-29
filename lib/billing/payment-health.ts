/**
 * Detección de cobros de renovación fallidos "en silencio".
 *
 * Gap detectado (2026-07-13): la state machine deriva ACTIVE de un preapproval
 * `authorized`, pero MP NO baja el status a paused/cancelled inmediatamente
 * cuando un cobro de renovación falla — reintenta varios días antes de pausar.
 *
 * Fix (2026-07-24): el CORTE proactivo lo hace ahora `transitionFromMP` vía
 * `isCurrentCycleUnpaid` (state-machine.ts), con math de ciclo calendario. Esta
 * función queda como ALERTA residual (Slack): marca casos que el corte no toca
 * (sin `last_charged_date` conocido, o gap grande) sin cambiar estado.
 *
 * Señal: MP expone `summarized.last_charged_date` (último cobro exitoso) y
 * `next_payment_date` (próximo cobro/reintento).
 */
import { PAST_DUE_GRACE_DAYS } from "./access"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Gap (en días) entre el último cobro exitoso y el próximo cobro que consideramos
 * "un cobro no entró". Un ciclo mensual normal es 28–31 días; usamos 40 (mes +
 * margen) para NO marcar como fallo un ciclo sano y sí un ciclo salteado (~60d).
 */
const MISSED_GAP_DAYS = 40

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
 * ciclo vigente no se ejecutó. Cubre TAMBIÉN el caso del reintento reprogramado
 * al futuro (que la versión vieja no agarraba porque exigía next_payment_date
 * vencido).
 */
export function isSilentChargeFailure(input: PaymentHealthInput): boolean {
  if (input.effectiveStatus !== "ACTIVE") return false
  if (input.mpStatus !== "authorized") return false
  if (!input.nextPaymentDate) return false

  const now = input.now ?? Date.now()
  const nextPay = new Date(input.nextPaymentDate).getTime()
  if (Number.isNaN(nextPay)) return false

  // Sin último cobro conocido: alertar solo si el próximo cobro ya venció más allá
  // de la gracia (este es el caso que el corte proactivo deliberadamente NO toca).
  if (!input.lastChargedDate) {
    return nextPay < now - PAST_DUE_GRACE_DAYS * DAY_MS
  }

  const lastCharged = new Date(input.lastChargedDate).getTime()
  if (Number.isNaN(lastCharged)) return true

  // Con último cobro conocido: el gap último-cobro → próximo-cobro supera 1 ciclo
  // + margen → un cobro no entró (robusto también con next_payment_date futuro).
  return lastCharged < nextPay - MISSED_GAP_DAYS * DAY_MS
}
