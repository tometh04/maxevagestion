import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { TagCategoryPreset, FunnelPreset } from "./vico-preset"

export type SeedConfig = {
  categories: TagCategoryPreset[]
  funnels: FunnelPreset[]
}

/**
 * Seed idempotente de un tenant en crm_mode='advanced'.
 * Pone organizations.crm_mode = 'advanced' al final.
 *
 * Idempotencia: hace upsert por (org_id, name) en categories/funnels y
 * por (category_id, label) en tags. Llamarla 2 veces no duplica.
 *
 * Requiere: admin client con service_role (RLS bypassed).
 */
export async function seedAdvancedMode(
  admin: SupabaseClient<Database>,
  orgId: string,
  config: SeedConfig
): Promise<void> {
  // 1. Fetch all existing categories for this org in one query
  const categoryNames = config.categories.map((c) => c.name)
  const { data: existingCats, error: fetchErr } = await admin
    .from("lead_tag_categories")
    .select("id, name")
    .eq("org_id", orgId)
    .in("name", categoryNames)
  if (fetchErr) throw fetchErr

  const existingMap = new Map(
    (existingCats ?? []).map((c: { id: string; name: string }) => [c.name, c.id])
  )

  // Separate into inserts and updates
  const toInsert = config.categories.filter((c) => !existingMap.has(c.name))
  const toUpdate = config.categories.filter((c) => existingMap.has(c.name))

  // Batch insert new categories
  let newCategoryMap = new Map<string, string>()
  if (toInsert.length > 0) {
    const insertRows = toInsert.map((cat) => ({
      org_id: orgId,
      name: cat.name,
      color: cat.color,
      cardinality: cat.cardinality,
      display_order: cat.display_order,
    }))
    const { data: created, error: insErr } = await admin
      .from("lead_tag_categories")
      .insert(insertRows as never)
      .select("id, name")
    if (insErr) throw insErr
    newCategoryMap = new Map(
      (created ?? []).map((c: { id: string; name: string }) => [c.name, c.id])
    )
  }

  // Existing categories: update metadata in parallel (fire-and-forget order ok)
  await Promise.all(
    toUpdate.map(async (cat) => {
      const categoryId = existingMap.get(cat.name)!
      const { error: upErr } = await admin
        .from("lead_tag_categories")
        .update({
          color: cat.color,
          cardinality: cat.cardinality,
          display_order: cat.display_order,
        } as never)
        .eq("id", categoryId)
      if (upErr) throw upErr
    })
  )

  // Full category id map
  const allCategoryIds = new Map([...existingMap, ...newCategoryMap])

  // 2. Batch upsert tags per category (one round trip per category)
  for (const cat of config.categories) {
    const categoryId = allCategoryIds.get(cat.name)!
    const tagRows = cat.tags.map((tag) => ({
      org_id: orgId,
      category_id: categoryId,
      label: tag.label,
      display_order: tag.display_order,
    }))
    const { error: tagErr } = await admin
      .from("lead_tags")
      .upsert(tagRows as never, { onConflict: "category_id,label" })
    if (tagErr) throw tagErr
  }

  // 3. Funnels — single batch upsert por (org_id, name)
  const funnelRows = config.funnels.map((f) => ({
    org_id: orgId,
    name: f.name,
    display_order: f.display_order,
    color: f.color,
    is_terminal: f.is_terminal,
    is_default_new: f.is_default_new,
  }))
  const { error: fErr } = await admin
    .from("lead_funnels")
    .upsert(funnelRows as never, { onConflict: "org_id,name" })
  if (fErr) throw fErr

  // 4. Activar modo advanced
  const { error: updateErr } = await admin
    .from("organizations")
    .update({ crm_mode: "advanced" } as never)
    .eq("id", orgId)
  if (updateErr) throw updateErr
}
