/**
 * Setup idempotente de la categoría "tipo" y sus tags ("VIAJE EXISTENTE", "EN VIAJE")
 * para VICO. Se usa para que el sync-handler pueda asignar tag-de-tipo según
 * la opción del menú del bot.
 *
 * Idempotente: solo crea lo que falta. No toca data existente.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const orgId = "586bca09-029e-4cc9-8762-2ad01d468428"

  // 1. Buscar o crear categoría "tipo"
  let { data: cat } = await admin
    .from("lead_tag_categories")
    .select("id")
    .eq("org_id", orgId)
    .ilike("name", "tipo")
    .maybeSingle()
  if (!cat) {
    const { data: created, error } = await admin
      .from("lead_tag_categories")
      .insert({
        org_id: orgId,
        name: "tipo",
        color: "blue",
        cardinality: "one",
        display_order: 5,
      } as never)
      .select("id")
      .single()
    if (error || !created) {
      console.error("❌ Error creando categoría tipo:", error)
      process.exit(1)
    }
    cat = created as { id: string }
    console.log(`✓ Creada categoría "tipo" (${(cat as { id: string }).id.slice(0, 8)})`)
  } else {
    console.log(`✓ Categoría "tipo" ya existe (${(cat as { id: string }).id.slice(0, 8)})`)
  }

  const catId = (cat as { id: string }).id

  // 2. Crear tags si no existen
  const labels = ["VIAJE EXISTENTE", "EN VIAJE"]
  for (const label of labels) {
    const { data: existing } = await admin
      .from("lead_tags")
      .select("id")
      .eq("org_id", orgId)
      .eq("category_id", catId)
      .ilike("label", label)
      .maybeSingle()
    if (existing) {
      console.log(`  ✓ Tag "${label}" ya existe`)
      continue
    }
    const { error } = await admin
      .from("lead_tags")
      .insert({
        org_id: orgId,
        category_id: catId,
        label,
      } as never)
    if (error) {
      console.error(`  ❌ Error creando tag "${label}":`, error)
    } else {
      console.log(`  ✓ Creada tag "${label}"`)
    }
  }

  console.log("\nSetup completo.")
})()
