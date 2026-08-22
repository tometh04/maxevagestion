import type { EmiliaDefaultOrigin } from "@/lib/emilia/origin-context"

const REVERSE_GEOCODER_URL = "https://nominatim.openstreetmap.org/reverse"

let cachedOrigin: EmiliaDefaultOrigin | null | undefined
let pendingOrigin: Promise<EmiliaDefaultOrigin | null> | null = null

async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<EmiliaDefaultOrigin | null> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    "accept-language": "es",
  })

  try {
    const response = await fetch(`${REVERSE_GEOCODER_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    })
    if (!response.ok) return null

    const data = (await response.json()) as {
      address?: {
        city?: string
        town?: string
        village?: string
        municipality?: string
        country?: string
      }
    }
    const city = (
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.municipality ||
      ""
    ).replace(/\s+/g, " ").trim().slice(0, 100)
    const country = (data.address?.country || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100)

    return city
      ? { city, country: country || undefined }
      : null
  } catch {
    return null
  }
}

/**
 * Solicita ubicación una sola vez por sesión y conserva únicamente ciudad/país.
 * Rechazo, timeout o reverse-geocoding fallido devuelven null.
 */
export async function detectBrowserOriginCity(): Promise<EmiliaDefaultOrigin | null> {
  if (cachedOrigin !== undefined) return cachedOrigin
  if (pendingOrigin) return pendingOrigin

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    cachedOrigin = null
    return null
  }

  pendingOrigin = (async () => {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          maximumAge: 15 * 60 * 1000,
          timeout: 10_000,
        })
      })
      cachedOrigin = await reverseGeocode(
        position.coords.latitude,
        position.coords.longitude
      )
      return cachedOrigin
    } catch {
      cachedOrigin = null
      return null
    } finally {
      pendingOrigin = null
    }
  })()

  return pendingOrigin
}
