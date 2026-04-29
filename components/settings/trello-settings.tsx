"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Link2, Key, ArrowRightLeft, Webhook, RefreshCw as SyncIcon } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

const credentialsSchema = z.object({
  apiKey: z.string().min(1, "La API Key es requerida"),
  token: z.string().min(1, "El Token es requerido"),
  boardId: z.string().min(1, "El Board ID es requerido"),
})

type CredentialsFormValues = z.infer<typeof credentialsSchema>

interface TrelloSettingsProps {
  agencies: Array<{ id: string; name: string }>
  defaultAgencyId: string | null
}

const STATUS_OPTIONS = ["NEW", "IN_PROGRESS", "QUOTED", "WON", "LOST"] as const
const REGION_OPTIONS = ["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"] as const

export function TrelloSettings({ agencies, defaultAgencyId }: TrelloSettingsProps) {
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(defaultAgencyId)
  const agencyId = selectedAgencyId
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [lists, setLists] = useState<Array<{ id: string; name: string }>>([])
  const [statusMapping, setStatusMapping] = useState<Record<string, string>>({})
  const [regionMapping, setRegionMapping] = useState<Record<string, string>>({})
  const [syncResult, setSyncResult] = useState<{ total: number; created: number; updated: number; incremental?: boolean; lastSyncAt?: string | null; errors?: number; error?: string; rateLimited?: number } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [forceFullSync, setForceFullSync] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; status: string; created: number; updated: number; errors: number } | null>(null)
  const [webhooks, setWebhooks] = useState<Array<{ id: string; callbackURL: string; active: boolean; description: string }>>([])
  const [webhookUrl, setWebhookUrl] = useState("")
  const [webhookLoading, setWebhookLoading] = useState(false)

  const form = useForm<CredentialsFormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      apiKey: "",
      token: "",
      boardId: "",
    },
  })

  useEffect(() => {
    // Resetear estados cuando cambia la agencia
    setLists([])
    setStatusMapping({})
    setRegionMapping({})
    setWebhooks([])
    setTestResult(null)
    setSyncResult(null)
    form.reset({
      apiKey: "",
      token: "",
      boardId: "",
    })
    
    if (agencyId) {
      loadSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId])

  const loadSettings = async () => {
    if (!agencyId) return

    try {
      const res = await fetch(`/api/settings/trello?agencyId=${agencyId}`)
      const data = await res.json()

      if (data.settings) {
        form.reset({
          apiKey: data.settings.trello_api_key || "",
          token: data.settings.trello_token || "",
          boardId: data.settings.board_id || "",
        })
        setStatusMapping((data.settings.list_status_mapping as Record<string, string>) || {})
        setRegionMapping((data.settings.list_region_mapping as Record<string, string>) || {})
        setLastSyncAt(data.settings.last_sync_at || null)

        // Load lists if we have credentials
        if (data.settings.trello_api_key && data.settings.trello_token && data.settings.board_id) {
          loadLists()
          loadWebhooks()
        }
        
        // Set webhook URL from environment or construct it
        if (typeof window !== "undefined") {
          const baseUrl = window.location.origin
          setWebhookUrl(`${baseUrl}/api/trello/webhook`)
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error)
    }
  }

  const loadLists = async () => {
    if (!agencyId) return

    try {
      const res = await fetch(`/api/trello/lists?agencyId=${agencyId}`)
      const data = await res.json()
      setLists(data.lists || [])
    } catch (error) {
      console.error("Error loading lists:", error)
    }
  }

  const handleTestConnection = async () => {
    const values = form.getValues()
    if (!values.apiKey || !values.token) {
      setTestResult("❌ Por favor completa API Key y Token")
      return
    }

    setLoading(true)
    setTestResult(null)

    try {
      // Usar el nuevo endpoint de validación
      const res = await fetch("/api/trello/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: values.apiKey,
          token: values.token,
          boardId: values.boardId || undefined,
        }),
      })
      const data = await res.json()
      if (data.valid) {
        let message = `✅ ${data.message || "Credenciales válidas"}`
        if (data.member) {
          message += `\n👤 Usuario: ${data.member.fullName || data.member.username}`
        }
        if (data.board) {
          message += `\n📋 Board: ${data.board.name} (${data.listsCount || 0} listas)`
        }
        setTestResult(message)
        // Load lists after successful connection if boardId was provided
        if (values.boardId) {
          await loadLists()
        }
      } else {
        setTestResult(`❌ ${data.error || "Credenciales inválidas"}`)
      }
    } catch (error: any) {
      setTestResult(`❌ Error: ${error.message || "Error al validar"}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCredentials = async (values: CredentialsFormValues) => {
    if (!agencyId) {
      setTestResult("❌ No hay agencia seleccionada")
      return
    }

    setLoading(true)
    setTestResult(null)
    
    try {
      // MEJORA: Validar credenciales ANTES de guardar
      const validateRes = await fetch("/api/trello/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: values.apiKey,
          token: values.token,
          boardId: values.boardId,
        }),
      })
      
      const validateData = await validateRes.json()
      
      if (!validateData.valid) {
        setTestResult(`❌ ${validateData.error || "Credenciales inválidas"}`)
        setLoading(false)
        return
      }

      // Si la validación fue exitosa, guardar
      const res = await fetch("/api/settings/trello", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId,
          trello_api_key: values.apiKey,
          trello_token: values.token,
          board_id: values.boardId,
          list_status_mapping: statusMapping,
          list_region_mapping: regionMapping,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult(`✅ ${validateData.message || "Credenciales guardadas correctamente"}`)
        await loadLists()
      } else {
        setTestResult(`❌ ${data.error || "Error al guardar"}`)
      }
    } catch (error: any) {
      setTestResult(`❌ Error: ${error.message || "Error al guardar"}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    if (!agencyId) {
      setSyncResult(null)
      return
    }

    setSyncing(true)
    setSyncResult(null)
    setSyncProgress({ current: 0, total: 0, status: "Iniciando sincronización...", created: 0, updated: 0, errors: 0 })

    // Iniciar sincronización
    const startTime = Date.now()
    let progressInterval: NodeJS.Timeout | null = null

    try {
      // Mostrar progreso estimado basado en tiempo con barra animada
      let progressValue = 0
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime
        const seconds = Math.floor(elapsed / 1000)
        // Simular progreso animado (0-90%) mientras espera respuesta
        progressValue = Math.min(90, Math.floor((elapsed / 100) % 100))
        setSyncProgress(prev => prev ? {
          ...prev,
          current: progressValue,
          total: 100,
          status: `Sincronizando... (${seconds}s)`
        } : null)
      }, 500) // Actualizar cada 500ms para animación más suave

      // Timeout de 5 minutos para la sincronización
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)

      const res = await fetch("/api/trello/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, forceFullSync }),
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      const data = await res.json()
      
      if (progressInterval) {
        clearInterval(progressInterval)
      }

      if (res.ok && data.success) {
        setSyncResult(data.summary)
        // Mostrar progreso final (100%)
        setSyncProgress({
          current: data.summary.totalCards || data.summary.total || 100,
          total: data.summary.totalCards || data.summary.total || 100,
          status: "✅ Sincronización completada",
          created: data.summary.created || 0,
          updated: data.summary.updated || 0,
          errors: data.summary.errors || 0
        })
        // Actualizar lastSyncAt si está disponible
        if (data.summary.lastSyncAt !== undefined) {
          setLastSyncAt(data.summary.lastSyncAt)
        }
        // Recargar settings para obtener el nuevo last_sync_at
        await loadSettings()
      } else {
        setSyncResult({ total: 0, created: 0, updated: 0, error: data.error || "Error desconocido" })
        setSyncProgress(null)
      }
    } catch (error: any) {
      console.error("Error syncing:", error)
      let errorMessage = "Error al sincronizar"
      
      if (error.name === "AbortError") {
        errorMessage = "La sincronización tardó demasiado (timeout de 5 minutos). Intenta nuevamente."
      } else if (error.message?.includes("Failed to fetch") || error.message?.includes("ERR_CONNECTION_CLOSED")) {
        errorMessage = "Error de conexión con el servidor. Verifica tu conexión a internet o intenta más tarde."
      } else {
        errorMessage = error.message || "Error al sincronizar"
      }
      
      setSyncResult({ total: 0, created: 0, updated: 0, error: errorMessage })
      setSyncProgress({
        current: 0,
        total: 100,
        status: "❌ Error en sincronización",
        created: 0,
        updated: 0,
        errors: 1
      })
      if (progressInterval) {
        clearInterval(progressInterval)
      }
    } finally {
      setSyncing(false)
      if (progressInterval) {
        clearInterval(progressInterval)
      }
      // Limpiar progreso después de 5 segundos
      setTimeout(() => {
        setSyncProgress(null)
      }, 5000)
    }
  }

  const loadWebhooks = async () => {
    if (!agencyId) return

    try {
      const res = await fetch(`/api/trello/webhooks?agencyId=${agencyId}`)
      const data = await res.json()
      setWebhooks(data.webhooks || [])
    } catch (error) {
      console.error("Error loading webhooks:", error)
    }
  }

  const handleRegisterWebhook = async () => {
    if (!agencyId || !webhookUrl) {
      setTestResult("❌ URL del webhook requerida")
      return
    }

    setWebhookLoading(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/trello/webhooks/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, webhookUrl }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTestResult("✅ Webhook registrado correctamente")
        await loadWebhooks()
      } else {
        const errorMsg = data.error || "Error al registrar webhook"
        console.error("Webhook registration error:", data)
        setTestResult(`❌ ${errorMsg}`)
      }
    } catch (error) {
      console.error("Webhook registration exception:", error)
      setTestResult(`❌ Error: ${error instanceof Error ? error.message : "Error desconocido"}`)
    } finally {
      setWebhookLoading(false)
    }
  }

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!agencyId) return

    setWebhookLoading(true)
    try {
      const res = await fetch(`/api/trello/webhooks?id=${webhookId}&agencyId=${agencyId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setTestResult("✅ Webhook eliminado correctamente")
        await loadWebhooks()
      } else {
        setTestResult("❌ Error al eliminar webhook")
      }
    } catch (error) {
      setTestResult("❌ Error al eliminar webhook")
    } finally {
      setWebhookLoading(false)
    }
  }

  const selectedAgencyName = agencies.find((a) => a.id === selectedAgencyId)?.name || ""

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
            <Link2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Configuración Trello</h2>
            {selectedAgencyName && (
              <p className="text-sm text-muted-foreground">Configurando para: {selectedAgencyName}</p>
            )}
          </div>
        </div>
        {agencies.length > 0 && (
          <div className="flex items-center gap-2">
            <Label htmlFor="trello-agency-select">Agencia:</Label>
            <Select
              value={selectedAgencyId || ""}
              onValueChange={(value) => setSelectedAgencyId(value || null)}
            >
              <SelectTrigger id="trello-agency-select" className="w-[200px]">
                <SelectValue placeholder="Seleccionar agencia" />
              </SelectTrigger>
              <SelectContent>
                {agencies.map((agency) => (
                  <SelectItem key={agency.id} value={agency.id}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!agencyId && agencies.length === 0 ? (
        <Alert>
          <AlertDescription>
            No hay agencias disponibles. Por favor crea una agencia primero.
          </AlertDescription>
        </Alert>
      ) : !agencyId ? (
        <Alert>
          <AlertDescription>
            Por favor selecciona una agencia para configurar Trello.
          </AlertDescription>
        </Alert>
      ) : (
        <>

      <Tabs defaultValue="credentials" className="w-full">
        <TabsList>
          <TabsTrigger value="credentials">Credenciales</TabsTrigger>
          <TabsTrigger value="mapping">Mapeo</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="sync">Sincronización</TabsTrigger>
        </TabsList>

        <TabsContent value="credentials">
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                <Key className="h-3.5 w-3.5 text-primary" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Credenciales de Trello</h4>
            </div>
            <p className="text-sm text-muted-foreground">Ingresa tus credenciales de API de Trello para sincronizar tarjetas</p>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSaveCredentials)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Key</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Tu API Key de Trello" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="token"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Token</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Tu Token de Trello" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="boardId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Board ID</FormLabel>
                        <FormControl>
                          <Input placeholder="ID del tablero" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={handleTestConnection} disabled={loading}>
                      {loading ? "Probando..." : "Probar Conexión"}
                    </Button>
                    <Button type="submit" size="sm" variant="outline" disabled={loading}>
                      Guardar
                    </Button>
                  </div>
                  {testResult && (
                    <Alert>
                      <AlertDescription>{testResult}</AlertDescription>
                    </Alert>
                  )}
                </form>
              </Form>
          </div>
        </TabsContent>

        <TabsContent value="mapping">
          <div className="space-y-4">
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Mapeo de Estados</h4>
              </div>
              <p className="text-sm text-muted-foreground">Configura cómo se mapean las listas de Trello a estados de leads</p>
                {lists.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Primero guarda las credenciales y prueba la conexión para cargar las listas.
                  </p>
                ) : (
                  <div className="rounded-xl border border-border/40 overflow-hidden">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted/50">
                        <TableRow>
                          <TableHead>Lista de Trello</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lists.map((list) => (
                          <TableRow key={list.id}>
                            <TableCell className="font-medium">{list.name}</TableCell>
                            <TableCell>
                              <Select
                                value={statusMapping[list.id] || ""}
                                onValueChange={(value) => {
                                  setStatusMapping({ ...statusMapping, [list.id]: value })
                                }}
                              >
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue placeholder="Seleccionar estado" />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {status}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Mapeo de Regiones</h4>
              </div>
              <p className="text-sm text-muted-foreground">Configura cómo se mapean las listas de Trello a regiones</p>
                {lists.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Primero guarda las credenciales y prueba la conexión para cargar las listas.
                  </p>
                ) : (
                  <div className="rounded-xl border border-border/40 overflow-hidden">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted/50">
                        <TableRow>
                          <TableHead>Lista de Trello</TableHead>
                          <TableHead>Región</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lists.map((list) => (
                          <TableRow key={list.id}>
                            <TableCell className="font-medium">{list.name}</TableCell>
                            <TableCell>
                              <Select
                                value={regionMapping[list.id] || ""}
                                onValueChange={(value) => {
                                  setRegionMapping({ ...regionMapping, [list.id]: value })
                                }}
                              >
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue placeholder="Seleccionar región" />
                                </SelectTrigger>
                                <SelectContent>
                                  {REGION_OPTIONS.map((region) => (
                                    <SelectItem key={region} value={region}>
                                      {region}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
            </div>

            {lists.length > 0 && (
              <div className="flex justify-end">
                <Button size="sm"
                  onClick={async () => {
                    const values = form.getValues()
                    if (values.apiKey && values.token && values.boardId) {
                      await handleSaveCredentials(values)
                    }
                  }}
                >
                  Guardar Mapeos
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="webhooks">
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                <Webhook className="h-3.5 w-3.5 text-primary" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Webhooks en Tiempo Real</h4>
            </div>
            <p className="text-sm text-muted-foreground">Configura webhooks para sincronización automática en tiempo real. Cuando se crea, actualiza o mueve una tarjeta en Trello, se sincronizará automáticamente.</p>
              <div className="space-y-2">
                <Label>URL del Webhook</Label>
                <div className="flex gap-2">
                  <Input
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://tu-dominio.com/api/trello/webhook"
                  />
                  <Button size="sm" onClick={handleRegisterWebhook} disabled={webhookLoading || !webhookUrl}>
                    {webhookLoading ? "Registrando..." : "Registrar Webhook"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  ⚠️ La URL debe ser pública. Para desarrollo local, usa ngrok o similar.
                </p>
              </div>

              {webhooks.length > 0 && (
                <div className="space-y-2">
                  <Label>Webhooks Activos</Label>
                  <div className="rounded-xl border border-border/40 overflow-hidden">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted/50">
                        <TableRow>
                          <TableHead>URL</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {webhooks.map((webhook) => (
                          <TableRow key={webhook.id}>
                            <TableCell className="font-mono text-xs">{webhook.callbackURL}</TableCell>
                            <TableCell>
                              <span className={webhook.active ? "text-warning" : "text-destructive"}>
                                {webhook.active ? "✅ Activo" : "❌ Inactivo"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button
                                className="text-destructive"
                                size="sm"
                                onClick={() => handleDeleteWebhook(webhook.id)}
                                disabled={webhookLoading}
                              >
                                Eliminar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {testResult && (
                <Alert>
                  <AlertDescription>{testResult}</AlertDescription>
                </Alert>
              )}
          </div>
        </TabsContent>

        <TabsContent value="sync">
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                <SyncIcon className="h-3.5 w-3.5 text-primary" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Sincronización Manual</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              {lastSyncAt
                ? `Sincronización incremental: solo se actualizarán las tarjetas modificadas desde ${new Date(lastSyncAt).toLocaleString('es-AR')}`
                : "Ejecuta la sincronización manual con Trello. La primera vez sincronizará todas las tarjetas. Las siguientes serán incrementales (solo cambios)."
              }
            </p>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="forceFullSync"
                  checked={forceFullSync}
                  onChange={(e) => setForceFullSync(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="forceFullSync" className="text-sm font-medium">
                  Forzar sincronización completa (ignorar checkpoint)
                </label>
              </div>
              <Button size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? "Sincronizando..." : forceFullSync ? "Ejecutar Sincronización Completa" : "Ejecutar Sincronización"}
              </Button>
              
              {/* Barra de progreso */}
              {syncing && syncProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{syncProgress.status}</span>
                    <span className="text-muted-foreground">
                      {syncProgress.current} / {syncProgress.total} tarjetas
                    </span>
                  </div>
                  <Progress 
                    value={syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0} 
                    className="h-2"
                  />
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>✅ Creados: {syncProgress.created}</span>
                    <span>🔄 Actualizados: {syncProgress.updated}</span>
                    {syncProgress.errors > 0 && <span>❌ Errores: {syncProgress.errors}</span>}
                  </div>
                </div>
              )}

              {syncResult && (
                <Alert variant={syncResult.error || (syncResult.errors && syncResult.errors > 0) ? "destructive" : "default"}>
                  <AlertDescription>
                    <div className="space-y-1">
                      {syncResult.error ? (
                        <>
                          <div>❌ Error en sincronización</div>
                          <div className="text-sm">{syncResult.error}</div>
                        </>
                      ) : (
                        <>
                          <div>✅ Sincronización {syncResult.incremental ? "incremental" : "completa"} completada</div>
                          <div className="text-sm">
                            Total: {syncResult.total} | Creados: {syncResult.created} | Actualizados: {syncResult.updated}
                            {syncResult.errors && syncResult.errors > 0 && ` | Errores: ${syncResult.errors}`}
                            {syncResult.rateLimited && syncResult.rateLimited > 0 && ` | Rate limits: ${syncResult.rateLimited}`}
                          </div>
                          {syncResult.incremental && syncResult.lastSyncAt && (
                            <div className="text-xs text-muted-foreground">
                              Última sincronización: {new Date(syncResult.lastSyncAt).toLocaleString('es-AR')}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
          </div>
        </TabsContent>
      </Tabs>
        </>
      )}
    </div>
  )
}
