"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { DEFAULT_USD_ARS_FALLBACK_RATE } from "@/lib/accounting/exchange-rates"
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
  primary_currency: "ARS" | "USD"
  enabled_currencies: string[]
  default_usd_rate: number
  // Impuestos
  default_iva_rate: number
  tax_regime: string
  retention_ganancias_rate: number
  retention_iva_rate: number
  iibb_jurisdiction: string
  iibb_rate: number
  iibb_convenio_multilateral: boolean
  withholdings_enabled: boolean
}

export function FinancesSettingsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<FinancialSettings>({
    primary_currency: "USD",
    enabled_currencies: ["ARS", "USD"],
    default_usd_rate: DEFAULT_USD_ARS_FALLBACK_RATE,
    default_iva_rate: 21,
    tax_regime: "TRAVEL_AGENCY",
    retention_ganancias_rate: 0,
    retention_iva_rate: 0,
    iibb_jurisdiction: "SANTA_FE",
    iibb_rate: 3.5,
    iibb_convenio_multilateral: false,
    withholdings_enabled: true,
  })

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/finances/settings")

      if (!response.ok) {
        throw new Error("Error al cargar configuración")
      }

      const data = await response.json()
      setSettings((prev) => ({ ...prev, ...data }))
    } catch (error: any) {
      console.error("Error loading settings:", error)
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
      const response = await fetch("/api/finances/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al guardar configuración")
      }

      toast({
        title: "Configuración guardada",
        description: "Los cambios se han guardado correctamente",
      })
    } catch (error: any) {
      console.error("Error saving settings:", error)
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
        enabled_currencies: current.filter((c) => c !== currency),
      })
    } else {
      setSettings({
        ...settings,
        enabled_currencies: [...current, currency],
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
          <h1 className="text-2xl font-semibold tracking-tight">Configuración Financiera</h1>
          <p className="text-muted-foreground">Personaliza monedas e impuestos</p>
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
          <TabsTrigger value="taxes">Impuestos</TabsTrigger>
        </TabsList>

        {/* Tab: Monedas */}
        <TabsContent value="currencies" className="space-y-4">
          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>Configuración de Monedas</CardTitle>
              <CardDescription>Define la moneda principal y las monedas habilitadas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Moneda Principal</Label>
                  <p className="text-sm text-muted-foreground">Moneda base del sistema</p>
                </div>
                <Select
                  value={settings.primary_currency}
                  onValueChange={(value: "ARS" | "USD") =>
                    setSettings({ ...settings, primary_currency: value })
                  }
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
                  {["ARS", "USD"].map((currency) => (
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

          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>Tipo de Cambio</CardTitle>
              <CardDescription>Tipo de cambio USD/ARS por defecto para el sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Tipo de Cambio USD/ARS por Defecto</Label>
                  <p className="text-sm text-muted-foreground">
                    Se usa cuando no hay tipo de cambio cargado para una fecha específica
                  </p>
                </div>
                <DecimalInput
                  className="w-32"
                  value={settings.default_usd_rate}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      default_usd_rate: parseFloat(v) || 0,
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Impuestos */}
        <TabsContent value="taxes" className="space-y-4">
          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>IVA</CardTitle>
              <CardDescription>Configuración de IVA para la agencia</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Alícuota IVA por defecto (%)</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Para agencias de viajes generalmente es 21% sobre el margen
                  </p>
                  <DecimalInput
                    className="w-32"
                    value={settings.default_iva_rate}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        default_iva_rate: parseFloat(v) || 21,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Régimen Fiscal</Label>
                  <p className="text-xs text-muted-foreground mb-1">Define cómo se calcula el IVA</p>
                  <Select
                    value={settings.tax_regime}
                    onValueChange={(v) => setSettings({ ...settings, tax_regime: v })}
                  >
                    <SelectTrigger className="w-[250px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRAVEL_AGENCY">Agencia de Viajes (IVA sobre margen)</SelectItem>
                      <SelectItem value="GENERAL">Régimen General (IVA sobre total)</SelectItem>
                      <SelectItem value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</SelectItem>
                      <SelectItem value="MONOTRIBUTISTA">Monotributista</SelectItem>
                      <SelectItem value="EXENTO">Exento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>Retenciones y Percepciones</CardTitle>
              <CardDescription>
                Configuración de retenciones al pagar a operadores y percepciones al cobrar a
                clientes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Master toggle — desactiva todas las retenciones/percepciones automáticas */}
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border/40 bg-muted/10 p-4">
                <div className="space-y-1">
                  <Label htmlFor="withholdings_enabled" className="text-sm font-medium">
                    Aplicar retenciones y percepciones automáticas
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Si lo desactivás, la agencia no genera retenciones (Ganancias, IVA, IIBB) ni
                    percepciones (IVA, IIBB, RG 5617, RG 3819) automáticas en pagos. Útil para
                    monotributistas o agencias que no retienen. Las reglas individuales se
                    preservan para cuando lo reactives.
                  </p>
                </div>
                <Switch
                  id="withholdings_enabled"
                  checked={settings.withholdings_enabled}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, withholdings_enabled: v })
                  }
                />
              </div>

              <div className={`grid grid-cols-2 gap-4 ${!settings.withholdings_enabled ? "opacity-50 pointer-events-none" : ""}`}>
                <div>
                  <Label>% Retención Ganancias</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Al pagar a operadores RI (0 = no retener)
                  </p>
                  <DecimalInput
                    className="w-32"
                    value={settings.retention_ganancias_rate}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        retention_ganancias_rate: parseFloat(v) || 0,
                      })
                    }
                    disabled={!settings.withholdings_enabled}
                  />
                </div>
                <div>
                  <Label>% Retención IVA</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Al pagar a operadores RI (0 = no retener)
                  </p>
                  <DecimalInput
                    className="w-32"
                    value={settings.retention_iva_rate}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        retention_iva_rate: parseFloat(v) || 0,
                      })
                    }
                    disabled={!settings.withholdings_enabled}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>Ingresos Brutos (IIBB)</CardTitle>
              <CardDescription>Configuración para Convenio Multilateral</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Jurisdicción Principal</Label>
                  <p className="text-xs text-muted-foreground mb-1">Provincia donde opera la agencia</p>
                  <Select
                    value={settings.iibb_jurisdiction}
                    onValueChange={(v) => setSettings({ ...settings, iibb_jurisdiction: v })}
                  >
                    <SelectTrigger className="w-[250px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUENOS_AIRES">Buenos Aires</SelectItem>
                      <SelectItem value="CABA">CABA</SelectItem>
                      <SelectItem value="CORDOBA">Córdoba</SelectItem>
                      <SelectItem value="MENDOZA">Mendoza</SelectItem>
                      <SelectItem value="SANTA_FE">Santa Fe</SelectItem>
                      <SelectItem value="TUCUMAN">Tucumán</SelectItem>
                      <SelectItem value="ENTRE_RIOS">Entre Ríos</SelectItem>
                      <SelectItem value="OTRO">Otra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Alícuota IIBB (%)</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Porcentaje de Ingresos Brutos aplicable
                  </p>
                  <DecimalInput
                    className="w-32"
                    value={settings.iibb_rate}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        iibb_rate: parseFloat(v) || 3.5,
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Convenio Multilateral</Label>
                  <p className="text-xs text-muted-foreground">
                    Activar si la agencia opera en múltiples provincias
                  </p>
                </div>
                <Switch
                  checked={settings.iibb_convenio_multilateral}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, iibb_convenio_multilateral: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
