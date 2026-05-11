import { createServerClient } from "@/lib/supabase/server"
import { AdvancedKanbanClient } from "./advanced-kanban-client"

interface AdvancedCRMKanbanProps {
  orgId: string
}

export async function AdvancedCRMKanban({ orgId }: AdvancedCRMKanbanProps) {
  const supabase = await createServerClient()

  const [funnelsResult, leadsResult, categoriesResult] = await Promise.all([
    supabase
      .from("lead_funnels")
      .select("id, name, color, display_order")
      .eq("org_id", orgId)
      .order("display_order", { ascending: true }),

    supabase
      .from("leads")
      .select(
        "id, contact_name, contact_phone, notes, funnel_id, updated_at, assigned_seller:assigned_seller_id(name), tag_assignments:lead_tag_assignments(tag:tag_id(id, label, category:category_id(name, color)))"
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
  ])

  const allFunnels = funnelsResult.data ?? []
  const allLeads = leadsResult.data ?? []
  const rawCategories = categoriesResult.data ?? []

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
    />
  )
}
