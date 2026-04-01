"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileText, Download, Loader2, Search, ShieldAlert, RefreshCw, AlertCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Agency {
  id: string
  name: string
}

interface Voucher {
  // AFIP mis-comprobantes field names (Spanish with spaces)
  "Fecha de Emisión"?: string
  "Fecha de Emision"?: string
  "Tipo de Comprobante"?: string
  "Punto de Venta"?: string
  "Número Desde"?: string
  "Numero Desde"?: string
  "Denominación Receptor"?: string
  "Denominacion Receptor"?: string
  "Denominación Emisor"?: string
  "Nro. Doc. Receptor"?: string
  "Nro. Doc. Emisor"?: string
  "Imp. Total"?: string
  "Imp. Neto Gravado"?: string
  "IVA"?: string
  "Moneda"?: string
  "Cód. Autorización"?: string
  "Cod. Autorizacion"?: string
  // Legacy/alternative field names
  fecha?: string
  fechaEmision?: string
  tipoComprobante?: string
  tipo?: string
  puntoVenta?: string | number
  numero?: string | number
  nroComprobante?: string | number
  nroDesde?: string | number
  cuitEmisor?: string
  denominacionEmisor?: string
  razonSocial?: string
  impTotal?: number
  importeTotal?: number
  impNeto?: number
  importeNeto?: number
  impIVA?: number
  importeIVA?: number
  moneda?: string
  tipoMoneda?: string
  cae?: string
  codAutorizacion?: string
  estado?: string
  [key: string]: any
}

interface FacturasComprasPageClientProps {
  agencies: Agency[]
}

export function FacturasComprasPageClient({ agencies }: FacturasComprasPageClientProps) {
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(agencies[0]?.id || "")
  const [dateFrom, setDateFrom] = useState("01/01/2026")
  const [dateTo, setDateTo] = useState("31/12/2026")
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  // Password dialog
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [afipPassword, setAfipPassword] = useState("")

  const fetchVouchers = useCallback(async (password: string) => {
    if (!selectedAgencyId || !password) return

    setShowPasswordDialog(false)
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/accounting/facturas-compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId: selectedAgencyId,
          dateFrom,
          dateTo,
          afipPassword: password,
        }),
      })
      const data = await res.json()

      if (data.error && !data.vouchers?.length) {
        const errorMsg = data.errorDetails
          ? `${data.error} (${typeof data.errorDetails === "string" ? data.errorDetails : JSON.stringify(data.errorDetails)})`
          : data.error
        setError(errorMsg)
      }

      setVouchers(data.vouchers || [])
      setFetched(true)
    } catch (err: any) {
      setError(err.message || "Error al consultar")
    } finally {
      setLoading(false)
    }
  }, [selectedAgencyId, dateFrom, dateTo])

  const handleConsultarClick = () => {
    if (!selectedAgencyId) return
    setShowPasswordDialog(true)
  }

  const handlePasswordSubmit = () => {
    fetchVouchers(afipPassword)
  }

  // Parse AFIP money strings like "4.687,20" or "0,00" to numbers
  const parseAfipMoney = (val: any): number => {
    if (typeof val === "number") return val
    if (!val || val === "—") return 0
    // AFIP format: "1.234,56" → remove dots (thousands), replace comma with dot
    return parseFloat(String(val).replace(/\./g, "").replace(",", ".")) || 0
  }

  // Normalize voucher fields — AFIP mis-comprobantes returns fields with
  // Spanish names and spaces like "Fecha de Emisión", "Imp. Total", etc.
  // For received invoices (t=R), the counterpart is labeled "Receptor" in the data.
  const normalizeVoucher = (v: Voucher) => ({
    fecha: v["Fecha de Emisión"] || v["Fecha de Emision"] || v.fecha || v.fechaEmision || "—",
    tipo: v["Tipo de Comprobante"] || v.tipoComprobante || v.tipo || "—",
    puntoVenta: v["Punto de Venta"] || v.puntoVenta || v.ptoVta || "—",
    numero: v["Número Desde"] || v["Numero Desde"] || v.numero || v.nroComprobante || v.nroDesde || "—",
    emisor: v["Denominación Receptor"] || v["Denominacion Receptor"] || v["Denominación Emisor"] || v.denominacionEmisor || v.razonSocial || "—",
    cuitEmisor: v["Nro. Doc. Receptor"] || v["Nro. Doc. Emisor"] || v.cuitEmisor || "—",
    total: parseAfipMoney(v["Imp. Total"] ?? v.impTotal ?? v.importeTotal ?? 0),
    neto: parseAfipMoney(v["Imp. Neto Gravado"] ?? v.impNeto ?? v.importeNeto ?? 0),
    iva: parseAfipMoney(v["IVA"] ?? v.impIVA ?? v.importeIVA ?? 0),
    moneda: v["Moneda"] || v.moneda || v.tipoMoneda || "ARS",
    cae: v["Cód. Autorización"] || v["Cod. Autorizacion"] || v.cae || v.codAutorizacion || "—",
    estado: v.estado || "—",
  })

  const filteredVouchers = vouchers
    .map(normalizeVoucher)
    .filter((v) => {
      if (!searchTerm) return true
      const term = searchTerm.toLowerCase()
      return (
        v.emisor.toLowerCase().includes(term) ||
        v.cuitEmisor.includes(term) ||
        v.tipo.toLowerCase().includes(term) ||
        String(v.numero).includes(term)
      )
    })

  const totalAmount = filteredVouchers.reduce((sum, v) => sum + Number(v.total || 0), 0)
  const totalIVA = filteredVouchers.reduce((sum, v) => sum + Number(v.iva || 0), 0)

  const formatMoney = (amount: number) =>
    `$ ${Number(amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const getTypeBadgeVariant = (tipo: string): "default" | "secondary" | "destructive" | "outline" => {
    if (tipo.includes("Crédito") || tipo.includes("NC")) return "destructive"
    if (tipo.includes("Débito") || tipo.includes("ND")) return "outline"
    return "secondary"
  }

  const exportCSV = () => {
    const headers = ["Fecha", "Tipo", "Pto Vta", "Número", "Emisor", "CUIT Emisor", "Total", "Neto", "IVA", "Moneda", "CAE"]
    const rows = filteredVouchers.map((v) => [
      v.fecha, v.tipo, v.puntoVenta, v.numero, v.emisor, v.cuitEmisor,
      v.total, v.neto, v.iva, v.moneda, v.cae,
    ])
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `facturas-compras-${dateFrom.replace(/\//g, "")}-${dateTo.replace(/\//g, "")}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="rounded-xl border-border/40">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-500" />
            <div>
              <CardTitle className="text-base">Facturas de Compras</CardTitle>
              <CardDescription>
                Comprobantes recibidos desde AFIP (facturas que te emitieron proveedores)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Agencia</Label>
              <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                <SelectTrigger className="h-8 text-xs min-w-[160px]">
                  <SelectValue placeholder="Seleccionar agencia" />
                </SelectTrigger>
                <SelectContent>
                  {agencies.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input
                className="h-8 text-xs w-[130px]"
                placeholder="DD/MM/AAAA"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input
                className="h-8 text-xs w-[130px]"
                placeholder="DD/MM/AAAA"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <Button
              size="sm"
              onClick={handleConsultarClick}
              disabled={loading || !selectedAgencyId}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {loading ? "Consultando AFIP..." : "Consultar"}
            </Button>

            {fetched && vouchers.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="rounded-xl border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {fetched && vouchers.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-xl border-border/40">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Comprobantes</div>
              <div className="text-2xl font-bold">{filteredVouchers.length}</div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-border/40">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Monto Total</div>
              <div className="text-2xl font-bold">{formatMoney(totalAmount)}</div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-border/40">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">IVA Total</div>
              <div className="text-2xl font-bold">{formatMoney(totalIVA)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      {fetched && (
        <Card className="rounded-xl border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {vouchers.length > 0 ? `${filteredVouchers.length} comprobante${filteredVouchers.length !== 1 ? "s" : ""}` : "Sin comprobantes"}
              </CardTitle>
              {vouchers.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por emisor, CUIT..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-8 text-xs w-[240px]"
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {vouchers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">No se encontraron comprobantes recibidos en el período</p>
              </div>
            ) : (
              <ScrollArea className="w-full">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Fecha</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Pto Vta</TableHead>
                        <TableHead className="text-xs">Número</TableHead>
                        <TableHead className="text-xs">Emisor</TableHead>
                        <TableHead className="text-xs">CUIT</TableHead>
                        <TableHead className="text-xs text-right">Neto</TableHead>
                        <TableHead className="text-xs text-right">IVA</TableHead>
                        <TableHead className="text-xs text-right">Total</TableHead>
                        <TableHead className="text-xs">CAE</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVouchers.map((v, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs whitespace-nowrap">{v.fecha}</TableCell>
                          <TableCell>
                            <Badge variant={getTypeBadgeVariant(v.tipo)} className="text-[10px] font-mono">
                              {v.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-center">{v.puntoVenta}</TableCell>
                          <TableCell className="text-xs font-mono">{v.numero}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{v.emisor}</TableCell>
                          <TableCell className="text-xs font-mono">{v.cuitEmisor}</TableCell>
                          <TableCell className="text-xs text-right">{formatMoney(v.neto)}</TableCell>
                          <TableCell className="text-xs text-right">{formatMoney(v.iva)}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{formatMoney(v.total)}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{v.cae}</TableCell>
                        </TableRow>
                      ))}
                      {/* Totals row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={6} className="text-xs">TOTALES</TableCell>
                        <TableCell className="text-xs text-right">
                          {formatMoney(filteredVouchers.reduce((s, v) => s + Number(v.neto || 0), 0))}
                        </TableCell>
                        <TableCell className="text-xs text-right">{formatMoney(totalIVA)}</TableCell>
                        <TableCell className="text-xs text-right">{formatMoney(totalAmount)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state before first fetch */}
      {!fetched && !loading && (
        <Card className="rounded-xl border-border/40">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ShieldAlert className="h-12 w-12 mb-4 opacity-30" />
            <h3 className="font-semibold text-lg mb-1 text-foreground">Comprobantes Recibidos de AFIP</h3>
            <p className="text-sm text-center max-w-md">
              Seleccioná una agencia y el rango de fechas, luego hacé click en &quot;Consultar&quot; para traer
              todas las facturas de compra emitidas a tu CUIT desde AFIP.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clave Fiscal AFIP</DialogTitle>
            <DialogDescription>
              Para consultar comprobantes recibidos, se necesita la clave fiscal del portal de AFIP.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-foreground/70" />
                <span className="text-xs font-medium text-foreground/70">Credenciales AFIP</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Clave Fiscal</Label>
                <Input
                  type="password"
                  placeholder="Ingresá tu clave fiscal"
                  value={afipPassword}
                  onChange={(e) => setAfipPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  Se usa solo para esta consulta. No se almacena.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePasswordSubmit} disabled={!afipPassword}>
              Consultar AFIP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
