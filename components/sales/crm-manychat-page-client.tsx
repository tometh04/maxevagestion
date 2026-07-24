"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { LeadsKanbanManychat } from "@/components/sales/leads-kanban-manychat"
import { LeadsTable } from "@/components/sales/leads-table"
import { NewLeadDialog } from "@/components/sales/new-lead-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, RefreshCw, Loader2, Wifi, WifiOff } from "lucide-react"
import { toast } from "sonner"
import { createBrowserClient } from "@supabase/ssr"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"

interface Lead {
  id: string
  contact_name: string
  contact_phone: string
  contact_email: string | null
  destination: string
  region: string
  status: string
  source: string
  trello_url: string | null
  trello_list_id: string | null
  list_name: string | null
  agency_id?: string
  created_at: string
  updated_at?: string
  assigned_seller_id: string | null
  archived_at?: string | null
  users?: { name: string; email: string } | null
  agencies?: { name: string } | null
}

/** Filtros que el kanban delega al padre para que refetchee server-side (VIB-61). */
export interface KanbanServerFilters {
  status?: string
  region?: string
  createdFrom?: string
  createdTo?: string
}

interface CRMManychatPageClientProps {
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  defaultAgencyId?: string
  defaultSellerId?: string
  currentUserId?: string
  currentUserRole?: string
  enableRegionFilter?: boolean
  enableListStatusSync?: boolean
  enableCreatedAtFilter?: boolean
  /** Org ID del usuario — usado para filtrar la suscripción Realtime por tenant. */
  orgId?: string
}

// Misma lógica que crm_lead_column_key() en la migración y que el kanban:
// list_name → region → "Sin lista".
function columnKeyOf(l: Partial<Lead>): string {
  const ln = (l.list_name || "").trim()
  if (ln) return ln
  const rg = (l.region || "").trim()
  if (rg) return rg
  return "Sin lista"
}
const normKey = (s: string) => s.trim().toLowerCase()

const COLUMN_PAGE_SIZE = 30

export function CRMManychatPageClient({
  agencies,
  sellers,
  operators,
  defaultAgencyId,
  defaultSellerId,
  currentUserId,
  currentUserRole,
  enableRegionFilter = false,
  enableListStatusSync = false,
  enableCreatedAtFilter = false,
  orgId,
}: CRMManychatPageClientProps) {
  const [newLeadDialogOpen, setNewLeadDialogOpen] = useState(false)
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(defaultAgencyId || agencies[0]?.id || "ALL")
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

  // ── Estado de datos lazy (VIB-61) ──
  // `leads` es el set ACOTADO cargado (primeras páginas por columna + "cargar
  // más"), NO todo el pipeline. `columnCounts` son los totales exactos por
  // columna (headers), calculados en el server. Antes se cargaba TODO el
  // pipeline (~9.600 leads en orgs grandes) y se contaba client-side, lo que no
  // escalaba y hacía que los conteos no cerraran.
  const [leads, setLeads] = useState<Lead[]>([])
  const [columnCounts, setColumnCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [includeOld, setIncludeOld] = useState(false)

  // Filtros server-side delegados por el kanban.
  const [filterStatus, setFilterStatus] = useState<string>("ALL")
  const [filterRegion, setFilterRegion] = useState<string>("ALL")
  const [filterCreatedFrom, setFilterCreatedFrom] = useState<string>("")
  const [filterCreatedTo, setFilterCreatedTo] = useState<string>("")

  // Paginación por columna (page cargada por key). Ref para no gatillar renders.
  const pageByKeyRef = useRef<Record<string, number>>({})
  const leadsRef = useRef<Lead[]>([])
  useEffect(() => { leadsRef.current = leads }, [leads])

  useEffect(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    }
  }, [])

  // Querystring base (scope de agencia + filtros server-side).
  const buildParams = useCallback(
    (extra: Record<string, string>) => {
      const p = new URLSearchParams()
      p.set("agencyId", selectedAgencyId)
      if (filterStatus && filterStatus !== "ALL") p.set("status", filterStatus)
      if (enableRegionFilter && filterRegion && filterRegion !== "ALL") p.set("region", filterRegion)
      if (enableCreatedAtFilter && filterCreatedFrom) p.set("createdFrom", filterCreatedFrom)
      if (enableCreatedAtFilter && filterCreatedTo) p.set("createdTo", filterCreatedTo)
      if (includeOld) p.set("includeOld", "1")
      for (const [k, v] of Object.entries(extra)) p.set(k, v)
      return p.toString()
    },
    [selectedAgencyId, filterStatus, filterRegion, filterCreatedFrom, filterCreatedTo, includeOld, enableRegionFilter, enableCreatedAtFilter]
  )

  const fetchColumnPage = useCallback(
    async (key: string, page: number): Promise<{ leads: Lead[]; hasMore: boolean }> => {
      const qs = buildParams({ mode: "column", key, page: String(page), limit: String(COLUMN_PAGE_SIZE) })
      const res = await fetch(`/api/leads/kanban?${qs}`, { cache: "no-store" })
      if (!res.ok) return { leads: [], hasMore: false }
      const data = await res.json()
      return { leads: (data.leads || []) as Lead[], hasMore: !!data.hasMore }
    },
    [buildParams]
  )

  // Carga completa: conteos + primera página de cada columna con count > 0.
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const countsRes = await fetch(`/api/leads/kanban?${buildParams({ mode: "counts" })}`, { cache: "no-store" })
      const countsData = countsRes.ok ? await countsRes.json() : { columns: [] }
      const columns = (countsData.columns || []) as Array<{ key: string; count: number }>
      const counts: Record<string, number> = {}
      for (const c of columns) counts[c.key] = c.count
      setColumnCounts(counts)

      pageByKeyRef.current = {}
      const keys = columns.filter((c) => c.count > 0).map((c) => c.key)
      const pages = await Promise.all(keys.map((k) => fetchColumnPage(k, 1)))
      const all: Lead[] = []
      keys.forEach((k, i) => {
        pageByKeyRef.current[k] = 1
        all.push(...pages[i].leads)
      })
      setLeads(all)
    } catch (error) {
      console.error("Error cargando kanban:", error)
    } finally {
      setLoading(false)
    }
  }, [buildParams, fetchColumnPage])

  // Recargar cuando cambia agencia, filtros o la ventana de recencia.
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, filterStatus, filterRegion, filterCreatedFrom, filterCreatedTo, includeOld])

  // "Cargar más" de una columna: siguiente página de las keys que foldean al
  // nombre visible (case-insensitive, como el kanban).
  const handleLoadMoreColumn = useCallback(
    async (displayName: string) => {
      const target = normKey(displayName)
      const keys = Object.keys(columnCounts).filter((k) => normKey(k) === target)
      if (keys.length === 0) keys.push(displayName)
      const results = await Promise.all(
        keys.map(async (k) => {
          const next = (pageByKeyRef.current[k] || 1) + 1
          const { leads: more } = await fetchColumnPage(k, next)
          // Solo avanzamos la página si vino algo: si una respuesta viene vacía
          // no queremos saltear páginas en el próximo click.
          if (more.length > 0) pageByKeyRef.current[k] = next
          return more
        })
      )
      const fresh = results.flat()
      if (fresh.length === 0) return
      setLeads((prev) => {
        const seen = new Set(prev.map((l) => l.id))
        return [...prev, ...fresh.filter((l) => !seen.has(l.id))]
      })
    },
    [columnCounts, fetchColumnPage]
  )

  const handleIncludeOldChange = useCallback((next: boolean) => {
    setIncludeOld(next)
  }, [])

  const handleFiltersChange = useCallback((f: KanbanServerFilters) => {
    setFilterStatus(f.status ?? "ALL")
    setFilterRegion(f.region ?? "ALL")
    setFilterCreatedFrom(f.createdFrom ?? "")
    setFilterCreatedTo(f.createdTo ?? "")
  }, [])

  // ── Realtime: aplica cambios targeted al set cargado + reconcilia conteos ──
  const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const pendingRealtimeEventsRef = useRef<Array<RealtimePostgresChangesPayload<Lead>>>([])
  const countsRefetchRef = useRef<NodeJS.Timeout | null>(null)

  const scheduleCountsRefetch = useCallback(() => {
    if (countsRefetchRef.current) clearTimeout(countsRefetchRef.current)
    countsRefetchRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/leads/kanban?${buildParams({ mode: "counts" })}`, { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        const counts: Record<string, number> = {}
        for (const c of (data.columns || []) as Array<{ key: string; count: number }>) counts[c.key] = c.count
        setColumnCounts(counts)
      } catch { /* noop */ }
    }, 1500)
  }, [buildParams])

  useEffect(() => {
    const supabase = supabaseRef.current
    if (!supabase) return

    const processRealtimeEvents = () => {
      const events = [...pendingRealtimeEventsRef.current]
      pendingRealtimeEventsRef.current = []
      if (events.length === 0) return

      const countDelta: Record<string, number> = {}
      setLeads((prev) => {
        let updated = prev
        const byId = new Map(prev.map((l) => [l.id, l]))

        for (const payload of events) {
          if (payload.eventType === "INSERT") {
            const nl = payload.new as Lead
            if (!byId.has(nl.id) && nl.archived_at == null) {
              // Solo lo prependemos si su columna ya está cargada (si no, igual
              // sube el header vía countDelta y aparece al "cargar más").
              const k = columnKeyOf(nl)
              if (pageByKeyRef.current[k]) {
                updated = [nl, ...updated]
                byId.set(nl.id, nl)
              }
              countDelta[k] = (countDelta[k] || 0) + 1
              toast.success(`Nuevo lead: ${nl.contact_name}`, { duration: 3000 })
            }
          } else if (payload.eventType === "UPDATE") {
            const ul = payload.new as Lead
            const before = byId.get(ul.id)
            if (before) {
              const merged = { ...before, ...ul }
              const oldK = columnKeyOf(before)
              const newK = columnKeyOf(merged)
              if (oldK !== newK) {
                countDelta[oldK] = (countDelta[oldK] || 0) - 1
                countDelta[newK] = (countDelta[newK] || 0) + 1
              }
              updated = updated.map((l) => (l.id === ul.id ? merged : l))
              byId.set(ul.id, merged as Lead)
            }
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as any
            const before = oldRow?.id ? byId.get(oldRow.id) : undefined
            if (before) {
              countDelta[columnKeyOf(before)] = (countDelta[columnKeyOf(before)] || 0) - 1
              updated = updated.filter((l) => l.id !== oldRow.id)
              byId.delete(oldRow.id)
            }
          }
        }
        return updated
      })

      if (Object.keys(countDelta).length > 0) {
        setColumnCounts((cc) => {
          const n = { ...cc }
          for (const [k, d] of Object.entries(countDelta)) n[k] = Math.max(0, (n[k] || 0) + d)
          return n
        })
      }
      // Reconciliación exacta (cubre updates/inserts de leads fuera del set).
      scheduleCountsRefetch()
    }

    const channel = supabase
      .channel("crm-leads-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          ...(orgId ? { filter: `org_id=eq.${orgId}` } : {}),
        },
        (payload: RealtimePostgresChangesPayload<Lead>) => {
          pendingRealtimeEventsRef.current.push(payload)
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
          realtimeDebounceRef.current = setTimeout(processRealtimeEvents, 250)
        }
      )
      .subscribe((status: string) => {
        setRealtimeConnected(status === "SUBSCRIBED")
      })

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
      if (countsRefetchRef.current) clearTimeout(countsRefetchRef.current)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, scheduleCountsRefetch])

  const handleRefresh = useCallback(async () => {
    await reload()
  }, [reload])

  // Optimistic update (drag/claim del kanban). Ajusta conteos si cambió la columna.
  const handleUpdateLead = useCallback((leadId: string, updates: Partial<Lead>) => {
    const before = leadsRef.current.find((l) => l.id === leadId)
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...updates } : l)))
    if (before) {
      const after = { ...before, ...updates }
      const oldK = columnKeyOf(before)
      const newK = columnKeyOf(after)
      if (oldK !== newK) {
        setColumnCounts((cc) => {
          const n = { ...cc }
          n[oldK] = Math.max(0, (n[oldK] || 0) - 1)
          n[newK] = (n[newK] || 0) + 1
          return n
        })
      }
    }
  }, [])

  const effectiveAgencyId =
    selectedAgencyId !== "ALL" ? selectedAgencyId : agencies[0]?.id || defaultAgencyId
  const shouldUseManychatKanban = !!effectiveAgencyId

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>CRM Ventas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">CRM Ventas</h1>
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                realtimeConnected
                  ? "bg-success/10 text-success"
                  : "bg-accent-coral/10 text-accent-coral"
              }`}
              title={realtimeConnected ? "Conectado - Los cambios se actualizan automáticamente" : "Conectando..."}
            >
              {realtimeConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span>En vivo</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span>Conectando...</span>
                </>
              )}
            </div>
          </div>
          <p className="text-muted-foreground">
            Leads de todos los canales (Manychat, WhatsApp, Instagram, Meta Ads) • Actualización en tiempo real
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {agencies.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="agency-select" className="whitespace-nowrap">Agencia:</Label>
              <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                <SelectTrigger id="agency-select" className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                  <SelectValue placeholder="Seleccionar agencia" />
                </SelectTrigger>
                <SelectContent>
                  {agencies.length > 1 && (
                    <SelectItem value="ALL">Todas las agencias</SelectItem>
                  )}
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id}>
                      {agency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Actualizando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar
              </>
            )}
          </Button>
          <Button size="sm" onClick={() => setNewLeadDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Lead
          </Button>
        </div>
      </div>

      <Tabs defaultValue="kanban" className="w-full">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="table">Tabla</TabsTrigger>
        </TabsList>
        <TabsContent value="kanban">
          {loading && leads.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Cargando leads...</p>
            </div>
          ) : shouldUseManychatKanban ? (
            <LeadsKanbanManychat
              leads={leads as any}
              agencyId={effectiveAgencyId!}
              agencies={agencies}
              sellers={sellers}
              operators={operators}
              columnCounts={columnCounts}
              includeOld={includeOld}
              windowDays={90}
              onLoadMoreColumn={handleLoadMoreColumn}
              onIncludeOldChange={handleIncludeOldChange}
              onFiltersChange={handleFiltersChange}
              onRefresh={handleRefresh}
              onUpdateLead={handleUpdateLead}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              enableRegionFilter={enableRegionFilter}
              enableListStatusSync={enableListStatusSync}
              enableCreatedAtFilter={enableCreatedAtFilter}
            />
          ) : (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Seleccioná una agencia para ver el pipeline.</p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="table" className="space-y-4">
          <LeadsTable
            agencies={agencies}
            sellers={sellers}
            operators={operators}
            onRefresh={handleRefresh}
            agencyId={selectedAgencyId}
            sellerId={defaultSellerId}
          />
        </TabsContent>
      </Tabs>

      <NewLeadDialog
        open={newLeadDialogOpen}
        onOpenChange={setNewLeadDialogOpen}
        onSuccess={handleRefresh}
        agencies={agencies}
        sellers={sellers}
        defaultAgencyId={selectedAgencyId !== "ALL" ? selectedAgencyId : defaultAgencyId}
        defaultSellerId={defaultSellerId}
      />
    </div>
  )
}
