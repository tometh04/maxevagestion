"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Save, Loader2 } from "lucide-react"
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
          <h1 className="text-3xl font-bold">Configuración de Operaciones</h1>
          <p className="text-muted-foreground">
            Configura alertas y validaciones para operaciones
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

      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="validations">Validaciones</TabsTrigger>
        </TabsList>

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

      </Tabs>
    </div>
  )
}
