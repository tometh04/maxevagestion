"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  /** True solo si el usuario es ADMIN/SUPER_ADMIN. Renderiza el filtro
   *  de vendedor para que pueda inspeccionar el pipeline de cada seller.
   *  SELLERs nunca lo ven — ya tienen los leads filtrados a sus propios. */
  canFilterBySeller?: boolean
}

const ALL_SELLERS = "__all__"
const UNASSIGNED = "__unassigned__"

export function AdvancedKanbanClient({
  categories,
  funnels,
  leads: initialLeads,
  orgId,
  agencies,
  sellers,
  operators,
  canFilterBySeller = false,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Filtro de vendedor (solo para admin). Por default "todos".
  const [sellerFilter, setSellerFilter] = useState<string>(ALL_SELLERS)
  // Estado local para drag-and-drop optimista — cuando el user dropea, mutamos
  // local PRIMERO y después confirmamos con PATCH. Si falla, rollback.
  const [leads, setLeads] = useState(initialLeads)
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const [dragOverFunnel, setDragOverFunnel] = useState<string | null>(null)

  // Filtro combinado: tags + vendedor.
  const filteredLeads = leads.filter((lead) => {
    // Tag filter (AND entre tags seleccionados)
    if (selected.size > 0) {
      const leadTagIds = lead.tag_assignments
        .map((ta) => ta.tag?.id)
        .filter((id): id is string => id !== undefined)
      const tagOk = Array.from(selected).every((tagId) =>
        leadTagIds.includes(tagId)
      )
      if (!tagOk) return false
    }
    // Seller filter (solo si el admin lo activó)
    if (canFilterBySeller && sellerFilter !== ALL_SELLERS) {
      if (sellerFilter === UNASSIGNED) {
        if (lead.assigned_seller_id) return false
      } else {
        if (lead.assigned_seller_id !== sellerFilter) return false
      }
    }
    return true
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

      {/* Filtros: tags + (solo admin) vendedor */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {categories.length > 0 && (
          <TagFilter categories={categories} selected={selected} onChange={setSelected} />
        )}
        {canFilterBySeller && sellers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Vendedor:</span>
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SELLERS}>Todos los vendedores</SelectItem>
                <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sellerFilter !== ALL_SELLERS && (
              <Badge variant="secondary" className="text-xs">
                {filteredLeads.length} leads
              </Badge>
            )}
          </div>
        )}
      </div>

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
