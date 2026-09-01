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
 * Catálogo completo de tipos de servicio (el enum `operation_service_type`).
 *
 * Es la única copia del catálogo del lado del servidor: la ruta de servicios lo
 * usa para validar el payload y el CHECK de
 * `financial_settings.commission_service_types` repite el mismo literal en SQL.
 */
export const ALL_SERVICE_TYPES = [
  "SEAT",
  "LUGGAGE",
  "VISA",
  "TRANSFER",
  "ASSISTANCE",
  "HOTEL",
  "FLIGHT",
  "EXCURSION",
] as const

export type ServiceType = (typeof ALL_SERVICE_TYPES)[number]

/**
 * Tipos que comisionan cuando la agencia no configuró nada.
 *
 * Es el set histórico: SEAT, LUGGAGE y VISA quedaron afuera porque nacieron como
 * cargos administrativos que se trasladan al pasajero sin margen. Resultó no ser
 * cierto para todas las agencias —en Lozada los asientos se venden con margen
 * propio y el vendedor los comisiona—, así que dejó de ser una regla del dominio
 * y pasó a ser una perilla por oficina (`financial_settings.commission_service_types`).
 * Esta constante sobrevive como el default que preserva el comportamiento de siempre.
 */
export const DEFAULT_COMMISSION_SERVICE_TYPES: ServiceType[] = [
  "TRANSFER",
  "ASSISTANCE",
  "HOTEL",
  "FLIGHT",
  "EXCURSION",
]

export interface ServiceCommissionTypesConfig {
  /** Tipos que comisionan por defecto en esta agencia, en MAYÚSCULAS. */
  types: Set<string>
}

export const DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG: ServiceCommissionTypesConfig = {
  types: new Set<string>(DEFAULT_COMMISSION_SERVICE_TYPES),
}

/**
 * Si un tipo de servicio comisiona por defecto en una agencia.
 *
 * Es solo el DEFAULT al cargar el servicio o al cambiarle el tipo: la verdad de
 * cada fila vive en `operation_services.generates_commission`, que el switch de
 * la UI puede pisar en cualquier dirección.
 *
 * `config` es requerido en el tipo pero tolera `null` en runtime, a propósito.
 * Requerido para que al cambiar la firma el compilador señale todos los call
 * sites en vez de dejar alguno leyendo el set histórico en silencio; tolerante
 * porque un `null` tiene que caer en "comisionan los de siempre" y nunca en "no
 * comisiona nada", que sería dejar de pagarle a alguien por un error de lectura.
 */
export function serviceGeneratesCommission(
  serviceType: string | null | undefined,
  config: ServiceCommissionTypesConfig | null | undefined,
): boolean {
  const types = config?.types ?? DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG.types
  return types.has(String(serviceType ?? "").toUpperCase())
}

/** Normaliza lo que venga de la columna jsonb a un set de tipos conocidos. */
export function parseCommissionServiceTypes(
  raw: unknown,
): ServiceCommissionTypesConfig | null {
  if (!Array.isArray(raw)) return null
  const known = new Set<string>(ALL_SERVICE_TYPES)
  const types = new Set<string>()
  for (const item of raw) {
    const value = String(item ?? "").toUpperCase()
    if (known.has(value)) types.add(value)
  }
  return { types }
}

/**
 * Lee de `financial_settings` qué tipos comisionan en una agencia.
 *
 * Best-effort igual que `getCommissionBaseConfig`: sin agencia, sin fila, con un
 * jsonb que no es array, o con un error de lectura, cae al set histórico. Que la
 * columna todavía no exista (deploy adelantado a la migración) entra por el
 * mismo camino: PostgREST devuelve error y el alta de servicios sigue andando
 * como venía.
 */
export async function getServiceCommissionTypesConfig(
  supabase: any,
  agencyId: string | null | undefined,
): Promise<ServiceCommissionTypesConfig> {
  if (!agencyId) return DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG

  try {
    const { data, error } = await supabase
      .from("financial_settings")
      .select("commission_service_types")
      .eq("agency_id", agencyId)
      .maybeSingle()

    if (error || !data) return DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG

    return (
      parseCommissionServiceTypes((data as any).commission_service_types) ??
      DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG
    )
  } catch (err) {
    console.error("[Commissions] No se pudo leer qué servicios comisionan:", err)
    return DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG
  }
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
