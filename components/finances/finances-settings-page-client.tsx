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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FinancialSettings {
  id?: string
  primary_currency: 'ARS' | 'USD'
  enabled_currencies: string[]
  exchange_rate_config: {
    source?: string
    auto_update?: boolean
    update_frequency?: string
  }
  default_usd_rate: number
  default_accounts: Record<string, string>
  auto_create_accounts: boolean
  enabled_payment_methods: string[]
  default_commission_rules: Record<string, any>
  auto_calculate_commissions: boolean
  auto_create_ledger_entries: boolean
  auto_create_iva_entries: boolean
  auto_create_operator_payments: boolean
  default_income_chart_account_id: string | null
  default_expense_chart_account_id: string | null
  auto_generate_invoices: boolean
  default_point_of_sale: number
  monthly_close_day: number
  auto_close_month: boolean
}

const paymentMethods = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'BANK', label: 'Transferencia Bancaria' },
  { value: 'MP', label: 'Mercado Pago' },
  { value: 'CREDIT_CARD', label: 'Tarjeta de Crédito' },
  { value: 'USD', label: 'Dólares' },
  { value: 'OTHER', label: 'Otro' },
]

export function FinancesSettingsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<FinancialSettings>({
    primary_currency: 'ARS',
    enabled_currencies: ['ARS', 'USD'],
    exchange_rate_config: {
      source: 'manual',
      auto_update: false,
    },
    default_usd_rate: 1000.00,
    default_accounts: {},
    auto_create_accounts: false,
    enabled_payment_methods: ['CASH', 'BANK', 'MP'],
    default_commission_rules: {},
    auto_calculate_commissions: true,
    auto_create_ledger_entries: true,
    auto_create_iva_entries: true,
    auto_create_operator_payments: true,
    default_income_chart_account_id: null,
    default_expense_chart_account_id: null,
    auto_generate_invoices: false,
    default_point_of_sale: 1,
    monthly_close_day: 1,
    auto_close_month: false,
  })

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/finances/settings')
      
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
      const response = await fetch('/api/finances/settings', {
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

  const toggleCurrency = (currency: string) => {
    const current = settings.enabled_currencies || []
    if (current.includes(currency)) {
      setSettings({
        ...settings,
        enabled_currencies: current.filter(c => c !== currency),
      })
    } else {
      setSettings({
        ...settings,
        enabled_currencies: [...current, currency],
      })
    }
  }

  const togglePaymentMethod = (method: string) => {
    const current = settings.enabled_payment_methods || []
    if (current.includes(method)) {
      setSettings({
        ...settings,
        enabled_payment_methods: current.filter(m => m !== method),
      })
    } else {
      setSettings({
        ...settings,
        enabled_payment_methods: [...current, method],
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
              <Link href="/cash/summary">Finanzas</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Configuración</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuración Financiera</h1>
          <p className="text-muted-foreground">
            Personaliza monedas, cuentas, métodos de pago y más
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

      <Tabs defaultValue="currencies" className="space-y-4">
        <TabsList>
          <TabsTrigger value="currencies">Monedas</TabsTrigger>
          <TabsTrigger value="accounts">Cuentas</TabsTrigger>
          <TabsTrigger value="payments">Métodos de Pago</TabsTrigger>
          <TabsTrigger value="commissions">Comisiones</TabsTrigger>
          <TabsTrigger value="accounting">Contabilidad</TabsTrigger>
          <TabsTrigger value="invoicing">Facturación</TabsTrigger>
        </TabsList>

        {/* Tab: Monedas */}
        <TabsContent value="currencies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Monedas</CardTitle>
              <CardDescription>
                Define la moneda principal y las monedas habilitadas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Moneda Principal</Label>
                  <p className="text-sm text-muted-foreground">
                    Moneda base del sistema
                  </p>
                </div>
                <Select
                  value={settings.primary_currency}
                  onValueChange={(value: 'ARS' | 'USD') => setSettings({
                    ...settings,
                    primary_currency: value,
                  })}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS - Peso Argentino</SelectItem>
                    <SelectItem value="USD">USD - Dólar Estadounidense</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Monedas Habilitadas</Label>
                <p className="text-sm text-muted-foreground mb-4">
                  Selecciona las monedas que estarán disponibles en el sistema
                </p>
                <div className="flex flex-wrap gap-2">
                  {['ARS', 'USD'].map((currency) => (
                    <Badge
                      key={currency}
                      variant={settings.enabled_currencies?.includes(currency) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCurrency(currency)}
                    >
                      {currency}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tipos de Cambio</CardTitle>
              <CardDescription>
                Configura cómo se obtienen y actualizan los tipos de cambio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Fuente de Tipo de Cambio</Label>
                  <p className="text-sm text-muted-foreground">
                    Cómo se obtiene el tipo de cambio USD/ARS
                  </p>
                </div>
                <Select
                  value={settings.exchange_rate_config?.source || 'manual'}
                  onValueChange={(value) => setSettings({
                    ...settings,
                    exchange_rate_config: {
                      ...settings.exchange_rate_config,
                      source: value,
                    },
                  })}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="api">API Externa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settings.exchange_rate_config?.source === 'manual' && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Tipo de Cambio USD/ARS por Defecto</Label>
                    <p className="text-sm text-muted-foreground">
                      Valor por defecto cuando no hay tipo de cambio específico
                    </p>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-32"
                    value={settings.default_usd_rate}
                    onChange={(e) => setSettings({
                      ...settings,
                      default_usd_rate: parseFloat(e.target.value) || 0,
                    })}
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label>Actualización Automática</Label>
                  <p className="text-sm text-muted-foreground">
                    Actualizar tipos de cambio automáticamente
                  </p>
                </div>
                <Switch
                  checked={settings.exchange_rate_config?.auto_update || false}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    exchange_rate_config: {
                      ...settings.exchange_rate_config,
                      auto_update: checked,
                    },
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Métodos de Pago */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Métodos de Pago Habilitados</CardTitle>
              <CardDescription>
                Selecciona los métodos de pago disponibles en el sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((method) => (
                  <Badge
                    key={method.value}
                    variant={settings.enabled_payment_methods?.includes(method.value) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => togglePaymentMethod(method.value)}
                  >
                    {method.label}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Comisiones */}
        <TabsContent value="commissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Comisiones</CardTitle>
              <CardDescription>
                Define cómo se calculan y aplican las comisiones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Calcular Comisiones Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Las comisiones se calcularán al crear operaciones
                  </p>
                </div>
                <Switch
                  checked={settings.auto_calculate_commissions}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_calculate_commissions: checked,
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Contabilidad */}
        <TabsContent value="accounting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuración Contable</CardTitle>
              <CardDescription>
                Define el comportamiento automático de los módulos contables
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Crear Movimientos Contables Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Generar movimientos en libro mayor al crear operaciones
                  </p>
                </div>
                <Switch
                  checked={settings.auto_create_ledger_entries}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_create_ledger_entries: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Crear Registros IVA Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Generar registros IVA al crear operaciones
                  </p>
                </div>
                <Switch
                  checked={settings.auto_create_iva_entries}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_create_iva_entries: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Crear Pagos a Operadores Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Generar registros de pago a operadores al crear operaciones
                  </p>
                </div>
                <Switch
                  checked={settings.auto_create_operator_payments}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_create_operator_payments: checked,
                  })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cierre Mensual</CardTitle>
              <CardDescription>
                Configuración del cierre contable mensual
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Día de Cierre Mensual</Label>
                  <p className="text-sm text-muted-foreground">
                    Día del mes en que se realiza el cierre
                  </p>
                </div>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  className="w-32"
                  value={settings.monthly_close_day}
                  onChange={(e) => setSettings({
                    ...settings,
                    monthly_close_day: parseInt(e.target.value) || 1,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Cierre Automático</Label>
                  <p className="text-sm text-muted-foreground">
                    Realizar cierre mensual automáticamente
                  </p>
                </div>
                <Switch
                  checked={settings.auto_close_month}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_close_month: checked,
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Facturación */}
        <TabsContent value="invoicing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Facturación</CardTitle>
              <CardDescription>
                Configuración para la generación automática de facturas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Generar Facturas Automáticamente</Label>
                  <p className="text-sm text-muted-foreground">
                    Crear facturas al confirmar operaciones
                  </p>
                </div>
                <Switch
                  checked={settings.auto_generate_invoices}
                  onCheckedChange={(checked) => setSettings({
                    ...settings,
                    auto_generate_invoices: checked,
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Punto de Venta por Defecto</Label>
                  <p className="text-sm text-muted-foreground">
                    Punto de venta para facturación AFIP
                  </p>
                </div>
                <Input
                  type="number"
                  min="1"
                  className="w-32"
                  value={settings.default_point_of_sale}
                  onChange={(e) => setSettings({
                    ...settings,
                    default_point_of_sale: parseInt(e.target.value) || 1,
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Cuentas (placeholder) */}
        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cuentas Financieras por Defecto</CardTitle>
              <CardDescription>
                Configuración de cuentas por defecto (próximamente)
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
