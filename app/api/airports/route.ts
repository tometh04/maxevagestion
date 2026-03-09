import { NextResponse } from "next/server"
import { searchLocalAirports } from "@/lib/airports/data"
import { searchAirports as searchAmadeus } from "@/lib/airports/amadeus"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()

  if (q.length < 2) {
    return NextResponse.json([])
  }

  // 1. Búsqueda local inmediata (siempre disponible, sin API key)
  const localResults = searchLocalAirports(q, 10)

  // 2. Si hay credenciales de Amadeus, complementar con resultados externos
  const hasAmadeus =
    !!process.env.AMADEUS_CLIENT_ID && !!process.env.AMADEUS_CLIENT_SECRET

  if (hasAmadeus) {
    try {
      const amadeusResults = await searchAmadeus(q)
      // Merge: locales primero, luego Amadeus sin duplicar por código IATA
      const localCodes = new Set(localResults.map((a) => a.code))
      const extra = amadeusResults.filter((a) => !localCodes.has(a.code))
      return NextResponse.json([...localResults, ...extra].slice(0, 15))
    } catch {
      // Si Amadeus falla, seguimos con los locales
    }
  }

  return NextResponse.json(localResults)
}
