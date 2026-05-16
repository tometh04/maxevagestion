"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { TagFilter } from "./tag-filter"
import { LeadCardAdvanced, type LeadAdvancedFull } from "./lead-card-advanced"

type Funnel = {
  id: string
  name: string
  color: string | null
  display_order: number
}

type CategoryForFilter = {
  id: string
  name: string
  color: string | null
  tags: Array<{ id: string; label: string }>
}

type Props = {
  categories: CategoryForFilter[]
  funnels: Funnel[]
  leads: LeadAdvancedFull[]
  orgId: string
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{
    id: string
    name: string
    admin_fee_percentage?: number | null
  }>
}

export function AdvancedKanbanClient({
  categories,
  funnels,
  leads,
  orgId,
  agencies,
  sellers,
  operators,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filteredLeads =
    selected.size === 0
      ? leads
      : leads.filter((lead) => {
          const leadTagIds = lead.tag_assignments
            .map((ta) => ta.tag?.id)
            .filter((id): id is string => id !== undefined)
          return Array.from(selected).every((tagId) => leadTagIds.includes(tagId))
        })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">CRM Vibook</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {leads.length} leads activos · {funnels.length} etapas
        </p>
      </div>

      {/* Tag filter */}
      {categories.length > 0 && (
        <div className="mb-4">
          <TagFilter categories={categories} selected={selected} onChange={setSelected} />
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1 items-start">
        {funnels.map((funnel) => {
          const funnelLeads = filteredLeads.filter((l) => l.funnel_id === funnel.id)

          return (
            <div key={funnel.id} className="flex-shrink-0 w-64 flex flex-col">
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
                      lead={lead}
                      orgId={orgId}
                      agencies={agencies}
                      sellers={sellers}
                      operators={operators}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}

        {funnels.length === 0 && (
          <div className="flex items-center justify-center w-full py-20 text-muted-foreground text-sm">
            No hay etapas configuradas para este CRM.
          </div>
        )}
      </div>
    </div>
  )
}
