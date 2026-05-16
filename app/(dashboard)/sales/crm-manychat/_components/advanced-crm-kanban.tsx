import { createServerClient } from "@/lib/supabase/server"
import { AdvancedKanbanClient } from "./advanced-kanban-client"

interface AdvancedCRMKanbanProps {
  orgId: string
}

export async function AdvancedCRMKanban({ orgId }: AdvancedCRMKanbanProps) {
  const supabase = await createServerClient()

  // En modo advanced (VICO) cargamos todo lo que el LeadDetailDialog necesita
  // para alcanzar paridad con Lozada legacy (cotizar, convertir a operación,
  // editar, archivar, etc.), MÁS las tags/funnels custom propias del modo.
  const [
    funnelsResult,
    leadsResult,
    categoriesResult,
    agenciesResult,
    sellersResult,
    operatorsResult,
  ] = await Promise.all([
    supabase
      .from("lead_funnels")
      .select("id, name, color, display_order")
      .eq("org_id", orgId)
      .order("display_order", { ascending: true }),

    supabase
      .from("leads")
      .select(
        // Campos completos del lead + relaciones que el LeadDetailDialog
        // necesita (operations, customers, agency name, seller user info).
        `id, contact_name, contact_phone, contact_email, contact_instagram,
         destination, region, status, source,
         trello_url, trello_list_id, trello_full_data,
         assigned_seller_id, agency_id,
         created_at, updated_at, notes,
         quoted_price, has_deposit, deposit_amount, deposit_currency,
         deposit_method, deposit_date,
         archived_at, funnel_id,
         agencies(name),
         users:assigned_seller_id(name, email),
         assigned_seller:assigned_seller_id(name),
         tag_assignments:lead_tag_assignments(tag:tag_id(id, label, category:category_id(name, color))),
         operations(id, file_code, destination, status, created_at, departure_date, sale_amount_total),
         customers:operation_customers(customer:customer_id(id, first_name, last_name))`
      )
      .eq("org_id", orgId)
      .not("funnel_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(500),

    supabase
      .from("lead_tag_categories")
      .select("id, name, color, lead_tags(id, label)")
      .eq("org_id", orgId)
      .order("display_order", { ascending: true }),

    supabase.from("agencies").select("id, name").eq("org_id", orgId),

    // Sellers de la org (todos los users con rol vendedor/admin)
    supabase
      .from("users")
      .select("id, name")
      .eq("org_id", orgId)
      .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
      .eq("is_active", true),

    // Operators (catálogo de la org para conversión a operación)
    (supabase.from("operators") as any)
      .select("id, name, admin_fee_percentage")
      .eq("org_id", orgId)
      .order("name"),
  ])

  const allFunnels = funnelsResult.data ?? []
  const allLeads = leadsResult.data ?? []
  const rawCategories = categoriesResult.data ?? []
  const agencies = agenciesResult.data ?? []
  const sellers = sellersResult.data ?? []
  const operators = operatorsResult.data ?? []

  const categories = rawCategories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    tags: (c.lead_tags as Array<{ id: string; label: string }> | null) ?? [],
  }))

  return (
    <AdvancedKanbanClient
      categories={categories}
      funnels={allFunnels}
      leads={allLeads as any}
      orgId={orgId}
      agencies={agencies as Array<{ id: string; name: string }>}
      sellers={sellers as Array<{ id: string; name: string }>}
      operators={
        operators as Array<{
          id: string
          name: string
          admin_fee_percentage?: number | null
        }>
      }
    />
  )
}
