import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Regiones default del CRM. Mismo set que seedeó la migración
 * 20260604000001_lead_regions_configurable para las orgs que ya existían.
 *
 * `code` es lo que se guarda en leads.region (uppercase, sin espacios);
 * `name` es el label visible. El tenant después las edita libremente
 * desde Settings → Regiones.
 */
export const DEFAULT_LEAD_REGIONS: { code: string; name: string; position: number }[] = [
  { code: "ARGENTINA", name: "Argentina", position: 0 },
  { code: "CARIBE", name: "Caribe", position: 1 },
  { code: "BRASIL", name: "Brasil", position: 2 },
  { code: "EUROPA", name: "Europa", position: 3 },
  { code: "EEUU", name: "EEUU", position: 4 },
  { code: "CRUCEROS", name: "Cruceros", position: 5 },
  { code: "OTROS", name: "Otros", position: 6 },
]

/**
 * Seedea las regiones default para una org nueva.
 *
 * Sin esto la org queda con 0 filas en `lead_regions` y NADIE puede crear
 * leads: `POST /api/leads` valida la región contra la tabla y rechaza todo
 * con 400 "Región inválida para tu organización", mientras el select del
 * front muestra un fallback hardcodeado que hace parecer que está todo bien.
 *
 * Multi-tenant: el caller tiene que poder escribir en la target org
 * (típicamente createAdminClient para bypass RLS).
 *
 * Idempotente: si la org ya tiene regiones no toca nada.
 */
export async function seedLeadRegionsForOrg(
  orgId: string,
  supabase: SupabaseClient
): Promise<{ created: number; skipped: number }> {
  const { count: existingCount } = await (supabase.from("lead_regions") as any)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)

  if ((existingCount || 0) > 0) {
    return { created: 0, skipped: existingCount || 0 }
  }

  const rows = DEFAULT_LEAD_REGIONS.map((r) => ({
    org_id: orgId,
    code: r.code,
    name: r.name,
    position: r.position,
    is_active: true,
  }))

  const { data, error } = await (supabase.from("lead_regions") as any)
    .insert(rows)
    .select("id")

  if (error) {
    throw new Error(`Error seedeando lead_regions para org ${orgId}: ${error.message}`)
  }

  return { created: (data || []).length, skipped: 0 }
}
