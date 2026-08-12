/**
 * Liquidación de comisiones al referidor (VIB-86).
 *
 * Reglas de negocio puras, sin I/O: qué comisiones se pueden liquidar juntas y
 * cuánta plata sale de la cuenta elegida. La route se queda con transporte,
 * permisos y persistencia; acá vive lo que hay que poder testear sin base.
 *
 * Contexto del cambio
 * -------------------
 * Antes, "pagar" una comisión de referido solo movía un flag: no salía plata de
 * ninguna cuenta. Este módulo es la mitad testeable del arreglo.
 *
 * Por qué liquidación y no pago fila por fila: al referidor se le paga un total
 * por período, no venta por venta. Agrupar permite un único movimiento de caja y
 * un comprobante con el detalle, que es lo que un tercero externo necesita para
 * conciliar.
 */

/** Monedas soportadas por el ledger. */
export type SettlementCurrency = "ARS" | "USD"

export interface SettlementCommission {
  id: string
  referral_partner_id: string
  currency: string
  amount: number | string
  status: string
  settlement_id?: string | null
  /** Fecha con la que se ubica la comisión en el período del comprobante. */
  date_calculated?: string | null
}

export interface SettlementSelectionResult {
  ok: boolean
  error?: string
  /** Total de las comisiones seleccionadas, en la moneda de las comisiones. */
  amount: number
  currency: SettlementCurrency | null
  partnerId: string | null
  periodFrom: string | null
  periodTo: string | null
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * ¿Esta comisión se puede incluir en una liquidación?
 *
 * - Flujo normal: sólo PENDING sin liquidación previa.
 * - Regularización: además acepta PAID sin liquidación, que son las que se
 *   marcaron como pagadas con el flujo viejo (sin salida de caja). Sirve para
 *   que cualquier agencia que ya venía usando el botón viejo pueda dejar la
 *   caja consistente sin tocar la base a mano.
 */
export function isCommissionSettleable(
  commission: Pick<SettlementCommission, "status" | "settlement_id">,
  opts: { regularize?: boolean } = {},
): boolean {
  if (commission.settlement_id) return false
  if (commission.status === "PENDING") return true
  return Boolean(opts.regularize) && commission.status === "PAID"
}

/**
 * Valida que un conjunto de comisiones pueda liquidarse junto y devuelve el
 * total y el período que cubre.
 *
 * Invariantes: un solo referidor, una sola moneda, todas elegibles, total > 0.
 * No mezclar monedas es la misma regla que sigue el resto del sistema — sumar
 * ARS y USD daría un total sin significado.
 */
export function validateSettlementSelection(
  commissions: SettlementCommission[],
  opts: { regularize?: boolean } = {},
): SettlementSelectionResult {
  const empty: SettlementSelectionResult = {
    ok: false,
    amount: 0,
    currency: null,
    partnerId: null,
    periodFrom: null,
    periodTo: null,
  }

  if (!Array.isArray(commissions) || commissions.length === 0) {
    return { ...empty, error: "Seleccioná al menos una comisión para liquidar" }
  }

  const partnerIds = new Set(commissions.map((c) => c.referral_partner_id))
  if (partnerIds.size > 1) {
    return {
      ...empty,
      error: "Una liquidación es de un solo referidor. Seleccioná comisiones de un mismo referidor.",
    }
  }

  const currencies = new Set(commissions.map((c) => String(c.currency || "").toUpperCase()))
  if (currencies.size > 1) {
    return {
      ...empty,
      error: "No se pueden liquidar comisiones en distintas monedas juntas. Hacé una liquidación por moneda.",
    }
  }

  const currency = Array.from(currencies)[0]
  if (currency !== "ARS" && currency !== "USD") {
    return { ...empty, error: `Moneda no soportada: ${currency || "(vacía)"}` }
  }

  const noElegible = commissions.find((c) => !isCommissionSettleable(c, opts))
  if (noElegible) {
    return {
      ...empty,
      error: noElegible.settlement_id
        ? "Alguna de las comisiones ya está incluida en otra liquidación"
        : `Alguna de las comisiones no está pendiente de pago (estado: ${noElegible.status})`,
    }
  }

  const amount = round2(commissions.reduce((acc, c) => acc + (Number(c.amount) || 0), 0))
  if (amount <= 0) {
    return { ...empty, error: "El total a liquidar debe ser mayor a cero" }
  }

  const fechas = commissions
    .map((c) => (c.date_calculated ? String(c.date_calculated).slice(0, 10) : null))
    .filter((d): d is string => Boolean(d))
    .sort()

  return {
    ok: true,
    amount,
    currency,
    partnerId: Array.from(partnerIds)[0],
    periodFrom: fechas[0] ?? null,
    periodTo: fechas[fechas.length - 1] ?? null,
  }
}

export interface SettlementCashInput {
  /** Moneda de las comisiones a liquidar. */
  commissionCurrency: SettlementCurrency
  /** Moneda de la cuenta desde la que sale la plata. */
  accountCurrency: SettlementCurrency
  /** Total a liquidar, en `commissionCurrency`. */
  amount: number
  /** Tipo de cambio ARS por USD. Obligatorio cross-moneda y para tocar USD. */
  exchangeRate?: number | null
}

export interface SettlementCashResult {
  ok: boolean
  error?: string
  /** Monto que sale de la cuenta, EN LA MONEDA DE LA CUENTA. */
  cashAmount: number
  /** Equivalente en ARS para el ledger. */
  amountARS: number
  exchangeRate: number | null
}

/**
 * Resuelve cuánta plata sale de la cuenta y su equivalente en ARS.
 *
 * Mismo criterio que el pago de comisión al vendedor (`/api/commissions/pay`):
 * se puede pagar una comisión en USD desde una cuenta en ARS y viceversa, con
 * tipo de cambio explícito. Esto importa porque el gasto manual de Caja NO
 * soporta cross-moneda (exige que la moneda de la cuenta coincida), que es
 * justamente la limitación que hoy obliga a hacerlo a mano.
 */
export function resolveSettlementCash(input: SettlementCashInput): SettlementCashResult {
  const { commissionCurrency, accountCurrency } = input
  const amount = round2(input.amount)
  const rate = input.exchangeRate != null ? Number(input.exchangeRate) : null
  const fail = (error: string): SettlementCashResult => ({
    ok: false,
    error,
    cashAmount: 0,
    amountARS: 0,
    exchangeRate: null,
  })

  if (!(amount > 0)) return fail("El total a liquidar debe ser mayor a cero")

  if (commissionCurrency === accountCurrency) {
    if (commissionCurrency === "ARS") {
      return { ok: true, cashAmount: amount, amountARS: amount, exchangeRate: null }
    }
    // Cuenta USD pagando comisión USD: el TC no cambia lo que sale de la cuenta,
    // pero sí el equivalente ARS que registra el ledger.
    if (!rate || !(rate > 0)) {
      return fail("Falta el tipo de cambio para registrar el equivalente en pesos")
    }
    return {
      ok: true,
      cashAmount: amount,
      amountARS: round2(amount * rate),
      exchangeRate: rate,
    }
  }

  if (!rate || !(rate > 0)) {
    return fail("Ingresá el tipo de cambio para pagar desde una cuenta en otra moneda")
  }

  if (commissionCurrency === "USD" && accountCurrency === "ARS") {
    const cashAmount = round2(amount * rate)
    return { ok: true, cashAmount, amountARS: cashAmount, exchangeRate: rate }
  }

  if (commissionCurrency === "ARS" && accountCurrency === "USD") {
    return {
      ok: true,
      cashAmount: round2(amount / rate),
      amountARS: amount,
      exchangeRate: rate,
    }
  }

  return fail("Combinación de monedas no soportada")
}

/**
 * Concepto del movimiento de ledger. El referidor es una entidad externa y
 * `ledger_movements` no tiene columna para él, así que el nombre viaja en el
 * concepto (el vínculo duro vive en referral_settlements.ledger_movement_id).
 */
export function buildSettlementConcept(params: {
  partnerName: string
  commissionsCount: number
  periodFrom?: string | null
  periodTo?: string | null
}): string {
  const { partnerName, commissionsCount, periodFrom, periodTo } = params
  const ventas = `${commissionsCount} venta${commissionsCount === 1 ? "" : "s"}`
  const periodo =
    periodFrom && periodTo
      ? periodFrom === periodTo
        ? ` (${periodFrom})`
        : ` (${periodFrom} a ${periodTo})`
      : ""
  return `Pago comisión referidor ${partnerName} — ${ventas}${periodo}`
}
