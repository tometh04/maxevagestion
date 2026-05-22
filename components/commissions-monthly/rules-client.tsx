"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Edit, Trash2, Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface Seller {
  id: string
  name: string
  email: string
  role: string
}

interface Rule {
  id: string
  seller_id: string
  org_id: string
  non_commissionable_amount_usd: number
  brackets: Array<{ threshold_usd: number; percentage: number }>
  sales_floor_usd: number
  sales_floor_pct: number
  sales_target_usd: number
  sales_target_pct: number
  mgmt_quotations_floor_rate: number
  mgmt_quotations_floor_pct: number
  mgmt_quotations_target_rate: number
  mgmt_quotations_target_pct: number
  mgmt_leads_floor_rate: number
  mgmt_leads_floor_pct: number
  mgmt_leads_target_rate: number
  mgmt_leads_target_pct: number
  mgmt_floor_pct: number
  factor_sales_weight_pct: number
  factor_mgmt_weight_pct: number
  date_field_for_period: "operation_date" | "created_at" | "departure_date"
  enabled: boolean
  users?: Seller | null
}

interface Props {
  initialRules: Rule[]
  sellers: Seller[]
}

const DATE_FIELD_LABELS: Record<string, string> = {
  operation_date: "Fecha de operación (venta)",
  created_at: "Fecha de creación",
  departure_date: "Fecha de viaje (salida)",
}

const DEFAULT_FORM: Partial<Rule> = {
  non_commissionable_amount_usd: 1450,
  brackets: [
    { threshold_usd: 1450, percentage: 15 },
    { threshold_usd: 3000, percentage: 20 },
    { threshold_usd: 5000, percentage: 25 },
    { threshold_usd: 7000, percentage: 30 },
  ],
  sales_floor_usd: 19000,
  sales_floor_pct: 80,
  sales_target_usd: 22000,
  sales_target_pct: 100,
  mgmt_quotations_floor_rate: 0.03,
  mgmt_quotations_floor_pct: 80,
  mgmt_quotations_target_rate: 0.04,
  mgmt_quotations_target_pct: 100,
  mgmt_leads_floor_rate: 0.03,
  mgmt_leads_floor_pct: 80,
  mgmt_leads_target_rate: 0.04,
  mgmt_leads_target_pct: 100,
  mgmt_floor_pct: 80,
  factor_sales_weight_pct: 50,
  factor_mgmt_weight_pct: 50,
  date_field_for_period: "operation_date",
  enabled: true,
}

export function CommissionsMonthlyRulesClient({ initialRules, sellers }: Props) {
  const [rules, setRules] = useState<Rule[]>(initialRules)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [form, setForm] = useState<Partial<Rule>>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [selectedSellerId, setSelectedSellerId] = useState<string>("")

  // Vendedoras que ya tienen regla (para no duplicar)
  const sellersWithRule = new Set(rules.map((r) => r.seller_id))
  const sellersWithoutRule = sellers.filter((s) => !sellersWithRule.has(s.id))

  function openCreate() {
    setEditing(null)
    setSelectedSellerId("")
    setForm({ ...DEFAULT_FORM })
    setDialogOpen(true)
  }

  function openEdit(rule: Rule) {
    setEditing(rule)
    setSelectedSellerId(rule.seller_id)
    setForm(rule)
    setDialogOpen(true)
  }

  function setF<K extends keyof Rule>(key: K, value: Rule[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function updateBracket(idx: number, key: "threshold_usd" | "percentage", value: number) {
    setForm((f) => {
      const brackets = [...(f.brackets || [])]
      brackets[idx] = { ...brackets[idx], [key]: value }
      return { ...f, brackets }
    })
  }

  function addBracket() {
    setForm((f) => ({
      ...f,
      brackets: [...(f.brackets || []), { threshold_usd: 0, percentage: 0 }],
    }))
  }

  function removeBracket(idx: number) {
    setForm((f) => ({
      ...f,
      brackets: (f.brackets || []).filter((_, i) => i !== idx),
    }))
  }

  async function handleSave() {
    if (!editing && !selectedSellerId) {
      toast.error("Seleccioná una vendedora")
      return
    }
    setSaving(true)
    try {
      const url = editing
        ? `/api/commissions/monthly/rules/${editing.id}`
        : `/api/commissions/monthly/rules`
      const method = editing ? "PATCH" : "POST"
      const body = editing
        ? form
        : { seller_id: selectedSellerId, ...form }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      if (editing) {
        setRules((rs) => rs.map((r) => (r.id === editing.id ? data.rule : r)))
        toast.success("Regla actualizada")
      } else {
        setRules((rs) => [data.rule, ...rs])
        toast.success("Regla creada")
      }
      setDialogOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(rule: Rule) {
    if (!confirm(`¿Eliminar la regla de ${rule.users?.name}? Settlements existentes quedan en historial.`)) return
    try {
      const res = await fetch(`/api/commissions/monthly/rules/${rule.id}`, { method: "DELETE" })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error)
      }
      setRules((rs) => rs.filter((r) => r.id !== rule.id))
      toast.success("Regla eliminada")
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reglas de comisión mensual
          </h1>
          <p className="text-muted-foreground">
            Configuración por vendedora. El cálculo corre el 1ro de cada mes y se aprueba manualmente.
          </p>
        </div>
        <Button onClick={openCreate} disabled={sellersWithoutRule.length === 0}>
          <Plus className="h-4 w-4 mr-2" /> Nueva regla
        </Button>
      </div>

      {rules.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            No hay reglas configuradas. Creá la primera con el botón de arriba.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {rules.map((rule) => (
          <Card key={rule.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">
                    {rule.users?.name || "(sin nombre)"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{rule.users?.email}</p>
                </div>
                <div className="flex gap-2">
                  {rule.enabled ? (
                    <Badge variant="default">Activa</Badge>
                  ) : (
                    <Badge variant="secondary">Pausada</Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEdit(rule)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(rule)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">No comisionable:</span>{" "}
                <strong>USD {rule.non_commissionable_amount_usd}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Tramos:</span>{" "}
                {(rule.brackets || []).map((b, i) => (
                  <Badge key={i} variant="outline" className="ml-1">
                    ≥{b.threshold_usd}: {b.percentage}%
                  </Badge>
                ))}
              </div>
              <div>
                <span className="text-muted-foreground">Target ventas:</span>{" "}
                <strong>USD {rule.sales_floor_usd}—{rule.sales_target_usd}</strong> ({rule.sales_floor_pct}%—{rule.sales_target_pct}%)
              </div>
              <div>
                <span className="text-muted-foreground">Piso gestión:</span>{" "}
                <strong>{rule.mgmt_floor_pct}%</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Periodo por:</span>{" "}
                <strong>{DATE_FIELD_LABELS[rule.date_field_for_period] || rule.date_field_for_period}</strong>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar regla" : "Nueva regla de comisión"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Vendedora: ${editing.users?.name}`
                : "Seleccioná la vendedora y ajustá los parámetros según el contrato."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Vendedora (solo al crear) */}
            {!editing && (
              <div>
                <Label>Vendedora</Label>
                <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar vendedora" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellersWithoutRule.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Comisión base */}
            <div>
              <h3 className="font-semibold text-sm mb-2">1. Comisión Base</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Monto no comisionable (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.non_commissionable_amount_usd ?? ""}
                    onChange={(e) =>
                      setF("non_commissionable_amount_usd", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <div>
                  <Label>Periodo por</Label>
                  <Select
                    value={form.date_field_for_period}
                    onValueChange={(v) => setF("date_field_for_period", v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DATE_FIELD_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label>Tramos (umbral USD → %)</Label>
                  <Button size="sm" variant="outline" onClick={addBracket}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {(form.brackets || []).map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Umbral USD"
                      value={b.threshold_usd}
                      onChange={(e) => updateBracket(i, "threshold_usd", parseFloat(e.target.value) || 0)}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="%"
                      value={b.percentage}
                      onChange={(e) => updateBracket(i, "percentage", parseFloat(e.target.value) || 0)}
                    />
                    <Button size="sm" variant="outline" onClick={() => removeBracket(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Componente Ventas */}
            <div>
              <h3 className="font-semibold text-sm mb-2">2. Componente Ventas (interpolación lineal)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Piso (USD margen)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.sales_floor_usd ?? ""}
                    onChange={(e) => setF("sales_floor_usd", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>% en el piso</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.sales_floor_pct ?? ""}
                    onChange={(e) => setF("sales_floor_pct", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Target (USD margen)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.sales_target_usd ?? ""}
                    onChange={(e) => setF("sales_target_usd", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>% en el target</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.sales_target_pct ?? ""}
                    onChange={(e) => setF("sales_target_pct", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Componente Gestión */}
            <div>
              <h3 className="font-semibold text-sm mb-2">3. Componente Gestión</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Promedio de 2 indicadores (cotizaciones y leads). Si el promedio es menor que el piso, se eleva al piso.
              </p>

              <p className="text-xs font-medium mt-3 mb-1">Indicador 1: Conversión sobre cotizaciones</p>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">Tasa piso</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={form.mgmt_quotations_floor_rate ?? ""}
                    onChange={(e) => setF("mgmt_quotations_floor_rate", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label className="text-xs">% piso</Label>
                  <Input
                    type="number"
                    value={form.mgmt_quotations_floor_pct ?? ""}
                    onChange={(e) => setF("mgmt_quotations_floor_pct", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Tasa target</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={form.mgmt_quotations_target_rate ?? ""}
                    onChange={(e) => setF("mgmt_quotations_target_rate", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label className="text-xs">% target</Label>
                  <Input
                    type="number"
                    value={form.mgmt_quotations_target_pct ?? ""}
                    onChange={(e) => setF("mgmt_quotations_target_pct", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <p className="text-xs font-medium mt-3 mb-1">Indicador 2: Conversión sobre leads</p>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">Tasa piso</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={form.mgmt_leads_floor_rate ?? ""}
                    onChange={(e) => setF("mgmt_leads_floor_rate", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label className="text-xs">% piso</Label>
                  <Input
                    type="number"
                    value={form.mgmt_leads_floor_pct ?? ""}
                    onChange={(e) => setF("mgmt_leads_floor_pct", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Tasa target</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={form.mgmt_leads_target_rate ?? ""}
                    onChange={(e) => setF("mgmt_leads_target_rate", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label className="text-xs">% target</Label>
                  <Input
                    type="number"
                    value={form.mgmt_leads_target_pct ?? ""}
                    onChange={(e) => setF("mgmt_leads_target_pct", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="mt-3">
                <Label>Piso global del componente Gestión (%)</Label>
                <Input
                  type="number"
                  value={form.mgmt_floor_pct ?? ""}
                  onChange={(e) => setF("mgmt_floor_pct", parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Pesos */}
            <div>
              <h3 className="font-semibold text-sm mb-2">4. Pesos del factor (deben sumar 100)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Peso Ventas (%)</Label>
                  <Input
                    type="number"
                    value={form.factor_sales_weight_pct ?? ""}
                    onChange={(e) => setF("factor_sales_weight_pct", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Peso Gestión (%)</Label>
                  <Input
                    type="number"
                    value={form.factor_mgmt_weight_pct ?? ""}
                    onChange={(e) => setF("factor_mgmt_weight_pct", parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Estado */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={form.enabled ?? true}
                onChange={(e) => setF("enabled", e.target.checked)}
              />
              <Label htmlFor="enabled">Regla activa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
