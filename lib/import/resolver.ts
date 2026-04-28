import type { SupabaseClientTyped, AgencyId } from "./types"

export interface CustomerMatch {
  documentNumber?: string
  email?: string
  name?: { firstName: string; lastName: string }
}

export interface ResolvedRecord {
  id: string
}

/**
 * Resuelve customer por (document_number > email > nombre) scopeado a agency_id.
 * Devuelve null si no matchea.
 */
export async function resolveCustomer(
  supabase: SupabaseClientTyped,
  agencyId: AgencyId,
  match: CustomerMatch
): Promise<ResolvedRecord | null> {
  if (match.documentNumber) {
    const { data } = await (supabase.from("customers") as any)
      .select("id")
      .eq("agency_id", agencyId)
      .eq("document_number", match.documentNumber)
      .maybeSingle()
    if (data) return { id: data.id }
  }

  if (match.email) {
    const { data } = await (supabase.from("customers") as any)
      .select("id")
      .eq("agency_id", agencyId)
      .eq("email", match.email)
      .maybeSingle()
    if (data) return { id: data.id }
  }

  if (match.name) {
    const { data } = await (supabase.from("customers") as any)
      .select("id")
      .eq("agency_id", agencyId)
      .ilike("first_name", match.name.firstName)
      .ilike("last_name", match.name.lastName)
      .maybeSingle()
    if (data) return { id: data.id }
  }

  return null
}

/**
 * Resuelve operator por nombre exacto (case-insensitive) scopeado a agency.
 */
export async function resolveOperator(
  supabase: SupabaseClientTyped,
  agencyId: AgencyId,
  name: string
): Promise<ResolvedRecord | null> {
  const { data } = await (supabase.from("operators") as any)
    .select("id")
    .eq("agency_id", agencyId)
    .ilike("name", name)
    .maybeSingle()
  return data ? { id: data.id } : null
}

export interface SellerMatch {
  email?: string
  name?: string
}

/**
 * Resuelve seller (user) por email > nombre. Scopeado a la agencia.
 */
export async function resolveSeller(
  supabase: SupabaseClientTyped,
  agencyId: AgencyId,
  match: SellerMatch
): Promise<ResolvedRecord | null> {
  // Filtrar por user_agencies para asegurar que el seller pertenece a la agencia
  if (match.email) {
    const { data } = await (supabase.from("users") as any)
      .select("id, user_agencies!inner(agency_id)")
      .eq("email", match.email)
      .eq("user_agencies.agency_id", agencyId)
      .maybeSingle()
    if (data) return { id: data.id }
  }
  return null
}

/**
 * Resuelve operación por file_code dentro de la agencia.
 */
export async function resolveOperationByFileCode(
  supabase: SupabaseClientTyped,
  agencyId: AgencyId,
  fileCode: string
): Promise<{ id: string; agency_id: string } | null> {
  const { data } = await (supabase.from("operations") as any)
    .select("id, agency_id")
    .eq("agency_id", agencyId)
    .eq("file_code", fileCode)
    .maybeSingle()
  return data ?? null
}
