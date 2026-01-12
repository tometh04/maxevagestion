"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { Loader2, AlertCircle, Eye, ArrowLeft } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { extractCustomerName } from "@/lib/customers/utils"

interface DebtorOperation {
  id: string
  file_code: string | null
  destination: string
  sale_amount_total: number
  currency: string
  paid: number
  debt: number
  departure_date: string | null
}

interface Debtor {
  customer: {
    id: string
    first_name: string
    last_name: string
    phone: string
    email: string
    document_type: string | null
    document_number: string | null
  }
  totalDebt: number
  currency: string
  operationsWithDebt: DebtorOperation[]
}

export function CustomersDebtorsPageClient() {
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)

  const fetchDebtors = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/customers/debtors")
      if (response.ok) {
        const data = await response.json()
        setDebtors(data.debtors || [])
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.error || "Error al obtener deudores")
      }
    } catch (err) {
      console.error("Error fetching debtors:", err)
      setError("Error al obtener deudores")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDebtors()
  }, [fetchDebtors])

  const toggleExpand = (customerId: string) => {
    setExpandedCustomerId(expandedCustomerId === customerId ? null : customerId)
  }

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency} ${Math.round(amount).toLocaleString("es-AR")}`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/customers">Base de Datos Clientes</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbPage>Deudores por Ventas</BreadcrumbPage>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/customers">Base de Datos Clientes</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbPage>Deudores por Ventas</BreadcrumbPage>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalDebt = debtors.reduce((sum, d) => sum + d.totalDebt, 0)
  const totalDebtors = debtors.length

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/customers">Base de Datos Clientes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Deudores por Ventas</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Deudores por Ventas</h1>
          <p className="text-muted-foreground">
            Clientes con pagos pendientes de operaciones
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/customers">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Clientes
          </Link>
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Deudores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDebtors}</div>
            <p className="text-xs text-muted-foreground">Clientes con deuda</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deuda Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {debtors.length > 0 ? formatCurrency(totalDebt, debtors[0]?.currency || "ARS") : "$ 0"}
            </div>
            <p className="text-xs text-muted-foreground">Monto total pendiente</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Operaciones con Deuda
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {debtors.reduce((sum, d) => sum + d.operationsWithDebt.length, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total de operaciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de deudores */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Deudores</CardTitle>
          <CardDescription>
            Clientes que tienen pagos pendientes de operaciones
          </CardDescription>
        </CardHeader>
        <CardContent>
          {debtors.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No hay clientes con deudas pendientes
            </div>
          ) : (
            <div className="space-y-4">
              {debtors.map((debtor) => {
                const customerName = extractCustomerName(
                  `${debtor.customer.first_name || ""} ${debtor.customer.last_name || ""}`.trim() ||
                    debtor.customer.first_name ||
                    ""
                )
                const isExpanded = expandedCustomerId === debtor.customer.id

                return (
                  <div key={debtor.customer.id} className="border rounded-lg">
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold">{customerName}</h3>
                            {debtor.customer.document_number && (
                              <Badge variant="outline">
                                {debtor.customer.document_type || "DNI"}: {debtor.customer.document_number}
                              </Badge>
                            )}
                          </div>
                          {debtor.customer.email && (
                            <p className="text-sm text-muted-foreground">{debtor.customer.email}</p>
                          )}
                          {debtor.customer.phone && (
                            <p className="text-sm text-muted-foreground">{debtor.customer.phone}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-2xl font-bold text-red-600">
                              {formatCurrency(debtor.totalDebt, debtor.currency)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {debtor.operationsWithDebt.length} operación{debtor.operationsWithDebt.length !== 1 ? "es" : ""}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpand(debtor.customer.id)}
                          >
                            {isExpanded ? "Ocultar" : "Ver operaciones"}
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/customers/${debtor.customer.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t bg-muted/50">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Código</TableHead>
                              <TableHead>Destino</TableHead>
                              <TableHead>Fecha Salida</TableHead>
                              <TableHead className="text-right">Total Venta</TableHead>
                              <TableHead className="text-right">Pagado</TableHead>
                              <TableHead className="text-right">Deuda</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {debtor.operationsWithDebt.map((op) => (
                              <TableRow key={op.id}>
                                <TableCell className="font-mono text-xs">
                                  {op.file_code || "-"}
                                </TableCell>
                                <TableCell>{op.destination}</TableCell>
                                <TableCell>
                                  {op.departure_date
                                    ? format(new Date(op.departure_date), "dd/MM/yyyy", { locale: es })
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(op.sale_amount_total, op.currency)}
                                </TableCell>
                                <TableCell className="text-right text-green-600">
                                  {formatCurrency(op.paid, op.currency)}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-red-600">
                                  {formatCurrency(op.debt, op.currency)}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" asChild>
                                    <Link href={`/operations/${op.id}`}>
                                      <Eye className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
