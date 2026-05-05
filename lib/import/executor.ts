import type { SupabaseClientTyped, RollbackEntry } from "./types"

export type ExecuteInsertResult =
  | { id: string; error?: never }
  | { id?: never; error: string }

/**
 * Inserta una fila y agrega entry al rollback log.
 *
 * Retorna `{ id }` cuando todo OK, o `{ error: string }` con el detalle de
 * Postgres cuando falla. Antes devolvía `null` opaco — los pipelines sólo
 * podían reportar "Falló insert (DB)" sin saber qué pasó realmente
 * (constraint violation? RLS? not-null missing?). Pendientes 3.2 — UX import.
 *
 * Backward compat: el llamador puede seguir chequeando `result?.id` truthy
 * para distinguir éxito de fallo, pero ahora también puede leer `result.error`
 * para propagar el detalle al usuario.
 */
export async function executeInsert(
  supabase: SupabaseClientTyped,
  table: string,
  data: Record<string, unknown>,
  rollbackLog: RollbackEntry[]
): Promise<ExecuteInsertResult> {
  const { data: result, error } = await (supabase.from(table as any) as any)
    .insert(data)
    .select("id")
    .single()

  if (error) {
    // Postgres errors típicos: 23505 unique_violation, 23502 not_null_violation,
    // 23503 foreign_key_violation, 42501 insufficient_privilege (RLS).
    // El campo .message es legible; .code y .details a veces ayudan más.
    const detail =
      (error as any)?.message ||
      (error as any)?.details ||
      (error as any)?.hint ||
      "error desconocido"
    return { error: detail }
  }
  if (!result) {
    return { error: "insert no devolvió fila (RLS bloqueando insert sin error?)" }
  }
  rollbackLog.push({ table, id: result.id })
  return { id: result.id }
}
