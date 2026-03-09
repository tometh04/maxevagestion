/**
 * Amadeus API integration for airport/city search.
 * Uses OAuth2 client_credentials flow with in-memory token cache.
 * NEVER expose this module to the browser — server-side only.
 */

export interface AirportResult {
  code: string
  name: string
  city: string
  country: string
}

// In-memory token cache (per server instance)
let cachedToken: string | null = null
let tokenExpiry = 0

async function getAmadeusToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }

  const clientId = process.env.AMADEUS_CLIENT_ID
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("AMADEUS_CLIENT_ID y AMADEUS_CLIENT_SECRET no configurados")
  }

  const response = await fetch(
    "https://test.api.amadeus.com/v1/security/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Amadeus token error: ${err}`)
  }

  const data = await response.json()
  cachedToken = data.access_token
  // Expire 60s before actual expiry to avoid edge cases
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

export async function searchAirports(query: string): Promise<AirportResult[]> {
  if (!query || query.length < 2) return []

  const token = await getAmadeusToken()

  const url = new URL("https://test.api.amadeus.com/v1/reference-data/locations")
  url.searchParams.set("keyword", query)
  url.searchParams.set("subType", "AIRPORT,CITY")
  url.searchParams.set("page[limit]", "10")

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error(`Amadeus search error: ${response.status}`)
  }

  const data = await response.json()

  return (data.data || []).map((item: any) => ({
    code: item.iataCode ?? "",
    name: item.name ?? "",
    city: item.address?.cityName ?? item.name ?? "",
    country: item.address?.countryName ?? "",
  }))
}
