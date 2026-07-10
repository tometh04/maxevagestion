import {
  deriveMealPlan,
  parseStars,
  type EmiliaFlight,
  type EurovipsHotel,
} from "@/lib/emilia/quotation-mapper"

export type FlightStopsFilter = "all" | "direct" | "one" | "two_plus"
export type MealPlanFilter =
  | "all"
  | "ALL_INCLUSIVE"
  | "DESAYUNO"
  | "MEDIA_PENSION"
  | "PENSION_COMPLETA"
  | "SOLO_ALOJAMIENTO"

export interface FlightFilters {
  maxPrice?: number | null
  stops?: FlightStopsFilter
  airline?: string | null
  provider?: string | null
}

export interface HotelFilters {
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
  price: NumberRange
  airlines: FilterOption[]
  providers: FilterOption[]
  stops: FlightStopsFilter[]
}

export interface HotelFilterOptions {
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

function getFlightStops(flight: EmiliaFlight): number {
  const rawStops = (flight as any).stops
  if (typeof rawStops === "number" && Number.isFinite(rawStops)) {
    return Math.max(0, rawStops)
  }

  const legs = Array.isArray(flight.legs) ? flight.legs : []
  if (legs.length === 0) return 0

  return legs.reduce((maxStops, leg) => {
    const layovers = Array.isArray(leg.layovers) ? leg.layovers.length : null
    if (layovers !== null) return Math.max(maxStops, layovers)

    const segments = (leg as any).options?.[0]?.segments
    if (Array.isArray(segments) && segments.length > 0) {
      return Math.max(maxStops, segments.length - 1)
    }

    return maxStops
  }, 0)
}

function matchesStopsFilter(stops: number, filter: FlightStopsFilter | undefined): boolean {
  if (!filter || filter === "all") return true
  if (filter === "direct") return stops === 0
  if (filter === "one") return stops === 1
  return stops >= 2
}

function matchesFlight(flight: EmiliaFlight, filters: FlightFilters): boolean {
  const price = flight.price?.amount
  if (
    filters.maxPrice != null &&
    Number.isFinite(filters.maxPrice) &&
    typeof price === "number" &&
    price > filters.maxPrice
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

  return true
}

export function filterFlights(
  flights: EmiliaFlight[],
  filters: FlightFilters,
  selectedFlightId?: string | null
): EmiliaFlight[] {
  const matching = flights.filter((flight) => matchesFlight(flight, filters))
  if (!selectedFlightId || matching.some((flight) => flight.id === selectedFlightId)) {
    return matching
  }

  const selected = flights.find((flight) => flight.id === selectedFlightId)
  return selected ? [selected, ...matching] : matching
}

export function getFlightFilterOptions(flights: EmiliaFlight[]): FlightFilterOptions {
  return {
    price: numberRange(flights.map((flight) => flight.price?.amount).filter((value): value is number => typeof value === "number")),
    airlines: uniqueOptions(flights.map((flight) => flight.airline?.name || flight.airline?.code)),
    providers: uniqueOptions(flights.map(getFlightProvider)),
    stops: Array.from(new Set(flights.map(getFlightStops).map((stops): FlightStopsFilter => {
      if (stops === 0) return "direct"
      if (stops === 1) return "one"
      return "two_plus"
    }))),
  }
}

export function hasActiveFlightFilters(filters: FlightFilters): boolean {
  return Boolean(
    filters.maxPrice != null ||
    (filters.stops && filters.stops !== "all") ||
    filters.airline ||
    filters.provider
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
  return deriveMealPlan(room.description) as Exclude<MealPlanFilter, "all"> | null
}

function selectedRoomIdFor(selectedRooms: SelectedRooms | undefined, hotelId: string): string | null {
  if (!selectedRooms) return null
  if (selectedRooms instanceof Map) {
    return selectedRooms.get(hotelId) ?? null
  }
  return (selectedRooms as Record<string, string | null | undefined>)[hotelId] ?? null
}

function matchesHotelLevelFilters(hotel: EurovipsHotel, filters: HotelFilters): boolean {
  if (filters.category && normalizeHotelCategory(hotel.category) !== filters.category) {
    return false
  }

  if (filters.provider && hotel.provider !== filters.provider) {
    return false
  }

  return true
}

function matchesRoomFilters(room: HotelRoom, filters: HotelFilters): boolean {
  if (
    filters.maxRoomTotal != null &&
    Number.isFinite(filters.maxRoomTotal) &&
    typeof room.total_price === "number" &&
    room.total_price > filters.maxRoomTotal
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
    roomTotal: numberRange(rooms.map((room) => room.total_price).filter((value): value is number => typeof value === "number")),
    categories: categoryValues,
    mealPlans,
    providers: uniqueOptions(hotels.map((hotel) => hotel.provider)),
  }
}

export function hasActiveHotelFilters(filters: HotelFilters): boolean {
  return Boolean(
    filters.maxRoomTotal != null ||
    filters.category ||
    (filters.mealPlan && filters.mealPlan !== "all") ||
    filters.provider
  )
}
