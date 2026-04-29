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
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
import { DateTypeFilter, type DateTypeOption } from "@/components/ui/date-type-filter"
import { Input } from "@/components/ui/input"

const debtorsDateTypes: DateTypeOption[] = [
  { value: "SALIDA", label: "Salida", shortLabel: "Salida" },
  { value: "CREACION", label: "Creación", shortLabel: "Creac." },
]

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

export function DebtsSalesPageClient() {
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [dateType, setDateType] = useState<string>("SALIDA")
  const [searchText, setSearchText] = useState("")

  const fetchDebtors = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (dateFrom) {
        params.append("dateFrom", format(dateFrom, "yyyy-MM-dd"))
      }
      if (dateTo) {
        params.append("dateTo", format(dateTo, "yyyy-MM-dd"))
      }
      if (dateType) {
        params.append("dateType", dateType)
      }
      const queryString = params.toString()
      const response = await fetch(`/api/accounting/debts-sales${queryString ? `?${queryString}` : ""}`)
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
  }, [dateFrom, dateTo, dateType])

  useEffect(() => {
    fetchDebtors()
  }, [fetchDebtors])

  const toggleExpand = (customerId: string) => {
    setExpandedCustomerId(expandedCustomerId === customerId ? null : customerId)
  }

  const filteredDebtors = useMemo(() => {
    if (!searchText.trim()) return debtors
    const term = searchText.toLowerCase()
    return debtors.filter((d) => {
      const name = `${d.customer.first_name || ""} ${d.customer.last_name || ""}`.toLowerCase()
      const doc = d.customer.document_number?.toLowerCase() || ""
      const ops = d.operationsWithDebt.some(
        (op) => op.file_code?.toLowerCase().includes(term) || op.destination?.toLowerCase().includes(term)
      )
      return name.includes(term) || doc.includes(term) || ops
    })
  }, [debtors, searchText])

  const { sortedData: sortedDebtors, sortConfig, requestSort } = useSortableData(filteredDebtors, { key: "totalDebt", direction: "desc" })

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
                <Link href="/accounting/ledger">Contabilidad</Link>
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
                <Link href="/accounting/ledger">Contabilidad</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbPage>Deudores por Ventas</BreadcrumbPage>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalDebt = filteredDebtors.reduce((sum, d) => sum + d.totalDebt, 0)
  const totalDebtors = filteredDebtors.length

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
              <Link href="/customers">Clientes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Deudores por Ventas</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deudores por Ventas</h1>
          <p className="text-muted-foreground">
            Clientes con pagos pendientes de operaciones
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/accounting/ledger">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Contabilidad
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Buscar cliente, destino o código..."
          className="h-8 text-xs rounded-full w-[240px]"
        />

        <DateTypeFilter
          types={debtorsDateTypes}
          includeNone={false}
          value={{ type: dateType, from: dateFrom, to: dateTo }}
          onChange={(v) => {
            setDateType(v.type)
            setDateFrom(v.from)
            setDateTo(v.to)
          }}
        />

        {(dateFrom || dateTo || searchText) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs rounded-full"
            onClick={() => {
              setDateFrom(undefined)
              setDateTo(undefined)
              setSearchText("")
            }}
          >
            Limpiar filtros
          </Button>
        )}
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
            <p className="text-xs text-muted-foreground">
              {(dateFrom || dateTo || searchText) ? "Clientes con deuda (filtrado)" : "Clientes con deuda"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deuda Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {filteredDebtors.length > 0 ? formatCurrency(totalDebt, filteredDebtors[0]?.currency || "ARS") : "$ 0"}
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
              {filteredDebtors.reduce((sum, d) => sum + d.operationsWithDebt.length, 0)}
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
              {sortedDebtors.map((debtor) => {
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
                            <div className="text-2xl font-bold text-destructive">
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
                              <TableHead>Código / Cliente</TableHead>
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
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="font-mono text-xs">
                                      {op.file_code || "-"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {customerName}
                                    </div>
                                  </div>
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
                                <TableCell className="text-right text-success">
                                  {formatCurrency(op.paid, op.currency)}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-destructive">
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
