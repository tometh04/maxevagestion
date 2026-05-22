"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, RefreshCw, Check, DollarSign, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface Settlement {
  id: string
  seller_id: string
  year_month: string
  total_margin_usd: number
  base_commission_usd: number
  performance_factor_pct: number
  final_commission_usd: number
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID" | "CANCELLED"
  mgmt_manual_indicator_pct: number | null
  retroactive_adjustment_usd: number
  bracket_applied_pct: number
  sales_component_pct: number
  mgmt_component_pct: number
  approved_at: string | null
  paid_at: string | null
  notes: string | null
  quotations_sent_count: number
  leads_received_count: number
  sales_closed_count: number
  users?: { id: string; name: string; email: string }
  approved_by?: { name: string } | null
}

interface Props {
  defaultYearMonth: string
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Borrador", variant: "secondary" },
  PENDING_APPROVAL: { label: "Pendiente aprobación", variant: "outline" },
  APPROVED: { label: "Aprobado", variant: "default" },
  PAID: { label: "Pagado", variant: "default" },
  CANCELLED: { label: "Cancelado", variant: "destructive" },
}

function listLast12Months(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  const today = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
    out.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return out
}

function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—"
  return `USD ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function CommissionsMonthlySettlementsClient({ defaultYearMonth }: Props) {
  const [yearMonth, setYearMonth] = useState(defaultYearMonth)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [manualDialogFor, setManualDialogFor] = useState<Settlement | null>(null)
  const [manualValue, setManualValue] = useState<string>("")

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/commissions/monthly/settlements?year_month=${yearMonth}`, {
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSettlements(data.settlements || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonth])

  async function handleGenerate() {
    if (!confirm(`¿Generar drafts de comisiones para ${yearMonth}? Los settlements ya aprobados/pagados NO se tocan.`)) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/commissions/monthly/settlements/generate/${yearMonth}`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(
        `Generado: ${data.summary.created} nuevos, ${data.summary.updated} actualizados, ${data.summary.locked} bloqueados, ${data.summary.errors} errores`
      )
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function patchSettlement(id: string, action: string, value?: any, notes?: string) {
    try {
      const res = await fetch(`/api/commissions/monthly/settlements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value, notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Actualizado")
      await load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function handleSaveManualIndicator() {
    if (!manualDialogFor) return
    const num = manualValue === "" ? null : parseFloat(manualValue)
    if (num !== null && (isNaN(num) || num < 0 || num > 100)) {
      toast.error("Valor inválido (0-100)")
      return
    }
    await patchSettlement(manualDialogFor.id, "set_manual_indicator", num)
    setManualDialogFor(null)
    setManualValue("")
  }

  const totalFinal = settlements.reduce((s, x) => s + (x.final_commission_usd || 0), 0)
  const months = listLast12Months()

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Liquidaciones mensuales</h1>
          <p className="text-muted-foreground">
            Comisiones de vendedoras del mes. Generá los drafts el 1ro y aprobá antes del 15.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={yearMonth} onValueChange={setYearMonth}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generar {yearMonth}
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <Card>
        <CardContent className="py-4 flex gap-8 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Settlements</p>
            <p className="text-2xl font-semibold">{settlements.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total a pagar</p>
            <p className="text-2xl font-semibold">{formatUsd(totalFinal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pendientes aprobación</p>
            <p className="text-2xl font-semibold">
              {settlements.filter((s) => s.status === "DRAFT" || s.status === "PENDING_APPROVAL").length}
            </p>
          </div>
        </CardContent>
      </Card>

      {settlements.length === 0 && !loading && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            No hay liquidaciones para {yearMonth}. Generá con el botón de arriba.
          </CardContent>
        </Card>
      )}

      {settlements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalle</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedora</TableHead>
                  <TableHead>Margen</TableHead>
                  <TableHead>Tramo</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Factor</TableHead>
                  <TableHead>Ajuste</TableHead>
                  <TableHead>Final</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.users?.name}</div>
                      <div className="text-xs text-muted-foreground">{s.users?.email}</div>
                    </TableCell>
                    <TableCell>{formatUsd(s.total_margin_usd)}</TableCell>
                    <TableCell>{s.bracket_applied_pct}%</TableCell>
                    <TableCell>{formatUsd(s.base_commission_usd)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{s.performance_factor_pct}%</div>
                      <div className="text-xs text-muted-foreground">
                        V {s.sales_component_pct}% · G {s.mgmt_component_pct}%
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.retroactive_adjustment_usd !== 0 ? (
                        <span className="text-destructive">{formatUsd(s.retroactive_adjustment_usd)}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">{formatUsd(s.final_commission_usd)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_LABELS[s.status]?.variant || "outline"}>
                        {STATUS_LABELS[s.status]?.label || s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {(s.status === "DRAFT" || s.status === "PENDING_APPROVAL") && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setManualDialogFor(s)
                              setManualValue(s.mgmt_manual_indicator_pct?.toString() ?? "")
                            }}
                            title="Cargar indicador manual (auditoría)"
                          >
                            Auditoría
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => patchSettlement(s.id, "recalculate")}
                            title="Recalcular"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => patchSettlement(s.id, "approve")}
                          >
                            <Check className="h-3 w-3 mr-1" /> Aprobar
                          </Button>
                        </>
                      )}
                      {s.status === "APPROVED" && (
                        <Button
                          size="sm"
                          onClick={() => patchSettlement(s.id, "mark_paid")}
                        >
                          <DollarSign className="h-3 w-3 mr-1" /> Pagado
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog: cargar 3er indicador */}
      <Dialog open={!!manualDialogFor} onOpenChange={(o) => !o && setManualDialogFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Indicador de auditoría</DialogTitle>
            <DialogDescription>
              Vendedora: <strong>{manualDialogFor?.users?.name}</strong> · {yearMonth}
              <br />
              Cargá el % de auditoría (0—100). Vacío para no incluir.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>% Auditoría</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="Ej: 85"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Al guardar, se recalcula la comisión incluyendo este indicador en el promedio de gestión.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogFor(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveManualIndicator}>Guardar y recalcular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
