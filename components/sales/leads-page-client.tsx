"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { LeadsKanban } from "@/components/sales/leads-kanban"
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
import { Plus, RefreshCw, Loader2, Wifi, WifiOff, HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  trello_url: string | null
  trello_list_id: string | null
  source: string
  agency_id?: string
  created_at: string
  assigned_seller_id: string | null
  users?: { name: string; email: string } | null
  agencies?: { name: string } | null
}

interface LeadsPageClientProps {
  initialLeads: Lead[]
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  defaultAgencyId?: string
  defaultSellerId?: string
  hasTrelloLeads?: boolean
  currentUserId?: string
  currentUserRole?: string
}

export function LeadsPageClient({
  initialLeads,
  agencies,
  sellers,
  operators,
  defaultAgencyId,
  defaultSellerId,
  hasTrelloLeads = false,
  currentUserId,
  currentUserRole,
}: LeadsPageClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [newLeadDialogOpen, setNewLeadDialogOpen] = useState(false)
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(defaultAgencyId || agencies[0]?.id || "ALL")
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [initialLeadId, setInitialLeadId] = useState<string | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

  // Leer leadId de query params y abrir dialog automáticamente
  useEffect(() => {
    const leadId = searchParams.get("leadId")
    if (leadId) {
      setInitialLeadId(leadId)
      const newSearchParams = new URLSearchParams(searchParams.toString())
      newSearchParams.delete("leadId")
      const newUrl = newSearchParams.toString()
        ? `${window.location.pathname}?${newSearchParams.toString()}`
        : window.location.pathname
      router.replace(newUrl, { scroll: false })
    }
  }, [searchParams, router])

  // Inicializar Supabase client para Realtime
  useEffect(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    }
  }, [])

  const LEADS_LIMIT = 200
  const [leadsPage, setLeadsPage] = useState(1)
  const [leadsHasMore, setLeadsHasMore] = useState(false)
  const [leadsTotal, setLeadsTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadLeads = useCallback(async (agencyId: string) => {
    setLoading(true)
    try {
      const url = agencyId === "ALL"
        ? `/api/leads?page=1&limit=${LEADS_LIMIT}`
        : `/api/leads?agencyId=${agencyId}&page=1&limit=${LEADS_LIMIT}`

      const response = await fetch(url, { cache: "no-store" })
      const data = await response.json()

      setLeads(data.leads || [])
      setLeadsPage(1)
      setLeadsHasMore(data.pagination?.hasMore ?? false)
      setLeadsTotal(data.pagination?.total ?? 0)
      if (data.leads?.length) {
        console.log(`✅ Cargados ${data.leads.length} de ${data.pagination?.total ?? "?"} leads`)
      } else {
        console.log("ℹ️ No se encontraron leads")
      }
    } catch (error) {
      console.error("Error loading leads:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMoreLeads = useCallback(async () => {
    if (!leadsHasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const nextPage = leadsPage + 1
      const url = selectedAgencyId === "ALL"
        ? `/api/leads?page=${nextPage}&limit=${LEADS_LIMIT}`
        : `/api/leads?agencyId=${selectedAgencyId}&page=${nextPage}&limit=${LEADS_LIMIT}`

      const response = await fetch(url, { cache: "no-store" })
      const data = await response.json()
      const newLeads = data.leads || []

      setLeads((prev) => [...prev, ...newLeads])
      setLeadsPage(nextPage)
      setLeadsHasMore(data.pagination?.hasMore ?? false)
      if (newLeads.length) {
        console.log(`✅ +${newLeads.length} leads cargados`)
      }
    } catch (error) {
      console.error("Error loading more leads:", error)
    } finally {
      setLoadingMore(false)
    }
  }, [leadsHasMore, leadsPage, loadingMore, selectedAgencyId])

  // 🔄 SUPABASE REALTIME - Actualización automática sin recargar
  useEffect(() => {
    const supabase = supabaseRef.current
    if (!supabase) return

    console.log("🔌 Conectando a Supabase Realtime...")

    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
        },
        (payload: RealtimePostgresChangesPayload<Lead>) => {
          console.log('📥 Cambio en tiempo real:', payload.eventType, payload.new || payload.old)

          if (payload.eventType === 'INSERT') {
            const newLead = payload.new as Lead
            const shouldAdd = (selectedAgencyId === "ALL" || newLead.agency_id === selectedAgencyId)

            if (shouldAdd) {
              setLeads((prev) => {
                if (prev.some(l => l.id === newLead.id)) return prev
                toast.success(`🆕 Nuevo lead: ${newLead.contact_name}`, { duration: 3000 })
                return [newLead, ...prev]
              })
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedLead = payload.new as Lead
            setLeads((prev) =>
              prev.map((lead) =>
                lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead
              )
            )
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id
            if (deletedId) {
              setLeads((prev) => prev.filter((lead) => lead.id !== deletedId))
              toast.info(`🗑️ Lead eliminado`, { duration: 2000 })
            }
          }
        }
      )
      .subscribe((status: string) => {
        console.log('📡 Estado de Realtime:', status)
        setRealtimeConnected(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') {
          console.log('✅ Conectado a Supabase Realtime')
        }
      })

    return () => {
      console.log('🔌 Desconectando de Supabase Realtime...')
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, loadLeads])

  // Cargar leads cuando cambia la agencia seleccionada
  useEffect(() => {
    if (selectedAgencyId && selectedAgencyId !== "ALL") {
      const delay = initialLoad ? 50 : 100
      const timer = setTimeout(() => {
        loadLeads(selectedAgencyId)
        if (initialLoad) {
          setInitialLoad(false)
        }
      }, delay)
      return () => clearTimeout(timer)
    } else if (selectedAgencyId === "ALL") {
      setLeads(initialLeads)
      setLeadsHasMore(false)
      setLeadsTotal(initialLeads.length)
      if (initialLoad) {
        setInitialLoad(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, loadLeads, initialLeads])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await loadLeads(selectedAgencyId)
      toast.success("✅ Leads actualizados", { duration: 2000 })
    } catch (error) {
      console.error("Error refreshing leads:", error)
    } finally {
      setRefreshing(false)
    }
  }

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
            <BreadcrumbPage>Leads</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">Leads</h1>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-medium mb-1">¿Cómo funciona?</p>
                    <p className="text-xs mb-2"><strong>Leads:</strong> Oportunidades de venta. Pueden venir de Manychat, formularios web, o creación manual.</p>
                    <p className="text-xs">Cuando un lead se convierte en operación, todos los datos se transfieren automáticamente y el lead se marca como ganado.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {/* Indicador de conexión en tiempo real */}
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                realtimeConnected
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
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
            Gestiona tus leads y oportunidades
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {agencies.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="agency-select" className="whitespace-nowrap">Agencia:</Label>
              <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                <SelectTrigger id="agency-select" className="w-[180px]">
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
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
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
          <Button onClick={() => setNewLeadDialogOpen(true)}>
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
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Cargando leads...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <LeadsKanban
                leads={leads as any}
                agencies={agencies}
                sellers={sellers}
                operators={operators}
                onRefresh={() => loadLeads(selectedAgencyId)}
                initialLeadId={initialLeadId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
              />
              {leadsHasMore && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {leads.length} de {leadsTotal} leads
                  </p>
                  <Button
                    variant="outline"
                    onClick={loadMoreLeads}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      "Cargar más"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="table" className="space-y-4">
          <LeadsTable
            agencies={agencies}
            sellers={sellers}
            operators={operators}
            onRefresh={() => loadLeads(selectedAgencyId)}
            agencyId={selectedAgencyId}
            sellerId={defaultSellerId}
          />
        </TabsContent>
      </Tabs>

      <NewLeadDialog
        open={newLeadDialogOpen}
        onOpenChange={setNewLeadDialogOpen}
        onSuccess={() => loadLeads(selectedAgencyId)}
        agencies={agencies}
        sellers={sellers}
        defaultAgencyId={selectedAgencyId !== "ALL" ? selectedAgencyId : defaultAgencyId}
        defaultSellerId={defaultSellerId}
      />
    </div>
  )
}
