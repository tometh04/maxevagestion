"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
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
import { Plus, RefreshCw, Loader2, Wifi, WifiOff } from "lucide-react"
import { toast } from "sonner"
import { createBrowserClient } from "@supabase/ssr"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"

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
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [newLeadDialogOpen, setNewLeadDialogOpen] = useState(false)
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(defaultAgencyId || agencies[0]?.id || "ALL")
  const [selectedTrelloListId, setSelectedTrelloListId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [syncingTrello, setSyncingTrello] = useState(false)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

  // Inicializar Supabase client para Realtime
  useEffect(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
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
            if (selectedAgencyId === "ALL" || newLead.agency_id === selectedAgencyId) {
              setLeads((prev) => {
                // Evitar duplicados
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
            // toast.info(`✏️ Lead actualizado: ${updatedLead.contact_name}`, { duration: 2000 })
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
  }, [selectedAgencyId])

  // Cargar leads cuando cambia la agencia seleccionada o el filtro de lista
  useEffect(() => {
    if (initialLoad) {
      setInitialLoad(false)
      // Cargar leads iniciales según la agencia seleccionada
      if (selectedAgencyId && selectedAgencyId !== defaultAgencyId) {
        loadLeads(selectedAgencyId, selectedTrelloListId)
      }
      return
    }
    loadLeads(selectedAgencyId, selectedTrelloListId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, selectedTrelloListId])

  const loadLeads = async (agencyId: string, trelloListId: string | null = null) => {
    setLoading(true)
    try {
      // Cargar TODOS los leads (hasta 10000 para evitar problemas de memoria)
      // Usar paginación si es necesario
      let allLeads: Lead[] = []
      let offset = 0
      const limit = 5000 // Cargar en batches grandes
      let hasMore = true

      while (hasMore) {
        let url = agencyId === "ALL"
          ? `/api/leads?limit=${limit}&offset=${offset}`
          : `/api/leads?agencyId=${agencyId}&limit=${limit}&offset=${offset}`
        
        if (trelloListId && trelloListId !== "ALL") {
          url += `&trelloListId=${trelloListId}`
        }
        
        // Cache busting para asegurar datos frescos
        url += `&_t=${Date.now()}`

        const response = await fetch(url, { cache: 'no-store' })
        const data = await response.json()
        
        if (data.leads && data.leads.length > 0) {
          allLeads = [...allLeads, ...data.leads]
          offset += data.leads.length
          hasMore = data.pagination?.hasMore || data.leads.length === limit
        } else {
          hasMore = false
        }
      }

      setLeads(allLeads)
      console.log(`✅ Cargados ${allLeads.length} leads`)
    } catch (error) {
      console.error("Error loading leads:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    await loadLeads(selectedAgencyId, selectedTrelloListId)
  }

  const handleSyncTrello = async (forceFullSync = false) => {
    if (!selectedAgencyId || selectedAgencyId === "ALL") {
      toast.error("Selecciona una agencia específica para sincronizar con Trello")
      return
    }

    setSyncingTrello(true)
    try {
      const response = await fetch("/api/trello/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId: selectedAgencyId, forceFullSync }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        const syncType = data.summary.incremental ? "incremental" : "completa"
        toast.success(
          `Sincronización ${syncType} completada: ${data.summary.total} tarjetas (${data.summary.created} nuevas, ${data.summary.updated} actualizadas)`
        )
        // Recargar leads después de sincronizar
        await loadLeads(selectedAgencyId)
      } else {
        toast.error(data.error || "Error al sincronizar con Trello")
      }
    } catch (error) {
      console.error("Error syncing Trello:", error)
      toast.error("Error al sincronizar con Trello")
    } finally {
      setSyncingTrello(false)
    }
  }

  // Los leads ya vienen filtrados del servidor
  const filteredLeads = leads

  // SIEMPRE usar Trello Kanban si hay leads con trello_list_id
  // Verificar si hay leads con trello_list_id (independientemente del source)
  // Usar useMemo para evitar recalcular en cada render
  const trelloLeads = useMemo(
    () => filteredLeads.filter((lead) => lead.trello_list_id !== null && lead.trello_list_id !== undefined),
    [filteredLeads]
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
    />
  ) : (
    <LeadsKanban 
      leads={filteredLeads as any}
      agencies={agencies}
      sellers={sellers}
      operators={operators}
      onRefresh={handleRefresh}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
    />
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Leads</h1>
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
            {shouldUseTrelloKanban ? "Leads sincronizados desde Trello • Actualización automática" : "Gestiona tus leads y oportunidades"}
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
              onClick={() => handleSyncTrello(false)}
              disabled={syncingTrello}
            >
              {syncingTrello ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sincronizar Trello
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
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Cargando leads...</p>
            </div>
          ) : (
            <LeadsTable
              leads={filteredLeads as any}
              agencies={agencies}
              sellers={sellers}
              operators={operators}
              onRefresh={handleRefresh}
            />
          )}
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
