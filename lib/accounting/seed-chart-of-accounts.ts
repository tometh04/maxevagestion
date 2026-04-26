import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Clona el plan de cuentas de una org template (default: lozada-viajes) a una
 * org nueva. Resuelve la jerarquía parent_id mappeando por account_code.
 *
 * Multi-tenant: el caller tiene que tener permisos para escribir en la target
 * org (típicamente platform_admin via createAdminClient para bypass RLS).
 *
 * Idempotente: si la target ya tiene cuentas, retorna { created: 0, skipped: N }
 * sin tocar nada. Para forzar re-seed habría que borrar las cuentas existentes
 * primero (no lo hacemos automático para evitar perder data).
 */
export async function seedChartOfAccountsForOrg(
  targetOrgId: string,
  supabase: SupabaseClient,
  options: {
    templateOrgSlug?: string
    templateOrgId?: string
  } = {}
): Promise<{ created: number; skipped: number; templateOrgId: string }> {
  const templateSlug = options.templateOrgSlug || "lozada-viajes"

  // 1. Resolver template org id (por slug o explicit id)
  let templateOrgId = options.templateOrgId
  if (!templateOrgId) {
    const { data: templateOrg, error: orgError } = await (supabase
      .from("organizations") as any)
      .select("id")
      .eq("slug", templateSlug)
      .maybeSingle()

    if (orgError || !templateOrg) {
      throw new Error(`Template org "${templateSlug}" no encontrada`)
    }
    templateOrgId = (templateOrg as any).id as string
  }

  if (templateOrgId === targetOrgId) {
    throw new Error("La org template no puede ser igual a la target")
  }

  // 2. Si la target ya tiene cuentas, no tocar nada
  const { count: existingCount } = await (supabase.from("chart_of_accounts") as any)
    .select("id", { count: "exact", head: true })
    .eq("org_id", targetOrgId)

  if ((existingCount || 0) > 0) {
    return { created: 0, skipped: existingCount || 0, templateOrgId }
  }

  // 3. Traer todas las cuentas activas del template, ordenadas por nivel (padres primero)
  const { data: templateAccounts, error: accountsError } = await (supabase
    .from("chart_of_accounts") as any)
    .select(
      "id, account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description"
    )
    .eq("org_id", templateOrgId)
    .eq("is_active", true)
    .order("level", { ascending: true })
    .order("account_code", { ascending: true })

  if (accountsError || !templateAccounts) {
    throw new Error(
      `Error al leer cuentas del template: ${accountsError?.message || "sin data"}`
    )
  }

  if (templateAccounts.length === 0) {
    throw new Error(
      `Template org "${templateOrgId}" no tiene cuentas activas — no se puede seedear`
    )
  }

  // 4. Map old_id → account_code (para resolver parent_id legacy → account_code → new_id)
  const oldIdToCode = new Map<string, string>()
  for (const tpl of templateAccounts as any[]) {
    oldIdToCode.set(tpl.id, tpl.account_code)
  }

  // 5. Insertar en orden (padres primero por level ASC). Resolver parent_id por account_code.
  const newIdByCode = new Map<string, string>()

  for (const tpl of templateAccounts as any[]) {
    let newParentId: string | null = null
    if (tpl.parent_id) {
      const parentCode = oldIdToCode.get(tpl.parent_id)
      if (parentCode) {
        newParentId = newIdByCode.get(parentCode) || null
      }
    }

    const { data: inserted, error: insertError } = await (supabase
      .from("chart_of_accounts") as any)
      .insert({
        org_id: targetOrgId,
        account_code: tpl.account_code,
        account_name: tpl.account_name,
        category: tpl.category,
        subcategory: tpl.subcategory,
        account_type: tpl.account_type,
        level: tpl.level,
        parent_id: newParentId,
        is_movement_account: tpl.is_movement_account,
        is_active: true,
        display_order: tpl.display_order,
        description: tpl.description,
      })
      .select("id")
      .single()

    if (insertError || !inserted) {
      throw new Error(
        `Error insertando cuenta ${tpl.account_code}: ${insertError?.message || "sin id"}`
      )
    }

    newIdByCode.set(tpl.account_code, (inserted as any).id)
  }

  return {
    created: templateAccounts.length,
    skipped: 0,
    templateOrgId,
  }
}
