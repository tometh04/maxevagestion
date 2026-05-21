/**
 * Helper para leer "feature flags" per-tenant desde organization_settings.
 *
 * organization_settings es una key/value store (columnas: org_id, key, value).
 * Lo usamos para activar features experimentales o customizaciones por
 * tenant sin tocar código (evita feature flags hardcodeados o
 * environment variables para casos per-tenant).
 *
 * Patrón:
 *   const flags = await getOrgFeatureFlags(supabase, orgId, [
 *     "features.region_filter_in_kanban",
 *     "features.list_name_to_status_sync",
 *   ])
 *   if (flags["features.region_filter_in_kanban"]) { ... }
 *
 * Convención de naming: keys que sean feature flags empiezan con
 * `features.<nombre>` para distinguirlas de settings de negocio
 * (company_name, address, etc.).
 *
 * Valores: tratamos "true", "1", "yes" (case-insensitive) como truthy.
 * Cualquier otra cosa (incluso falta del key) es false.
 */

export async function getOrgFeatureFlags(
  supabase: any,
  orgId: string | null | undefined,
  keys: string[]
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}
  for (const k of keys) result[k] = false

  if (!orgId || keys.length === 0) return result

  const { data, error } = await supabase
    .from("organization_settings")
    .select("key, value")
    .eq("org_id", orgId)
    .in("key", keys)

  if (error) {
    console.warn("[org-features] error leyendo organization_settings:", error.message)
    return result
  }

  for (const row of data || []) {
    const v = String((row as any).value ?? "").trim().toLowerCase()
    result[(row as any).key] = v === "true" || v === "1" || v === "yes"
  }

  return result
}

/**
 * Lee un único feature flag. Conveniente cuando solo necesitás uno.
 */
export async function getOrgFeatureFlag(
  supabase: any,
  orgId: string | null | undefined,
  key: string
): Promise<boolean> {
  const flags = await getOrgFeatureFlags(supabase, orgId, [key])
  return flags[key]
}
