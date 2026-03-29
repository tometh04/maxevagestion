"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import { Loader2, Download, FileText, TrendingUp, TrendingDown, Calculator } from "lucide-react"
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"

export default function LibroIvaPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/accounting/libro-iva?year=${year}&month=${month}`)
      if (res.ok) {
        const d = await res.json()
        setData(d)
      }
    } catch (err) {
      console.error("Error:", err)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchData() }, [fetchData])

  const { sortedData: sortedVentas, sortConfig: ventasSortConfig, requestSort: requestVentasSort } = useSortableData(data?.libro_ventas || [], { key: "created_at", direction: "desc" })
  const { sortedData: sortedCompras, sortConfig: comprasSortConfig, requestSort: requestComprasSort } = useSortableData(data?.libro_compras || [], { key: "invoice_date", direction: "desc" })

  const handleExportCSV = () => {
    window.open(`/api/accounting/libro-iva?year=${year}&month=${month}&format=csv`, "_blank")
  }

  const formatMoney = (amount: number) =>
    `$ ${Number(amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" })

  const cbteTipoLabel = (t: number) => {
    const map: Record<number, string> = { 1: "FA-A", 6: "FA-B", 11: "FA-C", 3: "NC-A", 8: "NC-B", 13: "NC-C" }
    return map[t] || `T${t}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">Libro IVA Ventas y Compras — {monthLabel}</p>
        </div>
        <Button onClick={handleExportCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Period selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Mes</Label>
              <Input
                type="month"
                value={`${year}-${String(month).padStart(2, "0")}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-")
                  setYear(parseInt(y))
                  setMonth(parseInt(m))
                }}
                className="w-[180px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          {/* Posición IVA Summary */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">Débito Fiscal</span>
                </div>
                <p className="text-xl font-bold text-red-600">{formatMoney(data.totals.posicion_iva.debito_fiscal)}</p>
                <p className="text-xs text-muted-foreground">IVA Ventas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-muted-foreground">Crédito Fiscal</span>
                </div>
                <p className="text-xl font-bold text-green-600">{formatMoney(data.totals.posicion_iva.credito_fiscal)}</p>
                <p className="text-xs text-muted-foreground">IVA Compras</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground">Percepciones a Favor</span>
                </div>
                <p className="text-xl font-bold text-blue-600">{formatMoney(data.totals.posicion_iva.percepciones)}</p>
                <p className="text-xs text-muted-foreground">IVA sufridas</p>
              </CardContent>
            </Card>
            <Card className={data.totals.posicion_iva.saldo > 0 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Calculator className="h-4 w-4" />
                  <span className="text-xs text-muted-foreground">
                    {data.totals.posicion_iva.saldo > 0 ? "IVA a Pagar" : "Saldo a Favor"}
                  </span>
                </div>
                <p className={`text-xl font-bold ${data.totals.posicion_iva.saldo > 0 ? "text-red-700" : "text-green-700"}`}>
                  {formatMoney(Math.abs(data.totals.posicion_iva.saldo))}
                </p>
                <p className="text-xs text-muted-foreground">Débito - Crédito - Percepciones</p>
              </CardContent>
            </Card>
          </div>

          {/* Libro IVA Ventas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Badge className="bg-green-100 text-green-700">Ventas</Badge>
                Libro IVA Ventas — {data.libro_ventas?.length || 0} comprobantes
              </CardTitle>
              <CardDescription>Facturas emitidas con CAE de AFIP</CardDescription>
            </CardHeader>
            <CardContent>
              {(data.libro_ventas?.length || 0) === 0 ? (
                <p className="text-center py-6 text-muted-foreground text-sm">Sin facturas emitidas en el período</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead sortKey="created_at" sortConfig={ventasSortConfig} onSort={requestVentasSort}>Fecha</SortableTableHead>
                        <SortableTableHead sortKey="cbte_tipo" sortConfig={ventasSortConfig} onSort={requestVentasSort}>Tipo</SortableTableHead>
                        <SortableTableHead sortKey="cbte_nro" sortConfig={ventasSortConfig} onSort={requestVentasSort}>Número</SortableTableHead>
                        <SortableTableHead sortKey="receptor_doc_nro" sortConfig={ventasSortConfig} onSort={requestVentasSort}>CUIT/DNI</SortableTableHead>
                        <SortableTableHead sortKey="receptor_nombre" sortConfig={ventasSortConfig} onSort={requestVentasSort}>Razón Social</SortableTableHead>
                        <SortableTableHead sortKey="imp_neto" sortConfig={ventasSortConfig} onSort={requestVentasSort} className="text-right">Neto</SortableTableHead>
                        <SortableTableHead sortKey="imp_iva" sortConfig={ventasSortConfig} onSort={requestVentasSort} className="text-right">IVA</SortableTableHead>
                        <SortableTableHead sortKey="imp_total" sortConfig={ventasSortConfig} onSort={requestVentasSort} className="text-right">Total</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedVentas.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="text-sm">{new Date(inv.created_at).toLocaleDateString("es-AR")}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{cbteTipoLabel(inv.cbte_tipo)}</Badge></TableCell>
                          <TableCell className="font-mono text-sm">{String(inv.pto_vta).padStart(4, "0")}-{String(inv.cbte_nro || 0).padStart(8, "0")}</TableCell>
                          <TableCell className="text-sm">{inv.receptor_doc_nro}</TableCell>
                          <TableCell className="text-sm">{inv.receptor_nombre}</TableCell>
                          <TableCell className="text-right text-sm">{formatMoney(inv.imp_neto)}</TableCell>
                          <TableCell className="text-right text-sm text-orange-600">{formatMoney(inv.imp_iva)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatMoney(inv.imp_total)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={5}>TOTAL VENTAS</TableCell>
                        <TableCell className="text-right">{formatMoney(data.totals.ventas.neto)}</TableCell>
                        <TableCell className="text-right text-orange-600">{formatMoney(data.totals.ventas.iva)}</TableCell>
                        <TableCell className="text-right">{formatMoney(data.totals.ventas.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Libro IVA Compras */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Badge className="bg-blue-100 text-blue-700">Compras</Badge>
                Libro IVA Compras — {data.libro_compras?.length || 0} comprobantes
              </CardTitle>
              <CardDescription>Facturas recibidas de operadores</CardDescription>
            </CardHeader>
            <CardContent>
              {(data.libro_compras?.length || 0) === 0 ? (
                <p className="text-center py-6 text-muted-foreground text-sm">Sin facturas de compra en el período</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead sortKey="invoice_date" sortConfig={comprasSortConfig} onSort={requestComprasSort}>Fecha</SortableTableHead>
                        <SortableTableHead sortKey="invoice_type" sortConfig={comprasSortConfig} onSort={requestComprasSort}>Tipo</SortableTableHead>
                        <SortableTableHead sortKey="invoice_number" sortConfig={comprasSortConfig} onSort={requestComprasSort}>Número</SortableTableHead>
                        <SortableTableHead sortKey="emitter_cuit" sortConfig={comprasSortConfig} onSort={requestComprasSort}>CUIT</SortableTableHead>
                        <SortableTableHead sortKey="emitter_name" sortConfig={comprasSortConfig} onSort={requestComprasSort}>Proveedor</SortableTableHead>
                        <SortableTableHead sortKey="net_amount" sortConfig={comprasSortConfig} onSort={requestComprasSort} className="text-right">Neto</SortableTableHead>
                        <SortableTableHead sortKey="iva_amount" sortConfig={comprasSortConfig} onSort={requestComprasSort} className="text-right">IVA</SortableTableHead>
                        <TableHead className="text-right">Perc.</TableHead>
                        <SortableTableHead sortKey="total_amount" sortConfig={comprasSortConfig} onSort={requestComprasSort} className="text-right">Total</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCompras.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="text-sm">{inv.invoice_date ? new Date(inv.invoice_date + "T12:00:00").toLocaleDateString("es-AR") : "-"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{inv.invoice_type?.replace("FACTURA_", "FA-") || "-"}</Badge></TableCell>
                          <TableCell className="font-mono text-sm">{inv.invoice_number || "-"}</TableCell>
                          <TableCell className="text-sm">{inv.emitter_cuit}</TableCell>
                          <TableCell className="text-sm">{inv.emitter_name || inv.operators?.name || "-"}</TableCell>
                          <TableCell className="text-right text-sm">{formatMoney(inv.net_amount)}</TableCell>
                          <TableCell className="text-right text-sm text-green-600">{formatMoney(inv.iva_amount)}</TableCell>
                          <TableCell className="text-right text-sm text-blue-600">{formatMoney((Number(inv.perception_iva) || 0) + (Number(inv.perception_iibb) || 0))}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatMoney(inv.total_amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={5}>TOTAL COMPRAS</TableCell>
                        <TableCell className="text-right">{formatMoney(data.totals.compras.neto)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatMoney(data.totals.compras.iva)}</TableCell>
                        <TableCell className="text-right text-blue-600">{formatMoney(data.totals.compras.percepciones_iva + data.totals.compras.percepciones_iibb)}</TableCell>
                        <TableCell className="text-right">{formatMoney(data.totals.compras.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
