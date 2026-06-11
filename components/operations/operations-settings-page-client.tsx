"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Save, Loader2, Plus, Trash2 } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"

interface AutoAlert {
  type: 'payment_due' | 'operator_payment' | 'upcoming_trip' | 'missing_doc'
  enabled: boolean
  days_before?: number
  channels?: ('email' | 'whatsapp' | 'system')[]
}

interface OperationSettings {
  id?: string
  custom_statuses: any[]
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
  custom_product_types: Array<{ value: string; label: string }>
  custom_operation_types: Array<{ value: string; label: string }>
}


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
    custom_product_types: [],
    custom_operation_types: [],
  })
  const [newProductTypeLabel, setNewProductTypeLabel] = useState("")
  const [newOperationTypeLabel, setNewOperationTypeLabel] = useState("")

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
      // Asegurar que los valores de integración contable siempre estén en true
      const settingsToSave = {
        ...settings,
        auto_create_ledger_entry: true,
        auto_create_iva_entry: true,
        auto_create_operator_payment: true,
      }
      const response = await fetch('/api/operations/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settingsToSave),
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
          <h1 className="text-2xl font-semibold tracking-tight">Configuración de Operaciones</h1>
          <p className="text-muted-foreground">
            Configura alertas y validaciones para operaciones
          </p>
        </div>
        <Button size="sm" onClick={saveSettings} disabled={saving}>
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

      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="validations">Validaciones</TabsTrigger>
          <TabsTrigger value="operation-types">Tipos de Operación</TabsTrigger>
          <TabsTrigger value="product-types">Tipos de Producto</TabsTrigger>
        </TabsList>

        {/* Tab: Alertas */}
        <TabsContent value="alerts" className="space-y-4">
          <Card className="rounded-xl border border-border/40">
            <CardHeader>
              <CardTitle>Alertas Automáticas</CardTitle>
              <CardDescription>
                Configura alertas que se generarán automáticamente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.auto_alerts.map((alert, index) => (
                <div key={index} className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
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
        </TabsContent>

        {/* Tab: Validaciones */}
        <TabsContent value="validations" className="space-y-4">
          <Card className="rounded-xl border border-border/40">
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Tipos de Operación */}
        <TabsContent value="operation-types" className="space-y-4">
          <Card className="rounded-xl border border-border/40">
            <CardHeader>
              <CardTitle>Tipos de Operación Personalizados</CardTitle>
              <CardDescription>
                Agrega tipos propios que aparecerán en el selector &quot;Tipo&quot; al crear o editar una operación. Los tipos estándar (Vuelo, Hotel, Paquete, etc.) siempre están disponibles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(settings.custom_operation_types || []).length === 0 && (
                <p className="text-sm text-muted-foreground">No hay tipos personalizados aún.</p>
              )}
              {(settings.custom_operation_types || []).map((ot, index) => (
                <div key={ot.value} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-2">
                  <span className="text-sm font-medium">{ot.label}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      const updated = (settings.custom_operation_types || []).filter((_, i) => i !== index)
                      setSettings({ ...settings, custom_operation_types: updated })
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Ej: Actividad, Excursión, Seguro..."
                  value={newOperationTypeLabel}
                  onChange={(e) => setNewOperationTypeLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      const label = newOperationTypeLabel.trim()
                      if (!label) return
                      const value = label.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "")
                      const existing = settings.custom_operation_types || []
                      if (existing.some((ot) => ot.value === value || ot.label.toLowerCase() === label.toLowerCase())) return
                      setSettings({ ...settings, custom_operation_types: [...existing, { value, label }] })
                      setNewOperationTypeLabel("")
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const label = newOperationTypeLabel.trim()
                    if (!label) return
                    const value = label.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "")
                    const existing = settings.custom_operation_types || []
                    if (existing.some((ot) => ot.value === value || ot.label.toLowerCase() === label.toLowerCase())) return
                    setSettings({ ...settings, custom_operation_types: [...existing, { value, label }] })
                    setNewOperationTypeLabel("")
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Tipos de Producto */}
        <TabsContent value="product-types" className="space-y-4">
          <Card className="rounded-xl border border-border/40">
            <CardHeader>
              <CardTitle>Tipos de Producto Personalizados</CardTitle>
              <CardDescription>
                Agrega categorías propias que aparecerán en el campo Tipo de Producto al cargar operadores en una operación. Los tipos estándar (Vuelo, Hotel, Paquete, etc.) siempre están disponibles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lista de tipos personalizados */}
              {(settings.custom_product_types || []).length === 0 && (
                <p className="text-sm text-muted-foreground">No hay tipos personalizados aún.</p>
              )}
              {(settings.custom_product_types || []).map((pt, index) => (
                <div key={pt.value} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-2">
                  <span className="text-sm font-medium">{pt.label}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      const updated = (settings.custom_product_types || []).filter((_, i) => i !== index)
                      setSettings({ ...settings, custom_product_types: updated })
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {/* Agregar nuevo tipo */}
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Ej: Entradas Mundial"
                  value={newProductTypeLabel}
                  onChange={(e) => setNewProductTypeLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      const label = newProductTypeLabel.trim()
                      if (!label) return
                      const value = label.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "")
                      const existing = settings.custom_product_types || []
                      if (existing.some((pt) => pt.value === value || pt.label.toLowerCase() === label.toLowerCase())) return
                      setSettings({ ...settings, custom_product_types: [...existing, { value, label }] })
                      setNewProductTypeLabel("")
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const label = newProductTypeLabel.trim()
                    if (!label) return
                    const value = label.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "")
                    const existing = settings.custom_product_types || []
                    if (existing.some((pt) => pt.value === value || pt.label.toLowerCase() === label.toLowerCase())) return
                    setSettings({ ...settings, custom_product_types: [...existing, { value, label }] })
                    setNewProductTypeLabel("")
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
