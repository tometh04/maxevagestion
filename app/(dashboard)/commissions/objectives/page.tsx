"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { Plus, Trash2, Loader2, Target, Trophy, TrendingUp, Users, DollarSign, Percent, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Switch } from "@/components/ui/switch"

interface Objective {
  id: string
  name: string
  description: string | null
  metric_type: string
  target_value: number
  target_currency: string
  reward_type: string
  reward_value: number
  reward_currency: string
  period_type: string
  seller_id: string | null
  is_active: boolean
  seller?: { id: string; name: string } | null
  agency?: { id: string; name: string } | null
}

const METRIC_LABELS: Record<string, { label: string; icon: any; description: string }> = {
  TRIPS_SOLD: { label: "Viajes vendidos", icon: Target, description: "Cantidad de operaciones cerradas" },
  REVENUE_AMOUNT: { label: "Monto de venta", icon: DollarSign, description: "Total facturado en ventas" },
  MARGIN_AMOUNT: { label: "Margen generado", icon: TrendingUp, description: "Total de margen generado" },
  NEW_CUSTOMERS: { label: "Clientes nuevos", icon: Users, description: "Nuevos clientes captados" },
  CONVERSION_RATE: { label: "Tasa de conversión", icon: Percent, description: "% de leads convertidos a operación" },
}

const REWARD_LABELS: Record<string, string> = {
  BONUS_PERCENTAGE: "Bonus en % sobre margen",
  BONUS_FIXED: "Bonus fijo ($)",
  PERCENTAGE_INCREASE: "Aumento de % de comisión",
}

const PERIOD_LABELS: Record<string, string> = {
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  ANNUAL: "Anual",
}

export default function ObjectivesPage() {
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sellers, setSellers] = useState<Array<{ id: string; name: string }>>([])

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    metric_type: "TRIPS_SOLD",
    target_value: "",
    target_currency: "ARS",
    reward_type: "BONUS_PERCENTAGE",
    reward_value: "",
    reward_currency: "ARS",
    period_type: "MONTHLY",
    seller_id: "ALL",
  })

  const fetchObjectives = useCallback(async () => {
    try {
      const res = await fetch("/api/commissions/objectives")
      if (res.ok) {
        const data = await res.json()
        setObjectives(data.objectives || [])
      }
    } catch (error) {
      console.error("Error fetching objectives:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSellers = useCallback(async () => {
    try {
      const res = await fetch("/api/users?role=SELLER")
      if (res.ok) {
        const data = await res.json()
        setSellers(data.users || [])
      }
    } catch {
      // Fallback empty
    }
  }, [])

  useEffect(() => {
    fetchObjectives()
    fetchSellers()
  }, [fetchObjectives, fetchSellers])

  const handleCreate = async () => {
    if (!formData.name || !formData.target_value || !formData.reward_value) {
      toast.error("Completá todos los campos requeridos")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/commissions/objectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          target_value: parseFloat(formData.target_value),
          reward_value: parseFloat(formData.reward_value),
          seller_id: formData.seller_id === "ALL" ? null : formData.seller_id,
        }),
      })

      if (res.ok) {
        toast.success("Objetivo creado correctamente")
        setShowDialog(false)
        setFormData({
          name: "",
          description: "",
          metric_type: "TRIPS_SOLD",
          target_value: "",
          target_currency: "ARS",
          reward_type: "BONUS_PERCENTAGE",
          reward_value: "",
          reward_currency: "ARS",
          period_type: "MONTHLY",
          seller_id: "ALL",
        })
        fetchObjectives()
      } else {
        const error = await res.json()
        toast.error(error.error || "Error al crear objetivo")
      }
    } catch {
      toast.error("Error al crear objetivo")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/commissions/objectives", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !isActive }),
      })
      if (res.ok) {
        toast.success(isActive ? "Objetivo desactivado" : "Objetivo activado")
        fetchObjectives()
      }
    } catch {
      toast.error("Error al actualizar objetivo")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este objetivo?")) return
    try {
      const res = await fetch(`/api/commissions/objectives?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Objetivo eliminado")
        fetchObjectives()
      }
    } catch {
      toast.error("Error al eliminar")
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/commissions">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Trophy className="h-6 w-6 text-accent-coral" />
              Objetivos de Vendedores
            </h1>
            <p className="text-muted-foreground text-sm">
              Configurá reglas de bonificación por metas alcanzadas
            </p>
          </div>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Objetivo
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Objetivos Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{objectives.filter(o => o.is_active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vendedores con Objetivos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {new Set(objectives.filter(o => o.is_active && o.seller_id).map(o => o.seller_id)).size || "Todos"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tipos de Métrica</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {new Set(objectives.filter(o => o.is_active).map(o => o.metric_type)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Objectives table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : objectives.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium">No hay objetivos configurados</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              Creá objetivos para motivar a tus vendedores con bonificaciones extra por metas alcanzadas
            </p>
            <Button className="mt-4" onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear primer objetivo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Objetivo</TableHead>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead>Recompensa</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {objectives.map((obj) => {
                const metric = METRIC_LABELS[obj.metric_type]
                const MetricIcon = metric?.icon || Target
                return (
                  <TableRow key={obj.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{obj.name}</p>
                        {obj.description && (
                          <p className="text-xs text-muted-foreground">{obj.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MetricIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{metric?.label || obj.metric_type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {["REVENUE_AMOUNT", "MARGIN_AMOUNT"].includes(obj.metric_type)
                        ? `${obj.target_currency} $${obj.target_value.toLocaleString("es-AR")}`
                        : obj.metric_type === "CONVERSION_RATE"
                        ? `${obj.target_value}%`
                        : obj.target_value
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {obj.reward_type === "BONUS_FIXED"
                          ? `$${obj.reward_value.toLocaleString("es-AR")}`
                          : `+${obj.reward_value}%`
                        }
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {REWARD_LABELS[obj.reward_type]}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {PERIOD_LABELS[obj.period_type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {obj.seller?.name || (
                        <span className="text-muted-foreground text-sm">Todos</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={obj.is_active}
                        onCheckedChange={() => handleToggleActive(obj.id, obj.is_active)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive/80"
                        onClick={() => handleDelete(obj.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Objetivo</DialogTitle>
            <DialogDescription>
              Definí una meta y la recompensa para los vendedores
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del objetivo *</Label>
              <Input
                placeholder="Ej: Meta mensual de ventas"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                placeholder="Descripción opcional del objetivo..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Métrica *</Label>
                <Select
                  value={formData.metric_type}
                  onValueChange={(v) => setFormData({ ...formData, metric_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METRIC_LABELS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {METRIC_LABELS[formData.metric_type]?.description}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Período *</Label>
                <Select
                  value={formData.period_type}
                  onValueChange={(v) => setFormData({ ...formData, period_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Meta *</Label>
                <DecimalInput
                  placeholder={["REVENUE_AMOUNT", "MARGIN_AMOUNT"].includes(formData.metric_type) ? "1000000" : "10"}
                  value={formData.target_value}
                  onChange={(v) => setFormData({ ...formData, target_value: v })}
                />
              </div>

              {["REVENUE_AMOUNT", "MARGIN_AMOUNT"].includes(formData.metric_type) && (
                <div className="space-y-2">
                  <Label>Moneda</Label>
                  <Select
                    value={formData.target_currency}
                    onValueChange={(v) => setFormData({ ...formData, target_currency: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARS">ARS</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Recompensa</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de recompensa *</Label>
                  <Select
                    value={formData.reward_type}
                    onValueChange={(v) => setFormData({ ...formData, reward_type: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(REWARD_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <DecimalInput
                    placeholder={formData.reward_type === "BONUS_FIXED" ? "50000" : "5"}
                    value={formData.reward_value}
                    onChange={(v) => setFormData({ ...formData, reward_value: v })}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="space-y-2">
                <Label>Aplica a</Label>
                <Select
                  value={formData.seller_id}
                  onValueChange={(v) => setFormData({ ...formData, seller_id: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos los vendedores</SelectItem>
                    {sellers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear Objetivo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
