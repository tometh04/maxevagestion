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
import { DEFAULT_COMMISSION_SERVICE_TYPES, ALL_SERVICE_TYPES } from "@/lib/commissions/service-commission"

import { DEFAULT_USD_ARS_FALLBACK_RATE } from "@/lib/accounting/exchange-rates"
import { Badge } from "@/components/ui/badge"
import { Save, Loader2, Info, AlertTriangle } from "lucide-react"
import { FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL } from "@/lib/feature-flags"
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

/** Etiquetas de los tipos de servicio, tal como se ven en la operación. */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  HOTEL: "Hotel",
  FLIGHT: "Vuelo / Aéreo",
  TRANSFER: "Traslado / Transfer",
  EXCURSION: "Excursión",
  ASSISTANCE: "Asistencia",
  SEAT: "Asiento",
  LUGGAGE: "Equipaje",
  VISA: "Visa",
}

interface FinancialSettings {
  id?: string
  primary_currency: "ARS" | "USD"
  /** Desde cuándo esta agencia lleva su contabilidad en vibook. */
  accounting_start_date?: string | null
  /**
   * Cómo se valúa el dólar. `auto_update` = tomar el oficial que baja el cron;
   * `criterio` = qué valor del mes usar (cierre o promedio).
   */
  exchange_rate_config?: {
    source?: string
    auto_update?: boolean
    criterio?: "CIERRE" | "PROMEDIO"
    [k: string]: unknown
  } | null
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
  // Cálculo de costo de operadores
  default_cost_calculation_mode: "SIMPLE" | "COMMISSIONABLE"
  default_commission_percentage: number
  // Base de comisiones neta de IVA (VIB-95). La alícuota se guarda como fracción.
  commission_base_net_of_iva: boolean
  /** VIB-174: repartir el ajuste de liquidación con el vendedor y el referidor. */
  operator_adjustment_split_with_seller: boolean
  commission_iva_rate: number
  commission_net_from: string | null
  /** Tipos de servicio que comisionan por defecto en esta oficina. */
  commission_service_types: string[]
}

interface FinancesSettingsPageClientProps {
  /** Oficinas que el usuario puede configurar. Con una sola, el selector no aparece. */
  agencies: Array<{ id: string; name: string }>
}

export function FinancesSettingsPageClient({ agencies }: FinancesSettingsPageClientProps) {
  const { toast } = useToast()
  /**
   * Qué oficina se está configurando. `financial_settings` es por agencia, así
   * que sin esto la segunda oficina no tenía cómo llegar a su propia fila.
   */
  const [agencyId, setAgencyId] = useState<string>(agencies[0]?.id ?? "")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Flag per-org (organization_settings, separado de financial_settings):
  // contar servicios adicionales impagos como deuda del cliente (CxC).
  const [includeServicesInDebt, setIncludeServicesInDebt] = useState(false)
  const [savingFlag, setSavingFlag] = useState(false)
  const [settings, setSettings] = useState<FinancialSettings>({
    primary_currency: "USD",
    accounting_start_date: null,
    exchange_rate_config: { source: "manual", auto_update: false },
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
    default_cost_calculation_mode: "SIMPLE",
    default_commission_percentage: 0,
    commission_base_net_of_iva: false,
    // Default true, igual que la columna: es el criterio más común.
    operator_adjustment_split_with_seller: true,
    commission_iva_rate: 0.105,
    commission_net_from: null,
    commission_service_types: [...DEFAULT_COMMISSION_SERVICE_TYPES],
  })

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        agencyId ? `/api/finances/settings?agencyId=${agencyId}` : "/api/finances/settings"
      )

      if (!response.ok) {
        throw new Error("Error al cargar configuración")
      }

      const data = await response.json()
      setSettings((prev) => ({ ...prev, ...data }))

      // Cargar la feature flag desde organization_settings (store separado).
      try {
        const flagRes = await fetch(
          `/api/settings/organization?key=${FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL}`
        )
        if (flagRes.ok) {
          const flagJson = await flagRes.json()
          const row = (flagJson.data || []).find(
            (r: any) => r.key === FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
          )
          const v = String(row?.value ?? "").trim().toLowerCase()
          setIncludeServicesInDebt(v === "true" || v === "1" || v === "yes")
        }
      } catch {
        // Non-fatal: si falla, el toggle queda en su default (false).
      }
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
        body: JSON.stringify(agencyId ? { ...settings, agencyId } : settings),
      })

      if (!response.ok) {
        const error = await response.json()
        // La API manda `details` con el campo que falló, pero antes se
        // descartaba y el usuario veía solo "Datos inválidos", sin ninguna
        // pista de qué corregir. Con varias decenas de campos en esta pantalla,
        // ese mensaje no permite avanzar.
        const campos = Array.isArray(error.details)
          ? error.details
              .map((d: any) => (Array.isArray(d?.path) ? d.path.join(".") : null))
              .filter(Boolean)
          : []
        const detalle = campos.length > 0 ? ` Revisá: ${campos.join(", ")}.` : ""
        throw new Error(`${error.error || "Error al guardar configuración"}.${detalle}`)
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

  const saveIncludeServicesFlag = async (checked: boolean) => {
    const prev = includeServicesInDebt
    setIncludeServicesInDebt(checked) // optimista
    setSavingFlag(true)
    try {
      const res = await fetch("/api/settings/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL,
          value: checked ? "true" : "false",
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || "No se pudo guardar")
      }
      toast({
        title: "Configuración guardada",
        description: checked
          ? "Los servicios adicionales impagos ahora cuentan como deuda del cliente."
          : "Los servicios adicionales ya no se cuentan en la deuda.",
      })
    } catch (err: any) {
      setIncludeServicesInDebt(prev) // revertir
      toast({
        title: "Error",
        description: err.message || "No se pudo guardar la configuración",
        variant: "destructive",
      })
    } finally {
      setSavingFlag(false)
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
        <div className="flex items-center gap-3">
          {/* Con una sola oficina el selector sobra: la config es la de siempre. */}
          {agencies.length > 1 && (
            <Select value={agencyId} onValueChange={setAgencyId}>
              <SelectTrigger className="w-[200px]" aria-label="Oficina a configurar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agencies.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
      </div>

      <Tabs defaultValue="currencies" className="space-y-4">
        <TabsList>
          <TabsTrigger value="currencies">Monedas</TabsTrigger>
          <TabsTrigger value="taxes">Impuestos</TabsTrigger>
          <TabsTrigger value="operations">Operaciones</TabsTrigger>
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
              <CardTitle>Contabilidad</CardTitle>
              <CardDescription>
                Desde cuándo esta agencia lleva su contabilidad en vibook y cómo se valúan las
                operaciones en otra moneda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="accounting-start">Fecha de inicio</Label>
                <Input
                  id="accounting-start"
                  type="date"
                  className="w-[190px]"
                  value={settings.accounting_start_date ?? ""}
                  onChange={(e) =>
                    setSettings({ ...settings, accounting_start_date: e.target.value || null })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  El Balance y el Estado de Resultados toman datos desde esta fecha. Lo anterior no
                  se borra ni se oculta: se sigue viendo en el Libro Mayor.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Cotización del dólar</Label>
                <div className="flex items-center justify-between rounded-md border px-3.5 py-3">
                  <div className="pr-6">
                    <p className="text-sm font-medium">Tomar el dólar oficial automáticamente</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      El sistema baja la cotización oficial todos los días y propone la del mes. Si
                      tu agencia opera a otro tipo de cambio, desactivalo y cargala vos.
                    </p>
                  </div>
                  <Switch
                    checked={settings.exchange_rate_config?.auto_update === true}
                    onCheckedChange={(v) =>
                      setSettings({
                        ...settings,
                        exchange_rate_config: {
                          ...(settings.exchange_rate_config ?? {}),
                          source: v ? "oficial" : "manual",
                          auto_update: v,
                        },
                      })
                    }
                  />
                </div>

                {settings.exchange_rate_config?.auto_update === true && (
                  <div className="flex items-center justify-between rounded-md border px-3.5 py-3">
                    <div className="pr-6">
                      <p className="text-sm font-medium">Qué valor del mes usar</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        El cierre es el del último día, que es lo que corresponde a un balance. El
                        promedio suele usarse para el estado de resultados.
                      </p>
                    </div>
                    <Select
                      value={settings.exchange_rate_config?.criterio ?? "CIERRE"}
                      onValueChange={(v) =>
                        setSettings({
                          ...settings,
                          exchange_rate_config: {
                            ...(settings.exchange_rate_config ?? {}),
                            criterio: v as "CIERRE" | "PROMEDIO",
                          },
                        })
                      }
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CIERRE">Cierre del mes</SelectItem>
                        <SelectItem value="PROMEDIO">Promedio del mes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>Cálculo de costo de operadores</CardTitle>
              <CardDescription>
                Define cómo se calcula el costo real a pagar a los operadores en las cotizaciones.
                Cada operador puede tener su propia configuración que sobreescribe este default.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Modo de cálculo default</Label>
                  <p className="text-sm text-muted-foreground">
                    Aplica a todos los operadores que no tengan modo propio configurado
                  </p>
                </div>
                <Select
                  value={settings.default_cost_calculation_mode}
                  onValueChange={(v: "SIMPLE" | "COMMISSIONABLE") =>
                    setSettings({ ...settings, default_cost_calculation_mode: v })
                  }
                >
                  <SelectTrigger className="w-[280px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIMPLE">Simple — ingresar costo neto</SelectItem>
                    <SelectItem value="COMMISSIONABLE">Comisionable — ingresar precio bruto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settings.default_cost_calculation_mode === "COMMISSIONABLE" && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label>% Comisión default</Label>
                    <p className="text-sm text-muted-foreground">
                      Porcentaje que el operador paga sobre el precio bruto. Editable por operador.
                    </p>
                  </div>
                  <DecimalInput
                    className="w-32"
                    value={settings.default_commission_percentage}
                    onChange={(v) =>
                      setSettings({ ...settings, default_commission_percentage: parseFloat(v) || 0 })
                    }
                  />
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/20 p-3">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Simple:</strong> el vendedor ingresa el costo neto directamente. Los gastos administrativos del operador se suman encima.</p>
                  <p><strong>Comisionable:</strong> el vendedor ingresa el precio de lista del operador. La comisión y los gastos se calculan desde ese bruto: <code className="bg-muted px-1 rounded">neto = bruto × (1 − comisión% + gastos%)</code></p>
                </div>
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

          {/* Qué servicios comisionan. Antes era una lista fija en el código:
              asiento, equipaje y visa no comisionaban nunca, porque nacieron
              como cargos que se trasladan al pasajero sin margen. No es cierto
              en todas las agencias, así que ahora lo decide cada oficina. */}
          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>Servicios que comisionan</CardTitle>
              <CardDescription>
                Qué tipos de servicio adicional generan comisión para el vendedor.
                Es el valor por defecto al cargar un servicio: en cada uno se
                puede prender o apagar a mano.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {ALL_SERVICE_TYPES.map((type) => {
                  const checked = settings.commission_service_types.includes(type)
                  return (
                    <div
                      key={type}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5"
                    >
                      <Label
                        htmlFor={`commission_service_type_${type}`}
                        className="text-sm font-medium"
                      >
                        {SERVICE_TYPE_LABELS[type]}
                      </Label>
                      <Switch
                        id={`commission_service_type_${type}`}
                        checked={checked}
                        onCheckedChange={(value) =>
                          setSettings({
                            ...settings,
                            commission_service_types: value
                              ? [...settings.commission_service_types, type]
                              : settings.commission_service_types.filter((t) => t !== type),
                          })
                        }
                      />
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Cambiar esto no toca las comisiones ya calculadas: aplica a los
                servicios que se carguen de acá en adelante.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>Base de comisiones neta de IVA</CardTitle>
              <CardDescription>
                Calcular las comisiones de vendedores y referidores sobre la ganancia
                neta de IVA en vez de la bruta. Es independiente del IVA fiscal: solo
                cambia la base con la que se reparten comisiones.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border/40 bg-muted/10 p-4">
                <div className="space-y-1">
                  <Label htmlFor="commission_base_net_of_iva" className="text-sm font-medium">
                    Comisionar sobre la ganancia neta de IVA
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Con esto activo, la base de comisión es{" "}
                    <strong>ganancia bruta × (1 − alícuota)</strong>. Ejemplo: ganancia
                    bruta 1.000 con 10,5% → base neta 895, y las comisiones se calculan
                    sobre 895.
                  </p>
                </div>
                <Switch
                  id="commission_base_net_of_iva"
                  checked={settings.commission_base_net_of_iva}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, commission_base_net_of_iva: checked })
                  }
                />
              </div>

              {settings.commission_base_net_of_iva && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Alícuota de IVA a descontar (%)</Label>
                    <p className="text-xs text-muted-foreground mb-1">
                      Porcentaje que se resta de la ganancia bruta (ej. 10,5).
                    </p>
                    <DecimalInput
                      className="w-32"
                      value={Math.round(settings.commission_iva_rate * 1000) / 10}
                      onChange={(v) => {
                        const pct = parseFloat(v)
                        setSettings({
                          ...settings,
                          commission_iva_rate: Number.isFinite(pct)
                            ? Math.min(Math.max(pct, 0), 99.9) / 100
                            : 0,
                        })
                      }}
                    />
                  </div>
                  <div>
                    <Label>Aplicar desde</Label>
                    <p className="text-xs text-muted-foreground mb-1">
                      Solo las operaciones con fecha de venta igual o posterior usan base
                      neta. Vacío = todas.
                    </p>
                    <Input
                      type="date"
                      className="w-44"
                      value={settings.commission_net_from ?? ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          commission_net_from: e.target.value || null,
                        })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    <strong>Esto baja todas las comisiones desde la fecha elegida.</strong>{" "}
                    Las comisiones ya pagadas o saldadas no se tocan. Conviene avisarles a
                    los vendedores antes de que lo vean en el reporte.
                  </p>
                  <p>
                    Para recalcular operaciones ya cargadas desde la fecha de corte, pedile
                    al equipo técnico que corra el script de recálculo.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* VIB-174 */}
          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>Ajustes de liquidación de operador</CardTitle>
              <CardDescription>
                Qué pasa cuando la liquidación definitiva de un operador llega por un monto
                distinto al que se estimó al vender, y la comisión ya se pagó sobre esa
                estimación.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border/40 bg-muted/10 p-4">
                <div className="space-y-1">
                  <Label
                    htmlFor="operator_adjustment_split_with_seller"
                    className="text-sm font-medium"
                  >
                    Repartir la diferencia con el vendedor
                  </Label>
                  <p className="max-w-xl text-xs text-muted-foreground">
                    Con esto activo, la diferencia se reparte según el porcentaje con el que
                    se le liquidó la comisión original. Ejemplo: el hotel salió 50 más caro y
                    el vendedor cobra 20% → 40 los absorbe la agencia y 10 se le descuentan de
                    la próxima liquidación. Apagado, la agencia se come sola la diferencia.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    El ajuste contable se registra siempre: esto solo decide a quién le toca.
                  </p>
                </div>
                <Switch
                  id="operator_adjustment_split_with_seller"
                  checked={settings.operator_adjustment_split_with_seller}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      operator_adjustment_split_with_seller: checked,
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Operaciones */}
        <TabsContent value="operations" className="space-y-4">
          <Card className="rounded-xl border-border/40">
            <CardHeader>
              <CardTitle>Servicios adicionales en la deuda</CardTitle>
              <CardDescription>
                Cómo se contabilizan los servicios extra (asistencia, asiento, transfer, etc.)
                cargados en una operación, además del viaje base.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border/40 bg-muted/10 p-4">
                <div className="space-y-1">
                  <Label htmlFor="include_services_in_sale_total" className="text-sm font-medium">
                    Contar servicios adicionales impagos como deuda del cliente (CxC)
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Si un cliente compró un servicio extra (asistencia, asiento, etc.) con precio de
                    venta y todavía no lo pagó, ese monto se cuenta como cuenta por cobrar y suma a
                    la venta en reportes y dashboard. Afecta toda la historia al instante y es
                    reversible.
                  </p>
                </div>
                <Switch
                  id="include_services_in_sale_total"
                  checked={includeServicesInDebt}
                  disabled={savingFlag}
                  onCheckedChange={saveIncludeServicesFlag}
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    <strong>Activalo solo si cargás los servicios como extras aparte del precio
                    base.</strong> Si el precio base de la operación ya incluye el servicio y además
                    lo cargás como servicio adicional (por ejemplo, solo para el itinerario), la
                    deuda se contaría duplicada.
                  </p>
                  <p>
                    Ante la duda, pedile al equipo técnico que corra la auditoría de servicios antes
                    de activarlo.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
