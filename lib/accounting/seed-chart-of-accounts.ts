import type { SupabaseClient } from "@supabase/supabase-js"
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  type DefaultChartAccount,
} from "./default-chart-of-accounts"

/**
 * Siembra el plan de cuentas default en una org nueva.
 *
 * La plantilla es `DEFAULT_CHART_OF_ACCOUNTS`: una lista generica que vive en
 * el codigo. Antes esto clonaba las cuentas de una org real usada como template
 * (`lozada-viajes`), o sea que el alta de un tenant leia datos de otro tenant y
 * heredaba cualquier cuenta que esa agencia hubiera agregado a mano. Ya no hay
 * lectura cross-tenant: la funcion solo escribe en la org destino.
 *
 * Multi-tenant: el caller tiene que tener permisos para escribir en la target
 * org (tipicamente platform_admin via createAdminClient para bypass RLS).
 *
 * Idempotente: si la target ya tiene cuentas, retorna { created: 0, skipped: N }
 * sin tocar nada. Una agencia que armo su plan a mano no puede perderlo.
 */
export async function seedChartOfAccountsForOrg(
  targetOrgId: string,
  supabase: SupabaseClient
): Promise<{ created: number; skipped: number }> {
  // 1. Si la target ya tiene cuentas, no tocar nada
  const { count: existingCount } = await (supabase.from("chart_of_accounts") as any)
    .select("id", { count: "exact", head: true })
    .eq("org_id", targetOrgId)

  if ((existingCount || 0) > 0) {
    return { created: 0, skipped: existingCount || 0 }
  }

  // 2. Insertar por nivel: los rubros primero, para poder colgar de ellos las
  //    subcuentas. `parent_id` se resuelve por codigo contra lo ya insertado.
  const porNivel = new Map<number, DefaultChartAccount[]>()
  for (const cuenta of DEFAULT_CHART_OF_ACCOUNTS) {
    const nivel = porNivel.get(cuenta.level) ?? []
    nivel.push(cuenta)
    porNivel.set(cuenta.level, nivel)
  }

  const idPorCodigo = new Map<string, string>()
  let created = 0

  for (const nivel of Array.from(porNivel.keys()).sort((a, b) => a - b)) {
    const cuentas = porNivel.get(nivel)!

    const filas = cuentas.map((c) => ({
      org_id: targetOrgId,
      account_code: c.code,
      account_name: c.name,
      category: c.category,
      subcategory: c.subcategory,
      account_type: c.accountType,
      level: c.level,
      parent_id: c.parentCode ? idPorCodigo.get(c.parentCode) ?? null : null,
      is_movement_account: c.isMovement,
      is_active: true,
      display_order: c.displayOrder,
      description: c.description,
    }))

    const { data: insertadas, error } = await (supabase.from("chart_of_accounts") as any)
      .insert(filas)
      .select("id, account_code")

    if (error || !insertadas) {
      throw new Error(
        `Error insertando el nivel ${nivel} del plan de cuentas: ${error?.message || "sin data"}`
      )
    }

    for (const fila of insertadas as any[]) {
      idPorCodigo.set(fila.account_code, fila.id)
    }
    created += insertadas.length
  }

  return { created, skipped: 0 }
}
