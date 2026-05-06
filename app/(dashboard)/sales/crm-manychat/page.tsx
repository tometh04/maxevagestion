import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"
import { CRMManychatPageClient } from "@/components/sales/crm-manychat-page-client"
import { canAccessModule } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export default async function CRMManychatPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  const userRole = user.role as any
  if (!canAccessModule(userRole, "leads")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM Ventas</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a leads</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)
  const agencyIds = agencies.map((a) => a.id)

  // Get sellers for filters
  let sellersQuery = supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)
  
  if (user.role === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }
  const { data: sellers } = await sellersQuery

  // Get operators for conversion dialog
  // Cast a any: types.ts está stale; admin_fee_percentage agregada en migration
  // 20260427000002 pero los tipos no fueron regenerados (npm run db:generate).
  const { data: operators } = await (supabase.from("operators") as any)
    .select("id, name, admin_fee_percentage")
    .order("name")

  // IMPORTANTE: Cargar leads de Manychat (nuevos) + Trello con list_name (migración visual)
  // 2026-05-06: refactor "CRM Manychat" → "CRM Ventas". Antes filtraba
  // restrictivamente source IN ('Manychat', 'Trello' con list_name); en
  // tenants reales con leads de WhatsApp/Instagram/Meta Ads/etc, el Kanban
  // quedaba perpetuamente vacío mientras la Tabla mostraba todos. Ahora
  // muestra TODOS los leads (los de cualquier source) — el page se llama
  // "CRM Ventas" y refleja la realidad del pipeline comercial completo.
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
    />
  )
}

