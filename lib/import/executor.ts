import type { SupabaseClientTyped, RollbackEntry } from "./types"

/**
 * Inserta una fila y agrega entry al rollback log. Retorna el ID o null si falla.
 */
export async function executeInsert(
  supabase: SupabaseClientTyped,
  table: string,
  data: Record<string, unknown>,
  rollbackLog: RollbackEntry[]
): Promise<{ id: string } | null> {
  const { data: result, error } = await (supabase.from(table as any) as any)
    .insert(data)
    .select("id")
    .single()

  if (error || !result) return null
  rollbackLog.push({ table, id: result.id })
  return { id: result.id }
}
