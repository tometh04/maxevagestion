import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { searchHotels } from "@/lib/hotels/data"

export const dynamic = "force-dynamic"

// GET — Buscar hoteles por nombre/destino (base local, sin API externa)
export async function GET(request: Request) {
  try {
    await getCurrentUser()
    const { searchParams } = new URL(request.url)
    const q = searchParams.get("q") || ""
    const destination = searchParams.get("destination") || ""
    const limit = parseInt(searchParams.get("limit") || "20")

    const results = searchHotels(q, destination, limit)

    return NextResponse.json(
      results.map(h => ({
        name: h.name,
        stars: h.stars,
        city: h.city,
        country: h.country,
        zone: h.zone || null,
      }))
    )
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in hotel search:", error)
    return NextResponse.json([])
  }
}
