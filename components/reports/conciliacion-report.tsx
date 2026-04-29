"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"

type Invoice = {
  id: string
  invoice_type: string
  invoice_number: string
  invoice_date: string
  currency: string
  net_amount: number
  total_amount: number
  total_ars_equivalent: number | null
  status: string
  days_old: number
  operator?: { id: string; name: string; cuit: string | null }
  operation?: { id: string; file_code: string | null; destination: string }
}

type Props = {
  agencies: Array<{ id: string; name: string }>
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  })
}

function ageBadge(days: number) {
  if (days < 30) return { variant: "secondary" as const, label: `${days}d`, className: "" }
  if (days < 60) return { variant: "secondary" as const, label: `${days}d`, className: "bg-yellow-500/15 text-yellow-700" }
  if (days < 90) return { variant: "secondary" as const, label: `${days}d`, className: "bg-orange-500/15 text-orange-700" }
  return { variant: "secondary" as const, label: `${days}d`, className: "bg-red-500/15 text-red-700" }
}

export function ConciliacionReport({ agencies }: Props) {
  const [agencyId, setAgencyId] = useState("all")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    invoices: Invoice[]
    totals: { ARS: number; USD: number; count: number }
  } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (agencyId !== "all") params.set("agencyId", agencyId)
    setLoading(true)
    fetch(`/api/reports/purchase-invoices-pending?${params}`)
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [agencyId])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {agencies.length > 0 && (
          <Select value={agencyId} onValueChange={setAgencyId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Agencia" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las agencias</SelectItem>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Facturas de compra pendientes</CardTitle>
          <CardDescription>
            {loading ? (
              "Cargando..."
            ) : (
              <>
                {data?.totals.count || 0} factura{data?.totals.count === 1 ? "" : "s"} ·{" "}
                <span className="font-mono text-foreground">
                  {formatMoney(data?.totals.ARS || 0, "ARS")}
                </span>{" "}
                +{" "}
                <span className="font-mono text-foreground">
                  {formatMoney(data?.totals.USD || 0, "USD")}
                </span>
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (data?.invoices || []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No hay facturas pendientes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Fecha</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-20 text-center">Antigüedad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.invoices || []).map((inv) => {
                  const age = ageBadge(inv.days_old)
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="text-xs">{formatDate(inv.invoice_date)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{inv.operator?.name || "—"}</div>
                        {inv.operator?.cuit && (
                          <div className="text-muted-foreground text-[10px]">
                            CUIT {inv.operator.cuit}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{inv.invoice_type}</div>
                        <div className="text-muted-foreground font-mono text-[10px]">
                          {inv.invoice_number}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {inv.operation && (
                          <Link
                            href={`/operations/${inv.operation.id}`}
                            className="hover:underline"
                          >
                            <div>{inv.operation.file_code || "—"}</div>
                            <div className="text-muted-foreground text-[10px]">
                              {inv.operation.destination}
                            </div>
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatMoney(Number(inv.total_amount), inv.currency)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={age.variant} className={age.className}>{age.label}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
