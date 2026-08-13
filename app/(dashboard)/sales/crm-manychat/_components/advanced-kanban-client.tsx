"use client"

import type { SellerOption } from "@/lib/sellers/seller-option"
import { useState, useEffect, useCallback, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
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
  orgId: string
  agencies: Array<{ id: string; name: string }>
  sellers: SellerOption[]
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
const PAGE_SIZE = 40

export function AdvancedKanbanClient({
  categories,
  funnels,
  orgId,
  agencies,
  sellers,
  operators,
  canFilterBySeller = false,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sellerFilter, setSellerFilter] = useState<string>(ALL_SELLERS)

  // VIB-61 (audit): lazy por columna. Antes se traían .limit(500) leads y el
  // header/badges contaban sobre eso → con 2.400+ leads en 7 funnels los números
  // mentían y los leads viejos desaparecían. Ahora los conteos son exactos
  // (server) y las cards se cargan por funnel con "cargar más".
  const [funnelCounts, setFunnelCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [columnLeads, setColumnLeads] = useState<Record<string, LeadAdvancedFull[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadingFunnel, setLoadingFunnel] = useState<string | null>(null)
  const pageByFunnelRef = useRef<Record<string, number>>({})

  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const [dragOverFunnel, setDragOverFunnel] = useState<string | null>(null)

  const buildParams = useCallback(
    (extra: Record<string, string>) => {
      const p = new URLSearchParams()
      if (canFilterBySeller && sellerFilter !== ALL_SELLERS) p.set("sellerId", sellerFilter)
      if (selected.size > 0) p.set("tags", Array.from(selected).join(","))
      for (const [k, v] of Object.entries(extra)) p.set(k, v)
      return p.toString()
    },
    [canFilterBySeller, sellerFilter, selected]
  )

  const fetchColumn = useCallback(
    async (funnelId: string, page: number): Promise<{ leads: LeadAdvancedFull[]; hasMore: boolean }> => {
      const qs = buildParams({ mode: "column", funnelId, page: String(page), limit: String(PAGE_SIZE) })
      const res = await fetch(`/api/leads/advanced-kanban?${qs}`, { cache: "no-store" })
      if (!res.ok) return { leads: [], hasMore: false }
      const data = await res.json()
      return { leads: (data.leads || []) as LeadAdvancedFull[], hasMore: !!data.hasMore }
    },
    [buildParams]
  )

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const countsRes = await fetch(`/api/leads/advanced-kanban?${buildParams({ mode: "counts" })}`, { cache: "no-store" })
      const countsData = countsRes.ok ? await countsRes.json() : { funnelCounts: {}, total: 0 }
      setFunnelCounts(countsData.funnelCounts || {})
      setTotal(countsData.total || 0)

      pageByFunnelRef.current = {}
      const withLeads = funnels.filter((f) => (countsData.funnelCounts?.[f.id] || 0) > 0)
      const pages = await Promise.all(withLeads.map((f) => fetchColumn(f.id, 1)))
      const store: Record<string, LeadAdvancedFull[]> = {}
      withLeads.forEach((f, i) => {
        pageByFunnelRef.current[f.id] = 1
        store[f.id] = pages[i].leads
      })
      setColumnLeads(store)
    } catch (err) {
      console.error("[advanced-kanban] error cargando:", err)
    } finally {
      setLoading(false)
    }
  }, [buildParams, fetchColumn, funnels])

  // Recargar al montar y cuando cambian los filtros (tags / vendedor).
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerFilter, selected])

  const loadMore = useCallback(
    async (funnelId: string) => {
      setLoadingFunnel(funnelId)
      try {
        const next = (pageByFunnelRef.current[funnelId] || 1) + 1
        const { leads: more } = await fetchColumn(funnelId, next)
        if (more.length > 0) {
          pageByFunnelRef.current[funnelId] = next
          setColumnLeads((prev) => {
            const existing = prev[funnelId] || []
            const seen = new Set(existing.map((l) => l.id))
            return { ...prev, [funnelId]: [...existing, ...more.filter((l) => !seen.has(l.id))] }
          })
        }
      } finally {
        setLoadingFunnel(null)
      }
    },
    [fetchColumn]
  )

  async function handleDrop(funnelId: string) {
    const leadId = draggedLeadId
    setDragOverFunnel(null)
    setDraggedLeadId(null)
    if (!leadId) return

    // Encontrar el lead y su funnel de origen dentro del store.
    let fromFunnel: string | null = null
    let moved: LeadAdvancedFull | null = null
    for (const [fid, list] of Object.entries(columnLeads)) {
      const found = list.find((l) => l.id === leadId)
      if (found) { fromFunnel = fid; moved = found; break }
    }
    if (!moved || !fromFunnel || fromFunnel === funnelId) return

    // Optimistic: mover la card entre columnas y ajustar conteos.
    setColumnLeads((prev) => {
      const src = (prev[fromFunnel!] || []).filter((l) => l.id !== leadId)
      const dst = [{ ...moved!, funnel_id: funnelId }, ...(prev[funnelId] || [])]
      return { ...prev, [fromFunnel!]: src, [funnelId]: dst }
    })
    setFunnelCounts((c) => ({
      ...c,
      [fromFunnel!]: Math.max(0, (c[fromFunnel!] || 0) - 1),
      [funnelId]: (c[funnelId] || 0) + 1,
    }))

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnel_id: funnelId }),
      })
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`)
    } catch (err) {
      console.error("[advanced-kanban] error moving lead:", err)
      // Rollback (card + conteos).
      setColumnLeads((prev) => {
        const dst = (prev[funnelId] || []).filter((l) => l.id !== leadId)
        const src = [{ ...moved!, funnel_id: fromFunnel! }, ...(prev[fromFunnel!] || [])]
        return { ...prev, [funnelId]: dst, [fromFunnel!]: src }
      })
      setFunnelCounts((c) => ({
        ...c,
        [funnelId]: Math.max(0, (c[funnelId] || 0) - 1),
        [fromFunnel!]: (c[fromFunnel!] || 0) + 1,
      }))
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">CRM Vibook</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {total} leads activos · {funnels.length} etapas
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
                {total} leads
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Kanban columns */}
      <div
        className="flex gap-4 overflow-x-auto pb-4 flex-1 items-start"
        data-tour="crm.kanban-board"
      >
        {funnels.map((funnel) => {
          const funnelLeads = columnLeads[funnel.id] || []
          const count = funnelCounts[funnel.id] || 0
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
                  {count}
                </Badge>
              </div>

              {/* Lead cards */}
              <div className="flex flex-col min-h-[80px] px-1">
                {loading && funnelLeads.length === 0 ? (
                  <Card className="p-3 border-dashed opacity-50 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </Card>
                ) : funnelLeads.length === 0 ? (
                  <Card className="p-3 border-dashed opacity-50">
                    <p className="text-xs text-muted-foreground text-center">Sin leads</p>
                  </Card>
                ) : (
                  <>
                    {funnelLeads.map((lead) => (
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
                    ))}
                    {count > funnelLeads.length && (
                      <button
                        type="button"
                        onClick={() => loadMore(funnel.id)}
                        disabled={loadingFunnel === funnel.id}
                        className="mt-1 w-full py-2 rounded-lg text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        {loadingFunnel === funnel.id ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Cargando…</>
                        ) : (
                          <>Cargar más ({count - funnelLeads.length})</>
                        )}
                      </button>
                    )}
                  </>
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
