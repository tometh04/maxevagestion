/**
 * SaaS Pilar 9 — State machine MP preapproval → organizations.subscription_status.
 *
 * Función pura. Recibe el estado actual de MP (preapproval + último payment event)
 * y devuelve los valores que hay que escribir en la DB. Idempotente por construcción.
 *
 * Llamada desde el webhook y desde el cron de reconciliación.
 */

export interface MPAutoRecurring {
  frequency: number
  frequency_type: string
  transaction_amount: number
  currency_id: string
  free_trial?: { frequency: number; frequency_type: string }
  start_date?: string
  end_date?: string
}

export interface MPPreapproval {
  id: string
  status: "pending" | "authorized" | "paused" | "cancelled" | "finished" | string
  external_reference: string
  last_modified: string
  auto_recurring: MPAutoRecurring
  next_payment_date?: string | null
  /**
   * Resumen de cobros que MP expone en el preapproval. `last_charged_date` es el
   * último cobro EXITOSO — la señal confiable para saber hasta cuándo pagó de
   * verdad (vs. next_payment_date, que es el próximo intento/reintento).
   */
  summarized?: {
    last_charged_date?: string | null
    last_charged_amount?: number | null
  } | null
}

export interface MPPaymentEvent {
  type: "subscription_authorized_payment"
  status: "approved" | "rejected" | "pending" | string
  transaction_amount?: number
  /**
   * `status_detail` del pago de MP (ej. cc_rejected_insufficient_amount).
   * No participa de la transición — el estado lo decide `status` — pero se
   * persiste en billing_events y se manda a Slack: sin esto un cobro caído
   * queda como "rechazado" a secas y no se puede distinguir "no tenía saldo"
   * de "tarjeta vencida". Ver lib/billing/rejection-reason.ts.
   */
  status_detail?: string | null
  /** Id del pago en MP, para poder abrirlo en el panel. */
  payment_id?: string | number | null
}

export interface TransitionContext {
  /** current_period_ends_at actual en DB, para preservarlo al cancelar. */
  preserved_current_period_ends_at?: string | null
  /**
   * trial_ends_at de la DB. Fuente de verdad cuando el admin extendió el
   * trial: MP no permite modificar free_trial post-creación, así que la DB
   * puede tener una fecha posterior a next_payment_date de MP.
   */
  trial_ends_at?: string | null
}

export interface TransitionResult {
  subscription_status:
    | "PENDING_PAYMENT" | "TRIALING" | "ACTIVE"
    | "PAST_DUE" | "CANCELLED" | "SUSPENDED"
  current_period_ends_at: string | null
  /** Evento para billing_events (además del raw webhook que se loggea siempre). */
  event_type: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Margen de tolerancia (timezone/skew de MP) antes de declarar impago un ciclo.
 * Solo cortamos cuando el último cobro es claramente anterior al inicio del ciclo.
 */
export const CYCLE_SKEW_DAYS = 2

/**
 * Avanza (o retrocede, con direction=-1) una fecha ISO por un ciclo de
 * `auto_recurring`. `months` = meses calendario reales (28–31), `days` = +N días.
 * Devuelve null si los datos no alcanzan.
 */
export function addCycle(
  fromISO: string | null | undefined,
  autoRecurring: MPAutoRecurring | undefined,
  direction: 1 | -1 = 1,
): Date | null {
  if (!fromISO || !autoRecurring) return null
  const base = new Date(fromISO)
  if (Number.isNaN(base.getTime())) return null
  const n = (autoRecurring.frequency ?? 1) * direction
  const d = new Date(base)
  if (autoRecurring.frequency_type === "months") {
    d.setMonth(d.getMonth() + n)
  } else if (autoRecurring.frequency_type === "days") {
    d.setTime(d.getTime() + n * DAY_MS)
  } else {
    return null
  }
  return d
}

/** Hasta cuándo pagó de verdad = último cobro exitoso + 1 ciclo. Null si no hay dato. */
export function computePaidThrough(pa: MPPreapproval): Date | null {
  return addCycle(pa.summarized?.last_charged_date, pa.auto_recurring, 1)
}

/**
 * ¿El ciclo vigente NO se cobró? CONSERVADOR: devuelve true solo con señal clara,
 * para nunca cortarle el acceso a alguien que sí pagó.
 *   1. status authorized.
 *   2. hay last_charged_date válido (sin él → false: no cortar sub nueva en su 1er cobro).
 *   3. el último cobro exitoso es anterior al inicio del ciclo vigente con margen skew:
 *      - con next_payment_date: cycleStart = next_payment_date − 1 ciclo (robusto también
 *        cuando MP reprogramó el reintento al futuro).
 *      - sin next_payment_date: paidThrough + skew < now.
 */
export function isCurrentCycleUnpaid(pa: MPPreapproval, now: number, skewMs: number): boolean {
  if (pa.status !== "authorized") return false
  const lastISO = pa.summarized?.last_charged_date
  if (!lastISO) return false
  const last = new Date(lastISO).getTime()
  if (Number.isNaN(last)) return false

  if (pa.next_payment_date) {
    const cycleStart = addCycle(pa.next_payment_date, pa.auto_recurring, -1)
    if (!cycleStart) return false
    return last < cycleStart.getTime() - skewMs
  }
  const paidThrough = computePaidThrough(pa)
  if (!paidThrough) return false
  return paidThrough.getTime() + skewMs < now
}

/**
 * Decide la transición según el estado de MP.
 *
 * Reglas:
 *  - pending → PENDING_PAYMENT
 *  - authorized + (sin pago aún) + free_trial activo → TRIALING
 *  - authorized + pago approved → ACTIVE (current_period_ends_at = next_payment_date)
 *  - authorized + pago rejected → PAST_DUE (preserva current_period_ends_at)
 *  - paused → PAST_DUE (preserva)
 *  - cancelled → CANCELLED (preserva)
 *  - finished → CANCELLED (preserva)
 */
export function transitionFromMP(
  preapproval: MPPreapproval,
  paymentEvent?: MPPaymentEvent,
  ctx?: TransitionContext
): TransitionResult {
  const mpStatus = preapproval.status

  if (mpStatus === "pending") {
    return {
      subscription_status: "PENDING_PAYMENT",
      current_period_ends_at: null,
      event_type: "SUBSCRIPTION_CREATED",
    }
  }

  if (mpStatus === "authorized") {
    const hasActiveFreeTrial = hasActiveFreeTrialPeriod(preapproval, ctx?.trial_ends_at)

    if (paymentEvent?.type === "subscription_authorized_payment") {
      if (paymentEvent.status === "rejected") {
        // Si el trial fue extendido por admin y aún está vigente en DB, mantener
        // TRIALING en lugar de bloquear al usuario prematuramente (MP intentó cobrar
        // en la fecha original, pero el admin había dado más tiempo de prueba).
        if (ctx?.trial_ends_at && new Date(ctx.trial_ends_at).getTime() > Date.now()) {
          return {
            subscription_status: "TRIALING",
            current_period_ends_at: ctx.trial_ends_at,
            event_type: "PAYMENT_REJECTED_TRIAL_ACTIVE",
          }
        }
        return {
          subscription_status: "PAST_DUE",
          current_period_ends_at: ctx?.preserved_current_period_ends_at ?? null,
          event_type: "PAYMENT_REJECTED",
        }
      }
      if (paymentEvent.status === "approved") {
        return {
          subscription_status: "ACTIVE",
          current_period_ends_at: preapproval.next_payment_date ?? null,
          event_type: "PAYMENT_APPROVED",
        }
      }
      // pending u otro: no transicionar, mantener estado computado del preapproval
      return {
        subscription_status: hasActiveFreeTrial ? "TRIALING" : "ACTIVE",
        current_period_ends_at: preapproval.next_payment_date ?? null,
        event_type: null,
      }
    }

    // Sin paymentEvent: solo status del preapproval
    if (hasActiveFreeTrial) {
      // Si trial_ends_at de DB es el motivo por el que el trial sigue activo
      // (extensión admin), usarlo como current_period_ends_at — no la fecha vieja de MP.
      const periodEnd =
        ctx?.trial_ends_at && new Date(ctx.trial_ends_at).getTime() > Date.now()
          ? ctx.trial_ends_at
          : preapproval.next_payment_date ?? null
      return {
        subscription_status: "TRIALING",
        current_period_ends_at: periodEnd,
        event_type: "SUBSCRIPTION_AUTHORIZED",
      }
    }
    // Trial declarado pero ya expirado y sin pago confirmado → deuda pendiente.
    // Evita que billing-reconcile transite TRIALING → ACTIVE prematuramente antes
    // de que MP procese el primer cobro.
    const hadFreeTrial = !!preapproval.auto_recurring.free_trial
    if (hadFreeTrial) {
      return {
        subscription_status: "PAST_DUE",
        current_period_ends_at: ctx?.preserved_current_period_ends_at ?? preapproval.next_payment_date ?? null,
        event_type: "TRIAL_EXPIRED",
      }
    }
    // Fix "mes gratis": MP sigue "authorized" pero el ciclo vigente no se cobró
    // (rechazo con reintento reprogramado al futuro). NO revivir ACTIVE ni estirar
    // la fecha al reintento; bajar a PAST_DUE con lo REALMENTE pagado (último cobro
    // + 1 ciclo). Conservador: solo si isCurrentCycleUnpaid da señal clara.
    if (isCurrentCycleUnpaid(preapproval, Date.now(), CYCLE_SKEW_DAYS * DAY_MS)) {
      return {
        subscription_status: "PAST_DUE",
        current_period_ends_at:
          computePaidThrough(preapproval)?.toISOString() ??
          ctx?.preserved_current_period_ends_at ??
          preapproval.next_payment_date ??
          null,
        event_type: "PAYMENT_MISSED",
      }
    }
    return {
      subscription_status: "ACTIVE",
      current_period_ends_at: preapproval.next_payment_date ?? null,
      event_type: "SUBSCRIPTION_AUTHORIZED",
    }
  }

  if (mpStatus === "paused") {
    return {
      subscription_status: "PAST_DUE",
      current_period_ends_at: ctx?.preserved_current_period_ends_at ?? null,
      event_type: "SUBSCRIPTION_PAUSED",
    }
  }

  if (mpStatus === "cancelled" || mpStatus === "finished") {
    return {
      subscription_status: "CANCELLED",
      current_period_ends_at: ctx?.preserved_current_period_ends_at ?? null,
      event_type: mpStatus === "cancelled" ? "SUBSCRIPTION_CANCELLED" : "SUBSCRIPTION_FINISHED",
    }
  }

  // Estado desconocido: flag conservador
  console.warn("[state-machine] unknown MP status", mpStatus)
  return {
    subscription_status: "PAST_DUE",
    current_period_ends_at: ctx?.preserved_current_period_ends_at ?? null,
    event_type: null,
  }
}

/**
 * ¿El preapproval sigue dentro de su período free_trial?
 *
 * Prioriza trial_ends_at de DB cuando existe: el admin puede extender el trial
 * pero MP no permite modificar free_trial post-creación, así que la DB puede
 * tener una fecha posterior a next_payment_date de MP. Sin trial_ends_at en DB,
 * fallback a next_payment_date de MP (comportamiento original).
 */
function hasActiveFreeTrialPeriod(p: MPPreapproval, dbTrialEndsAt?: string | null): boolean {
  if (!p.auto_recurring.free_trial) return false
  const now = Date.now()
  if (dbTrialEndsAt) return new Date(dbTrialEndsAt).getTime() > now
  if (!p.next_payment_date) return false
  return new Date(p.next_payment_date).getTime() > now
}
