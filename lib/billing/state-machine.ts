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
}

export interface MPPaymentEvent {
  type: "subscription_authorized_payment"
  status: "approved" | "rejected" | "pending" | string
  transaction_amount?: number
}

export interface TransitionContext {
  /** current_period_ends_at actual en DB, para preservarlo al cancelar. */
  preserved_current_period_ends_at?: string | null
}

export interface TransitionResult {
  subscription_status:
    | "PENDING_PAYMENT" | "TRIALING" | "ACTIVE"
    | "PAST_DUE" | "CANCELLED" | "SUSPENDED"
  current_period_ends_at: string | null
  /** Evento para billing_events (además del raw webhook que se loggea siempre). */
  event_type: string | null
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
    const hasActiveFreeTrial = hasActiveFreeTrialPeriod(preapproval)

    if (paymentEvent?.type === "subscription_authorized_payment") {
      if (paymentEvent.status === "rejected") {
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
      return {
        subscription_status: "TRIALING",
        current_period_ends_at: preapproval.next_payment_date ?? null,
        event_type: "SUBSCRIPTION_AUTHORIZED",
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
 * Heurística: free_trial declarado + next_payment_date futuro + authorized.
 * MP expone next_payment_date como "fecha del próximo cobro" — durante trial
 * coincide con el fin del trial. Tras el primer cobro exitoso, next_payment_date
 * avanza un mes, así que esta heurística devuelve false como corresponde.
 */
function hasActiveFreeTrialPeriod(p: MPPreapproval): boolean {
  if (!p.auto_recurring.free_trial) return false
  if (!p.next_payment_date) return false
  return new Date(p.next_payment_date).getTime() > Date.now()
}
