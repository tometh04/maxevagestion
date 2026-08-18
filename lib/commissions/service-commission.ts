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
}

/**
 * Base comisionable del servicio.
 *
 * Con monedas distintas no hay tipo de cambio confiable en este punto, así que
 * se comisiona sobre la venta en lugar de restar un costo en otra moneda, que
 * daría un margen inventado. Es el criterio que ya venía aplicando el alta.
 */
export function serviceCommissionBase(
  input: Pick<ServiceCommissionInput, "saleAmount" | "costAmount" | "saleCurrency" | "costCurrency">
): number {
  return input.saleCurrency === input.costCurrency
    ? input.saleAmount - input.costAmount
    : input.saleAmount
}

/**
 * Monto de comisión del servicio, redondeado a centavos.
 *
 * Devuelve 0 —y no un negativo— cuando el servicio se vendió a pérdida: una
 * comisión negativa le descontaría plata al vendedor por una decisión comercial
 * de la agencia.
 */
export function serviceCommissionAmount(input: ServiceCommissionInput): number {
  const base = serviceCommissionBase(input)
  if (base <= 0 || input.sellerPercentage <= 0) return 0
  return Math.round(((base * input.sellerPercentage) / 100) * 100) / 100
}
