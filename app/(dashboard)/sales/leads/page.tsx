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
  // Para Trello, necesitamos TODOS los leads, cargar con paginación si es necesario
  let query = supabase.from("leads").select("*, agencies(name), users:assigned_seller_id(name, email)")

  if (user.role === "SELLER") {
    query = query.eq("assigned_seller_id", user.id)
  } else if (agencyIds.length > 0) {
    query = query.in("agency_id", agencyIds)
  }

  // Cargar todos los leads con paginación (Supabase limita a 1000 por defecto)
  // Hacer múltiples queries si es necesario para cargar todos
  let allLeads: any[] = []
  let offset = 0
  const limit = 1000
  let hasMore = true

  while (hasMore) {
    const { data: batch, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
    
    if (error) {
      console.error("Error fetching leads:", error)
      break
    }
    
    if (batch && batch.length > 0) {
      allLeads = [...allLeads, ...batch]
      offset += limit
      hasMore = batch.length === limit
    } else {
      hasMore = false
    }
  }

  const leads = allLeads

  // Check if we have Trello leads - if ANY lead is from Trello, use Trello Kanban
  const hasTrelloLeads = leads?.some((lead: any) => lead.source === "Trello") || false

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
