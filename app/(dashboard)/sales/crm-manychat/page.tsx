import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { CRMManychatPageClient } from "@/components/sales/crm-manychat-page-client"
import { canAccessModule } from "@/lib/permissions"

export default async function CRMManychatPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  const userRole = user.role as any
  if (!canAccessModule(userRole, "leads")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">CRM Manychat</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a leads</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  // Get user agencies
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id, agencies(id, name)")
    .eq("user_id", user.id)

  const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

  // Get agencies for filters - SUPER_ADMIN ve todas, otros solo sus agencias
  let agencies: Array<{ id: string; name: string }> = []
  if (user.role === "SUPER_ADMIN") {
    const { data } = await supabase
      .from("agencies")
      .select("id, name")
      .order("name")
    agencies = (data || []) as Array<{ id: string; name: string }>
  } else {
    const { data } = await supabase
      .from("agencies")
      .select("id, name")
      .in("id", agencyIds.length > 0 ? agencyIds : [])
      .order("name")
    agencies = (data || []) as Array<{ id: string; name: string }>
  }

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
  const { data: operators } = await supabase
    .from("operators")
    .select("id, name")
    .order("name")

  // IMPORTANTE: Cargar inicialmente leads de Trello (para migración visual)
  // Los nuevos leads vendrán de Manychat vía webhook y se agregarán en tiempo real
  // Esto permite mostrar la migración de Trello a Manychat de forma visual
  let leads: any[] = []
  let leadsError: any = null
  const INITIAL_LIMIT = 2000

  if (user.role === "SELLER") {
    // Vendedor: leads asignados + sin asignar de Trello (para migración visual)
    const { data: myLeads, error: myLeadsError } = await supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .eq("assigned_seller_id", user.id)
      .eq("source", "Trello") // Inicialmente Trello para migración visual
      .order("updated_at", { ascending: false })
      .limit(INITIAL_LIMIT)

    const { data: unassignedLeads, error: unassignedError } = await supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .is("assigned_seller_id", null)
      .eq("source", "Trello") // Inicialmente Trello para migración visual
      .in("agency_id", agencyIds.length > 0 ? agencyIds : [])
      .order("updated_at", { ascending: false })
      .limit(INITIAL_LIMIT)

    leads = [...(myLeads || []), ...(unassignedLeads || [])]
    leadsError = myLeadsError || unassignedError
  } else {
    // Admin/otros: cargar leads de Trello inicialmente (para migración visual)
    let query = supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .eq("source", "Trello") // Inicialmente Trello para migración visual
    
    if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
      query = query.in("agency_id", agencyIds)
    }

    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(INITIAL_LIMIT)
    
    leads = data || []
    leadsError = error
  }
  
  // También cargar leads de Manychat para combinarlos
  let manychatLeads: any[] = []
  if (user.role === "SELLER") {
    const { data: myManychatLeads } = await supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .eq("assigned_seller_id", user.id)
      .eq("source", "Manychat")
      .limit(INITIAL_LIMIT)

    const { data: unassignedManychatLeads } = await supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .is("assigned_seller_id", null)
      .eq("source", "Manychat")
      .in("agency_id", agencyIds.length > 0 ? agencyIds : [])
      .limit(INITIAL_LIMIT)

    manychatLeads = [...(myManychatLeads || []), ...(unassignedManychatLeads || [])]
  } else {
    let manychatQuery = supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .eq("source", "Manychat")
    
    if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
      manychatQuery = manychatQuery.in("agency_id", agencyIds)
    }

    const { data: manychatData } = await manychatQuery.limit(INITIAL_LIMIT)
    manychatLeads = manychatData || []
  }
  
  // Combinar: Trello (migración visual) + Manychat (nuevos leads)
  leads = [...leads, ...manychatLeads]

  if (leadsError) {
    console.error("Error fetching Manychat leads:", leadsError)
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

