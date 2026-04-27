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
import { AlertCircle, Calendar, ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import Link from "next/link"

type CustomerPayment = {
  id: string
  amount: number
  currency: string
  date_due: string
  status: string
  isOverdue: boolean
  operation?: {
    id: string
    file_code: string | null
    destination: string
    operation_customers?: Array<{ customer?: { first_name: string; last_name: string } }>
  }
}

type OperatorPayment = {
  id: string
  amount: number
  currency: string
  due_date: string
  status: string
  isOverdue: boolean
  operator?: { id: string; name: string }
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
  })
}

export function VencimientosReport({ agencies }: Props) {
  const [days, setDays] = useState("7")
  const [agencyId, setAgencyId] = useState("all")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    customer_payments: CustomerPayment[]
    operator_payments: OperatorPayment[]
  } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ days })
    if (agencyId !== "all") params.set("agencyId", agencyId)
    setLoading(true)
    fetch(`/api/reports/upcoming-due?${params}`)
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [days, agencyId])

  const customerByCurrency = (data?.customer_payments || []).reduce(
    (acc, p) => {
      const cur = p.currency || "ARS"
      acc[cur] = (acc[cur] || 0) + Number(p.amount)
      return acc
    },
    {} as Record<string, number>,
  )

  const operatorByCurrency = (data?.operator_payments || []).reduce(
    (acc, p) => {
      const cur = p.currency || "ARS"
      acc[cur] = (acc[cur] || 0) + Number(p.amount)
      return acc
    },
    {} as Record<string, number>,
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Próximos 7 días</SelectItem>
              <SelectItem value="14">Próximos 14 días</SelectItem>
              <SelectItem value="30">Próximos 30 días</SelectItem>
              <SelectItem value="60">Próximos 60 días</SelectItem>
            </SelectContent>
          </Select>
        </div>
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

      <div className="grid gap-4 md:grid-cols-2">
        {/* COBRAR */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
              A cobrar (clientes)
            </CardTitle>
            <CardDescription>
              {Object.entries(customerByCurrency).map(([cur, amt]) => (
                <span key={cur} className="inline-block mr-3 font-mono text-foreground">
                  {formatMoney(amt, cur)}
                </span>
              ))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : (data?.customer_payments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sin vencimientos en el rango.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Vence</TableHead>
                    <TableHead>Cliente / Operación</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.customer_payments || []).map((p) => {
                    const customer = p.operation?.operation_customers?.[0]?.customer
                    const customerName = customer
                      ? `${customer.first_name} ${customer.last_name}`
                      : "—"
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">
                          <span className={p.isOverdue ? "text-red-600 font-semibold flex items-center gap-1" : ""}>
                            {p.isOverdue && <AlertCircle className="h-3 w-3" />}
                            {formatDate(p.date_due)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Link
                            href={`/operations/${p.operation?.id}`}
                            className="hover:underline"
                          >
                            <div className="font-medium">{customerName}</div>
                            <div className="text-muted-foreground">
                              {p.operation?.file_code || "—"} · {p.operation?.destination || ""}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatMoney(Number(p.amount), p.currency)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* PAGAR */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpFromLine className="h-4 w-4 text-orange-600" />
              A pagar (operadores)
            </CardTitle>
            <CardDescription>
              {Object.entries(operatorByCurrency).map(([cur, amt]) => (
                <span key={cur} className="inline-block mr-3 font-mono text-foreground">
                  {formatMoney(amt, cur)}
                </span>
              ))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : (data?.operator_payments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sin vencimientos en el rango.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Vence</TableHead>
                    <TableHead>Operador / Operación</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.operator_payments || []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">
                        <span className={p.isOverdue ? "text-red-600 font-semibold flex items-center gap-1" : ""}>
                          {p.isOverdue && <AlertCircle className="h-3 w-3" />}
                          {formatDate(p.due_date)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link
                          href={`/operations/${p.operation?.id}`}
                          className="hover:underline"
                        >
                          <div className="font-medium">{p.operator?.name || "—"}</div>
                          <div className="text-muted-foreground">
                            {p.operation?.file_code || "—"} · {p.operation?.destination || ""}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatMoney(Number(p.amount), p.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
