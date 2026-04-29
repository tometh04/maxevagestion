/**
 * HOTEL ENRICHMENT SCRIPT
 *
 * Uses Google Places API (New) to enrich hotel data with:
 * - Star rating (from Google rating → mapped to 1-5 stars)
 * - Address
 * - Photo URL (public lh3.googleusercontent.com — no API key needed to display)
 *
 * Usage:
 *   npx tsx scripts/enrich-hotels.ts
 *
 * Features:
 * - Saves progress to scripts/hotels-enriched.json after each batch
 * - Can resume from where it left off if interrupted
 * - Rate limited to ~5 requests/second to avoid API limits
 * - Two API calls per hotel: 1) Text Search, 2) Photo media URL
 */

import * as fs from "fs"
import * as path from "path"

const GOOGLE_API_KEY = "AIzaSyBa5iZ3ZfhTrj5nCnwuDOAd2WMhqjAo4tM"
const PROGRESS_FILE = path.join(__dirname, "hotels-enriched.json")
const OUTPUT_FILE = path.join(__dirname, "..", "lib", "hotels", "data.ts")

// Rate limiting
const DELAY_MS = 250 // 4 requests per second
const BATCH_SIZE = 50 // Save progress every 50 hotels

interface HotelEntry {
  name: string
  stars: number
  city: string
  country: string
  zone?: string
}

interface EnrichedHotel extends HotelEntry {
  address?: string
  photo_url?: string
  google_rating?: number
  google_place_id?: string
  enriched: boolean
}

// ─── Google Places API (New) ────────────────────────────────────────

async function searchPlace(hotelName: string, city: string, country: string): Promise<{
  place_id?: string
  rating?: number
  address?: string
  photo_name?: string // e.g. "places/ChIJ.../photos/AU_ZVE..."
} | null> {
  const textQuery = `${hotelName} hotel ${city} ${country}`

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": "places.id,places.rating,places.formattedAddress,places.photos",
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "es",
        maxResultCount: 1,
      }),
    })

    const data = await res.json()

    if (!data.places || data.places.length === 0) {
      return null
    }

    const place = data.places[0]
    return {
      place_id: place.id,
      rating: place.rating,
      address: place.formattedAddress,
      photo_name: place.photos?.[0]?.name, // "places/PLACE_ID/photos/PHOTO_REF"
    }
  } catch (error) {
    console.error(`  ✗ API error for "${hotelName}":`, (error as Error).message)
    return null
  }
}

/**
 * Get public photo URL from Google Places photo name.
 * Returns a lh3.googleusercontent.com URL that works without API key.
 */
async function getPublicPhotoUrl(photoName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
      {
        headers: {
          "X-Goog-Api-Key": GOOGLE_API_KEY,
        },
      }
    )
    const data = await res.json()
    return data.photoUri || null
  } catch {
    return null
  }
}

/**
 * Convert Google rating (1-5 float) to hotel star category (1-5 integer)
 * Google ratings are user reviews, so we map:
 * < 2.5 → 2 stars
 * 2.5-3.4 → 3 stars
 * 3.5-4.2 → 4 stars
 * 4.3+ → 5 stars
 */
function ratingToStars(rating: number | undefined): number {
  if (!rating) return 0
  if (rating >= 4.3) return 5
  if (rating >= 3.5) return 4
  if (rating >= 2.5) return 3
  return 2
}

// ─── Progress Management ────────────────────────────────────────────

function loadProgress(): Map<string, EnrichedHotel> {
  if (fs.existsSync(PROGRESS_FILE)) {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"))
    console.log(`📂 Loaded progress: ${data.length} hotels already enriched`)
    return new Map(data.map((h: EnrichedHotel) => [`${h.name}||${h.city}||${h.country}`, h]))
  }
  return new Map()
}

function saveProgress(hotels: EnrichedHotel[]) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(hotels, null, 2), "utf-8")
}

// ─── Load Current Hotels ────────────────────────────────────────────

function loadCurrentHotels(): HotelEntry[] {
  const content = fs.readFileSync(OUTPUT_FILE, "utf-8")

  const match = content.match(/export const HOTELS: HotelEntry\[\] = \[([\s\S]*?)\n\]/m)
  if (!match) {
    throw new Error("Could not parse HOTELS array from data.ts")
  }

  const entries: HotelEntry[] = []
  const lines = match[1].split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("{")) continue

    try {
      const nameMatch = trimmed.match(/name:\s*"([^"]*)"/)
      const starsMatch = trimmed.match(/stars:\s*(\d+)/)
      const cityMatch = trimmed.match(/city:\s*"([^"]*)"/)
      const countryMatch = trimmed.match(/country:\s*"([^"]*)"/)
      const zoneMatch = trimmed.match(/zone:\s*"([^"]*)"/)

      if (nameMatch && cityMatch && countryMatch) {
        entries.push({
          name: nameMatch[1],
          stars: parseInt(starsMatch?.[1] || "0"),
          city: cityMatch[1],
          country: countryMatch[1],
          zone: zoneMatch?.[1],
        })
      }
    } catch {
      // Skip unparseable lines
    }
  }

  return entries
}

// ─── Generate Updated data.ts ───────────────────────────────────────

function generateDataFile(hotels: EnrichedHotel[]) {
  const hotelLines = hotels.map(h => {
    const parts = [
      `name: ${JSON.stringify(h.name)}`,
      `stars: ${h.stars}`,
      `city: ${JSON.stringify(h.city)}`,
      `country: ${JSON.stringify(h.country)}`,
    ]
    if (h.zone) parts.push(`zone: ${JSON.stringify(h.zone)}`)
    if (h.address) parts.push(`address: ${JSON.stringify(h.address)}`)
    if (h.photo_url) parts.push(`photo_url: ${JSON.stringify(h.photo_url)}`)
    if (h.google_rating) parts.push(`google_rating: ${h.google_rating}`)

    return `  { ${parts.join(", ")} },`
  })

  const content = `/**
 * Dataset de hoteles — scraped from lozadaviajes.com, enriched via Google Places API
 * ${hotels.length} hoteles unicos across ${new Set(hotels.map(h => h.city)).size} ciudades.
 * Mismo patron que lib/airports/data.ts — busqueda local e instantanea.
 * Generated: 2026-03-30 | Enriched: ${new Date().toISOString().split("T")[0]}
 */

export interface HotelEntry {
  name: string
  stars: number
  city: string
  country: string
  zone?: string
  address?: string
  photo_url?: string
  google_rating?: number
}

export const HOTELS: HotelEntry[] = [
${hotelLines.join("\n")}
]

/**
 * Search hotels by query string — local, instantanea (no API calls)
 * Prioriza hoteles en el destino seleccionado.
 */
export function searchHotels(query: string, destination?: string, limit = 20): HotelEntry[] {
  if (!query || query.length < 2) return []

  const q = normalize(query)
  const destNorm = destination ? normalize(destination) : ""

  const scored = HOTELS.map(h => {
    let score = 0

    const nameNorm = normalize(h.name)
    const cityNorm = normalize(h.city)
    const countryNorm = normalize(h.country)
    const zoneNorm = h.zone ? normalize(h.zone) : ""

    // Match por nombre del hotel
    if (nameNorm.includes(q)) score += 500
    if (nameNorm.startsWith(q)) score += 200

    // Match por ciudad
    if (cityNorm.includes(q)) score += 300
    if (countryNorm.includes(q)) score += 100
    if (zoneNorm.includes(q)) score += 150

    // Bonus si el hotel esta en el destino seleccionado
    if (destNorm && (cityNorm.includes(destNorm) || destNorm.includes(cityNorm))) {
      score += 1000
    }

    // Bonus por estrellas (mejores primero)
    score += h.stars * 2

    return { hotel: h, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.hotel)
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .trim()
}
`

  fs.writeFileSync(OUTPUT_FILE, content, "utf-8")
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("🏨 Hotel Enrichment Script (Google Places API New)")
  console.log("=".repeat(60))

  // 1. Load current hotels
  const hotels = loadCurrentHotels()
  console.log(`📊 Found ${hotels.length} hotels in data.ts`)

  // 2. Load any previous progress
  const progress = loadProgress()
  const alreadyDone = progress.size
  console.log(`✅ Already enriched: ${alreadyDone}/${hotels.length}`)
  console.log(`⏱️  Estimated time: ~${Math.ceil((hotels.length - alreadyDone) * 0.5 / 60)} minutes\n`)

  // 3. Process hotels
  const enriched: EnrichedHotel[] = []
  let apiCalls = 0
  let found = 0
  let notFound = 0

  for (let i = 0; i < hotels.length; i++) {
    const hotel = hotels[i]
    const key = `${hotel.name}||${hotel.city}||${hotel.country}`

    // Skip if already processed
    if (progress.has(key)) {
      enriched.push(progress.get(key)!)
      continue
    }

    // Search Google Places
    const prefix = `[${i + 1}/${hotels.length}]`
    process.stdout.write(`${prefix} ${hotel.name} (${hotel.city})... `)

    const result = await searchPlace(hotel.name, hotel.city, hotel.country)
    apiCalls++

    if (result) {
      const stars = ratingToStars(result.rating)

      // Get public photo URL if photo available
      let photoUrl: string | undefined
      if (result.photo_name) {
        photoUrl = (await getPublicPhotoUrl(result.photo_name)) || undefined
        apiCalls++ // counts as second API call
        await new Promise(resolve => setTimeout(resolve, DELAY_MS))
      }

      const enrichedHotel: EnrichedHotel = {
        ...hotel,
        stars: stars || hotel.stars,
        address: result.address,
        photo_url: photoUrl,
        google_rating: result.rating,
        google_place_id: result.place_id,
        enriched: true,
      }

      enriched.push(enrichedHotel)
      found++
      console.log(`✓ ${stars}★ | ${result.rating || "N/A"} | ${photoUrl ? "📸" : "no photo"}`)
    } else {
      enriched.push({ ...hotel, enriched: false })
      notFound++
      console.log("✗ not found")
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, DELAY_MS))

    // Save progress periodically
    if (apiCalls % BATCH_SIZE === 0) {
      saveProgress(enriched)
      const pct = Math.round((i + 1) / hotels.length * 100)
      console.log(`\n💾 Progress saved (${pct}% done, ${found} found, ${notFound} not found)\n`)
    }
  }

  // 4. Final save
  saveProgress(enriched)
  console.log("\n" + "=".repeat(60))
  console.log(`📊 Results:`)
  console.log(`   Total: ${hotels.length}`)
  console.log(`   Found: ${found} (${found + notFound > 0 ? Math.round(found / (found + notFound) * 100) : 0}%)`)
  console.log(`   Not found: ${notFound}`)
  console.log(`   API calls: ${apiCalls}`)
  console.log(`   Previously cached: ${alreadyDone}`)

  // 5. Generate updated data.ts
  console.log(`\n📝 Generating updated data.ts...`)
  generateDataFile(enriched)
  console.log(`✅ Done! Updated ${OUTPUT_FILE}`)

  // Stats
  const withStars = enriched.filter(h => h.stars > 0).length
  const withAddress = enriched.filter(h => h.address).length
  const withPhotos = enriched.filter(h => h.photo_url).length
  console.log(`\n📈 Enrichment stats:`)
  console.log(`   With stars: ${withStars}/${hotels.length} (${Math.round(withStars / hotels.length * 100)}%)`)
  console.log(`   With address: ${withAddress}/${hotels.length} (${Math.round(withAddress / hotels.length * 100)}%)`)
  console.log(`   With photos: ${withPhotos}/${hotels.length} (${Math.round(withPhotos / hotels.length * 100)}%)`)
}

main().catch(console.error)
