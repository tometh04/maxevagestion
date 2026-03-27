"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, FileText, ExternalLink, Eye } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import { format } from "date-fns"
import Link from "next/link"

interface SaleInvoice {
  id: string
  cbte_tipo: number
  pto_vta: number
  cbte_nro: number | null
  cae: string | null
  receptor_nombre: string
  receptor_doc_nro: string
  imp_neto: number
  imp_iva: number
  imp_total: number
  moneda: string
  status: string
  created_at: string
}

interface Props {
  operationId: string
}

const cbteTipoLabels: Record<number, string> = {
  1: "Factura A",
  6: "Factura B",
  11: "Factura C",
  3: "NC A",
  8: "NC B",
  13: "NC C",
  2: "ND A",
  7: "ND B",
  12: "ND C",
}

export function OperationSaleInvoicesSection({ operationId }: Props) {
  const [invoices, setInvoices] = useState<SaleInvoice[]>([])
  const [loading, setLoading] = useState(true)

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices?operationId=${operationId}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices || [])
      }
    } catch (err) {
      console.error("Error fetching sale invoices:", err)
    } finally {
      setLoading(false)
    }
  }, [operationId])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  const formatMoney = (amount: number, currency: string = "ARS") => {
    const prefix = currency === "DOL" || currency === "USD" ? "US$" : "$"
    return `${prefix} ${Number(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "AUTHORIZED": return <Badge className="bg-success/10 text-success text-xs">Autorizada</Badge>
      case "PENDING": return <Badge variant="secondary" className="text-xs">Pendiente</Badge>
      case "REJECTED": return <Badge variant="destructive" className="text-xs">Rechazada</Badge>
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>
    }
  }

  return (
    <Card className="rounded-xl border border-border/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-success" />
              Facturas Emitidas al Cliente
              <Badge className="bg-success/10 text-success text-xs ml-2">Venta</Badge>
            </CardTitle>
            <CardDescription>Facturas autorizadas por AFIP — Débito fiscal IVA</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/operations/billing/new?operationId=${operationId}`}>
              <FileText className="h-4 w-4 mr-1" />
              Nueva Factura
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay facturas emitidas para esta operación</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>CAE</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {cbteTipoLabels[inv.cbte_tipo] || `Tipo ${inv.cbte_tipo}`}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {inv.pto_vta ? `${String(inv.pto_vta).padStart(4, "0")}-${String(inv.cbte_nro || 0).padStart(8, "0")}` : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{inv.receptor_nombre}</div>
                    <div className="text-xs text-muted-foreground">{inv.receptor_doc_nro}</div>
                  </TableCell>
                  <TableCell className="text-right text-sm">{formatMoney(inv.imp_neto, inv.moneda)}</TableCell>
                  <TableCell className="text-right text-sm text-orange-600">{formatMoney(inv.imp_iva, inv.moneda)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatMoney(inv.imp_total, inv.moneda)}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {inv.cae ? inv.cae.substring(0, 10) + "..." : "-"}
                  </TableCell>
                  <TableCell>{statusBadge(inv.status)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <Link href={`/operations/billing/${inv.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
