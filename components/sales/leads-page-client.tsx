"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { LeadsKanban } from "@/components/sales/leads-kanban"
import { LeadsKanbanTrello } from "@/components/sales/leads-kanban-trello"
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
  const [selectedTrelloListId, setSelectedTrelloListId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [syncingTrello, setSyncingTrello] = useState(false)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [initialLeadId, setInitialLeadId] = useState<string | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

  // Leer leadId de query params y abrir dialog automáticamente
  useEffect(() => {
    const leadId = searchParams.get("leadId")
    if (leadId) {
      setInitialLeadId(leadId)
      // Limpiar el query param de la URL sin recargar
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

  // Definir loadLeads como useCallback para poder usarla en Realtime
  // OPTIMIZADO: Para Trello, cargar más leads (hasta 2000 por agencia)
  const loadLeads = useCallback(async (agencyId: string, trelloListId: string | null = null) => {
    setLoading(true)
    try {
      // Para Trello, aumentar el límite a 2000 (máximo por agencia según el usuario)
      const limit = 2000
      let url = agencyId === "ALL"
        ? `/api/leads?page=1&limit=${limit}&source=Trello`
        : `/api/leads?agencyId=${agencyId}&page=1&limit=${limit}&source=Trello`
      
      if (trelloListId && trelloListId !== "ALL") {
        url += `&trelloListId=${trelloListId}`
      }

      const response = await fetch(url, { cache: 'no-store' })
      const data = await response.json()
      
      if (data.leads && data.leads.length > 0) {
        setLeads(data.leads)
        console.log(`✅ Cargados ${data.leads.length} leads de ${data.pagination?.total || 'N/A'} totales`)
      } else {
        setLeads([])
        console.log("ℹ️ No se encontraron leads")
      }
    } catch (error) {
      console.error("Error loading leads:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 🔄 SUPABASE REALTIME - Actualización automática sin recargar
  useEffect(() => {
    const supabase = supabaseRef.current
    if (!supabase) return

    console.log("🔌 Conectando a Supabase Realtime...")

    // Suscribirse a cambios en la tabla leads
    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'leads',
        },
        (payload: RealtimePostgresChangesPayload<Lead>) => {
          console.log('📥 Cambio en tiempo real:', payload.eventType, payload.new || payload.old)
          
          if (payload.eventType === 'INSERT') {
            const newLead = payload.new as Lead
            // Solo agregar si coincide con el filtro de agencia actual
            // Y si es un lead de Trello (tiene trello_list_id) cuando estamos usando Trello Kanban
            const isTrelloLead = newLead.trello_list_id !== null && newLead.trello_list_id !== undefined
            const shouldAdd = (selectedAgencyId === "ALL" || newLead.agency_id === selectedAgencyId)
            
            if (shouldAdd) {
              setLeads((prev) => {
                // Evitar duplicados
                if (prev.some(l => l.id === newLead.id)) return prev
                if (isTrelloLead) {
                  toast.success(`🆕 Nuevo lead de Trello: ${newLead.contact_name}`, { duration: 3000 })
                }
                return [newLead, ...prev]
              })
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedLead = payload.new as Lead
            const oldLead = payload.old as Lead
            
            // Si cambió el trello_list_id, es un movimiento de lista - recargar todos los leads
            if (oldLead?.trello_list_id !== updatedLead.trello_list_id) {
              console.log('📋 Lista de Trello cambiada, recargando leads...')
              // Recargar todos los leads para asegurar orden correcto
              if (selectedAgencyId && selectedAgencyId !== "ALL") {
                loadLeads(selectedAgencyId, selectedTrelloListId)
              }
            } else {
              // Actualizar el lead en la lista actual
              setLeads((prev) => 
                prev.map((lead) => 
                  lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead
                )
              )
            }
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

    // Cleanup al desmontar
    return () => {
      console.log('🔌 Desconectando de Supabase Realtime...')
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, selectedTrelloListId, loadLeads])

  // Cargar leads cuando cambia la agencia seleccionada o el filtro de lista
  useEffect(() => {
    // SIEMPRE cargar leads desde la API cuando se selecciona una agencia
    // Esto asegura que se carguen todos los leads (hasta 2000) y no solo los initialLeads
    if (selectedAgencyId && selectedAgencyId !== "ALL") {
      // Si es la carga inicial, usar un delay más corto
      const delay = initialLoad ? 50 : 100
      const timer = setTimeout(() => {
        loadLeads(selectedAgencyId, selectedTrelloListId)
        if (initialLoad) {
          setInitialLoad(false)
        }
      }, delay)
      return () => clearTimeout(timer)
    } else if (selectedAgencyId === "ALL") {
      // Si se selecciona "Todas las agencias", usar los initialLeads (solo Trello)
      setLeads(initialLeads)
      if (initialLoad) {
        setInitialLoad(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, selectedTrelloListId, loadLeads, initialLeads])

  const handleRefresh = async () => {
    await loadLeads(selectedAgencyId, selectedTrelloListId)
  }

  const handleRefreshLeads = async () => {
    if (selectedAgencyId === "ALL") {
      // Si es "ALL", solo recargar desde BD
      await loadLeads(selectedAgencyId, selectedTrelloListId)
      return
    }

    setSyncingTrello(true)
    try {
      // Usar sincronización rápida con Trello
      const response = await fetch("/api/trello/sync-quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId: selectedAgencyId }),
      })

      const data = await response.json()

      if (data.success) {
        const summary = data.summary
        toast.success(
          `✅ Sincronizado: ${summary.created || 0} nuevos, ${summary.updated || 0} actualizados, ${summary.deleted || 0} eliminados`,
          { duration: 3000 }
        )
        
        // Recargar leads desde BD después de la sincronización
        await loadLeads(selectedAgencyId, selectedTrelloListId)
      } else {
        toast.error(data.error || "Error al sincronizar con Trello")
      }
    } catch (error: any) {
      console.error("Error syncing Trello:", error)
      toast.error("Error al sincronizar con Trello")
    } finally {
      setSyncingTrello(false)
    }
  }

  const handleRefreshLeadsOld = async () => {
    if (!selectedAgencyId || selectedAgencyId === "ALL") {
      toast.error("Selecciona una agencia específica para refrescar leads")
      return
    }

    setSyncingTrello(true)
    try {
      // Simplemente recargar los leads desde la BD (sin sincronizar con Trello)
      // Esto es mucho más rápido y trae los leads actualizados
      await loadLeads(selectedAgencyId, selectedTrelloListId)
      toast.success("✅ Leads actualizados", { duration: 2000 })
    } catch (error) {
      console.error("Error refreshing leads:", error)
      toast.error("Error al refrescar leads")
    } finally {
      setSyncingTrello(false)
    }
  }


  // Los leads ya vienen filtrados del servidor (solo Trello)
  // SIEMPRE usar Trello Kanban si hay leads con trello_list_id
  const trelloLeads = useMemo(
    () => leads.filter((lead) => lead.trello_list_id !== null && lead.trello_list_id !== undefined),
    [leads]
  )
  const hasTrelloLeadsInState = trelloLeads.length > 0
  
  // Usar la agencia seleccionada o la primera disponible
  const effectiveAgencyId = selectedAgencyId !== "ALL" 
    ? selectedAgencyId 
    : (trelloLeads[0] as any)?.agency_id || agencies[0]?.id || defaultAgencyId
  
  // FORZAR uso de Trello Kanban si hay leads con trello_list_id Y tenemos agencyId
  const shouldUseTrelloKanban = hasTrelloLeadsInState && !!effectiveAgencyId && effectiveAgencyId !== "ALL"

  // Si hay leads de Trello, SIEMPRE usar el Kanban de Trello
  const KanbanComponent = shouldUseTrelloKanban ? (
    <LeadsKanbanTrello 
      leads={trelloLeads as any} 
      agencyId={effectiveAgencyId!}
      agencies={agencies}
      sellers={sellers}
      operators={operators}
      onRefresh={handleRefresh}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      initialLeadId={initialLeadId}
    />
  ) : (
    <LeadsKanban 
      leads={leads as any}
      agencies={agencies}
      sellers={sellers}
      operators={operators}
      onRefresh={handleRefresh}
      initialLeadId={initialLeadId}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
    />
  )

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
                    <p className="text-xs mb-2"><strong>Leads:</strong> Oportunidades de venta en etapa inicial. Pueden venir de formularios web, Trello, o creación manual.</p>
                    <p className="text-xs mb-2"><strong>Conversión:</strong> Cuando un lead se convierte en operación, todos los datos se transfieren automáticamente y el lead se marca como ganado.</p>
                    <p className="text-xs">Los leads pueden estar sincronizados con Trello. El sistema actualiza automáticamente cuando hay cambios en tiempo real.</p>
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
            {shouldUseTrelloKanban 
              ? "Leads sincronizados desde Trello • Actualización automática" 
              : "Gestiona tus leads y oportunidades"}
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
          {shouldUseTrelloKanban && selectedAgencyId !== "ALL" && (
            <Button
              variant="outline"
              onClick={handleRefreshLeads}
              disabled={syncingTrello}
              title="Sincronizar con Trello y actualizar leads"
            >
              {syncingTrello ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Actualizando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Actualizar Leads
                </>
              )}
            </Button>
          )}
          <Button onClick={() => setNewLeadDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Lead
          </Button>
        </div>
      </div>

      <Tabs defaultValue="kanban" className="w-full">
        <TabsList>
          <TabsTrigger value="kanban">
            {shouldUseTrelloKanban ? "Kanban Trello" : "Kanban"}
          </TabsTrigger>
          <TabsTrigger value="table">Tabla</TabsTrigger>
        </TabsList>
        <TabsContent value="kanban">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Cargando leads...</p>
            </div>
          ) : (
            KanbanComponent
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
