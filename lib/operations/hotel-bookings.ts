/**
 * Reservas por cadena de hotel (pedido Lozada/Maxi).
 *
 * Permite buscar todas las reservas de una cadena de hotel (ej. "Iberostar")
 * dentro de un rango de fechas y devolver, por cada reserva, su código de
 * reserva de hotel. Sirve para dos cosas:
 *   1. Tener ordenados los localizadores por cadena.
 *   2. Sacar estadística por hotel (cuántas reservas / monto).
 *
 * Fuentes de datos (ambas con nombre de hotel + código de reserva):
 *   - `operations`      → hotel a nivel operación (lo que se carga en TODA alta).
 *   - `operation_legs`  → hoteles de viajes multidestino (se cargan en edición).
 * `operation_services` NO guarda código de reserva de hotel, así que queda fuera.
 *
 * El rango de fechas filtra por check-in con fallback a la fecha de salida
 * (`COALESCE(checkin_date, departure_date)`). Se resuelve en memoria porque el
 * set ya viene acotado por la cadena de hotel (chico) y PostgREST no expresa
 * COALESCE cómodo.
 *
 * Multi-tenant + scope por rol: se reusa `applyOperationsFilters` para la query
 * de operaciones y se replica el mismo criterio sobre el embed `operations` de
 * la query de tramos (un SELLER solo ve lo suyo, etc).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { isIndependentAdvisor, type UserRole } from "@/lib/permissions"
import {
  applyOperationsFilters,
  hasAgencyOperationsSupportView,
  canRegisterPaymentsOnAgencyOperations,
  NO_MATCH_UUID,
} from "@/lib/permissions-api"
import {
  buildExchangeRateMap,
  getLatestExchangeRate,
  DEFAULT_USD_ARS_FALLBACK_RATE,
} from "@/lib/accounting/exchange-rates"

/** Tope defensivo para no traer queries gigantes. */
export const HOTEL_BOOKINGS_LIMIT = 10_000

export type HotelBookingsUser = {
  id: string
  role: string
  org_id?: string | null
  is_independent_advisor?: boolean | null
  can_view_agency_operations_support?: boolean | null
  can_register_payments_on_agency_operations?: boolean | null
}

export type HotelBookingsFilters = {
  /** Cadena/nombre de hotel a buscar (ilike parcial). */
  hotel?: string | null
  /** Rango sobre COALESCE(checkin_date, departure_date). Formato YYYY-MM-DD. */
  dateFrom?: string | null
  dateTo?: string | null
  /** Filtro opcional por agencia concreta (además del scope por rol). */
  agencyId?: string | null
  /** Filtro opcional por vendedor concreto (además del scope por rol). */
  sellerId?: string | null
}

export type HotelBookingRow = {
  /** De qué capa viene la reserva. */
  source: "operation" | "leg"
  operationId: string
  fileCode: string | null
  hotelName: string | null
  reservationCode: string | null
  checkinDate: string | null
  checkoutDate: string | null
  departureDate: string | null
  /** Fecha usada para el filtro/orden: checkin con fallback a salida. */
  effectiveDate: string | null
  customerName: string | null
  sellerName: string | null
  status: string | null
  saleAmount: number
  saleCurrency: string
  /** Venta convertida a USD (referencial). */
  saleAmountUsd: number
}

export type HotelSummaryRow = {
  hotel: string
  reservas: number
  /** Suma de venta en USD (solo capa operación, para no doble-contar multidestino). */
  montoUsd: number
}

export type HotelBookingsResult = {
  rows: HotelBookingRow[]
  summary: HotelSummaryRow[]
  /** true si se alcanzó el tope y el resultado quedó cortado. */
  truncated: boolean
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function customerName(oc: any[] | null | undefined): string | null {
  if (!oc || oc.length === 0) return null
  const main = oc.find((c) => c.role === "MAIN" || c.role === "main") ?? oc[0]
  const c = main?.customers
  if (!c) return null
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
  return name || null
}

/**
 * Replica el criterio de `applyOperationsFilters` pero apuntando a las columnas
 * del embed `operations` de una query sobre `operation_legs` (que no tiene
 * `seller_id`/`org_id` propios). Mantiene la misma semántica de scope por rol.
 */
function scopeLegsByRole(
  query: any,
  user: HotelBookingsUser,
  agencyIds: string[]
): any {
  const userRole = user.role as UserRole

  if (isIndependentAdvisor(user)) {
    return query.eq("operations.seller_id", user.id)
  }

  if (userRole === "SELLER") {
    if (hasAgencyOperationsSupportView(user) || canRegisterPaymentsOnAgencyOperations(user)) {
      if (agencyIds.length > 0) return query.in("operations.agency_id", agencyIds)
      return query.eq("operations.seller_id", user.id)
    }
    return query.eq("operations.seller_id", user.id)
  }

  if (agencyIds.length > 0) return query.in("operations.agency_id", agencyIds)
  // Sin agencias asignadas → no devolver nada (evita leak cross-tenant).
  return query.eq("operations.id", NO_MATCH_UUID)
}

/** Fecha efectiva para el filtro/orden: check-in con fallback a salida. */
function effectiveDateOf(checkin: string | null, departure: string | null): string | null {
  return checkin || departure || null
}

function withinRange(date: string | null, from?: string | null, to?: string | null): boolean {
  if (!date) return false
  // Comparación lexicográfica: seguro para YYYY-MM-DD y para timestamps ISO
  // (ambos ordenan igual que cronológicamente). Recortamos a 10 chars por si la
  // columna trae timestamp completo.
  const d = date.slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

/**
 * Devuelve las reservas de hotel que matchean la cadena + rango de fechas,
 * junto con un resumen agregado por hotel.
 */
export async function getHotelBookings(
  supabase: SupabaseClient<Database>,
  user: HotelBookingsUser,
  agencyIds: string[],
  filters: HotelBookingsFilters
): Promise<HotelBookingsResult> {
  const hotel = (filters.hotel ?? "").trim()
  const dateFrom = filters.dateFrom && DATE_RE.test(filters.dateFrom) ? filters.dateFrom : null
  const dateTo = filters.dateTo && DATE_RE.test(filters.dateTo) ? filters.dateTo : null
  const agencyId = filters.agencyId && filters.agencyId !== "ALL" ? filters.agencyId : null
  const sellerId = filters.sellerId && filters.sellerId !== "ALL" ? filters.sellerId : null

  // Escapar comodines de PostgREST para que el usuario no inyecte patrones.
  const ilikeTerm = `%${hotel.replace(/[%_]/g, (m) => `\\${m}`)}%`

  // ── Query 1: hotel a nivel operación ──────────────────────────────────────
  let opsQuery: any = supabase
    .from("operations")
    .select(`
      id, file_code, status,
      hotel_name, reservation_code_hotel,
      checkin_date, checkout_date, departure_date,
      sale_amount_total, sale_currency, currency,
      sellers:seller_id(name),
      operation_customers(role, customers:customer_id(first_name, last_name))
    `)

  if (user.org_id) opsQuery = opsQuery.eq("org_id", user.org_id)
  opsQuery = applyOperationsFilters(opsQuery, user as any, agencyIds)
  if (hotel) opsQuery = opsQuery.ilike("hotel_name", ilikeTerm)
  else opsQuery = opsQuery.not("hotel_name", "is", null)
  if (agencyId) opsQuery = opsQuery.eq("agency_id", agencyId)
  if (sellerId) opsQuery = opsQuery.eq("seller_id", sellerId)
  opsQuery = opsQuery.limit(HOTEL_BOOKINGS_LIMIT)

  // ── Query 2: hoteles a nivel tramo (multidestino) ─────────────────────────
  let legsQuery: any = supabase
    .from("operation_legs")
    .select(`
      hotel_name, reservation_code_hotel,
      checkin_date, checkout_date, departure_date,
      operations!inner(
        id, file_code, status, org_id, seller_id, agency_id,
        departure_date, sale_amount_total, sale_currency, currency,
        sellers:seller_id(name),
        operation_customers(role, customers:customer_id(first_name, last_name))
      )
    `)

  if (user.org_id) legsQuery = legsQuery.eq("operations.org_id", user.org_id)
  legsQuery = scopeLegsByRole(legsQuery, user, agencyIds)
  if (hotel) legsQuery = legsQuery.ilike("hotel_name", ilikeTerm)
  else legsQuery = legsQuery.not("hotel_name", "is", null)
  if (agencyId) legsQuery = legsQuery.eq("operations.agency_id", agencyId)
  if (sellerId) legsQuery = legsQuery.eq("operations.seller_id", sellerId)
  legsQuery = legsQuery.limit(HOTEL_BOOKINGS_LIMIT)

  const [opsRes, legsRes] = await Promise.all([opsQuery, legsQuery])
  if (opsRes.error) throw new Error(opsRes.error.message)
  if (legsRes.error) throw new Error(legsRes.error.message)

  const opsData = (opsRes.data ?? []) as any[]
  const legsData = (legsRes.data ?? []) as any[]

  // Construir filas crudas (sin conversión de moneda todavía).
  type RawRow = Omit<HotelBookingRow, "saleAmountUsd">
  const rawRows: RawRow[] = []

  for (const op of opsData) {
    const effectiveDate = effectiveDateOf(op.checkin_date, op.departure_date)
    if (!withinRange(effectiveDate, dateFrom, dateTo)) continue
    rawRows.push({
      source: "operation",
      operationId: op.id,
      fileCode: op.file_code ?? null,
      hotelName: op.hotel_name ?? null,
      reservationCode: op.reservation_code_hotel ?? null,
      checkinDate: op.checkin_date ?? null,
      checkoutDate: op.checkout_date ?? null,
      departureDate: op.departure_date ?? null,
      effectiveDate,
      customerName: customerName(op.operation_customers),
      sellerName: op.sellers?.name ?? null,
      status: op.status ?? null,
      saleAmount: Number(op.sale_amount_total ?? 0) || 0,
      saleCurrency: op.sale_currency || op.currency || "USD",
    })
  }

  for (const leg of legsData) {
    const op = leg.operations
    if (!op) continue
    const effectiveDate = effectiveDateOf(leg.checkin_date, leg.departure_date || op.departure_date)
    if (!withinRange(effectiveDate, dateFrom, dateTo)) continue
    rawRows.push({
      source: "leg",
      operationId: op.id,
      fileCode: op.file_code ?? null,
      hotelName: leg.hotel_name ?? null,
      reservationCode: leg.reservation_code_hotel ?? null,
      checkinDate: leg.checkin_date ?? null,
      checkoutDate: leg.checkout_date ?? null,
      departureDate: leg.departure_date || op.departure_date || null,
      effectiveDate,
      customerName: customerName(op.operation_customers),
      sellerName: op.sellers?.name ?? null,
      status: op.status ?? null,
      // El monto vive a nivel operación; para tramos NO lo sumamos en el
      // resumen (ver montoUsd más abajo) para no doble-contar multidestino,
      // pero lo exponemos igual como referencia de la operación.
      saleAmount: Number(op.sale_amount_total ?? 0) || 0,
      saleCurrency: op.sale_currency || op.currency || "USD",
    })
  }

  // Conversión ARS→USD (referencial), mismo patrón que analytics/destinations.
  let getRate: (date: any) => number | null = () => null
  let fallbackRate = DEFAULT_USD_ARS_FALLBACK_RATE
  try {
    const arsDates = rawRows
      .filter((r) => r.saleCurrency === "ARS")
      .map((r) => r.effectiveDate)
    if (arsDates.length > 0) {
      getRate = await buildExchangeRateMap(supabase, arsDates)
      fallbackRate = (await getLatestExchangeRate(supabase)) || DEFAULT_USD_ARS_FALLBACK_RATE
    }
  } catch {
    // FX no disponible: montoUsd cae al monto crudo (no rompemos el listado).
  }

  const rows: HotelBookingRow[] = rawRows.map((r) => {
    let saleAmountUsd = r.saleAmount
    if (r.saleCurrency === "ARS") {
      const rate = getRate(r.effectiveDate) || fallbackRate
      saleAmountUsd = rate ? r.saleAmount / rate : r.saleAmount
    }
    return { ...r, saleAmountUsd }
  })

  // Orden: por fecha efectiva descendente (más recientes primero).
  rows.sort((a, b) => (b.effectiveDate ?? "").localeCompare(a.effectiveDate ?? ""))

  // Resumen por hotel. Cuenta TODAS las reservas (operación + tramo), pero el
  // monto suma solo la capa operación para no inflar en multidestino.
  const summaryMap = new Map<string, HotelSummaryRow>()
  for (const r of rows) {
    const key = (r.hotelName ?? "").trim() || "Sin nombre"
    let entry = summaryMap.get(key)
    if (!entry) {
      entry = { hotel: key, reservas: 0, montoUsd: 0 }
      summaryMap.set(key, entry)
    }
    entry.reservas += 1
    if (r.source === "operation") entry.montoUsd += r.saleAmountUsd
  }
  const summary = Array.from(summaryMap.values()).sort((a, b) => b.reservas - a.reservas)

  const truncated =
    opsData.length >= HOTEL_BOOKINGS_LIMIT || legsData.length >= HOTEL_BOOKINGS_LIMIT

  return { rows, summary, truncated }
}
