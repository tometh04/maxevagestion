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
  leads: initialLeads,
  orgId,
  agencies,
  sellers,
  operators,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Estado local para drag-and-drop optimista — cuando el user dropea, mutamos
  // local PRIMERO y después confirmamos con PATCH. Si falla, rollback.
  const [leads, setLeads] = useState(initialLeads)
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const [dragOverFunnel, setDragOverFunnel] = useState<string | null>(null)

  const filteredLeads =
    selected.size === 0
      ? leads
      : leads.filter((lead) => {
          const leadTagIds = lead.tag_assignments
            .map((ta) => ta.tag?.id)
            .filter((id): id is string => id !== undefined)
          return Array.from(selected).every((tagId) => leadTagIds.includes(tagId))
        })

  async function handleDrop(funnelId: string) {
    const leadId = draggedLeadId
    setDragOverFunnel(null)
    setDraggedLeadId(null)
    if (!leadId) return

    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.funnel_id === funnelId) return

    const prevFunnelId = lead.funnel_id
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, funnel_id: funnelId } : l))
    )

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnel_id: funnelId }),
      })
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`)
    } catch (err) {
      console.error("[advanced-kanban] error moving lead:", err)
      // Rollback
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId ? { ...l, funnel_id: prevFunnelId } : l
        )
      )
    }
  }

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
          const isDragOver = dragOverFunnel === funnel.id

          return (
            <div
              key={funnel.id}
              className={`flex-shrink-0 w-64 flex flex-col rounded-lg transition-colors ${
                isDragOver ? "bg-primary/5 ring-1 ring-primary/30" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverFunnel(funnel.id)
              }}
              onDragLeave={(e) => {
                // Solo limpiar si realmente salimos de la columna (no de un child)
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverFunnel((prev) => (prev === funnel.id ? null : prev))
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                handleDrop(funnel.id)
              }}
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
              <div className="flex flex-col min-h-[80px] px-1">
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
                      onDragStart={() => setDraggedLeadId(lead.id)}
                      onDragEnd={() => {
                        setDraggedLeadId(null)
                        setDragOverFunnel(null)
                      }}
                      isDragging={draggedLeadId === lead.id}
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
