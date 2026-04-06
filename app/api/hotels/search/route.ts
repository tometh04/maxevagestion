import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { searchHotels, searchHotelsByDestination, type HotelEntry } from "@/lib/hotels/data"
import { searchGeoapifyHotels } from "@/lib/hotels/geoapify"

export const dynamic = "force-dynamic"

function normalizeHotelKey(hotel: Pick<HotelEntry, "name" | "city" | "country">) {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()

  return `${normalize(hotel.name)}::${normalize(hotel.city)}::${normalize(hotel.country)}`
}

function mergeHotelResults(localResults: HotelEntry[], externalResults: HotelEntry[], limit: number) {
  const uniqueHotels = new Map<string, HotelEntry>()

  for (const hotel of [...localResults, ...externalResults]) {
    uniqueHotels.set(normalizeHotelKey(hotel), hotel)
  }

  return Array.from(uniqueHotels.values()).slice(0, limit)
}

// GET — Buscar hoteles por nombre/destino (base local + fallback externo)
export async function GET(request: Request) {
  try {
    await getCurrentUser()
    const { searchParams } = new URL(request.url)
    const q = (searchParams.get("q") || "").trim()
    const destination = (searchParams.get("destination") || "").trim()
    const limit = parseInt(searchParams.get("limit") || "20")

    const localResults = q.length >= 2
      ? searchHotels(q, destination, limit)
      : destination
        ? searchHotelsByDestination(destination, limit)
        : []

    const externalResults =
      destination && localResults.length === 0
        ? await searchGeoapifyHotels(destination, q, limit)
        : []

    const results = mergeHotelResults(localResults, externalResults, limit)

    return NextResponse.json(
      results.map(h => ({
        name: h.name,
        stars: h.stars,
        city: h.city,
        country: h.country,
        zone: h.zone || null,
        address: h.address || null,
        photo_url: h.photo_url || null,
        google_rating: h.google_rating || null,
      }))
    )
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in hotel search:", error)
    return NextResponse.json([])
  }
}
