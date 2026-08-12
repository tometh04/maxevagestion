/**
 * Precio de venta por servicio/pata (VIB-112).
 *
 * `operation_operators.sale_amount` es un DESGLOSE informativo de
 * `operations.sale_amount_total`: cuánto de la venta total corresponde a cada
 * pata (vuelo, hotel, traslado...). Existe para dos cosas:
 *   - facturar cada servicio con el precio que la agencia definió, en vez de un
 *     reparto proporcional al costo (que infla la base gravada de IVA);
 *   - atribuir la venta por producto en los reportes.
 *
 * NO es la fuente de verdad de la venta: `sale_amount_total` lo sigue siendo
 * (de él dependen comisiones, IVA, deuda del cliente y los reportes). Por eso
 * el desglose se CONTRASTA contra el total y, si no cuadra, se avisa — nunca se
 * recalcula el total desde las patas.
 *
 * Este módulo es puro para poder testear el cuadre y el reparto sin base ni UI.
 */

export interface OperatorSaleLeg {
  /** Precio de venta asignado a la pata, en la moneda de venta de la operación. */
  sale_amount?: number | string | null
  /** Costo de la pata (para el reparto proporcional). */
  cost?: number | string | null
  /** Moneda del costo ("ARS" | "USD"); si difiere de la venta, se convierte. */
  cost_currency?: string | null
}

export type OperatorSaleBreakdownStatus = "EMPTY" | "BALANCED" | "MISMATCH"

export interface OperatorSaleBreakdownResult {
  status: OperatorSaleBreakdownStatus
  /** Suma de los sale_amount cargados. */
  breakdownTotal: number
  /** breakdownTotal − saleAmountTotal (positivo = cargaron de más). */
  difference: number
  /** Cuántas patas tienen un sale_amount > 0. */
  filledCount: number
  /** Total de patas. */
  legCount: number
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Tolerancia por defecto para considerar que el desglose "cuadra" con el total:
 * medio por ciento del total, con un piso de un centavo (para totales chicos).
 */
export function defaultBreakdownTolerance(saleAmountTotal: number): number {
  return Math.max(0.01, Math.abs(saleAmountTotal) * 0.005)
}

/**
 * Contrasta el desglose por pata contra el total de venta de la operación.
 *
 * - `EMPTY`: ninguna pata tiene precio cargado (estado normal hoy). No se avisa
 *   nada y la facturación cae al reparto por costo.
 * - `BALANCED`: hay precios y la suma cuadra con el total dentro de la
 *   tolerancia. La facturación usa estos precios.
 * - `MISMATCH`: hay precios pero la suma NO cuadra. Se avisa; no se bloquea.
 */
export function reconcileOperatorSaleBreakdown(input: {
  legs: OperatorSaleLeg[]
  saleAmountTotal: number | string | null | undefined
  tolerance?: number
}): OperatorSaleBreakdownResult {
  const legs = input.legs ?? []
  const saleAmountTotal = toNumber(input.saleAmountTotal)
  const tolerance = input.tolerance ?? defaultBreakdownTolerance(saleAmountTotal)

  let breakdownTotal = 0
  let filledCount = 0
  for (const leg of legs) {
    const amount = toNumber(leg.sale_amount)
    breakdownTotal += amount
    if (amount > 0) filledCount += 1
  }
  breakdownTotal = round(breakdownTotal)
  const difference = round(breakdownTotal - saleAmountTotal)

  let status: OperatorSaleBreakdownStatus
  if (filledCount === 0) {
    status = "EMPTY"
  } else {
    status = Math.abs(difference) <= tolerance ? "BALANCED" : "MISMATCH"
  }

  return { status, breakdownTotal, difference, filledCount, legCount: legs.length }
}

/**
 * Reparte `saleAmountTotal` entre las patas en proporción a su costo.
 *
 * Es el default editable de la facturación por servicio y del reporte por
 * producto: extrae la misma lógica que hoy vive inline en
 * `app/(dashboard)/operations/billing/new/page.tsx` y en
 * `lib/reports/sales-breakdown-report.ts`, para que los tres usen un solo
 * algoritmo.
 *
 * Reglas:
 * - El costo se expresa en la moneda de venta usando `exchangeRate` (USD→ARS).
 * - Si no hay costos (todos 0), reparto parejo.
 * - Si los costos están en monedas mezcladas y no hay TC (`exchangeRate <= 1`
 *   para una op en USD), no se pueden comparar → reparto parejo (nunca se suman
 *   ARS y USD crudos).
 * - El residuo de redondeo lo absorbe la pata de mayor peso, así la suma de los
 *   shares da EXACTAMENTE el total.
 */
export function distributeSaleByCost(input: {
  legs: OperatorSaleLeg[]
  saleAmountTotal: number | string | null | undefined
  saleCurrency: "ARS" | "USD"
  exchangeRate?: number | null
}): number[] {
  const legs = input.legs ?? []
  const saleTotal = toNumber(input.saleAmountTotal)
  const saleCurrency = input.saleCurrency === "USD" ? "USD" : "ARS"
  const rate = toNumber(input.exchangeRate) > 1 ? toNumber(input.exchangeRate) : 1

  if (legs.length === 0) return []

  const currencies = new Set(
    legs.map((l) => (String(l.cost_currency).toUpperCase() === "USD" ? "USD" : "ARS"))
  )
  const canConvert = rate > 1 || currencies.size === 1

  const costInSaleCurrency = (leg: OperatorSaleLeg): number => {
    const cost = toNumber(leg.cost)
    const cc = String(leg.cost_currency).toUpperCase() === "USD" ? "USD" : "ARS"
    if (cc === saleCurrency) return cost
    // Convertir sólo si hay TC; si no, el caller ya cae a reparto parejo.
    if (rate <= 1) return cost
    return saleCurrency === "USD" ? cost / rate : cost * rate
  }

  const weights = canConvert ? legs.map(costInSaleCurrency) : legs.map(() => 1)
  const totalWeight = weights.reduce((acc, w) => acc + Math.max(0, w), 0)

  // Sin costos (o no convertibles) → reparto parejo.
  const effectiveWeights =
    totalWeight > 0 ? weights.map((w) => Math.max(0, w)) : legs.map(() => 1)
  const effectiveTotal = effectiveWeights.reduce((acc, w) => acc + w, 0)

  const shares = effectiveWeights.map((w) => round((saleTotal * w) / effectiveTotal))

  // El residuo de redondeo lo absorbe la pata de mayor peso.
  const residual = round(saleTotal - shares.reduce((acc, s) => acc + s, 0))
  if (residual !== 0 && shares.length > 0) {
    let maxIndex = 0
    for (let i = 1; i < effectiveWeights.length; i++) {
      if (effectiveWeights[i] > effectiveWeights[maxIndex]) maxIndex = i
    }
    shares[maxIndex] = round(shares[maxIndex] + residual)
  }

  return shares
}
