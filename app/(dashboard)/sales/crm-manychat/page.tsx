import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser, getUserAgencyIds } from "@/lib/permissions-api"
import { CRMManychatPageClient } from "@/components/sales/crm-manychat-page-client"
import { AdvancedCRMKanban } from "./_components/advanced-crm-kanban"
import { EmiliaCrmDiscovery } from "@/components/sales/emilia-crm-discovery"
import { getOrgFeatureFlags } from "@/lib/settings/org-features"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"
import {
  SELLER_OPTION_ROLES,
  SELLER_OPTION_SELECT,
  type SellerOption,
} from "@/lib/sellers/seller-option"
import { resolveEffectiveSellerOptions } from "@/lib/sellers/effective-seller-options"
import {
  QUOTATION_OPERATOR_SELECT,
  type QuotationOperatorOption,
} from "@/lib/operators/quotation-option"

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
          <EmiliaCrmDiscovery />
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
    .select(SELLER_OPTION_SELECT)
    .in("role", SELLER_OPTION_ROLES)
    .eq("is_active", true)
    .eq("org_id", (user as any).org_id)

  if (user.role === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }
  const { data: sellers } = await sellersQuery
  // Porcentaje EFECTIVO: los diálogos del CRM comparten el cálculo del reparto
  // con los de Operaciones (VIB-173).
  // Con las oficinas que el diálogo puede elegir: el tope depende de la
  // sucursal de la operación (VIB-188).
  const sellerOptions = await resolveEffectiveSellerOptions(
    supabase,
    (user as any).org_id,
    sellers,
    agencyIds
  )

  // Get operators for conversion dialog
  // Cast a any: types.ts está stale; admin_fee_percentage agregada en migration
  // 20260427000002 pero los tipos no fueron regenerados (npm run db:generate).
  // 🔴 CROSS-TENANT FIX (2026-05-21): mismo bug que sellers — sin filtro
  // explícito por org_id, un tenant nuevo veía operadores de otros tenants
  // por RLS rota. Defense-in-depth obligatorio (regla de oro CLAUDE.md).
  const { data: operators } = await (supabase.from("operators") as any)
    .select(QUOTATION_OPERATOR_SELECT)
    .eq("org_id", (user as any).org_id)
    .or(agencyIds.length > 0
      ? `agency_id.is.null,agency_id.in.(${agencyIds.join(",")})`
      : "agency_id.is.null")
    .order("name")

  // VIB-61: el kanban ya NO carga todo el pipeline. Es lazy por columna: pide
  // conteos exactos por lista y la primera página de cada una vía
  // /api/leads/kanban (ver components/sales/crm-manychat-page-client.tsx). Con
  // orgs grandes (Lozada: ~9.600 leads activos) cargar todo no escalaba y hacía
  // que los conteos no cerraran. Por eso acá no hacemos ningún fetch de leads.

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
    <>
      <EmiliaCrmDiscovery />
      <CRMManychatPageClient
        agencies={(agencies || []) as Array<{ id: string; name: string }>}
        sellers={sellerOptions}
        operators={(operators || []) as QuotationOperatorOption[]}
        defaultAgencyId={agencyIds[0] || undefined}
        defaultSellerId={user.role === "SELLER" ? user.id : undefined}
        currentUserId={user.id}
        currentUserRole={user.role}
        orgId={(user as any).org_id || undefined}
        enableRegionFilter={featureFlags["features.region_filter_in_kanban"]}
        enableListStatusSync={featureFlags["features.list_name_to_status_sync"]}
        enableCreatedAtFilter={featureFlags["features.created_at_filter_in_kanban"]}
      />
    </>
  )
}

