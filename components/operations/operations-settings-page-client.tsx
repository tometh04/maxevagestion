"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Save, Loader2, ArrowRight } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CustomStatus {
  value: string
  label: string
  color: string
  order?: number
}

interface AutoAlert {
  type: 'payment_due' | 'operator_payment' | 'upcoming_trip' | 'missing_doc'
  enabled: boolean
  days_before?: number
  channels?: ('email' | 'whatsapp' | 'system')[]
}

interface OperationSettings {
  id?: string
  custom_statuses: CustomStatus[]
  workflows: Record<string, any>
  auto_alerts: AutoAlert[]
  document_templates: any[]
  default_status: string
  require_destination: boolean
  require_departure_date: boolean
  require_operator: boolean
  require_customer: boolean
  alert_payment_due_days: number
  alert_operator_payment_days: number
  alert_upcoming_trip_days: number
  auto_generate_quotation: boolean
  auto_generate_invoice: boolean
  require_documents_before_confirmation: boolean
  auto_create_ledger_entry: boolean
  auto_create_iva_entry: boolean
  auto_create_operator_payment: boolean
}

const standardStatuses = [
  { value: "RESERVED", label: "Reservado", color: "bg-blue-500" },
  { value: "CONFIRMED", label: "Confirmado", color: "bg-green-500" },
  { value: "CANCELLED", label: "Cancelado", color: "bg-red-500" },
  { value: "TRAVELLING", label: "En viaje", color: "bg-orange-500" },
  { value: "TRAVELLED", label: "Viajado", color: "bg-purple-500" },
]

const statusColors = [
  "bg-gray-500",
  "bg-blue-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-orange-500",
  "bg-red-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-slate-500",
]

export function OperationsSettingsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<OperationSettings>({
    custom_statuses: [],
    workflows: {},
    auto_alerts: [],
    document_templates: [],
    default_status: "RESERVED",
    require_destination: true,
    require_departure_date: true,
    require_operator: false,
    require_customer: false,
    alert_payment_due_days: 30,
    alert_operator_payment_days: 30,
    alert_upcoming_trip_days: 7,
    auto_generate_quotation: false,
    auto_generate_invoice: false,
    require_documents_before_confirmation: false,
    auto_create_ledger_entry: true,
    auto_create_iva_entry: true,
    auto_create_operator_payment: true,
  })

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/operations/settings')
      
      if (!response.ok) {
        throw new Error('Error al cargar configuración')
      }

      const data = await response.json()
      setSettings(data)
    } catch (error: any) {
      console.error('Error loading settings:', error)
      toast({
        title: "Error",
        description: error.message || "No se pudo cargar la configuración",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/operations/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al guardar configuración')
      }

      toast({
        title: "Configuración guardada",
        description: "Los cambios se han guardado correctamente",
      })
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la configuración",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const addCustomStatus = () => {
    setSettings({
      ...settings,
      custom_statuses: [
        ...settings.custom_statuses,
        {
          value: `CUSTOM_${Date.now()}`,
          label: "Nuevo Estado",
          color: "bg-gray-500",
          order: settings.custom_statuses.length,
        },
      ],
    })
  }

  const removeCustomStatus = (index: number) => {
    setSettings({
      ...settings,
      custom_statuses: settings.custom_statuses.filter((_, i) => i !== index),
    })
  }

  const updateCustomStatus = (index: number, field: keyof CustomStatus, value: any) => {
    const updated = [...settings.custom_statuses]
    updated[index] = { ...updated[index], [field]: value }
    setSettings({ ...settings, custom_statuses: updated })
  }

  const updateAlert = (index: number, field: keyof AutoAlert, value: any) => {
    const updated = [...settings.auto_alerts]
    updated[index] = { ...updated[index], [field]: value }
    setSettings({ ...settings, auto_alerts: updated })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/operations">Operaciones</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Configuración</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuración de Operaciones</h1>
          <p className="text-muted-foreground">
            Personaliza estados, flujos de trabajo, alertas y más
          </p>
        </div>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="statuses" className="space-y-4">
        <TabsList>
          <TabsTrigger value="statuses">Estados</TabsTrigger>
          <TabsTrigger value="workflows">Flujos de Trabajo</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="validations">Validaciones</TabsTrigger>
          <TabsTrigger value="integrations">Integraciones</TabsTrigger>
        </TabsList>

        {/* Tab: Estados */}
        <TabsContent value="statuses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Estados Estándar</CardTitle>
              <CardDescription>
                Estados predefinidos del sistema (no se pueden modificar)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {standardStatuses.map((status) => (
                  <Badge key={status.value} className={status.color}>
                    {status.label}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Estados Personalizados</CardTitle>
                  <CardDescription>
                    Agrega estados adicionales para tu flujo de trabajo
                  </CardDescription>
                </div>
                <Button onClick={addCustomStatus} size="sm" variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar Estado
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.custom_statuses.map((status, index) => (
                <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                  <div className="flex-1 grid grid-cols-3 gap-4">
                    <div>
                      <Label>Valor (ID)</Label>
                      <Input
                        value={status.value}
                        onChange={(e) => updateCustomStatus(index, 'value', e.target.value)}
                        placeholder="CUSTOM_STATUS"
                      />
                    </div>
                    <div>
                      <Label>Etiqueta</Label>
                      <Input
                        value={status.label}
                        onChange={(e) => updateCustomStatus(index, 'label', e.target.value)}
                        placeholder="Nombre del Estado"
                      />
                    </div>
                    <div>
                      <Label>Color</Label>
                      <Select
                        value={status.color}
                        onValueChange={(value) => updateCustomStatus(index, 'color', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusColors.map((color) => (
                            <SelectItem key={color} value={color}>
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded ${color}`} />
                                {color.replace('bg-', '')}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCustomStatus(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {settings.custom_statuses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay estados personalizados. Haz clic en &quot;Agregar Estado&quot; para crear uno.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estado por Defecto</CardTitle>
              <CardDescription>
                Estado que se asignará automáticamente a nuevas operaciones
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={settings.default_status}
                onValueChange={(value) => setSettings({ ...settings, default_status: value })}
              >
                <SelectTrigger className="w-[300px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {standardStatuses.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                  {settings.custom_statuses.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Alertas */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alertas Automáticas</CardTitle>
              <CardDescription>
                Configura alertas que se generarán automáticamente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.auto_alerts.map((alert, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Switch
                        checked={alert.enabled}
                        onCheckedChange={(checked) => updateAlert(index, 'enabled', checked)}
                      />
                      <Label className="font-semibold">
                        {alert.type === 'payment_due' && 'Pago Pendiente'}
                        {alert.type === 'operator_payment' && 'Pago a Operador'}
                        {alert.type === 'upcoming_trip' && 'Viaje Próximo'}
                        {alert.type === 'missing_doc' && 'Documento Faltante'}
                      </Label>
                    </div>
                  </div>
                  {alert.enabled && (
                    <div className="grid grid-cols-2 gap-4 pl-10">
                      <div>
                        <Label>Días antes</Label>
                        <Input
                          type="number"
                          value={alert.days_before || ''}
                          onChange={(e) => updateAlert(index, 'days_before', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuración de Días</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Días antes de pago pendiente</Label>
                  <p className="text-sm text-muted-foreground">
                    Alertar cuando falten X días para el pago
                  </p>
                </div>
                <Input
                  type="number"
                  className="w-32"
                  value={settings.alert_payment_due_days}
                  onChange={(e) => setSettings({
                    ...settings,
                    alert_payment_due_days: parseInt(e.target.value) || 30,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Días antes de pago a operador</Label>
                  <p className="text-sm text-muted-foreground">
                    Alertar cuando falten X días para pagar al operador
                  </p>
                </div>
                <Input
                  type="number"
                  className="w-32"
                  value={settings.alert_operator_payment_days}
                  onChange={(e) => setSettings({
                    ...settings,
                    alert_operator_payment_days: parseInt(e.target.value) || 30,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Días antes de viaje</Label>
                  <p className="text-sm text-muted-foreground">
                    Alertar cuando falten X días para el viaje
                  </p>
                </div>
                <Input
                  type="number"
                  className="w-32"
                  value={settings.alert_upcoming_trip_days}
                  onChange={(e) => setSettings({
                    ...settings,
                    alert_upcoming_trip_days: parseInt(e.target.value) || 7,
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Validaciones */}
        <TabsContent value="validations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validaciones de Campos</CardTitle>
              <CardDescription>
                Define qué campos son obligatorios al crear/editar operaciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Requerir Destino</Label>
                  <p className="text-sm text-muted-foreground">
                    El campo destino será obligatorio
                  </p>
                </div>
                <Switch
                  checked={settings.require_destination}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    require_destination: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Requerir Fecha de Salida</Label>
                  <p className="text-sm text-muted-foreground">
                    El campo fecha de salida será obligatorio
                  </p>
                </div>
                <Switch
                  checked={settings.require_departure_date}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    require_departure_date: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Requerir Operador</Label>
                  <p className="text-sm text-muted-foreground">
                    El campo operador será obligatorio
                  </p>
                </div>
                <Switch
                  checked={settings.require_operator}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    require_operator: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Requerir Cliente</Label>
                  <p className="text-sm text-muted-foreground">
                    Se debe asociar al menos un cliente
                  </p>
                </div>
                <Switch
                  checked={settings.require_customer}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    require_customer: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Requerir Documentos antes de Confirmar</Label>
                  <p className="text-sm text-muted-foreground">
                    No se podrá confirmar una operación sin documentos requeridos
                  </p>
                </div>
                <Switch
                  checked={settings.require_documents_before_confirmation}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    require_documents_before_confirmation: checked,
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Integraciones */}
        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generación Automática</CardTitle>
              <CardDescription>
                Configura qué se genera automáticamente al crear operaciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Generar Cotización Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Crear cotización PDF al confirmar operación
                  </p>
                </div>
                <Switch
                  checked={settings.auto_generate_quotation}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_generate_quotation: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Generar Factura Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Crear factura al confirmar operación
                  </p>
                </div>
                <Switch
                  checked={settings.auto_generate_invoice}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_generate_invoice: checked,
                  })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Integración Contable</CardTitle>
              <CardDescription>
                Configura la integración automática con módulos contables
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Crear Asiento Contable Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Generar movimiento en libro mayor al crear operación
                  </p>
                </div>
                <Switch
                  checked={settings.auto_create_ledger_entry}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_create_ledger_entry: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Crear Registro IVA Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Generar registro IVA al crear operación
                  </p>
                </div>
                <Switch
                  checked={settings.auto_create_iva_entry}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_create_iva_entry: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Crear Pago a Operador Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Generar registro de pago a operador al crear operación
                  </p>
                </div>
                <Switch
                  checked={settings.auto_create_operator_payment}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_create_operator_payment: checked,
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Flujos de Trabajo */}
        <TabsContent value="workflows" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flujos de Trabajo</CardTitle>
              <CardDescription>
                Configura las transiciones de estado permitidas (próximamente)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Esta funcionalidad estará disponible en una futura actualización.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
