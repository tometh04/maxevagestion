import { NextResponse } from "next/server"
import { searchAirports } from "@/lib/airports/amadeus"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()

  if (q.length < 2) {
    return NextResponse.json([])
  }

  try {
    const results = await searchAirports(q)
    return NextResponse.json(results)
  } catch (error) {
    console.error("Airport search error:", error)
    // Return empty array so UX doesn't break if Amadeus is unavailable
    return NextResponse.json([])
  }
}
