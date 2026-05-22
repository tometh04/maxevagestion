import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser, getUserAgencyIds } from "@/lib/permissions-api"
import { CRMManychatPageClient } from "@/components/sales/crm-manychat-page-client"
import { AdvancedCRMKanban } from "./_components/advanced-crm-kanban"
import { getOrgFeatureFlags } from "@/lib/settings/org-features"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"

export const dynamic = "force-dynamic"

export default async function CRMManychatPage() {
  const { user } = await getCurrentUser()
  const supabaseForPerms = await createServerClient()
  const agencyIdsForPerms = await getUserAgencyIds(supabaseForPerms, user.id, user.role as any)
  const permsMatrix = user.org_id
    ? await resolveUserPermissions(supabaseForPerms as any, user.id, user.org_id, user.role, agencyIdsForPerms)
    : null

  if (!assertPermission(user.role, permsMatrix, "leads", "read")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM Ventas</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a leads</p>
        </div>
      </div>
    )
  }

  // Routing condicional por crm_mode
  if (user.org_id) {
    const supabaseForOrg = await createServerClient()
    const { data: org } = await supabaseForOrg
      .from("organizations")
      .select("crm_mode")
      .eq("id", user.org_id)
      .single()

    if (org?.crm_mode === "advanced") {
      return (
        <div className="p-6 h-full">
          <AdvancedCRMKanban orgId={user.org_id} />
        </div>
      )
    }
  }

  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)
  const agencyIds = agencies.map((a) => a.id)

  // Get sellers for filters.
  // 🔴 CROSS-TENANT FIX (2026-05-21): bug reportado por Tomi vía WhatsApp —
  // un org NUEVO ("Oficial Test Vibook") veía vendedores de TODOS los demás
  // tenants (Test V7, Mateo admin, Maximiliano De Franco, etc.). Causa:
  // query a users sin .eq("org_id", ...) confiando en RLS, pero
  // user_org_ids() está rota / leakea (ver CLAUDE.md regla de oro).
  // Defense-in-depth: filtro explícito por org_id del user logueado.
  let sellersQuery = supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)
    .eq("org_id", (user as any).org_id)

  if (user.role === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }
  const { data: sellers } = await sellersQuery

  // Get operators for conversion dialog
  // Cast a any: types.ts está stale; admin_fee_percentage agregada en migration
  // 20260427000002 pero los tipos no fueron regenerados (npm run db:generate).
  // 🔴 CROSS-TENANT FIX (2026-05-21): mismo bug que sellers — sin filtro
  // explícito por org_id, un tenant nuevo veía operadores de otros tenants
  // por RLS rota. Defense-in-depth obligatorio (regla de oro CLAUDE.md).
  const { data: operators } = await (supabase.from("operators") as any)
    .select("id, name, admin_fee_percentage")
    .eq("org_id", (user as any).org_id)
    .order("name")

  // Cargar TODOS los leads del tenant (cualquier source). El kanban "CRM Ventas"
  // refleja la realidad del pipeline comercial completo. Cleanup 2026-05-08:
  // removida lógica histórica de filtros por source 'Trello'.
  let leads: any[] = []
  let leadsError: any = null
  const INITIAL_LIMIT = 5000

  if (user.role === "SELLER") {
    // Vendedor: leads asignados a él + leads sin asignar de sus agencias.
    // Sin filtro de source — cualquier canal de origen es válido.
    const { data: myLeads, error: myError } = await supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .eq("assigned_seller_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(INITIAL_LIMIT)

    const { data: unassignedLeads, error: unassignedError } = await supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .is("assigned_seller_id", null)
      .in("agency_id", agencyIds.length > 0 ? agencyIds : [])
      .order("updated_at", { ascending: false })
      .limit(INITIAL_LIMIT)

    leads = [...(myLeads || []), ...(unassignedLeads || [])]
    leadsError = myError || unassignedError
  } else {
    // Admin/otros: TODOS los leads de las agencias del user (RLS
    // adicionalmente acota por org).
    let leadsQuery = supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")

    if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
      leadsQuery = leadsQuery.in("agency_id", agencyIds)
    }

    const { data, error } = await leadsQuery
      .order("updated_at", { ascending: false })
      .limit(INITIAL_LIMIT)

    leads = data || []
    leadsError = error
  }

  if (leadsError) {
    console.error("Error fetching CRM Ventas leads:", leadsError)
  }

  // Feature flags per-tenant (organization_settings key/value).
  // Defaults: false → comportamiento legacy preservado para todos los
  // tenants. Solo activos para tenants que tengan los settings prendidos.
  // Doc: lib/settings/org-features.ts
  const featureFlags = await getOrgFeatureFlags(supabase, user.org_id ?? null, [
    "features.region_filter_in_kanban",
    "features.list_name_to_status_sync",
    "features.created_at_filter_in_kanban",
  ])

  return (
    <CRMManychatPageClient
      initialLeads={leads || []}
      agencies={(agencies || []) as Array<{ id: string; name: string }>}
      sellers={(sellers || []) as Array<{ id: string; name: string }>}
      operators={(operators || []) as Array<{ id: string; name: string }>}
      defaultAgencyId={agencyIds[0] || undefined}
      defaultSellerId={user.role === "SELLER" ? user.id : undefined}
      currentUserId={user.id}
      currentUserRole={user.role}
      enableRegionFilter={featureFlags["features.region_filter_in_kanban"]}
      enableListStatusSync={featureFlags["features.list_name_to_status_sync"]}
      enableCreatedAtFilter={featureFlags["features.created_at_filter_in_kanban"]}
    />
  )
}

