/**
 * Lista todas las categorías de tags de VICO con sus labels, para diseñar el
 * mapping opción 1-5 → tags. Output ordenado por categoría.
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

  // Sin asumir schema: traemos categorías sin order y vemos qué tienen
  const { data: cats, error: catsErr } = await admin
    .from("lead_tag_categories")
    .select("*")
    .eq("org_id", orgId)
  if (catsErr) console.error("catsErr:", catsErr)
  console.log("CATEGORÍAS:", JSON.stringify(cats, null, 2))

  const { data: allTags, error: tagsErr } = await admin
    .from("lead_tags")
    .select("*")
    .eq("org_id", orgId)
    .limit(80)
  if (tagsErr) console.error("tagsErr:", tagsErr)
  console.log("\nTOTAL TAGS:", allTags?.length)
  // Agrupar por category_id
  const byCat: Record<string, string[]> = {}
  for (const t of (allTags ?? []) as any[]) {
    const k = t.category_id ?? "(sin categoría)"
    if (!byCat[k]) byCat[k] = []
    byCat[k].push(t.label)
  }
  for (const [catId, labels] of Object.entries(byCat)) {
    const catName =
      (cats ?? []).find((c: any) => c.id === catId)?.name ?? catId
    console.log(`\n[${catName}] (${labels.length}):`)
    for (const l of labels) console.log(`  - ${l}`)
  }
})()
