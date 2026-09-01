/**
 * Traduce el `status_detail` de un pago rechazado de MP a algo accionable.
 *
 * Contexto (2026-08-30): el webhook consumía solo `payment.status`
 * (approved/rejected) y descartaba `status_detail`, así que un cobro caído
 * quedaba registrado como "rechazado" a secas. Sin el detalle no se puede
 * distinguir "no tiene saldo" (el cliente recarga y listo) de "tarjeta
 * vencida" (tiene que cambiar el medio de pago) ni saber si reintentar sirve.
 *
 * Referencia: los status_detail de /v1/payments de MP. La lista no es cerrada,
 * así que el default devuelve el código crudo en vez de tragárselo.
 */

export interface RejectionReason {
  /** status_detail crudo de MP. */
  code: string
  /** Explicación corta en español para el panel admin / Slack. */
  label: string
  /**
   * ¿Reintentar el MISMO medio de pago puede funcionar? Saldo insuficiente o
   * un rechazo transitorio sí; tarjeta vencida o robada no — ahí el cliente
   * tiene que cambiar el medio de pago sí o sí.
   */
  retryable: boolean
  /** Qué tiene que hacer el cliente. */
  action: string
}

const MAP: Record<string, Omit<RejectionReason, "code">> = {
  cc_rejected_insufficient_amount: {
    label: "Fondos insuficientes",
    retryable: true,
    action: "Cargar saldo / usar otro medio de pago y reintentar el cobro.",
  },
  cc_rejected_high_risk: {
    label: "Rechazado por prevención de fraude de MP",
    retryable: false,
    action: "Pagar con otro medio o con la cuenta de MP del titular.",
  },
  cc_rejected_bad_filled_card_number: {
    label: "Número de tarjeta mal cargado",
    retryable: false,
    action: "Volver a cargar la tarjeta en el checkout.",
  },
  cc_rejected_bad_filled_date: {
    label: "Fecha de vencimiento mal cargada",
    retryable: false,
    action: "Volver a cargar la tarjeta en el checkout.",
  },
  cc_rejected_bad_filled_security_code: {
    label: "Código de seguridad incorrecto",
    retryable: false,
    action: "Volver a cargar la tarjeta en el checkout.",
  },
  cc_rejected_bad_filled_other: {
    label: "Datos de la tarjeta incorrectos",
    retryable: false,
    action: "Volver a cargar la tarjeta en el checkout.",
  },
  cc_rejected_call_for_authorize: {
    label: "El banco pide autorización del titular",
    retryable: true,
    action: "El cliente debe autorizar el cobro con su banco y reintentar.",
  },
  cc_rejected_card_disabled: {
    label: "Tarjeta inhabilitada",
    retryable: false,
    action: "Activar la tarjeta con el banco o usar otra.",
  },
  cc_rejected_card_error: {
    label: "Error de la tarjeta",
    retryable: true,
    action: "Reintentar; si persiste, cambiar el medio de pago.",
  },
  cc_rejected_duplicated_payment: {
    label: "Pago duplicado",
    retryable: false,
    action: "Verificar si el cobro ya entró antes de volver a cobrar.",
  },
  cc_rejected_max_attempts: {
    label: "Superó el máximo de intentos",
    retryable: false,
    action: "Esperar y usar otro medio de pago.",
  },
  cc_rejected_invalid_installments: {
    label: "Cuotas no soportadas por el medio de pago",
    retryable: false,
    action: "Usar otro medio de pago.",
  },
  cc_rejected_blacklist: {
    label: "Medio de pago bloqueado por MP",
    retryable: false,
    action: "Usar otro medio de pago.",
  },
  cc_rejected_other_reason: {
    label: "Rechazado por el emisor (sin detalle)",
    retryable: true,
    action: "Reintentar; si persiste, cambiar el medio de pago.",
  },
  rejected_insufficient_data: {
    label: "Faltan datos del pagador",
    retryable: false,
    action: "Completar los datos de facturación y rehacer el checkout.",
  },
  rejected_by_bank: {
    label: "Rechazado por el banco",
    retryable: true,
    action: "El cliente debe destrabarlo con su banco y reintentar.",
  },
  rejected_by_regulations: {
    label: "Rechazado por regulaciones",
    retryable: false,
    action: "Usar otro medio de pago.",
  },
  insufficient_amount: {
    label: "Fondos insuficientes",
    retryable: true,
    action: "Cargar saldo / usar otro medio de pago y reintentar el cobro.",
  },
}

/**
 * Devuelve el motivo interpretado. `null` solo si no hay status_detail —
 * un código desconocido igual se devuelve (crudo) para no perder la señal.
 */
export function parseRejectionReason(statusDetail: string | null | undefined): RejectionReason | null {
  if (!statusDetail) return null
  const code = String(statusDetail)
  const known = MAP[code]
  if (known) return { code, ...known }
  return {
    code,
    label: `Rechazo no mapeado (${code})`,
    retryable: true,
    action: "Revisar el pago en el panel de MP.",
  }
}

/** Línea corta para Slack / admin: "Fondos insuficientes (cc_rejected_insufficient_amount)". */
export function formatRejectionReason(statusDetail: string | null | undefined): string {
  const r = parseRejectionReason(statusDetail)
  if (!r) return "motivo no informado por MP"
  return `${r.label} (${r.code})`
}
