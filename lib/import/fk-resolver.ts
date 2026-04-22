import type { SupabaseClient } from "@supabase/supabase-js"

export interface FkMapping {
  column: string
  targetTable: string
  targetColumn: string
  resolvedKey: string
}

export interface RowWithFkResult extends Record<string, unknown> {
  _fkErrors?: string[]
}

/**
 * Resuelve FKs para un batch de rows, scopeado por org_id.
 * Para cada mapping: busca en targetTable WHERE org_id = p_org_id AND targetColumn = row[column].
 * Si encuentra, setea row[resolvedKey] = id. Si no, agrega error a row._fkErrors.
 */
export async function resolveFks(
  admin: SupabaseClient,
  orgId: string,
  rows: Record<string, unknown>[],
  mappings: FkMapping[]
): Promise<RowWithFkResult[]> {
  const result: RowWithFkResult[] = rows.map((r) => ({ ...r, _fkErrors: [] }))

  for (let i = 0; i < rows.length; i++) {
    for (const m of mappings) {
      const lookupValue = rows[i][m.column] as string | undefined
      if (!lookupValue || lookupValue === "") {
        result[i]._fkErrors!.push(`${m.column} vacío — requiere valor para resolver FK`)
        continue
      }
      const { data } = await (admin as any)
        .from(m.targetTable)
        .select("id")
        .eq("org_id", orgId)
        .eq(m.targetColumn, lookupValue)
        .maybeSingle()
      if (data?.id) {
        result[i][m.resolvedKey] = data.id
      } else {
        result[i]._fkErrors!.push(
          `no se encontró ${m.targetTable} con ${m.targetColumn}="${lookupValue}" en tu org`
        )
      }
    }
  }

  return result
}
