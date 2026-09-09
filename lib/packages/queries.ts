import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

/**
 * Lectura de paquetes cerrados con su cupo (VIB-183).
 *
 * Vive acá y no en la ruta porque lo consumen tres lugares: el listado de
 * Grupales y Cupo (Server Component), el selector del alta de operación y el
 * pre-chequeo del POST de operaciones. El "consumido" se calcula en UN solo
 * lado —la RPC `get_travel_package_availability`— para que nadie reimplemente
 * el JOIN contra operaciones canceladas por su cuenta.
 */

export interface PackageItem {
  id: string
  operator_id: string
  operator_name: string | null
  product_type: string | null
  cost: number
  cost_currency: string
  sale_amount: number
  notes: string | null
  sort_order: number
}

export interface PackageAvailability {
  total_quota: number
  consumed: number
  /** Puede venir negativo si el cupo se bajó por afuera; la UI lo clampea. */
  remaining: number
  active_bookings: number
  cancelled_bookings: number
}

export interface PackageWithAvailability {
  id: string
  name: string
  description: string | null
  destination: string | null
  departure_date: string | null
  return_date: string | null
  sale_amount_total: number | null
  sale_currency: string
  status: string
  notes: string | null
  agency_id: string | null
  agency_name: string | null
  created_at: string
  items: PackageItem[]
  availability: PackageAvailability
}

const PACKAGE_COLUMNS = `
  id, name, description, destination, departure_date, return_date,
  sale_amount_total, sale_currency, status, notes, agency_id, created_at,
  agencies:agency_id ( id, name ),
  travel_package_items (
    id, operator_id, product_type, cost, cost_currency, sale_amount, notes, sort_order,
    operators:operator_id ( id, name )
  )
`

function mapItems(raw: any[]): PackageItem[] {
  return (raw || [])
    .map((item: any) => ({
      id: item.id,
      operator_id: item.operator_id,
      operator_name: item.operators?.name ?? null,
      product_type: item.product_type ?? null,
      cost: Number(item.cost) || 0,
      cost_currency: item.cost_currency || "USD",
      sale_amount: Number(item.sale_amount) || 0,
      notes: item.notes ?? null,
      sort_order: Number(item.sort_order) || 0,
    }))
    // El orden define cuál es el operador principal al aplicar el paquete, así
    // que no se puede confiar en el orden en que los devuelva PostgREST.
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** Cupo por paquete. Devuelve un mapa vacío si no hay ids que consultar. */
export async function fetchAvailabilityMap(
  supabase: SupabaseClient<Database>,
  orgId: string,
  packageIds: string[]
): Promise<Map<string, PackageAvailability>> {
  const map = new Map<string, PackageAvailability>()
  if (packageIds.length === 0) return map

  const { data, error } = await (supabase.rpc as any)("get_travel_package_availability", {
    p_org_id: orgId,
    p_package_ids: packageIds,
  })

  if (error) {
    // El cupo es el dato central de la pantalla: si no se pudo calcular hay que
    // enterarse, no mostrar ceros que parezcan reales.
    throw new Error(`No se pudo calcular el cupo de los paquetes: ${error.message}`)
  }

  for (const row of (data || []) as any[]) {
    map.set(row.package_id, {
      total_quota: Number(row.total_quota) || 0,
      consumed: Number(row.consumed) || 0,
      remaining: Number(row.remaining) || 0,
      active_bookings: Number(row.active_bookings) || 0,
      cancelled_bookings: Number(row.cancelled_bookings) || 0,
    })
  }

  return map
}

export interface FetchPackagesOptions {
  orgId: string
  /**
   * Agencias del usuario. Los paquetes sin agencia (de toda la org) se ven
   * siempre; los de una agencia, solo si es una de estas.
   */
  agencyIds: string[]
  /** true = solo los que se pueden vender hoy (ACTIVE y con plazas libres). */
  onlySellable?: boolean
}

export async function fetchPackagesWithAvailability(
  supabase: SupabaseClient<Database>,
  { orgId, agencyIds, onlySellable = false }: FetchPackagesOptions
): Promise<PackageWithAvailability[]> {
  let query = (supabase.from("travel_packages") as any)
    .select(PACKAGE_COLUMNS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  if (onlySellable) {
    query = query.eq("status", "ACTIVE")
  }

  // Un paquete sin agencia es de toda la org. Con `agencyIds` vacío, solo esos.
  query =
    agencyIds.length > 0
      ? query.or(`agency_id.is.null,agency_id.in.(${agencyIds.join(",")})`)
      : query.is("agency_id", null)

  const { data, error } = await query
  if (error) {
    throw new Error(`Error al obtener paquetes: ${error.message}`)
  }

  const rows = (data || []) as any[]
  const availability = await fetchAvailabilityMap(
    supabase,
    orgId,
    rows.map((row) => row.id)
  )

  const packages: PackageWithAvailability[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    destination: row.destination ?? null,
    departure_date: row.departure_date ?? null,
    return_date: row.return_date ?? null,
    sale_amount_total: row.sale_amount_total === null ? null : Number(row.sale_amount_total),
    sale_currency: row.sale_currency || "USD",
    status: row.status,
    notes: row.notes ?? null,
    agency_id: row.agency_id ?? null,
    agency_name: row.agencies?.name ?? null,
    created_at: row.created_at,
    items: mapItems(row.travel_package_items),
    availability: availability.get(row.id) ?? {
      total_quota: Number(row.total_quota) || 0,
      consumed: 0,
      remaining: Number(row.total_quota) || 0,
      active_bookings: 0,
      cancelled_bookings: 0,
    },
  }))

  // El filtro de "con plazas libres" va acá y no en SQL porque el disponible es
  // derivado: no existe como columna contra la cual filtrar.
  return onlySellable
    ? packages.filter((pkg) => pkg.availability.remaining > 0)
    : packages
}

export async function fetchPackageById(
  supabase: SupabaseClient<Database>,
  orgId: string,
  packageId: string
): Promise<PackageWithAvailability | null> {
  const { data, error } = await (supabase.from("travel_packages") as any)
    .select(PACKAGE_COLUMNS)
    .eq("org_id", orgId)
    .eq("id", packageId)
    .maybeSingle()

  if (error) {
    throw new Error(`Error al obtener el paquete: ${error.message}`)
  }
  if (!data) return null

  const availability = await fetchAvailabilityMap(supabase, orgId, [data.id])

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    destination: data.destination ?? null,
    departure_date: data.departure_date ?? null,
    return_date: data.return_date ?? null,
    sale_amount_total: data.sale_amount_total === null ? null : Number(data.sale_amount_total),
    sale_currency: data.sale_currency || "USD",
    status: data.status,
    notes: data.notes ?? null,
    agency_id: data.agency_id ?? null,
    agency_name: data.agencies?.name ?? null,
    created_at: data.created_at,
    items: mapItems(data.travel_package_items),
    availability: availability.get(data.id) ?? {
      total_quota: 0,
      consumed: 0,
      remaining: 0,
      active_bookings: 0,
      cancelled_bookings: 0,
    },
  }
}

export interface PackageConsumingOperation {
  operation_id: string
  seats: number
  booked_at: string
  file_code: string | null
  destination: string | null
  status: string
  sale_amount_total: number | null
  sale_currency: string | null
  departure_date: string | null
  seller_name: string | null
  /** false = cancelada: la fila sigue visible pero su cupo ya se liberó. */
  consumes_quota: boolean
}

/**
 * Ventas que consumieron cupo de un paquete. Las canceladas se devuelven igual,
 * marcadas: ocultarlas haría incomprensible por qué bajó el número de vendidas.
 */
export async function fetchPackageConsumingOperations(
  supabase: SupabaseClient<Database>,
  orgId: string,
  packageId: string
): Promise<PackageConsumingOperation[]> {
  const { data, error } = await (supabase.from("travel_package_bookings") as any)
    .select(
      `
      seats, created_at, operation_id,
      operations:operation_id (
        id, file_code, destination, status, sale_amount_total, sale_currency, departure_date,
        seller:seller_id ( id, name )
      )
    `
    )
    .eq("org_id", orgId)
    .eq("package_id", packageId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Error al obtener las ventas del paquete: ${error.message}`)
  }

  return ((data || []) as any[]).map((row) => {
    const op = row.operations || {}
    return {
      operation_id: row.operation_id,
      seats: Number(row.seats) || 0,
      booked_at: row.created_at,
      file_code: op.file_code ?? null,
      destination: op.destination ?? null,
      status: op.status ?? "",
      sale_amount_total: op.sale_amount_total === null || op.sale_amount_total === undefined
        ? null
        : Number(op.sale_amount_total),
      sale_currency: op.sale_currency ?? null,
      departure_date: op.departure_date ?? null,
      seller_name: op.seller?.name ?? null,
      consumes_quota: op.status !== "CANCELLED",
    }
  })
}

export interface OperationTravelPackage {
  package_id: string
  name: string
  destination: string | null
  departure_date: string | null
  return_date: string | null
  status: string
  /** Plazas que esta operación le ocupa al paquete. */
  seats: number
}

/**
 * Paquete del que salió una operación, o null si se cargó suelta.
 *
 * El vínculo es la fila de `travel_package_bookings`: la operación no guarda el
 * paquete en ninguna columna propia, así que sin esta consulta el detalle no
 * tiene forma de saber de dónde vino la venta.
 */
export async function fetchOperationPackage(
  supabase: SupabaseClient<Database>,
  orgId: string,
  operationId: string
): Promise<OperationTravelPackage | null> {
  const { data, error } = await (supabase.from("travel_package_bookings") as any)
    .select(
      `
      seats, package_id,
      travel_packages:package_id ( id, name, destination, departure_date, return_date, status )
    `
    )
    .eq("org_id", orgId)
    .eq("operation_id", operationId)
    .maybeSingle()

  // Que no se sepa el paquete no puede romper el detalle de la operación: se
  // registra y la pantalla sigue mostrando todo lo demás.
  if (error) {
    console.error("[packages] no se pudo leer el paquete de la operación:", error)
    return null
  }
  if (!data?.travel_packages) return null

  const pkg = data.travel_packages
  return {
    package_id: pkg.id,
    name: pkg.name,
    destination: pkg.destination ?? null,
    departure_date: pkg.departure_date ?? null,
    return_date: pkg.return_date ?? null,
    status: pkg.status,
    seats: Number(data.seats) || 0,
  }
}

/** Venta acumulada de las operaciones que consumen cupo, separada por moneda. */
export function sumSalesByCurrency(
  operations: PackageConsumingOperation[]
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const op of operations) {
    // Una venta cancelada no suma: liberó el cupo y no es venta.
    if (!op.consumes_quota) continue
    const currency = op.sale_currency || "USD"
    totals[currency] = (totals[currency] || 0) + (op.sale_amount_total || 0)
  }
  return totals
}
