"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { 
  Plus, Plug, Zap, CheckCircle, XCircle, AlertCircle, 
  RefreshCw, Settings2, Trash2, Play, Clock, 
  FileText, Mail, MessageSquare, Calendar, Webhook,
  ExternalLink
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface Integration {
  id: string
  name: string
  integration_type: string
  description?: string
  status: 'active' | 'inactive' | 'error' | 'pending'
  config: Record<string, any>
  sync_enabled: boolean
  sync_frequency?: string
  last_sync_at?: string
  error_message?: string
  created_at: string
  updated_at: string
}

interface IntegrationLog {
  id: string
  log_type: string
  action: string
  message: string
  details?: Record<string, any>
  duration_ms?: number
  created_at: string
}

const integrationTypes = [
  { value: 'trello', label: 'Trello', icon: FileText, color: 'bg-blue-500' },
  { value: 'manychat', label: 'Manychat', icon: MessageSquare, color: 'bg-purple-500' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'bg-green-500' },
  { value: 'afip', label: 'AFIP', icon: FileText, color: 'bg-sky-500' },
  { value: 'email', label: 'Email/SMTP', icon: Mail, color: 'bg-orange-500' },
  { value: 'calendar', label: 'Calendario', icon: Calendar, color: 'bg-red-500' },
  { value: 'webhook', label: 'Webhook', icon: Webhook, color: 'bg-gray-500' },
  { value: 'zapier', label: 'Zapier', icon: Zap, color: 'bg-amber-500' },
  { value: 'other', label: 'Otro', icon: Plug, color: 'bg-slate-500' },
]

const statusConfig = {
  active: { label: 'Activo', color: 'bg-green-500', icon: CheckCircle },
  inactive: { label: 'Inactivo', color: 'bg-gray-500', icon: XCircle },
  error: { label: 'Error', color: 'bg-red-500', icon: AlertCircle },
  pending: { label: 'Pendiente', color: 'bg-yellow-500', icon: Clock },
}

export function IntegrationsPageClient() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, error: 0 })
  const [loading, setLoading] = useState(true)
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [logs, setLogs] = useState<IntegrationLog[]>([])
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [testing, setTesting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    integration_type: '',
    description: '',
    config: {} as Record<string, string>,
    sync_enabled: false,
    sync_frequency: 'manual',
  })

  // AFIP setup form state
  const [afipSetupData, setAfipSetupData] = useState({
    agency_id: '',
    cuit: '',
    clave_fiscal: '',
    point_of_sale: 1,
    environment: 'sandbox' as 'sandbox' | 'production',
  })
  const [agencies, setAgencies] = useState<Array<{ id: string; name: string }>>([])
  const [settingUpAfip, setSettingUpAfip] = useState(false)

  useEffect(() => {
    loadIntegrations()
    loadAgencies()
  }, [])

  async function loadAgencies() {
    try {
      const res = await fetch('/api/agencies')
      if (res.ok) {
        const data = await res.json()
        setAgencies(data.agencies || [])
        if (data.agencies && data.agencies.length > 0 && !afipSetupData.agency_id) {
          setAfipSetupData({ ...afipSetupData, agency_id: data.agencies[0].id })
        }
      }
    } catch (error) {
      console.error('Error loading agencies:', error)
    }
  }

  useEffect(() => {
    if (selectedIntegration) {
      loadLogs(selectedIntegration.id)
    }
  }, [selectedIntegration])

  async function loadIntegrations() {
    try {
      setLoading(true)
      const res = await fetch('/api/integrations')
      if (!res.ok) throw new Error('Error al cargar integraciones')
      const data = await res.json()
      setIntegrations(data.integrations || [])
      setStats(data.stats || { total: 0, active: 0, inactive: 0, error: 0 })
    } catch (error) {
      console.error('Error loading integrations:', error)
      toast.error('Error al cargar integraciones')
    } finally {
      setLoading(false)
    }
  }

  async function loadLogs(integrationId: string) {
    try {
      const res = await fetch(`/api/integrations/${integrationId}/logs`)
      if (!res.ok) throw new Error('Error al cargar logs')
      const data = await res.json()
      setLogs(data.logs || [])
    } catch (error) {
      console.error('Error loading logs:', error)
    }
  }

  async function createIntegration() {
    try {
      // Si es AFIP, usar el endpoint de setup automático
      if (formData.integration_type === 'afip') {
        await setupAfipIntegration()
        return
      }

      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) throw new Error('Error al crear integración')
      
      toast.success('Integración creada')
      setShowNewDialog(false)
      setFormData({ name: '', integration_type: '', description: '', config: {}, sync_enabled: false, sync_frequency: 'manual' })
      loadIntegrations()
    } catch (error) {
      toast.error('Error al crear integración')
    }
  }

  async function setupAfipIntegration() {
    try {
      setSettingUpAfip(true)
      
      if (!afipSetupData.agency_id || !afipSetupData.cuit || !afipSetupData.clave_fiscal) {
        toast.error('Complete todos los campos requeridos')
        return
      }

      const res = await fetch('/api/integrations/afip/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(afipSetupData),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Error al configurar AFIP')
        return
      }

      toast.success('AFIP configurado correctamente. Ya puedes comenzar a facturar.')
      setShowNewDialog(false)
      setFormData({ name: '', integration_type: '', description: '', config: {}, sync_enabled: false, sync_frequency: 'manual' })
      setAfipSetupData({ agency_id: agencies[0]?.id || '', cuit: '', clave_fiscal: '', point_of_sale: 1, environment: 'sandbox' })
      loadIntegrations()
    } catch (error: any) {
      toast.error(error.message || 'Error al configurar AFIP')
    } finally {
      setSettingUpAfip(false)
    }
  }

  async function testIntegration(id: string) {
    try {
      setTesting(true)
      const res = await fetch(`/api/integrations/${id}/test`, { method: 'POST' })
      const data = await res.json()
      
      if (data.success) {
        toast.success(data.message)
      } else {
        toast.error(data.message)
      }
      
      loadIntegrations()
      if (selectedIntegration?.id === id) {
        loadLogs(id)
      }
    } catch (error) {
      toast.error('Error al probar integración')
    } finally {
      setTesting(false)
    }
  }

  async function deleteIntegration(id: string) {
    if (!confirm('¿Está seguro de eliminar esta integración?')) return
    
    try {
      const res = await fetch(`/api/integrations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      
      toast.success('Integración eliminada')
      setSelectedIntegration(null)
      loadIntegrations()
    } catch (error) {
      toast.error('Error al eliminar integración')
    }
  }

  async function toggleStatus(integration: Integration) {
    try {
      const newStatus = integration.status === 'active' ? 'inactive' : 'active'
      const res = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Error al actualizar')
      
      toast.success(`Integración ${newStatus === 'active' ? 'activada' : 'desactivada'}`)
      loadIntegrations()
    } catch (error) {
      toast.error('Error al actualizar integración')
    }
  }

  const getIntegrationType = (type: string) => {
    return integrationTypes.find(t => t.value === type) || integrationTypes[integrationTypes.length - 1]
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Integraciones</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Activas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-600">{stats.inactive}</div>
            <p className="text-xs text-muted-foreground">Inactivas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.error}</div>
            <p className="text-xs text-muted-foreground">Con Error</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Lista de Integraciones */}
        <Card className="col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Integraciones</CardTitle>
              <CardDescription>Gestiona las conexiones con servicios externos</CardDescription>
            </div>
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Integración
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nueva Integración</DialogTitle>
                  <DialogDescription>
                    {formData.integration_type === 'afip' 
                      ? 'Configura AFIP automáticamente. Solo necesitas tu CUIT y Clave Fiscal.'
                      : 'Configura una nueva conexión con un servicio externo'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {formData.integration_type === 'afip' ? (
                    // Formulario especial para AFIP
                    <>
                      <div>
                        <Label>Agencia *</Label>
                        <Select 
                          value={afipSetupData.agency_id}
                          onValueChange={(v) => setAfipSetupData({ ...afipSetupData, agency_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una agencia" />
                          </SelectTrigger>
                          <SelectContent>
                            {agencies.map(agency => (
                              <SelectItem key={agency.id} value={agency.id}>
                                {agency.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>CUIT *</Label>
                        <Input 
                          type="text"
                          value={afipSetupData.cuit}
                          onChange={(e) => setAfipSetupData({ ...afipSetupData, cuit: e.target.value })}
                          placeholder="20-12345678-9"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Ingrese su CUIT sin guiones (ej: 20123456789)
                        </p>
                      </div>
                      <div>
                        <Label>Clave Fiscal *</Label>
                        <Input 
                          type="password"
                          value={afipSetupData.clave_fiscal}
                          onChange={(e) => setAfipSetupData({ ...afipSetupData, clave_fiscal: e.target.value })}
                          placeholder="Tu clave fiscal de AFIP"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          La clave fiscal que usas para ingresar a AFIP
                        </p>
                      </div>
                      <div>
                        <Label>Punto de Venta *</Label>
                        <Input 
                          type="number"
                          value={afipSetupData.point_of_sale}
                          onChange={(e) => setAfipSetupData({ ...afipSetupData, point_of_sale: parseInt(e.target.value) || 1 })}
                          placeholder="1"
                          min="1"
                        />
                      </div>
                      <div>
                        <Label>Ambiente</Label>
                        <Select 
                          value={afipSetupData.environment}
                          onValueChange={(v) => setAfipSetupData({ ...afipSetupData, environment: v as 'sandbox' | 'production' })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sandbox">Sandbox (Pruebas)</SelectItem>
                            <SelectItem value="production">Producción</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use Sandbox para pruebas, Producción para facturar reales
                        </p>
                      </div>
                      <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          <strong>Importante:</strong> Asegúrese de haber autorizado el servicio de Facturación Electrónica en AFIP Clave Fiscal antes de continuar.
                        </p>
                      </div>
                    </>
                  ) : (
                    // Formulario genérico para otras integraciones
                    <>
                      <div>
                        <Label>Nombre</Label>
                        <Input 
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Mi integración"
                        />
                      </div>
                      <div>
                        <Label>Tipo</Label>
                        <Select 
                          value={formData.integration_type}
                          onValueChange={(v) => setFormData({ ...formData, integration_type: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {integrationTypes.map(type => (
                              <SelectItem key={type.value} value={type.value}>
                                <div className="flex items-center gap-2">
                                  <type.icon className="h-4 w-4" />
                                  {type.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Descripción (opcional)</Label>
                        <Textarea 
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Describe esta integración..."
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>Sincronización automática</Label>
                        <Switch 
                          checked={formData.sync_enabled}
                          onCheckedChange={(v) => setFormData({ ...formData, sync_enabled: v })}
                        />
                      </div>
                      {formData.sync_enabled && (
                        <div>
                          <Label>Frecuencia</Label>
                          <Select 
                            value={formData.sync_frequency}
                            onValueChange={(v) => setFormData({ ...formData, sync_frequency: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="realtime">Tiempo real</SelectItem>
                              <SelectItem value="hourly">Cada hora</SelectItem>
                              <SelectItem value="daily">Diario</SelectItem>
                              <SelectItem value="weekly">Semanal</SelectItem>
                              <SelectItem value="manual">Manual</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setShowNewDialog(false)
                    setFormData({ name: '', integration_type: '', description: '', config: {}, sync_enabled: false, sync_frequency: 'manual' })
                    setAfipSetupData({ agency_id: agencies[0]?.id || '', cuit: '', clave_fiscal: '', point_of_sale: 1, environment: 'sandbox' })
                  }}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={createIntegration} 
                    disabled={
                      formData.integration_type === 'afip'
                        ? (!afipSetupData.agency_id || !afipSetupData.cuit || !afipSetupData.clave_fiscal || settingUpAfip)
                        : (!formData.name || !formData.integration_type)
                    }
                  >
                    {settingUpAfip ? 'Configurando...' : formData.integration_type === 'afip' ? 'Configurar AFIP' : 'Crear'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Cargando...</div>
            ) : integrations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Plug className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay integraciones configuradas</p>
                <Button variant="link" onClick={() => setShowNewDialog(true)}>
                  Crear primera integración
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {integrations.map(integration => {
                  const type = getIntegrationType(integration.integration_type)
                  const status = statusConfig[integration.status]
                  const StatusIcon = status.icon
                  
                  return (
                    <div 
                      key={integration.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedIntegration?.id === integration.id ? 'bg-muted' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedIntegration(integration)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${type.color}`}>
                            <type.icon className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <div className="font-medium">{integration.name}</div>
                            <div className="text-sm text-muted-foreground">{type.label}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="gap-1">
                            <StatusIcon className={`h-3 w-3 ${
                              integration.status === 'active' ? 'text-green-500' :
                              integration.status === 'error' ? 'text-red-500' :
                              integration.status === 'pending' ? 'text-yellow-500' : 'text-gray-500'
                            }`} />
                            {status.label}
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); testIntegration(integration.id) }}
                            disabled={testing}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel de Detalle */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedIntegration ? selectedIntegration.name : 'Detalles'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedIntegration ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Selecciona una integración para ver detalles
              </p>
            ) : (
              <Tabs defaultValue="info">
                <TabsList className="w-full">
                  <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
                  <TabsTrigger value="logs" className="flex-1">Logs</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Estado</Label>
                    <div className="flex items-center justify-between mt-1">
                      <Badge variant={selectedIntegration.status === 'active' ? 'default' : 'secondary'}>
                        {statusConfig[selectedIntegration.status].label}
                      </Badge>
                      <Switch 
                        checked={selectedIntegration.status === 'active'}
                        onCheckedChange={() => toggleStatus(selectedIntegration)}
                      />
                    </div>
                  </div>
                  
                  {selectedIntegration.error_message && (
                    <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {selectedIntegration.error_message}
                      </p>
                    </div>
                  )}

                  {selectedIntegration.last_sync_at && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Última sincronización</Label>
                      <p className="text-sm">
                        {format(new Date(selectedIntegration.last_sync_at), "dd/MM/yyyy HH:mm", { locale: es })}
                      </p>
                    </div>
                  )}

                  <Separator />

                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => testIntegration(selectedIntegration.id)}
                      disabled={testing}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${testing ? 'animate-spin' : ''}`} />
                      Probar
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => deleteIntegration(selectedIntegration.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="logs">
                  <ScrollArea className="h-[300px]">
                    {logs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Sin logs</p>
                    ) : (
                      <div className="space-y-2">
                        {logs.map(log => (
                          <div key={log.id} className="text-xs p-2 bg-muted rounded">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className={`
                                ${log.log_type === 'success' ? 'border-green-500 text-green-600' : ''}
                                ${log.log_type === 'error' ? 'border-red-500 text-red-600' : ''}
                                ${log.log_type === 'warning' ? 'border-yellow-500 text-yellow-600' : ''}
                              `}>
                                {log.action}
                              </Badge>
                              <span className="text-muted-foreground">
                                {format(new Date(log.created_at), "HH:mm:ss")}
                              </span>
                            </div>
                            <p className="mt-1">{log.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Integraciones Disponibles */}
      <Card>
        <CardHeader>
          <CardTitle>Integraciones Disponibles</CardTitle>
          <CardDescription>Conecta MAXEVA GESTION con estos servicios</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
            {integrationTypes.filter(t => t.value !== 'other').map(type => (
              <div 
                key={type.value}
                className="p-4 border rounded-lg text-center hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => {
                  setFormData({ ...formData, integration_type: type.value, name: type.label })
                  setShowNewDialog(true)
                }}
              >
                <div className={`w-12 h-12 ${type.color} rounded-lg flex items-center justify-center mx-auto mb-2`}>
                  <type.icon className="h-6 w-6 text-white" />
                </div>
                <p className="font-medium text-sm">{type.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
