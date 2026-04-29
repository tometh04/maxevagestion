/**
 * Destination normalization and fuzzy matching utilities
 */

/**
 * Remove accents/diacritics from a string
 */
function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Normalize a destination name for comparison/searching
 * "PUNTA CANA" → "puntacana"
 * "Pnta Cana" → "pntacana"
 */
export function normalizeDestinationName(name: string): string {
  return removeAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // Remove non-alphanumeric
}

/**
 * Convert a destination name to Title Case
 * "punta cana" → "Punta Cana"
 * "PUNTA CANA" → "Punta Cana"
 */
export function toTitleCase(name: string): string {
  const words = name.trim().replace(/\s+/g, " ").split(" ")
  return words
    .map((word, index) => {
      if (word.length === 0) return ""
      const lower = word.toLowerCase()
      // Keep prepositions lowercase unless first word
      if (index > 0 && ["de", "del", "la", "las", "los", "el", "y", "e", "do", "da"].includes(lower)) {
        return lower
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Find the best matching destination from a list
 * Returns the match if Levenshtein distance ≤ threshold
 */
export function findBestMatch(
  normalizedName: string,
  existingDestinations: { id: string; name: string; name_normalized: string }[],
  threshold: number = 2
): { id: string; name: string } | null {
  let bestMatch: { id: string; name: string } | null = null
  let bestDistance = Infinity

  for (const dest of existingDestinations) {
    if (dest.name_normalized === normalizedName) {
      return { id: dest.id, name: dest.name }
    }

    const distance = levenshteinDistance(normalizedName, dest.name_normalized)
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance
      bestMatch = { id: dest.id, name: dest.name }
    }
  }

  return bestMatch
}

/**
 * Find or create a destination in the database
 * Normalizes the name, searches for fuzzy match, creates if not found
 */
export async function findOrCreateDestination(
  rawName: string,
  supabase: any
): Promise<{ id: string; name: string } | null> {
  const trimmed = rawName.trim()
  if (!trimmed || trimmed === "Sin destino") {
    return null
  }

  const normalized = normalizeDestinationName(trimmed)
  const titleCased = toTitleCase(trimmed)

  // Get all existing destinations
  const { data: existing } = await supabase
    .from("destinations")
    .select("id, name, name_normalized")
    .eq("is_active", true)

  if (existing && existing.length > 0) {
    const match = findBestMatch(normalized, existing)
    if (match) return match
  }

  // No match found — create new destination
  const { data: newDest, error } = await supabase
    .from("destinations")
    .insert({
      name: titleCased,
      name_normalized: normalized,
    })
    .select("id, name")
    .single()

  if (error) {
    // Unique constraint violation — try to find it again
    const { data: retry } = await supabase
      .from("destinations")
      .select("id, name")
      .eq("name_normalized", normalized)
      .single()
    if (retry) return retry
    console.error("Error creating destination:", error)
    return null
  }

  return newDest
}
