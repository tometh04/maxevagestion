/**
 * Resuelve el prompt configurado en la columna del Kanban donde está el lead
 * (manychat_list_order.prompt) para incorporarlo al prompt sugerido de Emilia.
 *
 * Espeja la resolución de columna del Kanban (leads-kanban-manychat.tsx):
 *   - la columna del lead es list_name → region → "Sin lista"
 *   - el match contra manychat_list_order es case-insensitive (un lead con
 *     region="ARGENTINA" cae en la columna "Argentina")
 */
export async function fetchListPrompt(
  supabase: any,
  agencyId: string | null,
  listName: string | null,
  region: string | null
): Promise<string | null> {
  if (!agencyId) return null
  const key = (listName?.trim() || region?.trim() || "").toLowerCase()
  if (!key) return null

  const { data } = await supabase
    .from("manychat_list_order")
    .select("list_name, prompt")
    .eq("agency_id", agencyId)

  const row = ((data || []) as Array<{ list_name: string; prompt: string | null }>).find(
    (r) => !!r.prompt?.trim() && r.list_name.trim().toLowerCase() === key
  )
  return row?.prompt?.trim() || null
}
