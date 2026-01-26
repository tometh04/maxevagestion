"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
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
  assigned_seller_id: string | null
  users?: { name: string; email: string } | null
  agencies?: { name: string } | null
}

interface CRMManychatPageClientProps {
  initialLeads: Lead[]
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  defaultAgencyId?: string
  defaultSellerId?: string
  currentUserId?: string
  currentUserRole?: string
}

export function CRMManychatPageClient({
  initialLeads,
  agencies,
  sellers,
  operators,
  defaultAgencyId,
  defaultSellerId,
  currentUserId,
  currentUserRole,
}: CRMManychatPageClientProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [newLeadDialogOpen, setNewLeadDialogOpen] = useState(false)
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(defaultAgencyId || agencies[0]?.id || "ALL")
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
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

  // Cargar leads: Manychat (nuevos) + Trello con list_name (migración visual)
  // OPTIMIZACIÓN Fase 2: límite 200 por fuente (antes 5000)
  const loadLeads = useCallback(async (agencyId: string) => {
    setLoading(true)
    try {
      const limit = 200
      const manychatUrl = agencyId === "ALL"
        ? `/api/leads?page=1&limit=${limit}&source=Manychat`
        : `/api/leads?agencyId=${agencyId}&page=1&limit=${limit}&source=Manychat`
      const trelloUrl = agencyId === "ALL"
        ? `/api/leads?page=1&limit=${limit}&source=Trello`
        : `/api/leads?agencyId=${agencyId}&page=1&limit=${limit}&source=Trello`

      const [manychatResponse, trelloResponse] = await Promise.all([
        fetch(manychatUrl, { cache: 'no-store' }),
        fetch(trelloUrl, { cache: 'no-store' })
      ])
      
      const manychatData = await manychatResponse.json()
      const trelloData = await trelloResponse.json()
      
      // Filtrar leads de Trello que tienen list_name asignado (migración visual)
      const trelloLeadsWithListName = (trelloData.leads || []).filter((lead: any) => lead.list_name)
      
      // Combinar: Manychat (nuevos) + Trello con list_name (migración visual)
      const allLeads = [
        ...(manychatData.leads || []),
        ...trelloLeadsWithListName
      ]
      
      if (allLeads.length > 0) {
        setLeads(allLeads)
        console.log(`✅ Cargados ${manychatData.leads?.length || 0} leads de Manychat + ${trelloLeadsWithListName.length} de Trello (con list_name)`)
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

    console.log("🔌 Conectando a Supabase Realtime para Manychat...")

    // Suscribirse a cambios en la tabla leads (Manychat + Trello con list_name)
    // Manychat: nuevos leads en tiempo real
    // Trello: leads con list_name (migración visual)
    const channel = supabase
      .channel('crm-manychat-leads-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          // Escuchar leads de Manychat Y leads de Trello con list_name
        },
        (payload: RealtimePostgresChangesPayload<Lead>) => {
          console.log('📥 Cambio en tiempo real (Manychat):', payload.eventType, payload.new || payload.old)
          
          if (payload.eventType === 'INSERT') {
            const newLead = payload.new as Lead
            const shouldAdd = (selectedAgencyId === "ALL" || newLead.agency_id === selectedAgencyId)
            
            if (shouldAdd) {
              setLeads((prev) => {
                if (prev.some(l => l.id === newLead.id)) return prev
                const sourceLabel = newLead.source === "Manychat" ? "Manychat" : "Trello"
                toast.success(`🆕 Nuevo lead de ${sourceLabel}: ${newLead.contact_name}`, { duration: 3000 })
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
        console.log('📡 Estado de Realtime (Manychat):', status)
        setRealtimeConnected(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') {
          console.log('✅ Conectado a Supabase Realtime para Manychat')
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
      if (initialLoad) {
        setInitialLoad(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId, loadLeads, initialLeads])

  const handleRefresh = async () => {
    await loadLeads(selectedAgencyId)
  }

  // Filtrar leads que tienen list_name asignado (Manychat + Trello migrados)
  const leadsWithListName = useMemo(
    () => leads.filter((lead) => lead.list_name),
    [leads]
  )
  const hasLeadsWithListName = leadsWithListName.length > 0
  const effectiveAgencyId = selectedAgencyId !== "ALL" 
    ? selectedAgencyId 
    : (leadsWithListName[0] as any)?.agency_id || agencies[0]?.id || defaultAgencyId
  const shouldUseManychatKanban = hasLeadsWithListName && !!effectiveAgencyId && effectiveAgencyId !== "ALL"

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
            <BreadcrumbPage>CRM Manychat</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">CRM Manychat</h1>
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
            Leads desde Manychat • Actualización en tiempo real
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
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
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
          <Button onClick={() => setNewLeadDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Lead
          </Button>
        </div>
      </div>

      {/* Usar LeadsKanbanManychat para agrupar por list_name */}
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
          ) : shouldUseManychatKanban ? (
            <LeadsKanbanManychat 
              leads={leadsWithListName as any} 
              agencyId={effectiveAgencyId!}
              agencies={agencies}
              sellers={sellers}
              operators={operators}
              onRefresh={handleRefresh}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          ) : (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">No hay leads con list_name asignado. Los nuevos leads aparecerán aquí automáticamente.</p>
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

