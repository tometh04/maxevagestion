import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { LeadsKanban } from "@/components/sales/leads-kanban"
import { LeadsTable } from "@/components/sales/leads-table"
import { LeadsPageClient } from "@/components/sales/leads-page-client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { canAccessModule } from "@/lib/permissions"

export default async function LeadsPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  const userRole = user.role as any
  if (!canAccessModule(userRole, "leads")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Leads</h1>
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
    // SUPER_ADMIN puede ver todas las agencias
    const { data } = await supabase
      .from("agencies")
      .select("id, name")
      .order("name")
    agencies = (data || []) as Array<{ id: string; name: string }>
  } else {
    // Otros roles solo ven sus agencias asignadas
    const { data } = await supabase
      .from("agencies")
      .select("id, name")
      .in("id", agencyIds.length > 0 ? agencyIds : [])
      .order("name")
    agencies = (data || []) as Array<{ id: string; name: string }>
  }

  // Get sellers for filters - incluir SELLER, ADMIN y SUPER_ADMIN como vendedores
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

  // Get leads (including trello_list_id)
  // Cargar solo una muestra inicial - el cliente cargará más con paginación
  let leads: any[] = []
  let leadsError: any = null
  const INITIAL_LIMIT = 100 // Reducido para carga rápida inicial

  if (user.role === "SELLER") {
    // Vendedor ve:
    // 1. Leads asignados a él
    // 2. Leads SIN asignar de sus agencias (para poder agarrarlos)
    const { data: myLeads, error: myLeadsError } = await supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .eq("assigned_seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(INITIAL_LIMIT)

    const { data: unassignedLeads, error: unassignedError } = await supabase
      .from("leads")
      .select("*, agencies(name), users:assigned_seller_id(name, email)")
      .is("assigned_seller_id", null)
      .in("agency_id", agencyIds.length > 0 ? agencyIds : [])
      .order("created_at", { ascending: false })
      .limit(INITIAL_LIMIT)

    leads = [...(myLeads || []), ...(unassignedLeads || [])]
    leadsError = myLeadsError || unassignedError
  } else {
    // Admin/otros: cargar solo muestra inicial
    let query = supabase.from("leads").select("*, agencies(name), users:assigned_seller_id(name, email)")
    
    if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
      query = query.in("agency_id", agencyIds)
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(INITIAL_LIMIT)
    
    leads = data || []
    leadsError = error
  }

  if (leadsError) {
    console.error("Error fetching leads:", leadsError)
  }

  // Check if we have Trello leads - verificar si hay leads con trello_list_id
  // Más eficiente: solo verificar si hay alguno con trello_list_id en lugar de buscar por source
  const hasTrelloLeads = (leads || []).some((lead: any) => lead.trello_list_id !== null && lead.trello_list_id !== undefined) || false

  return (
    <LeadsPageClient
      initialLeads={leads || []}
      agencies={(agencies || []) as Array<{ id: string; name: string }>}
      sellers={(sellers || []) as Array<{ id: string; name: string }>}
      operators={(operators || []) as Array<{ id: string; name: string }>}
      defaultAgencyId={agencyIds[0] || undefined}
      defaultSellerId={user.role === "SELLER" ? user.id : undefined}
      hasTrelloLeads={hasTrelloLeads || false}
      currentUserId={user.id}
      currentUserRole={user.role}
    />
  )
}
