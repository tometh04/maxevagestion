import type { HotelEntry } from "@/lib/hotels/data"

interface GeoapifyGeocodeResponse {
  results?: Array<{
    lat?: number
    lon?: number
  }>
}

interface GeoapifyPlacesResponse {
  features?: Array<{
    properties?: {
      name?: string
      city?: string
      state?: string
      country?: string
      formatted?: string
      address_line1?: string
      address_line2?: string
    }
  }>
}

const geocodeCache = new Map<string, { lat: number; lon: number } | null>()
const hotelsCache = new Map<string, HotelEntry[]>()

function normalizeCacheKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function buildSearchKey(destination: string, query: string, limit: number) {
  return `${normalizeCacheKey(destination)}::${normalizeCacheKey(query)}::${limit}`
}

function buildHotelKey(hotel: Pick<HotelEntry, "name" | "city" | "country">) {
  return `${normalizeCacheKey(hotel.name)}::${normalizeCacheKey(hotel.city)}::${normalizeCacheKey(hotel.country)}`
}

function matchesNormalizedValue(candidate: string, target: string) {
  if (!candidate || !target) return false
  return candidate.includes(target) || target.includes(candidate)
}

function geoapifyHotelMatchesDestination(hotel: HotelEntry, destination: string) {
  const destinationNorm = normalizeCacheKey(destination)
  if (!destinationNorm) return false

  return (
    matchesNormalizedValue(normalizeCacheKey(hotel.city || ""), destinationNorm) ||
    matchesNormalizedValue(normalizeCacheKey(hotel.country || ""), destinationNorm) ||
    matchesNormalizedValue(normalizeCacheKey(hotel.address || ""), destinationNorm)
  )
}

async function resolveDestinationCoordinates(destination: string, apiKey: string) {
  const cacheKey = normalizeCacheKey(destination)
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null
  }

  const params = new URLSearchParams({
    text: destination,
    format: "json",
    lang: "es",
    limit: "1",
    apiKey,
  })

  const response = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    geocodeCache.set(cacheKey, null)
    return null
  }

  const data = (await response.json()) as GeoapifyGeocodeResponse
  const firstResult = data.results?.[0]

  if (typeof firstResult?.lat !== "number" || typeof firstResult?.lon !== "number") {
    geocodeCache.set(cacheKey, null)
    return null
  }

  const coordinates = { lat: firstResult.lat, lon: firstResult.lon }
  geocodeCache.set(cacheKey, coordinates)
  return coordinates
}

export async function searchGeoapifyHotels(
  destination: string,
  query: string,
  limit = 20
): Promise<HotelEntry[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY
  if (!apiKey || !destination.trim()) {
    return []
  }

  const cacheKey = buildSearchKey(destination, query, limit)
  const cached = hotelsCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const coordinates = await resolveDestinationCoordinates(destination, apiKey)
  if (!coordinates) {
    hotelsCache.set(cacheKey, [])
    return []
  }

  const params = new URLSearchParams({
    categories: "accommodation.hotel",
    filter: `circle:${coordinates.lon},${coordinates.lat},25000`,
    bias: `proximity:${coordinates.lon},${coordinates.lat}`,
    lang: "es",
    limit: String(limit),
    apiKey,
  })

  if (query.trim()) {
    params.set("name", query.trim())
  }

  const response = await fetch(`https://api.geoapify.com/v2/places?${params.toString()}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    hotelsCache.set(cacheKey, [])
    return []
  }

  const data = (await response.json()) as GeoapifyPlacesResponse
  const uniqueHotels = new Map<string, HotelEntry>()

  for (const feature of data.features || []) {
    const properties = feature.properties
    const name = properties?.name?.trim()

    if (!name) {
      continue
    }

    const city = properties?.city || properties?.state || destination
    const country = properties?.country || ""
    const address =
      properties?.formatted ||
      [properties?.address_line1, properties?.address_line2].filter(Boolean).join(", ") ||
      undefined

    const hotel: HotelEntry = {
      name,
      stars: 0,
      city,
      country,
      address,
    }

    uniqueHotels.set(buildHotelKey(hotel), hotel)
  }

  const hotels = Array.from(uniqueHotels.values())
  const destinationMatches = hotels.filter(hotel => geoapifyHotelMatchesDestination(hotel, destination))
  const finalHotels = destinationMatches.length > 0 ? destinationMatches : hotels
  hotelsCache.set(cacheKey, finalHotels)
  return finalHotels
}
