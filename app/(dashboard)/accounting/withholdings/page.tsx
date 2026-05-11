"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
import { Loader2, Plus, ShieldCheck, TrendingDown, TrendingUp, Receipt } from "lucide-react"
import { format } from "date-fns"

interface Withholding {
  id: string
  type: string
  direction: string
  source_type: string
  amount: number
  currency: string
  tax_period: string
  withholding_date: string
  counterpart_cuit: string | null
  counterpart_name: string | null
  status: string
  notes: string | null
  operations?: { id: string; file_code: string; destination: string } | null
  operators?: { id: string; name: string } | null
}

interface CurrencyAmount {
  ars: number
  usd: number
}

interface Totals {
  percepcion_iva: CurrencyAmount
  percepcion_iibb: CurrencyAmount
  retencion_ganancias: CurrencyAmount
  retencion_iva: CurrencyAmount
  retencion_iibb: CurrencyAmount
  total_a_favor: CurrencyAmount
  total_practicadas: CurrencyAmount
}

const TYPE_LABELS: Record<string, string> = {
  PERCEPCION_IVA: "Percepción IVA",
  PERCEPCION_IIBB: "Percepción IIBB",
  RETENCION_GANANCIAS: "Retención Ganancias",
  RETENCION_IVA: "Retención IVA",
  RETENCION_IIBB: "Retención IIBB",
  PERCEPCION_RG5617_30: "RG 5617 — 30%",
  PERCEPCION_RG3819_5: "RG 3819 — 5%",
}

const DIRECTION_LABELS: Record<string, string> = {
  SUFFERED: "Sufrida (a favor)",
  PRACTICED: "Practicada (retenida)",
}

const SOURCE_LABELS: Record<string, string> = {
  PURCHASE_INVOICE: "Factura de compra",
  BANK_MOVEMENT: "Movimiento bancario",
  OPERATOR_PAYMENT: "Pago a operador",
  PAYMENT: "Cobro de cliente",
  AUTO: "Cálculo automático",
  MANUAL: "Carga manual",
}

export default function WithholdingsPage() {
  const { toast } = useToast()
  const [withholdings, setWithholdings] = useState<Withholding[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)

  // Filters
  const currentMonth = new Date().toISOString().substring(0, 7)
  const [period, setPeriod] = useState(currentMonth)
  const [filterType, setFilterType] = useState("ALL")
  const [filterDirection, setFilterDirection] = useState("ALL")

  // Form
  const [form, setForm] = useState({
    type: "PERCEPCION_IVA",
    direction: "SUFFERED",
    source_type: "BANK_MOVEMENT",
    counterpart_cuit: "",
    counterpart_name: "",
    currency: "ARS",
    amount: "",
    withholding_date: new Date().toISOString().split("T")[0],
    notes: "",
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (period) params.set("period", period)
      if (filterType !== "ALL") params.set("type", filterType)
      if (filterDirection !== "ALL") params.set("direction", filterDirection)

      const res = await fetch(`/api/accounting/withholdings?${params}`)
      if (res.ok) {
        const data = await res.json()
        setWithholdings(data.withholdings || [])
        setTotals(data.totals || null)
      }
    } catch (err) {
      console.error("Error fetching withholdings:", err)
    } finally {
      setLoading(false)
    }
  }, [period, filterType, filterDirection])

  useEffect(() => { fetchData() }, [fetchData])

  const { sortedData: sortedWithholdings, sortConfig, requestSort } = useSortableData(withholdings, {
    key: "withholding_date",
    direction: "desc",
  })

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast({ title: "Error", description: "Ingresá un monto válido", variant: "destructive" })
      return
    }

    try {
      const res = await fetch("/api/accounting/withholdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          tax_period: period || form.withholding_date.substring(0, 7),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      toast({ title: "Percepción/Retención registrada" })
      setShowDialog(false)
      setForm({
        type: "PERCEPCION_IVA", direction: "SUFFERED", source_type: "BANK_MOVEMENT",
        counterpart_cuit: "", counterpart_name: "", currency: "ARS",
        amount: "", withholding_date: new Date().toISOString().split("T")[0], notes: "",
      })
      await fetchData()
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    }
  }

  const formatMoney = (amount: number, currency: string = "ARS") =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency === "USD" ? "USD" : "ARS",
      minimumFractionDigits: 2,
    }).format(amount)

  const formatCurrencyAmount = (ca: CurrencyAmount) => {
    const parts: string[] = []
    if (ca.ars) parts.push(formatMoney(ca.ars, "ARS"))
    if (ca.usd) parts.push(formatMoney(ca.usd, "USD"))
    if (parts.length === 0) return formatMoney(0)
    return parts.join(" + ")
  }

  // Bug fix 2026-05-06: usar new Date("2026-05-01") parsea como UTC
  // medianoche, que en AR (UTC-3) se muestra como abril 30. Resultado:
  // header del Detalle decía "abril de 2026" cuando el filtro estaba
  // en mayo. Construimos la fecha en zona local.
  const periodLabel = (() => {
    if (!period) return "Todos"
    const [yr, mo] = period.split("-").map(Number)
    if (!yr || !mo) return "Todos"
    return new Date(yr, mo - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" })
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Cargar Percepción / Retención
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Período Fiscal</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-[180px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="PERCEPCION_IVA">Percepción IVA</SelectItem>
                  <SelectItem value="PERCEPCION_IIBB">Percepción IIBB</SelectItem>
                  <SelectItem value="RETENCION_GANANCIAS">Retención Ganancias</SelectItem>
                  <SelectItem value="RETENCION_IVA">Retención IVA</SelectItem>
                  <SelectItem value="RETENCION_IIBB">Retención IIBB</SelectItem>
                  <SelectItem value="PERCEPCION_RG5617_30">RG 5617 — 30%</SelectItem>
                  <SelectItem value="PERCEPCION_RG3819_5">RG 3819 — 5%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dirección</Label>
              <Select value={filterDirection} onValueChange={setFilterDirection}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  <SelectItem value="SUFFERED">Sufridas (a favor)</SelectItem>
                  <SelectItem value="PRACTICED">Practicadas (retenidas)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      {totals && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-xs text-muted-foreground">Total a Favor (sufridas)</span>
              </div>
              <p className="text-xl font-bold text-success">{formatMoney(totals.total_a_favor.ars)}</p>
              {totals.total_a_favor.usd > 0 && (
                <p className="text-sm font-medium text-success/80 mt-0.5">{formatMoney(totals.total_a_favor.usd, "USD")}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Percepción IVA</span>
              </div>
              <p className="text-xl font-bold">{formatMoney(totals.percepcion_iva.ars)}</p>
              {totals.percepcion_iva.usd > 0 && (
                <p className="text-sm font-medium text-muted-foreground mt-0.5">{formatMoney(totals.percepcion_iva.usd, "USD")}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-accent-violet" />
                <span className="text-xs text-muted-foreground">Percepción IIBB</span>
              </div>
              <p className="text-xl font-bold">{formatMoney(totals.percepcion_iibb.ars)}</p>
              {totals.percepcion_iibb.usd > 0 && (
                <p className="text-sm font-medium text-muted-foreground mt-0.5">{formatMoney(totals.percepcion_iibb.usd, "USD")}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-accent-coral" />
                <span className="text-xs text-muted-foreground">Retenciones Practicadas</span>
              </div>
              <p className="text-xl font-bold">{formatMoney(totals.total_practicadas.ars)}</p>
              {totals.total_practicadas.usd > 0 && (
                <p className="text-sm font-medium text-muted-foreground mt-0.5">{formatMoney(totals.total_practicadas.usd, "USD")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle — {periodLabel}</CardTitle>
          <CardDescription>{withholdings.length} registros</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : withholdings.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">
              No hay percepciones ni retenciones para el período seleccionado
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="withholding_date" sortConfig={sortConfig} onSort={requestSort}>Fecha</SortableTableHead>
                  <SortableTableHead sortKey="type" sortConfig={sortConfig} onSort={requestSort}>Tipo</SortableTableHead>
                  <SortableTableHead sortKey="direction" sortConfig={sortConfig} onSort={requestSort}>Dirección</SortableTableHead>
                  <SortableTableHead sortKey="source_type" sortConfig={sortConfig} onSort={requestSort}>Origen</SortableTableHead>
                  <SortableTableHead sortKey="counterpart_name" sortConfig={sortConfig} onSort={requestSort}>Contraparte</SortableTableHead>
                  <SortableTableHead sortKey="operations.file_code" sortConfig={sortConfig} onSort={requestSort}>Operación</SortableTableHead>
                  <SortableTableHead sortKey="amount" sortConfig={sortConfig} onSort={requestSort} className="text-right">Monto</SortableTableHead>
                  <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={requestSort}>Estado</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedWithholdings.map(w => (
                  <TableRow key={w.id}>
                    <TableCell className="text-sm">
                      {w.withholding_date ? format(new Date(w.withholding_date + "T12:00:00"), "dd/MM/yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[w.type] || w.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.direction === "SUFFERED" ? "default" : "secondary"} className="text-xs">
                        {w.direction === "SUFFERED" ? "A favor" : "Retenida"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {SOURCE_LABELS[w.source_type] || w.source_type}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{w.counterpart_name || w.operators?.name || "-"}</div>
                      {w.counterpart_cuit && <div className="text-xs text-muted-foreground">{w.counterpart_cuit}</div>}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {w.operations?.file_code || "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      <span className={w.direction === "SUFFERED" ? "text-success" : "text-accent-coral"}>
                        {formatMoney(w.amount, w.currency)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.status === "APPLIED" ? "default" : "secondary"} className="text-xs">
                        {w.status === "APPLIED" ? "Aplicada" : w.status === "EXPIRED" ? "Vencida" : "Pendiente"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog for manual entry */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cargar Percepción / Retención</DialogTitle>
            <DialogDescription>
              Registrar una percepción bancaria, retención a operador, u otra
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCEPCION_IVA">Percepción IVA</SelectItem>
                    <SelectItem value="PERCEPCION_IIBB">Percepción IIBB</SelectItem>
                    <SelectItem value="RETENCION_GANANCIAS">Retención Ganancias</SelectItem>
                    <SelectItem value="RETENCION_IVA">Retención IVA</SelectItem>
                    <SelectItem value="RETENCION_IIBB">Retención IIBB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dirección *</Label>
                <Select value={form.direction} onValueChange={v => setForm(p => ({ ...p, direction: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUFFERED">Sufrida (a favor nuestro)</SelectItem>
                    <SelectItem value="PRACTICED">Practicada (retenimos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Origen</Label>
                <Select value={form.source_type} onValueChange={v => setForm(p => ({ ...p, source_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK_MOVEMENT">Movimiento bancario</SelectItem>
                    <SelectItem value="OPERATOR_PAYMENT">Pago a operador</SelectItem>
                    <SelectItem value="MANUAL">Carga manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha *</Label>
                <Input type="date" value={form.withholding_date} onChange={e => setForm(p => ({ ...p, withholding_date: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CUIT Contraparte</Label>
                <Input placeholder="20-12345678-9" value={form.counterpart_cuit} onChange={e => setForm(p => ({ ...p, counterpart_cuit: e.target.value }))} />
              </div>
              <div>
                <Label>Nombre Contraparte</Label>
                <Input placeholder="Banco Galicia, etc" value={form.counterpart_name} onChange={e => setForm(p => ({ ...p, counterpart_name: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Monto *</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Notas</Label>
              <Input placeholder="Referencia, nro comprobante, etc" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
              <Button onClick={handleSave}>Registrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
