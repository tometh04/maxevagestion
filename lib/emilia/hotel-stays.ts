import { z } from "zod"

export const hotelSearchContextSchema = z.object({
  stay_id: z.string().min(1),
  destination_option_id: z.string().min(1),
  required_stay_ids: z.array(z.string().min(1)).min(1).max(6),
  combined_budget: z.object({ amount: z.number().finite().positive(), currency: z.string().regex(/^[A-Z]{3}$/) }).optional(),
})

export type HotelSearchContext = z.infer<typeof hotelSearchContextSchema>

const hotelSegmentSchema = z.object({
  stay_id: z.string(), destination_option_id: z.string(), city: z.string().nullable().optional(),
  check_in: z.string().nullable().optional(), check_out: z.string().nullable().optional(),
  status: z.enum(["available", "empty", "failed"]), count: z.number().optional(),
})

export function parseHotelSegments(metadata: unknown) {
  const parsed = z.object({ hotel_segments: z.array(hotelSegmentSchema).max(12) }).safeParse(metadata)
  return parsed.success ? parsed.data.hotel_segments : []
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Resolve only the stay and alternative identified by the public offer. */
export function hotelQueryForOffer(query: Record<string, unknown>, context?: HotelSearchContext): Record<string, unknown> {
  if (!context) return query
  const stays = Array.isArray(query.segments) ? query.segments.map(record) : []
  const stay = stays.find((value, index) => (value.id || `stay-${index + 1}`) === context.stay_id)
  if (!stay) return {}
  const options = Array.isArray(stay.destinationOptions) ? stay.destinationOptions.map(record) : []
  const option = options.find((value, index) => (value.id || `destination-${index + 1}`) === context.destination_option_id)
  if (options.length && !option) return {}
  const location = record(option?.location)
  const common = Object.fromEntries(["adults", "children", "infants", "childrenAges", ...(stays.length === 1 ? ["checkinDate", "checkoutDate"] : [])]
    .filter(key => query[key] !== undefined && query[key] !== null).map(key => [key, query[key]]))
  const { destinationOptions: _stayOptions, ...stayFields } = stay
  return {
    ...common, ...stayFields, ...option,
    city: location.name || stay.city,
    countryCode: location.countryCode || stay.countryCode,
    region: location.region || stay.region,
    stayId: context.stay_id, destinationOptionId: context.destination_option_id,
  }
}

export function selectHotelForStay(
  selected: Map<string, string>,
  hotel: { id: string; search_context?: HotelSearchContext },
  roomId: string,
  hotels: Array<{ id: string; search_context?: HotelSearchContext }>,
) {
  const next = new Map(selected)
  const stayId = hotel.search_context?.stay_id
  if (stayId) {
    for (const other of hotels) {
      if (other.search_context?.stay_id === stayId) next.delete(other.id)
    }
  }
  if (next.size >= (stayId ? 6 : 4)) throw new Error("Alcanzaste el límite de hoteles seleccionados.")
  next.set(hotel.id, roomId)
  return next
}
