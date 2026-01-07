"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Save, Loader2 } from "lucide-react"
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

interface CustomField {
  name: string
  type: 'text' | 'number' | 'date' | 'email' | 'phone' | 'select' | 'textarea'
  label: string
  required: boolean
  options?: string[]
  default_value?: string
}

interface Notification {
  event: 'new_customer' | 'customer_updated' | 'customer_deleted' | 'customer_operation_created'
  enabled: boolean
  channels: ('email' | 'whatsapp' | 'system')[]
}

interface CustomerSettings {
  id?: string
  custom_fields: CustomField[]
  validations: {
    email?: { required?: boolean; format?: 'email' }
    phone?: { required?: boolean; format?: 'phone' }
  }
  notifications: Notification[]
  integrations: {
    operations?: { auto_link?: boolean }
    leads?: { auto_convert?: boolean }
  }
  auto_assign_lead: boolean
  require_document: boolean
  duplicate_check_enabled: boolean
  duplicate_check_fields: string[]
}

export function CustomersSettingsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<CustomerSettings>({
    custom_fields: [],
    validations: {
      email: { required: true, format: 'email' },
      phone: { required: true, format: 'phone' },
    },
    notifications: [],
    integrations: {
      operations: { auto_link: true },
      leads: { auto_convert: false },
    },
    auto_assign_lead: false,
    require_document: false,
    duplicate_check_enabled: true,
    duplicate_check_fields: ['email', 'phone'],
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/customers/settings')
      
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
      const response = await fetch('/api/customers/settings', {
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

  const addCustomField = () => {
    setSettings({
      ...settings,
      custom_fields: [
        ...settings.custom_fields,
        {
          name: `field_${Date.now()}`,
          type: 'text',
          label: '',
          required: false,
        },
      ],
    })
  }

  const removeCustomField = (index: number) => {
    setSettings({
      ...settings,
      custom_fields: settings.custom_fields.filter((_, i) => i !== index),
    })
  }

  const updateCustomField = (index: number, field: Partial<CustomField>) => {
    const newFields = [...settings.custom_fields]
    newFields[index] = { ...newFields[index], ...field }
    setSettings({ ...settings, custom_fields: newFields })
  }

  const addNotification = () => {
    setSettings({
      ...settings,
      notifications: [
        ...settings.notifications,
        {
          event: 'new_customer',
          enabled: true,
          channels: ['system'],
        },
      ],
    })
  }

  const removeNotification = (index: number) => {
    setSettings({
      ...settings,
      notifications: settings.notifications.filter((_, i) => i !== index),
    })
  }

  const updateNotification = (index: number, notification: Partial<Notification>) => {
    const newNotifications = [...settings.notifications]
    newNotifications[index] = { ...newNotifications[index], ...notification }
    setSettings({ ...settings, notifications: newNotifications })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
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
            <BreadcrumbLink asChild>
              <Link href="/customers">Clientes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Configuración</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuración de Clientes</h1>
          <p className="text-muted-foreground">
            Personaliza el módulo de clientes según las necesidades de tu agencia
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

      <Tabs defaultValue="fields" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fields">Campos Personalizados</TabsTrigger>
          <TabsTrigger value="validations">Validaciones</TabsTrigger>
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="integrations">Integraciones</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Campos Personalizados</CardTitle>
              <CardDescription>
                Agrega campos adicionales a los formularios de clientes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.custom_fields.map((field, index) => (
                <Card key={index} className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label>Nombre del Campo</Label>
                      <Input
                        value={field.name}
                        onChange={(e) => updateCustomField(index, { name: e.target.value })}
                        placeholder="nombre_campo"
                      />
                    </div>
                    <div>
                      <Label>Etiqueta</Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateCustomField(index, { label: e.target.value })}
                        placeholder="Etiqueta visible"
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select
                        value={field.type}
                        onValueChange={(value: any) => updateCustomField(index, { type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto</SelectItem>
                          <SelectItem value="number">Número</SelectItem>
                          <SelectItem value="date">Fecha</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="phone">Teléfono</SelectItem>
                          <SelectItem value="select">Selección</SelectItem>
                          <SelectItem value="textarea">Área de texto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`required-${index}`}
                            checked={field.required}
                            onCheckedChange={(checked) => updateCustomField(index, { required: checked })}
                          />
                          <Label htmlFor={`required-${index}`}>Requerido</Label>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCustomField(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {field.type === 'select' && (
                    <div className="mt-4">
                      <Label>Opciones (separadas por comas)</Label>
                      <Input
                        value={field.options?.join(', ') || ''}
                        onChange={(e) => updateCustomField(index, {
                          options: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                        })}
                        placeholder="Opción 1, Opción 2, Opción 3"
                      />
                    </div>
                  )}
                </Card>
              ))}
              <Button variant="outline" onClick={addCustomField}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Campo
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validaciones de Datos</CardTitle>
              <CardDescription>
                Configura las reglas de validación para los campos de clientes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <p className="text-sm text-muted-foreground">
                      Validar formato y requerimiento de email
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={settings.validations.email?.required || false}
                        onCheckedChange={(checked) => setSettings({
                          ...settings,
                          validations: {
                            ...settings.validations,
                            email: { ...settings.validations.email, required: checked },
                          },
                        })}
                      />
                      <Label>Requerido</Label>
                    </div>
                    <Badge variant="outline">Formato: Email</Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <Label>Teléfono</Label>
                    <p className="text-sm text-muted-foreground">
                      Validar formato y requerimiento de teléfono
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={settings.validations.phone?.required || false}
                        onCheckedChange={(checked) => setSettings({
                          ...settings,
                          validations: {
                            ...settings.validations,
                            phone: { ...settings.validations.phone, required: checked },
                          },
                        })}
                      />
                      <Label>Requerido</Label>
                    </div>
                    <Badge variant="outline">Formato: Teléfono</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notificaciones Automáticas</CardTitle>
              <CardDescription>
                Configura qué notificaciones enviar y por qué canales
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.notifications.map((notification, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 space-y-2">
                      <Select
                        value={notification.event}
                        onValueChange={(value: any) => updateNotification(index, { event: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new_customer">Nuevo Cliente</SelectItem>
                          <SelectItem value="customer_updated">Cliente Actualizado</SelectItem>
                          <SelectItem value="customer_deleted">Cliente Eliminado</SelectItem>
                          <SelectItem value="customer_operation_created">Operación Creada</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={notification.enabled}
                            onCheckedChange={(checked) => updateNotification(index, { enabled: checked })}
                          />
                          <Label>Habilitado</Label>
                        </div>
                        <div className="flex gap-2">
                          {['email', 'whatsapp', 'system'].map((channel) => (
                            <Badge
                              key={channel}
                              variant={notification.channels.includes(channel as any) ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => {
                                const channels = notification.channels.includes(channel as any)
                                  ? notification.channels.filter(c => c !== channel)
                                  : [...notification.channels, channel as any]
                                updateNotification(index, { channels })
                              }}
                            >
                              {channel}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeNotification(index)}
                      className="ml-4"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
              <Button variant="outline" onClick={addNotification}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Notificación
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Integraciones con Otros Módulos</CardTitle>
              <CardDescription>
                Configura cómo se integra el módulo de clientes con otros módulos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label>Operaciones</Label>
                  <p className="text-sm text-muted-foreground">
                    Vincular automáticamente clientes con operaciones
                  </p>
                </div>
                <Switch
                  checked={settings.integrations.operations?.auto_link || false}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    integrations: {
                      ...settings.integrations,
                      operations: { auto_link: checked },
                    },
                  })}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label>Leads</Label>
                  <p className="text-sm text-muted-foreground">
                    Convertir automáticamente leads en clientes
                  </p>
                </div>
                <Switch
                  checked={settings.integrations.leads?.auto_convert || false}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    integrations: {
                      ...settings.integrations,
                      leads: { auto_convert: checked },
                    },
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuración General</CardTitle>
              <CardDescription>
                Opciones generales del módulo de clientes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label>Asignar Lead Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Asignar automáticamente leads a vendedores
                  </p>
                </div>
                <Switch
                  checked={settings.auto_assign_lead}
                  onCheckedChange={(checked) => setSettings({ ...settings, auto_assign_lead: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label>Requerir Documento</Label>
                  <p className="text-sm text-muted-foreground">
                    Hacer obligatorio el documento de identidad
                  </p>
                </div>
                <Switch
                  checked={settings.require_document}
                  onCheckedChange={(checked) => setSettings({ ...settings, require_document: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label>Detección de Duplicados</Label>
                  <p className="text-sm text-muted-foreground">
                    Verificar si un cliente ya existe antes de crear
                  </p>
                </div>
                <Switch
                  checked={settings.duplicate_check_enabled}
                  onCheckedChange={(checked) => setSettings({ ...settings, duplicate_check_enabled: checked })}
                />
              </div>

              {settings.duplicate_check_enabled && (
                <div className="p-4 border rounded-lg space-y-2">
                  <Label>Campos para Detectar Duplicados</Label>
                  <div className="flex flex-wrap gap-2">
                    {['email', 'phone', 'document_number'].map((field) => (
                      <Badge
                        key={field}
                        variant={settings.duplicate_check_fields.includes(field) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const fields = settings.duplicate_check_fields.includes(field)
                            ? settings.duplicate_check_fields.filter(f => f !== field)
                            : [...settings.duplicate_check_fields, field]
                          setSettings({ ...settings, duplicate_check_fields: fields })
                        }}
                      >
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

