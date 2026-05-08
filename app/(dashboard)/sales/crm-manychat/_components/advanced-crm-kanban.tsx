import { createServerClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LeadCardAdvanced } from "./lead-card-advanced"

interface AdvancedCRMKanbanProps {
  orgId: string
}

export async function AdvancedCRMKanban({ orgId }: AdvancedCRMKanbanProps) {
  const supabase = await createServerClient()

  const { data: funnels } = await supabase
    .from("lead_funnels")
    .select("id, name, color, display_order")
    .eq("org_id", orgId)
    .order("display_order", { ascending: true })

  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id, contact_name, contact_phone, notes, funnel_id, updated_at, assigned_seller:assigned_seller_id(name), tag_assignments:lead_tag_assignments(tag:tag_id(id, label, category:category_id(name, color)))"
    )
    .eq("org_id", orgId)
    .not("funnel_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(500)

  const allFunnels = funnels ?? []
  const allLeads = leads ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">CRM Vibook</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {allLeads.length} leads activos · {allFunnels.length} etapas
        </p>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1 items-start">
        {allFunnels.map((funnel) => {
          const funnelLeads = allLeads.filter((l) => l.funnel_id === funnel.id)

          return (
            <div
              key={funnel.id}
              className="flex-shrink-0 w-64 flex flex-col"
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-sm font-semibold text-foreground truncate">
                  {funnel.name}
                </span>
                <Badge variant="secondary" className="text-xs ml-2 flex-shrink-0">
                  {funnelLeads.length}
                </Badge>
              </div>

              {/* Lead cards */}
              <div className="flex flex-col min-h-[80px]">
                {funnelLeads.length === 0 ? (
                  <Card className="p-3 border-dashed opacity-50">
                    <p className="text-xs text-muted-foreground text-center">Sin leads</p>
                  </Card>
                ) : (
                  funnelLeads.map((lead) => (
                    <LeadCardAdvanced
                      key={lead.id}
                      lead={lead as any}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}

        {allFunnels.length === 0 && (
          <div className="flex items-center justify-center w-full py-20 text-muted-foreground text-sm">
            No hay etapas configuradas para este CRM.
          </div>
        )}
      </div>
    </div>
  )
}
