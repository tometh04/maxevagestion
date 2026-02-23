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
import { Slider } from "@/components/ui/slider"
import { Save, Loader2, Bot, Mail, MessageCircle, Bell, FileSpreadsheet, Palette, Database } from "lucide-react"
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

interface ToolsSettings {
  id?: string
  // Emilia
  emilia_enabled: boolean
  emilia_model: string
  emilia_temperature: number
  emilia_max_tokens: number
  emilia_system_prompt?: string
  emilia_allowed_actions: string[]
  // Email
  email_enabled: boolean
  email_provider: string
  email_from_name: string
  email_from_address?: string
  email_reply_to?: string
  email_signature?: string
  // WhatsApp
  whatsapp_enabled: boolean
  whatsapp_provider: 'manual' | 'api' | 'manychat'
  whatsapp_api_key?: string
  whatsapp_default_country_code: string
  // Notificaciones
  notifications_enabled: boolean
  notifications_sound: boolean
  notifications_desktop: boolean
  notifications_email_digest: boolean
  notifications_digest_frequency: 'daily' | 'weekly' | 'never'
  // Exportaciones
  export_default_format: 'xlsx' | 'csv' | 'pdf'
  export_include_headers: boolean
  export_date_format: string
  export_currency_format: 'symbol' | 'code' | 'both'
  export_logo_url?: string
  // UI
  ui_theme: 'light' | 'dark' | 'system'
  ui_sidebar_collapsed: boolean
  ui_compact_mode: boolean
  ui_show_tooltips: boolean
  ui_default_currency_display: string
  ui_date_format: string
  ui_time_format: '12h' | '24h'
  ui_language: string
  // Backups
  backups_enabled: boolean
  backups_frequency: 'daily' | 'weekly' | 'monthly'
  backups_retention_days: number
  backups_include_attachments: boolean
}

const emiliaActions = [
  { value: 'search', label: 'Buscar información' },
  { value: 'summarize', label: 'Resumir datos' },
  { value: 'suggest', label: 'Hacer sugerencias' },
  { value: 'create', label: 'Crear registros' },
  { value: 'analyze', label: 'Analizar operaciones' },
]

export function ToolsSettingsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<ToolsSettings>({
    emilia_enabled: true,
    emilia_model: 'gpt-4',
    emilia_temperature: 0.7,
    emilia_max_tokens: 2000,
    emilia_allowed_actions: ['search', 'summarize', 'suggest'],
    email_enabled: true,
    email_provider: 'resend',
    email_from_name: 'MAXEVA Gestión',
    whatsapp_enabled: true,
    whatsapp_provider: 'manual',
    whatsapp_default_country_code: '+54',
    notifications_enabled: true,
    notifications_sound: true,
    notifications_desktop: true,
    notifications_email_digest: false,
    notifications_digest_frequency: 'daily',
    export_default_format: 'xlsx',
    export_include_headers: true,
    export_date_format: 'DD/MM/YYYY',
    export_currency_format: 'symbol',
    ui_theme: 'system',
    ui_sidebar_collapsed: false,
    ui_compact_mode: false,
    ui_show_tooltips: true,
    ui_default_currency_display: 'ARS',
    ui_date_format: 'DD/MM/YYYY',
    ui_time_format: '24h',
    ui_language: 'es',
    backups_enabled: false,
    backups_frequency: 'weekly',
    backups_retention_days: 30,
    backups_include_attachments: false,
  })

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/tools/settings')
      
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
      const response = await fetch('/api/tools/settings', {
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

  const toggleEmiliaAction = (action: string) => {
    const current = settings.emilia_allowed_actions || []
    if (current.includes(action)) {
      setSettings({
        ...settings,
        emilia_allowed_actions: current.filter(a => a !== action),
      })
    } else {
      setSettings({
        ...settings,
        emilia_allowed_actions: [...current, action],
      })
    }
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
              <Link href="/">Inicio</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/tools">Herramientas</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Configuración</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuración de Herramientas</h1>
          <p className="text-muted-foreground">
            Personaliza Emilia, notificaciones, email, WhatsApp y más
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

      <Tabs defaultValue="emilia" className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="emilia" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Emilia</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notificaciones</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar</span>
          </TabsTrigger>
          <TabsTrigger value="ui" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Interfaz</span>
          </TabsTrigger>
          <TabsTrigger value="backups" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Backups</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab: Emilia */}
        <TabsContent value="emilia" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Emilia - AI Copilot
              </CardTitle>
              <CardDescription>
                Configura el asistente de inteligencia artificial
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Habilitar Emilia</Label>
                  <p className="text-sm text-muted-foreground">
                    Activa o desactiva el asistente AI
                  </p>
                </div>
                <Switch
                  checked={settings.emilia_enabled}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    emilia_enabled: checked,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Modelo de IA</Label>
                  <p className="text-sm text-muted-foreground">
                    Modelo de lenguaje a utilizar
                  </p>
                </div>
                <Select
                  value={settings.emilia_model}
                  onValueChange={(value) => setSettings({
                    ...settings,
                    emilia_model: value,
                  })}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4">GPT-4 (Recomendado)</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Creatividad (Temperatura): {settings.emilia_temperature}</Label>
                </div>
                <Slider
                  value={[settings.emilia_temperature]}
                  min={0}
                  max={2}
                  step={0.1}
                  onValueChange={([value]) => setSettings({
                    ...settings,
                    emilia_temperature: value,
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  0 = Muy preciso, 2 = Muy creativo
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Tokens Máximos</Label>
                  <p className="text-sm text-muted-foreground">
                    Longitud máxima de respuesta
                  </p>
                </div>
                <Input
                  type="number"
                  min="100"
                  max="8000"
                  className="w-32"
                  value={settings.emilia_max_tokens}
                  onChange={(e) => setSettings({
                    ...settings,
                    emilia_max_tokens: parseInt(e.target.value) || 2000,
                  })}
                />
              </div>

              <div>
                <Label>Acciones Permitidas</Label>
                <p className="text-sm text-muted-foreground mb-4">
                  Qué puede hacer Emilia en el sistema
                </p>
                <div className="flex flex-wrap gap-2">
                  {emiliaActions.map((action) => (
                    <Badge
                      key={action.value}
                      variant={settings.emilia_allowed_actions?.includes(action.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleEmiliaAction(action.value)}
                    >
                      {action.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>Prompt del Sistema (Opcional)</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Instrucciones personalizadas para Emilia
                </p>
                <Textarea
                  placeholder="Ej: Eres un asistente especializado en turismo y viajes..."
                  value={settings.emilia_system_prompt || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    emilia_system_prompt: e.target.value,
                  })}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Email */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Configuración de Email
              </CardTitle>
              <CardDescription>
                Configura el envío de correos electrónicos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Habilitar Email</Label>
                  <p className="text-sm text-muted-foreground">
                    Activa o desactiva el envío de emails
                  </p>
                </div>
                <Switch
                  checked={settings.email_enabled}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    email_enabled: checked,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Nombre del Remitente</Label>
                  <p className="text-sm text-muted-foreground">
                    Nombre que aparece en los emails
                  </p>
                </div>
                <Input
                  className="w-[250px]"
                  value={settings.email_from_name}
                  onChange={(e) => setSettings({
                    ...settings,
                    email_from_name: e.target.value,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Email Remitente</Label>
                  <p className="text-sm text-muted-foreground">
                    Dirección de email para envío
                  </p>
                </div>
                <Input
                  type="email"
                  className="w-[250px]"
                  placeholder="noreply@tudominio.com"
                  value={settings.email_from_address || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    email_from_address: e.target.value,
                  })}
                />
              </div>

              <div>
                <Label>Firma de Email</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Firma que se incluye en los emails
                </p>
                <Textarea
                  placeholder="Ej: Saludos cordiales,&#10;El equipo de MAXEVA"
                  value={settings.email_signature || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    email_signature: e.target.value,
                  })}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: WhatsApp */}
        <TabsContent value="whatsapp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Configuración de WhatsApp
              </CardTitle>
              <CardDescription>
                Configura la integración con WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Habilitar WhatsApp</Label>
                  <p className="text-sm text-muted-foreground">
                    Activa o desactiva la integración
                  </p>
                </div>
                <Switch
                  checked={settings.whatsapp_enabled}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    whatsapp_enabled: checked,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Proveedor</Label>
                  <p className="text-sm text-muted-foreground">
                    Método de integración con WhatsApp
                  </p>
                </div>
                <Select
                  value={settings.whatsapp_provider}
                  onValueChange={(value: 'manual' | 'api' | 'manychat') => setSettings({
                    ...settings,
                    whatsapp_provider: value,
                  })}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual (Links)</SelectItem>
                    <SelectItem value="api">API WhatsApp Business</SelectItem>
                    <SelectItem value="manychat">ManyChat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Código de País por Defecto</Label>
                  <p className="text-sm text-muted-foreground">
                    Prefijo telefónico por defecto
                  </p>
                </div>
                <Input
                  className="w-32"
                  value={settings.whatsapp_default_country_code}
                  onChange={(e) => setSettings({
                    ...settings,
                    whatsapp_default_country_code: e.target.value,
                  })}
                />
              </div>

              {settings.whatsapp_provider === 'api' && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label>API Key</Label>
                    <p className="text-sm text-muted-foreground">
                      Clave de API de WhatsApp Business
                    </p>
                  </div>
                  <Input
                    type="password"
                    className="w-[250px]"
                    value={settings.whatsapp_api_key || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      whatsapp_api_key: e.target.value,
                    })}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Notificaciones */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notificaciones del Sistema
              </CardTitle>
              <CardDescription>
                Configura cómo recibir notificaciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Habilitar Notificaciones</Label>
                  <p className="text-sm text-muted-foreground">
                    Recibir notificaciones del sistema
                  </p>
                </div>
                <Switch
                  checked={settings.notifications_enabled}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    notifications_enabled: checked,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Sonido</Label>
                  <p className="text-sm text-muted-foreground">
                    Reproducir sonido al recibir notificaciones
                  </p>
                </div>
                <Switch
                  checked={settings.notifications_sound}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    notifications_sound: checked,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Notificaciones de Escritorio</Label>
                  <p className="text-sm text-muted-foreground">
                    Mostrar notificaciones en el escritorio
                  </p>
                </div>
                <Switch
                  checked={settings.notifications_desktop}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    notifications_desktop: checked,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Resumen por Email</Label>
                  <p className="text-sm text-muted-foreground">
                    Recibir resumen de notificaciones por email
                  </p>
                </div>
                <Switch
                  checked={settings.notifications_email_digest}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    notifications_email_digest: checked,
                  })}
                />
              </div>

              {settings.notifications_email_digest && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Frecuencia del Resumen</Label>
                    <p className="text-sm text-muted-foreground">
                      Cada cuánto enviar el resumen
                    </p>
                  </div>
                  <Select
                    value={settings.notifications_digest_frequency}
                    onValueChange={(value: 'daily' | 'weekly' | 'never') => setSettings({
                      ...settings,
                      notifications_digest_frequency: value,
                    })}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diario</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="never">Nunca</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Exportaciones */}
        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Configuración de Exportaciones
              </CardTitle>
              <CardDescription>
                Configura el formato por defecto para exportar datos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Formato por Defecto</Label>
                  <p className="text-sm text-muted-foreground">
                    Formato de archivo para exportaciones
                  </p>
                </div>
                <Select
                  value={settings.export_default_format}
                  onValueChange={(value: 'xlsx' | 'csv' | 'pdf') => setSettings({
                    ...settings,
                    export_default_format: value,
                  })}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                    <SelectItem value="csv">CSV (.csv)</SelectItem>
                    <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Incluir Encabezados</Label>
                  <p className="text-sm text-muted-foreground">
                    Incluir fila de encabezados en exportaciones
                  </p>
                </div>
                <Switch
                  checked={settings.export_include_headers}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    export_include_headers: checked,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Formato de Fecha</Label>
                  <p className="text-sm text-muted-foreground">
                    Formato para fechas en exportaciones
                  </p>
                </div>
                <Select
                  value={settings.export_date_format}
                  onValueChange={(value) => setSettings({
                    ...settings,
                    export_date_format: value,
                  })}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Formato de Moneda</Label>
                  <p className="text-sm text-muted-foreground">
                    Cómo mostrar valores monetarios
                  </p>
                </div>
                <Select
                  value={settings.export_currency_format}
                  onValueChange={(value: 'symbol' | 'code' | 'both') => setSettings({
                    ...settings,
                    export_currency_format: value,
                  })}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="symbol">Símbolo ($)</SelectItem>
                    <SelectItem value="code">Código (ARS)</SelectItem>
                    <SelectItem value="both">Ambos ($ ARS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Interfaz */}
        <TabsContent value="ui" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Preferencias de Interfaz
              </CardTitle>
              <CardDescription>
                Personaliza la apariencia del sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Tema</Label>
                  <p className="text-sm text-muted-foreground">
                    Esquema de colores del sistema
                  </p>
                </div>
                <Select
                  value={settings.ui_theme}
                  onValueChange={(value: 'light' | 'dark' | 'system') => setSettings({
                    ...settings,
                    ui_theme: value,
                  })}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Claro</SelectItem>
                    <SelectItem value="dark">Oscuro</SelectItem>
                    <SelectItem value="system">Sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Modo Compacto</Label>
                  <p className="text-sm text-muted-foreground">
                    Reducir espaciado para ver más contenido
                  </p>
                </div>
                <Switch
                  checked={settings.ui_compact_mode}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    ui_compact_mode: checked,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Mostrar Tooltips</Label>
                  <p className="text-sm text-muted-foreground">
                    Mostrar ayudas emergentes
                  </p>
                </div>
                <Switch
                  checked={settings.ui_show_tooltips}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    ui_show_tooltips: checked,
                  })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Formato de Hora</Label>
                  <p className="text-sm text-muted-foreground">
                    Formato de visualización de hora
                  </p>
                </div>
                <Select
                  value={settings.ui_time_format}
                  onValueChange={(value: '12h' | '24h') => setSettings({
                    ...settings,
                    ui_time_format: value,
                  })}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24 horas (14:30)</SelectItem>
                    <SelectItem value="12h">12 horas (2:30 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Backups */}
        <TabsContent value="backups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Configuración de Backups
              </CardTitle>
              <CardDescription>
                Configura las copias de seguridad automáticas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Habilitar Backups Automáticos</Label>
                  <p className="text-sm text-muted-foreground">
                    Crear copias de seguridad periódicas
                  </p>
                </div>
                <Switch
                  checked={settings.backups_enabled}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    backups_enabled: checked,
                  })}
                />
              </div>

              {settings.backups_enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Frecuencia</Label>
                      <p className="text-sm text-muted-foreground">
                        Cada cuánto crear backups
                      </p>
                    </div>
                    <Select
                      value={settings.backups_frequency}
                      onValueChange={(value: 'daily' | 'weekly' | 'monthly') => setSettings({
                        ...settings,
                        backups_frequency: value,
                      })}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diario</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Retención (días)</Label>
                      <p className="text-sm text-muted-foreground">
                        Cuántos días mantener los backups
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      className="w-32"
                      value={settings.backups_retention_days}
                      onChange={(e) => setSettings({
                        ...settings,
                        backups_retention_days: parseInt(e.target.value) || 30,
                      })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Incluir Archivos Adjuntos</Label>
                      <p className="text-sm text-muted-foreground">
                        Incluir documentos y archivos en el backup
                      </p>
                    </div>
                    <Switch
                      checked={settings.backups_include_attachments}
                      onCheckedChange={(checked) => setSettings({
                        ...settings,
                        backups_include_attachments: checked,
                      })}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
