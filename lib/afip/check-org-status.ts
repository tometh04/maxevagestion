/**
 * Helper server-side para verificar si la org del usuario tiene al menos
 * una integración AFIP activa configurada en alguna de sus agencias.
 *
 * Pendientes 2026-05-06 (onboarding GTM): antes el usuario nuevo entraba a
 * /operations/billing/new y se chocaba con un dropdown vacío de "Punto de
 * Venta / Agencia" sin saber qué hacer. Ahora, antes de mostrar el form,
 * verificamos si hay AFIP configurado y, si no, mostramos un gate con CTA
 * directo a /settings/integrations.
 *
 * Multi-tenant safe: scope por org_id del usuario. Las agencias son
 * per-tenant; las integrations llevan agency_id y RLS las filtra, pero
 * además cruzamos explícitamente contra agencies.org_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export interface OrgAfipStatus {
  configured: boolean
  totalAgencies: number
  agenciesWithAfip: Array<{ id: string; name: string }>
  agenciesWithoutAfip: Array<{ id: string; name: string }>
}

export async function getOrgAfipStatus(
  supabase: SupabaseClient<Database>,
  orgId: string | null | undefined
): Promise<OrgAfipStatus> {
  const empty: OrgAfipStatus = {
    configured: false,
    totalAgencies: 0,
    agenciesWithAfip: [],
    agenciesWithoutAfip: [],
  }
  if (!orgId) return empty

  // 1) Listar agencias de la org.
  const { data: agencies, error: agenciesError } = await (supabase
    .from('agencies') as any)
    .select('id, name')
    .eq('org_id', orgId)

  if (agenciesError || !agencies || agencies.length === 0) {
    return empty
  }

  const agencyById = new Map<string, { id: string; name: string }>()
  for (const a of agencies as Array<{ id: string; name: string }>) {
    agencyById.set(a.id, { id: a.id, name: a.name })
  }
  const agencyIds = Array.from(agencyById.keys())

  // 2) Buscar integraciones AFIP activas para esas agencias.
  const { data: integrations } = await (supabase
    .from('integrations') as any)
    .select('agency_id, status, integration_type')
    .eq('integration_type', 'afip')
    .eq('status', 'active')
    .in('agency_id', agencyIds)

  const withAfip = new Set<string>(
    (integrations || []).map((i: any) => i.agency_id as string)
  )

  const agenciesWithAfip = agencyIds
    .filter((id) => withAfip.has(id))
    .map((id) => agencyById.get(id)!)
  const agenciesWithoutAfip = agencyIds
    .filter((id) => !withAfip.has(id))
    .map((id) => agencyById.get(id)!)

  return {
    configured: agenciesWithAfip.length > 0,
    totalAgencies: agencyIds.length,
    agenciesWithAfip,
    agenciesWithoutAfip,
  }
}
