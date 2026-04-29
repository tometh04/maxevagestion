/**
 * Migration script: Populate destinations table from existing operations
 *
 * Run with: npx tsx scripts/migrate-destinations.ts
 *
 * What it does:
 * 1. Reads all DISTINCT destinations from operations
 * 2. Normalizes and groups similar names (fuzzy matching)
 * 3. Creates canonical destination records
 * 4. Updates operations with destination_id and canonical name
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function normalize(name: string): string {
  return removeAccents(name).toLowerCase().replace(/[^a-z0-9]/g, "")
}

function toTitleCase(name: string): string {
  const words = name.trim().replace(/\s+/g, " ").split(" ")
  return words
    .map((word, index) => {
      if (word.length === 0) return ""
      const lower = word.toLowerCase()
      if (index > 0 && ["de", "del", "la", "las", "los", "el", "y", "e", "do", "da"].includes(lower)) {
        return lower
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
      }
    }
  }
  return matrix[b.length][a.length]
}

async function main() {
  console.log("=== Destination Migration Script ===\n")

  // 1. Get all distinct destinations with their counts
  const { data: operations, error } = await supabase
    .from("operations")
    .select("id, destination")
    .not("destination", "is", null)

  if (error) {
    console.error("Error fetching operations:", error)
    process.exit(1)
  }

  // Count occurrences of each destination
  const destCounts = new Map<string, number>()
  for (const op of operations || []) {
    const dest = (op.destination || "").trim()
    if (!dest || dest === "Sin destino") continue
    destCounts.set(dest, (destCounts.get(dest) || 0) + 1)
  }

  console.log(`Found ${destCounts.size} unique destination names\n`)

  // 2. Group by normalized name
  const groups = new Map<string, { variants: Map<string, number>; normalized: string }>()

  for (const [dest, count] of destCounts) {
    const norm = normalize(dest)
    if (!norm) continue

    // Check if matches any existing group (fuzzy)
    let matched = false
    for (const [groupKey, group] of groups) {
      if (norm === group.normalized || levenshtein(norm, group.normalized) <= 2) {
        group.variants.set(dest, count)
        matched = true
        break
      }
    }

    if (!matched) {
      const newGroup = { variants: new Map<string, number>(), normalized: norm }
      newGroup.variants.set(dest, count)
      groups.set(norm, newGroup)
    }
  }

  console.log(`Grouped into ${groups.size} canonical destinations\n`)

  // 3. For each group, pick the canonical name (most frequent variant, title-cased)
  const canonicalDestinations: { name: string; normalized: string; variants: string[] }[] = []

  for (const [, group] of groups) {
    // Find most frequent variant
    let bestVariant = ""
    let bestCount = 0
    for (const [variant, count] of group.variants) {
      if (count > bestCount) {
        bestCount = count
        bestVariant = variant
      }
    }

    const canonical = toTitleCase(bestVariant)
    const variants = Array.from(group.variants.keys())

    canonicalDestinations.push({
      name: canonical,
      normalized: group.normalized,
      variants,
    })

    if (variants.length > 1) {
      console.log(`  "${canonical}" ← ${variants.map(v => `"${v}" (${group.variants.get(v)})`).join(", ")}`)
    }
  }

  console.log(`\n--- Creating ${canonicalDestinations.length} destination records ---\n`)

  // 4. Insert destinations and update operations
  let created = 0
  let updated = 0

  for (const dest of canonicalDestinations) {
    // Insert destination
    const { data: inserted, error: insertError } = await supabase
      .from("destinations")
      .upsert(
        { name: dest.name, name_normalized: dest.normalized },
        { onConflict: "name" }
      )
      .select("id, name")
      .single()

    if (insertError) {
      console.error(`  Error inserting "${dest.name}":`, insertError.message)
      continue
    }

    created++

    // Update all operations with matching destination variants
    for (const variant of dest.variants) {
      const { count, error: updateError } = await supabase
        .from("operations")
        .update({
          destination_id: inserted.id,
          destination: dest.name, // Normalize the text field too
        })
        .eq("destination", variant)

      if (updateError) {
        console.error(`  Error updating ops for "${variant}":`, updateError.message)
      } else {
        updated += count || 0
      }
    }
  }

  console.log(`\n=== Done ===`)
  console.log(`  Destinations created: ${created}`)
  console.log(`  Operations updated: ${updated}`)
}

main().catch(console.error)
