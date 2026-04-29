import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Lista default que se crea para una agencia nueva. Son regiones de viaje
 * estándar para una agencia argentina + nombres genéricos sin asociar a sellers.
 * Cada admin de la agencia puede después renombrar / agregar / asignar a sellers.
 *
 * IMPORTANTE: estos nombres están sincronizados con `regionToListName` en
 * `app/api/leads/route.ts:287-296` para que el flujo Manychat → Lead funcione.
 * Si cambian acá, cambiar también allá.
 */
const DEFAULT_MANYCHAT_LISTS: Array<{ list_name: string; position: number }> = [
  { list_name: "Leads - Argentina", position: 0 },
  { list_name: "Leads - Caribe", position: 1 },
  { list_name: "Leads - Brasil", position: 2 },
  { list_name: "Leads - EEUU", position: 3 },
  { list_name: "Leads - Europa", position: 4 },
  { list_name: "Leads - Exoticos", position: 5 },
  { list_name: "Leads - Otros", position: 6 },
]

/**
 * Crea las listas Manychat default para una agencia nueva. Idempotente: si la
 * agencia ya tiene listas registradas en `manychat_list_order`, no toca nada.
 *
 * Multi-tenant: requiere `org_id` además del `agency_id` porque la tabla tiene
 * RLS por org desde la SaaS conversion. El caller debe pasar el orgId del agency.
 */
export async function seedManychatListsForAgency(
  agencyId: string,
  orgId: string,
  supabase: SupabaseClient
): Promise<{ created: number; skipped: number }> {
  // 1. Validar que la agency exista y pertenezca a la org indicada
  const { data: agency, error: agencyError } = await (supabase
    .from("agencies") as any)
    .select("id, org_id")
    .eq("id", agencyId)
    .maybeSingle()

  if (agencyError || !agency) {
    throw new Error(`Agency ${agencyId} no encontrada`)
  }
  if (agency.org_id !== orgId) {
    throw new Error(
      `Agency ${agencyId} pertenece a org ${agency.org_id}, no a ${orgId}`
    )
  }

  // 2. Si ya tiene listas, no tocar (idempotente)
  const { count: existingCount } = await (supabase
    .from("manychat_list_order") as any)
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)

  if ((existingCount || 0) > 0) {
    return { created: 0, skipped: existingCount || 0 }
  }

  // 3. Insertar las listas default
  const rows = DEFAULT_MANYCHAT_LISTS.map((l) => ({
    agency_id: agencyId,
    org_id: orgId,
    list_name: l.list_name,
    position: l.position,
    seller_id: null,
  }))

  const { error: insertError } = await (supabase
    .from("manychat_list_order") as any)
    .insert(rows)

  if (insertError) {
    throw new Error(`Error insertando listas: ${insertError.message}`)
  }

  return { created: rows.length, skipped: 0 }
}
