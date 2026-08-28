/**
 * Comisión de un servicio agregado a una operación.
 *
 * Vive acá y no dentro de una ruta porque la misma regla corre al crear y al
 * editar un servicio, y es plata: tenerla duplicada en dos rutas es la forma más
 * segura de que se desincronicen.
 *
 * La regla, en una línea: un servicio comisiona a **quien lo vendió** —no al
 * vendedor de la operación— y en el **mes en que se vendió** —no en el de la
 * venta original—. Por eso su comisión es una fila propia de
 * `commission_records` (`kind = 'SERVICE'`) en vez de un agregado sobre la
 * comisión de la venta base, que es como se hacía antes y que provocaba tres
 * problemas: se la cobraba el vendedor equivocado, caía en un mes ya cerrado, y
 * si esa comisión ya estaba pagada el servicio simplemente no comisionaba nada.
 */

/**
 * Tipos de servicio que generan comisión al vendedor.
 *
 * Los que faltan (SEAT, LUGGAGE, VISA) son cargos administrativos que se
 * trasladan al pasajero sin margen para la agencia.
 */
export const COMMISSION_SERVICE_TYPES = new Set([
  "TRANSFER",
  "ASSISTANCE",
  "HOTEL",
  "FLIGHT",
  "EXCURSION",
])

/** Si un tipo de servicio comisiona. Deriva `operation_services.generates_commission`. */
export function serviceGeneratesCommission(serviceType: string | null | undefined): boolean {
  return COMMISSION_SERVICE_TYPES.has(String(serviceType ?? "").toUpperCase())
}

export interface ServiceCommissionInput {
  saleAmount: number
  costAmount: number
  saleCurrency: string
  costCurrency: string
  /** Porcentaje del vendedor DEL SERVICIO, no el de la operación. */
  sellerPercentage: number
  /**
   * Moneda en la que se expresa la comisión: la de la OPERACIÓN.
   *
   * `commission_records` no tiene columna de moneda — el `amount` se lee
   * asumiendo la moneda de la operación, en unos treinta lugares. Un servicio
   * cargado en otra moneda producía un importe en pesos que después se leía
   * como dólares: reportado por Lozada sobre un transfer con $159.000 de margen
   * que figuraba como una deuda de USD 20.670 con la vendedora.
   *
   * Si se omite, no se convierte nada: es el comportamiento viejo.
   */
  operationCurrency?: string
  /** Pesos por dólar de la fecha del servicio. Sólo hace falta si hay que convertir. */
  exchangeRate?: number | null
}

/**
 * Base comisionable del servicio, en la moneda de VENTA del servicio.
 *
 * Cuando venta y costo están en monedas distintas entre sí se comisiona sobre
 * la venta en lugar de restar un costo en otra moneda, que daría un margen
 * inventado. Es el criterio que ya venía aplicando el alta y no se toca acá:
 * son cuatro servicios en toda la base y no es lo que se vino a arreglar.
 */
export function serviceCommissionBase(
  input: Pick<ServiceCommissionInput, "saleAmount" | "costAmount" | "saleCurrency" | "costCurrency">
): number {
  return input.saleCurrency === input.costCurrency
    ? input.saleAmount - input.costAmount
    : input.saleAmount
}

/** ARS ⇄ USD con el tipo de cambio dado. `null` = no se puede valuar. */
function convertir(
  monto: number,
  desde: string,
  hacia: string,
  exchangeRate: number | null | undefined
): number | null {
  if (desde === hacia) return monto
  if (!exchangeRate || !(exchangeRate > 0)) return null
  // El tipo de cambio siempre es pesos por dólar, en cualquier dirección.
  return hacia === "USD" ? monto / exchangeRate : monto * exchangeRate
}

/**
 * Monto de comisión del servicio, en la moneda de la operación y redondeado a
 * centavos.
 *
 * Devuelve 0 —y no un negativo— cuando el servicio se vendió a pérdida: una
 * comisión negativa le descontaría plata al vendedor por una decisión comercial
 * de la agencia.
 *
 * Devuelve **null** cuando hace falta convertir y no hay tipo de cambio. Es
 * distinto de 0 a propósito: 0 es "no corresponde comisión" y null es "no se
 * pudo calcular". Guardar el importe sin convertir sería peor que las dos
 * cosas, porque se leería como si estuviera en la moneda de la operación.
 */
export function serviceCommissionAmount(input: ServiceCommissionInput): number | null {
  const base = serviceCommissionBase(input)
  if (base <= 0 || input.sellerPercentage <= 0) return 0

  const destino = input.operationCurrency || input.saleCurrency
  const baseEnMonedaDeLaOperacion = convertir(
    base,
    input.saleCurrency,
    destino,
    input.exchangeRate
  )
  if (baseEnMonedaDeLaOperacion === null) return null

  return Math.round(((baseEnMonedaDeLaOperacion * input.sellerPercentage) / 100) * 100) / 100
}
