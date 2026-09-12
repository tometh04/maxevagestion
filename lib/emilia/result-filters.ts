import {
  deriveMealPlan,
  parseStars,
  type EmiliaFlight,
  type EurovipsHotel,
} from "@/lib/emilia/quotation-mapper"

export type FlightStopsFilter = "all" | "direct" | "one" | "up_to_one" | "two_plus" | `exact_${number}`
export interface FlightTimeRange { from?: string; to?: string }
export type MealPlanFilter =
  | "all"
  | "ALL_INCLUSIVE"
  | "DESAYUNO"
  | "MEDIA_PENSION"
  | "PENSION_COMPLETA"
  | "SOLO_ALOJAMIENTO"

export interface FlightFilters {
  maxPerStops?: Record<number, number | null>
  maxPrice?: number | null
  stops?: FlightStopsFilter
  airline?: string | null
  provider?: string | null
  currency?: string | null
  outboundDeparture?: FlightTimeRange
  outboundArrival?: FlightTimeRange
  inboundDeparture?: FlightTimeRange
  inboundArrival?: FlightTimeRange
  maxDurationMinutes?: number | null
  maxLayoverMinutes?: number | null
}

export interface HotelFilters {
  name?: string
  currency?: string | null
  freeCancellation?: boolean
  availableOnly?: boolean
  maxRoomTotal?: number | null
  category?: string | null
  mealPlan?: MealPlanFilter
  provider?: string | null
}

export interface FilterOption {
  value: string
  label: string
}

export interface NumberRange {
  min: number | null
  max: number | null
}

export interface FlightFilterOptions {
  maxDurationMinutes: FilterOption[]
  maxLayoverMinutes: FilterOption[]
  stopCounts: number[]
  currencies: FilterOption[]
  price: NumberRange
  airlines: FilterOption[]
  providers: FilterOption[]
  stops: FlightStopsFilter[]
}

export interface HotelFilterOptions {
  currencies: FilterOption[]
  roomTotal: NumberRange
  categories: FilterOption[]
  mealPlans: FilterOption[]
  providers: FilterOption[]
}

type HotelRoom = EurovipsHotel["rooms"][number]
type SelectedRooms = ReadonlyMap<string, string> | Record<string, string | null | undefined>

const MEAL_PLAN_LABELS: Record<Exclude<MealPlanFilter, "all">, string> = {
  ALL_INCLUSIVE: "All inclusive",
  DESAYUNO: "Desayuno",
  MEDIA_PENSION: "Media pensión",
  PENSION_COMPLETA: "Pensión completa",
  SOLO_ALOJAMIENTO: "Solo alojamiento",
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function uniqueOptions(values: Array<string | null | undefined>): FilterOption[] {
  return Array.from(new Set(values.map(cleanString).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((value) => ({ value, label: value }))
}

function numberRange(values: number[]): NumberRange {
  const valid = values.filter((value) => Number.isFinite(value))
  if (valid.length === 0) return { min: null, max: null }
  return {
    min: Math.min(...valid),
    max: Math.max(...valid),
  }
}

function getFlightProvider(flight: EmiliaFlight): string | null {
  return cleanString((flight as any).provider ?? (flight as any).wholesaler ?? (flight as any).mayorista)
}

function getFlightStops(flight: EmiliaFlight): number | null {
  const rawStops = (flight as any).stops
  const fallback = typeof rawStops === "number" && Number.isInteger(rawStops) && rawStops >= 0 ? rawStops : null

  const legs = Array.isArray(flight.legs) ? flight.legs : []
  if (legs.length === 0) return fallback

  let unknown = false
  const maximum = legs.reduce((maxStops, leg) => {
    if (typeof leg.stops === "number" && Number.isFinite(leg.stops)) {
      return Math.max(maxStops, leg.stops)
    }
    const layovers = Array.isArray(leg.layovers) ? leg.layovers.length : null
    if (layovers !== null) return Math.max(maxStops, layovers)

    const segments = (leg as any).options?.[0]?.segments
    if (Array.isArray(segments) && segments.length > 0) {
      return Math.max(maxStops, segments.length - 1)
    }

    unknown = true
    return maxStops
  }, 0)
  return unknown ? fallback : maximum
}

function matchesStopsFilter(stops: number | null, filter: FlightStopsFilter | undefined): boolean {
  if (!filter || filter === "all") return true
  if (stops === null) return false
  if (filter === "direct") return stops === 0
  if (filter === "one") return stops === 1
  if (filter === "up_to_one") return stops <= 1
  if (filter.startsWith("exact_")) return stops === Number(filter.slice(6))
  return stops >= 2
}

function timeMinutes(value: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value || "")
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function flightDurationMinutes(value: string | undefined): number | null {
  const match = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/i.exec((value || "").trim())
  if (!match || (!match[1] && !match[2])) return null
  return Number(match[1] || 0) * 60 + Number(match[2] || 0)
}

function matchesTime(value: string | undefined, range?: FlightTimeRange): boolean {
  if (!range?.from && !range?.to) return true
  const time = timeMinutes(value)
  const from = range.from ? timeMinutes(range.from) : 0
  const to = range.to ? timeMinutes(range.to) : 1439
  if (time === null || from === null || to === null) return false
  return from > to ? time >= from || time <= to : time >= from && time <= to
}

export function matchesFlight(flight: EmiliaFlight, filters: FlightFilters): boolean {
  if (filters.currency && flight.price?.currency !== filters.currency) return false
  const price = flight.price?.amount
  if (
    filters.maxPrice != null &&
    Number.isFinite(filters.maxPrice) &&
    (typeof price !== "number" || !Number.isFinite(price) || price > filters.maxPrice)
  ) {
    return false
  }

  if (!matchesStopsFilter(getFlightStops(flight), filters.stops)) {
    return false
  }

  if (filters.airline && flight.airline?.name !== filters.airline && flight.airline?.code !== filters.airline) {
    return false
  }

  if (filters.provider && getFlightProvider(flight) !== filters.provider) {
    return false
  }

  const legs = flight.legs || []
  const outbound = legs.find(leg => leg.flight_type === "outbound")
  const inbound = legs.find(leg => leg.flight_type === "inbound")
  if (!matchesTime(outbound?.departure?.time, filters.outboundDeparture)
    || !matchesTime(outbound?.arrival?.time, filters.outboundArrival)
    || !matchesTime(inbound?.departure?.time, filters.inboundDeparture)
    || !matchesTime(inbound?.arrival?.time, filters.inboundArrival)) return false

  if (filters.maxDurationMinutes != null && (legs.length === 0 || legs.some(leg => {
    const duration = flightDurationMinutes(leg.duration)
    return duration === null || duration > filters.maxDurationMinutes!
  }))) return false

  if (filters.maxLayoverMinutes != null && (legs.length === 0 || legs.some(leg => {
    const stops = leg.stops ?? leg.layovers?.length
    if (stops === 0) return false
    if (stops == null || !leg.layovers || leg.layovers.length < stops) return true
    return leg.layovers.some(layover => {
      const duration = flightDurationMinutes(layover.waiting_time)
      return duration === null || duration > filters.maxLayoverMinutes!
    })
  }))) return false

  return true
}

export function filterFlights(
  flights: EmiliaFlight[],
  filters: FlightFilters,
  selectedFlightIds?: string | readonly string[] | null
): EmiliaFlight[] {
  const selectedIds = new Set(typeof selectedFlightIds === "string" ? [selectedFlightIds] : selectedFlightIds ?? [])
  const counts = new Map<number, number>()
  const matching = flights.filter((flight) => {
    if (!matchesFlight(flight, filters)) return false
    const stops = getFlightStops(flight)
    if (stops === null) return true
    const limit = filters.maxPerStops?.[stops]
    const count = counts.get(stops) ?? 0
    if (limit != null && Number.isInteger(limit) && limit >= 0 && count >= limit) return false
    counts.set(stops, count + 1)
    return true
  })
  const matchingIds = new Set(matching.map(flight => flight.id))
  const selected = flights.filter(flight => selectedIds.has(flight.id) && !matchingIds.has(flight.id))
  return [...selected, ...matching]
}

function durationOptions(values: Array<string | undefined>): FilterOption[] {
  return Array.from(new Set(values.map(flightDurationMinutes).filter((value): value is number => value !== null)))
    .sort((a, b) => a - b)
    .map(minutes => ({ value: String(minutes), label: `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` }))
}

export function getFlightFilterOptions(flights: EmiliaFlight[]): FlightFilterOptions {
  return {
    maxDurationMinutes: durationOptions(flights.flatMap(flight => (flight.legs || []).map(leg => leg.duration))),
    maxLayoverMinutes: durationOptions(flights.flatMap(flight => (flight.legs || []).flatMap(leg => (leg.layovers || []).map(layover => layover.waiting_time)))),
    stopCounts: Array.from(new Set(flights.map(getFlightStops).filter((stops): stops is number => stops !== null)))
      .sort((a, b) => a - b),
    currencies: uniqueOptions(flights.map(flight => flight.price?.currency)),
    price: numberRange(flights.map((flight) => flight.price?.amount).filter((value): value is number => typeof value === "number")),
    airlines: uniqueOptions(flights.map((flight) => flight.airline?.name || flight.airline?.code)),
    providers: uniqueOptions(flights.map(getFlightProvider)),
    stops: Array.from(new Set(flights.map(getFlightStops).filter((stops): stops is number => stops !== null).map((stops): FlightStopsFilter => {
      if (stops === 0) return "direct"
      if (stops === 1) return "one"
      return "two_plus"
    }))),
  }
}

export function hasActiveFlightFilters(filters: FlightFilters): boolean {
  return Boolean(
    Object.values(filters.maxPerStops ?? {}).some(limit => limit != null && Number.isInteger(limit) && limit >= 0) ||
    filters.maxPrice != null ||
    (filters.stops && filters.stops !== "all") ||
    filters.airline ||
    filters.provider || filters.currency ||
    filters.maxDurationMinutes != null || filters.maxLayoverMinutes != null ||
    [filters.outboundDeparture, filters.outboundArrival, filters.inboundDeparture, filters.inboundArrival]
      .some(range => range?.from || range?.to)
  )
}

export function normalizeHotelCategory(category: string | null | undefined): string | null {
  const parsedStars = parseStars(category)
  if (parsedStars !== null) return String(parsedStars)

  const raw = cleanString(category)
  if (!raw) return null
  const upper = raw.toUpperCase()
  const halfMatch = upper.match(/^H?(\d)[_.](\d)$/)
  if (halfMatch) return `${halfMatch[1]}.${halfMatch[2]}`

  const match = upper.match(/(\d+(?:[.,]\d+)?)\s*(?:EST|LL|STAR|ESTRELLA|\*)?/)
  if (!match) return upper

  return match[1].replace(",", ".")
}

export function formatHotelCategoryLabel(category: string): string {
  const normalized = normalizeHotelCategory(category) ?? category
  return `${normalized} estrella${normalized === "1" ? "" : "s"}`
}

function getRoomMealPlan(room: HotelRoom): Exclude<MealPlanFilter, "all"> | null {
  return (deriveMealPlan(room.board_description) || deriveMealPlan(room.board) || deriveMealPlan(room.description)) as Exclude<MealPlanFilter, "all"> | null
}

function selectedRoomIdFor(selectedRooms: SelectedRooms | undefined, hotelId: string): string | null {
  if (!selectedRooms) return null
  if (selectedRooms instanceof Map) {
    return selectedRooms.get(hotelId) ?? null
  }
  return (selectedRooms as Record<string, string | null | undefined>)[hotelId] ?? null
}

function matchesHotelLevelFilters(hotel: EurovipsHotel, filters: HotelFilters): boolean {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim()
  if (filters.name?.trim() && !normalize(hotel.name).includes(normalize(filters.name))) return false
  if (filters.category && normalizeHotelCategory(hotel.category) !== filters.category) {
    return false
  }

  if (filters.provider && hotel.provider !== filters.provider) {
    return false
  }

  return true
}

export function matchesRoomFilters(room: HotelRoom, filters: HotelFilters): boolean {
  if (filters.currency && room.currency !== filters.currency) return false
  if (filters.freeCancellation && room.free_cancellation !== true) return false
  if (filters.availableOnly && (room.availability_status
    ? room.availability_status !== "available" : room.availability < 3 || !Number.isFinite(room.availability))) return false
  if (
    filters.maxRoomTotal != null &&
    Number.isFinite(filters.maxRoomTotal) &&
    (!Number.isFinite(room.total_price) || room.total_price > filters.maxRoomTotal)
  ) {
    return false
  }

  if (filters.mealPlan && filters.mealPlan !== "all" && getRoomMealPlan(room) !== filters.mealPlan) {
    return false
  }

  return true
}

function withSelectedRoom(rooms: HotelRoom[], hotel: EurovipsHotel, selectedRoomId: string | null): HotelRoom[] {
  if (!selectedRoomId || rooms.some((room) => room.occupancy_id === selectedRoomId)) {
    return rooms
  }

  const selectedRoom = hotel.rooms?.find((room) => room.occupancy_id === selectedRoomId)
  return selectedRoom ? [selectedRoom, ...rooms] : rooms
}

export function filterHotels(
  hotels: EurovipsHotel[],
  filters: HotelFilters,
  selectedRooms?: SelectedRooms
): EurovipsHotel[] {
  const selectedOutsideFilter: EurovipsHotel[] = []
  const visible: EurovipsHotel[] = []

  for (const hotel of hotels) {
    const selectedRoomId = selectedRoomIdFor(selectedRooms, hotel.id)
    const hotelMatches = matchesHotelLevelFilters(hotel, filters)
    const filteredRooms = hotelMatches
      ? (hotel.rooms || []).filter((room) => matchesRoomFilters(room, filters))
      : []
    const rooms = withSelectedRoom(filteredRooms, hotel, selectedRoomId)
    const nextHotel = { ...hotel, rooms: rooms.length > 0 ? rooms : hotel.rooms }
    const matches = hotelMatches && filteredRooms.length > 0

    if (matches) {
      visible.push(nextHotel)
    } else if (selectedRoomId) {
      selectedOutsideFilter.push(nextHotel)
    }
  }

  return [...selectedOutsideFilter, ...visible]
}

export function getHotelFilterOptions(hotels: EurovipsHotel[]): HotelFilterOptions {
  const rooms = hotels.flatMap((hotel) => hotel.rooms || [])
  const mealPlans = Array.from(new Set(rooms.map(getRoomMealPlan).filter(Boolean) as Exclude<MealPlanFilter, "all">[]))
    .sort((a, b) => MEAL_PLAN_LABELS[a].localeCompare(MEAL_PLAN_LABELS[b], "es"))
    .map((value) => ({ value, label: MEAL_PLAN_LABELS[value] }))

  const categoryValues = Array.from(new Set(hotels.map((hotel) => normalizeHotelCategory(hotel.category)).filter(Boolean) as string[]))
    .sort((a, b) => Number(a) - Number(b))
    .map((value) => ({ value, label: formatHotelCategoryLabel(value) }))

  return {
    currencies: uniqueOptions(rooms.map(room => room.currency)),
    roomTotal: numberRange(rooms.map((room) => room.total_price).filter((value): value is number => typeof value === "number")),
    categories: categoryValues,
    mealPlans,
    providers: uniqueOptions(hotels.map((hotel) => hotel.provider)),
  }
}

export function hasActiveHotelFilters(filters: HotelFilters): boolean {
  return Boolean(
    filters.name?.trim() || filters.currency || filters.freeCancellation || filters.availableOnly ||
    filters.maxRoomTotal != null ||
    filters.category ||
    (filters.mealPlan && filters.mealPlan !== "all") ||
    filters.provider
  )
}
