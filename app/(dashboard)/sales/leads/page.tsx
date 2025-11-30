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

  // Get sellers for filters
  let sellersQuery = supabase.from("users").select("id, name").eq("role", "SELLER")
  if (user.role === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }
  const { data: sellers } = await sellersQuery

  // Get leads (including trello_list_id)
  // OPTIMIZACIÓN: Solo cargar leads necesarios para la vista inicial
  // El cliente cargará más según sea necesario
  let query = supabase.from("leads").select("*, agencies(name), users:assigned_seller_id(name, email)")

  if (user.role === "SELLER") {
    query = query.eq("assigned_seller_id", user.id)
  } else if (agencyIds.length > 0) {
    query = query.in("agency_id", agencyIds)
  }

  // OPTIMIZACIÓN: Cargar solo los primeros 500 leads para la carga inicial
  // Si hay más, el cliente puede cargarlos bajo demanda
  const INITIAL_LIMIT = 500
  const { data: leads, error: leadsError } = await query
    .order("created_at", { ascending: false })
    .limit(INITIAL_LIMIT)

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
      defaultAgencyId={agencyIds[0] || undefined}
      defaultSellerId={user.role === "SELLER" ? user.id : undefined}
      hasTrelloLeads={hasTrelloLeads || false}
    />
  )
}
