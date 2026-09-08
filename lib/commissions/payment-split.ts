/**
 * Reparto de un pago de comisiones entre varias formas de pago.
 *
 * Pedido concreto de una agencia: una comisión generada en dólares se le paga
 * "una parte en pesos y otra en dólares". Antes había que pagar todo desde una
 * sola cuenta, o hacer dos pasadas calculando a mano cuántos dólares eran los
 * pesos que se entregaban.
 *
 * Esta función es el único lugar donde se decide qué parte de cada comisión
 * cancela cada cuenta. Es pura a propósito: el cálculo de cuánta plata sale de
 * cada lado no puede vivir en el componente.
 *
 * Dos invariantes, y por eso los residuos de redondeo se absorben al final:
 *
 *  1. La suma de lo que se le imputa a cada comisión es exactamente el total
 *     seleccionado. Si no, queda una comisión con un centavo pendiente que
 *     nadie va a pagar nunca.
 *  2. Lo que sale de cada cuenta es exactamente el importe que se cargó en esa
 *     forma de pago. Si no, la caja no cierra contra el comprobante.
 *
 * El tipo de cambio es SIEMPRE pesos por dólar (igual que en
 * `app/api/commissions/pay/route.ts`), sin importar en qué moneda esté la
 * comisión: es la única lectura que no se presta a confusión.
 */

export type SplitCurrency = "ARS" | "USD"

export interface PaymentLineInput {
  /** Identificador de la línea en la UI; vuelve en el error para señalarla. */
  id: string
  accountId: string
  accountCurrency: SplitCurrency
  /** Importe EN LA MONEDA DE LA CUENTA: es lo que sale de esa cuenta. */
  amount: number
  /** Pesos por dólar. Requerido solo si la cuenta es de otra moneda. */
  exchangeRate: number | null
}

export interface PayableCommissionInput {
  id: string
  /** Importe a cancelar, en la moneda de la comisión. */
  amount: number
}

export interface PaymentAllocation {
  commissionId: string
  accountId: string
  /** Lo que cancela de la comisión, en la moneda de la comisión. */
  amount: number
  /** Pesos por dólar, o null si no hubo conversión. */
  exchangeRate: number | null
  /** Lo que sale de la cuenta, en la moneda de la cuenta. */
  cashAmount: number
}

export type SplitResult =
  | { ok: true; allocations: PaymentAllocation[] }
  | { ok: false; error: string; lineId?: string }

const EPS = 0.005

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Importe de una cuenta llevado a la moneda de la comisión. */
export function toCommissionCurrency(
  amount: number,
  accountCurrency: SplitCurrency,
  commissionCurrency: SplitCurrency,
  exchangeRate: number | null
): number {
  if (accountCurrency === commissionCurrency) return round2(amount)
  if (!exchangeRate || exchangeRate <= 0) return 0
  // Cuenta en pesos pagando una comisión en dólares, y viceversa.
  return accountCurrency === "ARS" ? round2(amount / exchangeRate) : round2(amount * exchangeRate)
}

/** Importe de una comisión llevado a la moneda de la cuenta. */
export function toAccountCurrency(
  amount: number,
  accountCurrency: SplitCurrency,
  commissionCurrency: SplitCurrency,
  exchangeRate: number | null
): number {
  if (accountCurrency === commissionCurrency) return round2(amount)
  if (!exchangeRate || exchangeRate <= 0) return 0
  return accountCurrency === "ARS" ? round2(amount * exchangeRate) : round2(amount / exchangeRate)
}

/**
 * Suma de las formas de pago, en la moneda de la comisión. Sirve para mostrar
 * en pantalla cuánto falta o cuánto sobra antes de confirmar.
 */
export function sumLinesInCommissionCurrency(
  lines: PaymentLineInput[],
  commissionCurrency: SplitCurrency
): number {
  return round2(
    lines.reduce(
      (total, line) =>
        total +
        toCommissionCurrency(
          line.amount,
          line.accountCurrency,
          commissionCurrency,
          line.exchangeRate
        ),
      0
    )
  )
}

export interface AllocatePaymentParams {
  /** Comisiones seleccionadas con el importe que se les quiere imputar. */
  commissions: PayableCommissionInput[]
  /** Formas de pago, en orden: la primera se consume primero. */
  lines: PaymentLineInput[]
  commissionCurrency: SplitCurrency
}

export function allocateCommissionPayment({
  commissions,
  lines,
  commissionCurrency,
}: AllocatePaymentParams): SplitResult {
  const payable = commissions.filter((c) => Number(c.amount) > EPS)
  if (payable.length === 0) {
    return { ok: false, error: "No hay comisiones seleccionadas para pagar" }
  }
  if (lines.length === 0) {
    return { ok: false, error: "Agregá al menos una forma de pago" }
  }

  for (const line of lines) {
    if (!line.accountId) {
      return { ok: false, error: "Elegí la cuenta de cada forma de pago", lineId: line.id }
    }
    if (!(Number(line.amount) > EPS)) {
      return { ok: false, error: "Cargá el importe de cada forma de pago", lineId: line.id }
    }
    if (line.accountCurrency !== commissionCurrency && !(Number(line.exchangeRate) > 0)) {
      return {
        ok: false,
        error: "Ingresá el tipo de cambio de la forma de pago en otra moneda",
        lineId: line.id,
      }
    }
  }

  const total = round2(payable.reduce((sum, c) => sum + Number(c.amount), 0))
  const covered = sumLinesInCommissionCurrency(lines, commissionCurrency)

  // Tolerancia: un centavo por línea, que es lo que puede aportar el redondeo
  // de cada conversión. Cualquier diferencia mayor es un error de carga.
  const tolerance = Math.max(0.01, 0.01 * lines.length)
  const difference = round2(covered - total)

  if (Math.abs(difference) > tolerance) {
    return {
      ok: false,
      error:
        difference > 0
          ? `Las formas de pago suman ${Math.abs(difference).toFixed(2)} ${commissionCurrency} de más que las comisiones seleccionadas.`
          : `Faltan ${Math.abs(difference).toFixed(2)} ${commissionCurrency} para cubrir las comisiones seleccionadas.`,
    }
  }

  const allocations: PaymentAllocation[] = []
  let index = 0
  let commissionRemaining = round2(Number(payable[0].amount))

  for (const line of lines) {
    let cashRemaining = round2(Number(line.amount))
    let lineRemaining = toCommissionCurrency(
      line.amount,
      line.accountCurrency,
      commissionCurrency,
      line.exchangeRate
    )

    while (lineRemaining > EPS && index < payable.length) {
      const take = Math.min(commissionRemaining, lineRemaining)
      // La última imputación de la línea se lleva el resto exacto de la cuenta:
      // así lo que sale de la cuenta es lo que se cargó, sin arrastre.
      const isLastOfLine = take >= lineRemaining - EPS
      const cash = isLastOfLine
        ? round2(cashRemaining)
        : round2(
            toAccountCurrency(take, line.accountCurrency, commissionCurrency, line.exchangeRate)
          )

      allocations.push({
        commissionId: payable[index].id,
        accountId: line.accountId,
        amount: round2(take),
        exchangeRate: line.accountCurrency === commissionCurrency ? null : line.exchangeRate,
        cashAmount: cash,
      })

      cashRemaining = round2(cashRemaining - cash)
      lineRemaining = round2(lineRemaining - take)
      commissionRemaining = round2(commissionRemaining - take)

      if (commissionRemaining <= EPS) {
        index += 1
        commissionRemaining = index < payable.length ? round2(Number(payable[index].amount)) : 0
      }
    }
  }

  // Residuo por redondeo: se lo lleva la última imputación, para que ninguna
  // comisión quede con centavos colgados.
  const allocated = round2(allocations.reduce((sum, a) => sum + a.amount, 0))
  const residual = round2(total - allocated)
  if (Math.abs(residual) > EPS) {
    if (Math.abs(residual) > tolerance || allocations.length === 0) {
      return {
        ok: false,
        error: `No se pudo repartir el pago entre las comisiones (quedaron ${residual.toFixed(2)} ${commissionCurrency} sin imputar).`,
      }
    }
    const last = allocations[allocations.length - 1]
    last.amount = round2(last.amount + residual)
  }

  return { ok: true, allocations }
}
