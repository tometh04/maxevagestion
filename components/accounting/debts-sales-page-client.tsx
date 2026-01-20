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
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { extractCustomerName } from "@/lib/customers/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { Download, Filter, X } from "lucide-react"
import * as XLSX from "xlsx"

interface DebtorOperation {
  id: string
  file_code: string | null
  destination: string
  sale_amount_total: number
  currency: string
  paid: number
  debt: number
  departure_date: string | null
  seller_id: string | null
  seller_name: string | null
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

interface DebtsSalesPageClientProps {
  sellers: Array<{ id: string; name: string }>
}

export function DebtsSalesPageClient({ sellers: initialSellers }: DebtsSalesPageClientProps) {
  const [debtors, setDebtors] = useState<Debtor[]>([])
  const [allDebtors, setAllDebtors] = useState<Debtor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL")
  const [customerFilter, setCustomerFilter] = useState<string>("")
  const [sellerFilter, setSellerFilter] = useState<string>("ALL")
  const [dateFromFilter, setDateFromFilter] = useState<Date | undefined>(undefined)
  const [dateToFilter, setDateToFilter] = useState<Date | undefined>(undefined)

  const fetchDebtors = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (currencyFilter !== "ALL") {
        params.append("currency", currencyFilter)
      }
      if (customerFilter) {
        params.append("customerId", customerFilter)
      }
      if (sellerFilter !== "ALL") {
        params.append("sellerId", sellerFilter)
      }
      if (dateFromFilter) {
        params.append("dateFrom", format(dateFromFilter, "yyyy-MM-dd"))
      }
      if (dateToFilter) {
        params.append("dateTo", format(dateToFilter, "yyyy-MM-dd"))
      }

      const response = await fetch(`/api/accounting/debts-sales?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setAllDebtors(data.debtors || [])
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
  }, [currencyFilter, customerFilter, sellerFilter, dateFromFilter, dateToFilter])

  useEffect(() => {
    fetchDebtors()
  }, [fetchDebtors])

  const toggleExpand = (customerId: string) => {
    setExpandedCustomerId(expandedCustomerId === customerId ? null : customerId)
  }

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency} ${Math.round(amount).toLocaleString("es-AR")}`
  }

  // Filtrar deudores localmente (por búsqueda de nombre de cliente)
  const filteredDebtors = useMemo(() => {
    if (!customerFilter.trim()) return debtors
    
    const searchTerm = customerFilter.toLowerCase().trim()
    return debtors.filter((debtor) => {
      const firstName = debtor.customer.first_name?.toLowerCase() || ""
      const lastName = debtor.customer.last_name?.toLowerCase() || ""
      const fullName = `${firstName} ${lastName}`.trim()
      return fullName.includes(searchTerm) || firstName.includes(searchTerm) || lastName.includes(searchTerm)
    })
  }, [debtors, customerFilter])

  // Exportar a Excel
  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new()

    // Hoja 1: Resumen por Cliente
    const summaryData = filteredDebtors.map((debtor) => {
      const customerName = extractCustomerName(
        `${debtor.customer.first_name || ""} ${debtor.customer.last_name || ""}`.trim() ||
          debtor.customer.first_name ||
          ""
      )
      return {
        Cliente: customerName,
        "Documento": debtor.customer.document_number || "",
        "Email": debtor.customer.email || "",
        "Teléfono": debtor.customer.phone || "",
        "Deuda Total (USD)": debtor.totalDebt,
        "Cantidad Operaciones": debtor.operationsWithDebt.length,
      }
    })

    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen por Cliente")

    // Hoja 2: Detalle de Operaciones
    const detailData: any[] = []
    filteredDebtors.forEach((debtor) => {
      const customerName = extractCustomerName(
        `${debtor.customer.first_name || ""} ${debtor.customer.last_name || ""}`.trim() ||
          debtor.customer.first_name ||
          ""
      )
      debtor.operationsWithDebt.forEach((op) => {
        detailData.push({
          Cliente: customerName,
          "Código Operación": op.file_code || "-",
          Destino: op.destination,
          Vendedor: op.seller_name || "Sin vendedor",
          "Fecha Salida": op.departure_date
            ? format(new Date(op.departure_date), "dd/MM/yyyy", { locale: es })
            : "-",
          "Total Venta (USD)": op.sale_amount_total,
          "Pagado (USD)": op.paid,
          "Deuda (USD)": op.debt,
        })
      })
    })

    const detailSheet = XLSX.utils.json_to_sheet(detailData)
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalle Operaciones")

    // Guardar archivo
    const fileName = `deudores-por-ventas-${format(new Date(), "yyyy-MM-dd", { locale: es })}.xlsx`
    XLSX.writeFile(workbook, fileName)
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
            <div className="flex items-center gap-2 text-red-600">
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
          <Link href="/accounting/ledger">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Contabilidad
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 items-end">
            {/* Filtro por Moneda */}
            <div className="space-y-1.5">
              <Label className="text-xs">Moneda</Label>
              <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="ARS">ARS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Vendedor */}
            <div className="space-y-1.5">
              <Label className="text-xs">Vendedor</Label>
              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {initialSellers.map((seller) => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Cliente (búsqueda por nombre) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente</Label>
              <Input
                placeholder="Buscar por nombre..."
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
              />
            </div>

            {/* Filtro por Fecha Desde */}
            <div className="space-y-1.5">
              <Label className="text-xs">Desde</Label>
              <DateInputWithCalendar
                value={dateFromFilter}
                onChange={(date) => {
                  setDateFromFilter(date)
                  if (date && dateToFilter && dateToFilter < date) {
                    setDateToFilter(undefined)
                  }
                }}
                placeholder="dd/MM/yyyy"
              />
            </div>

            {/* Filtro por Fecha Hasta */}
            <div className="space-y-1.5">
              <Label className="text-xs">Hasta</Label>
              <DateInputWithCalendar
                value={dateToFilter}
                onChange={(date) => {
                  if (date && dateFromFilter && date < dateFromFilter) {
                    return
                  }
                  setDateToFilter(date)
                }}
                placeholder="dd/MM/yyyy"
                minDate={dateFromFilter}
              />
            </div>
          </div>
          
          {(dateFromFilter !== undefined || dateToFilter !== undefined || currencyFilter !== "ALL" || customerFilter || sellerFilter !== "ALL") && (
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setCurrencyFilter("ALL")
                  setSellerFilter("ALL")
                  setCustomerFilter("")
                  setDateFromFilter(undefined)
                  setDateToFilter(undefined)
                }}
                title="Limpiar filtros"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
              {filteredDebtors.length > 0 ? formatCurrency(totalDebt, filteredDebtors[0]?.currency || "USD") : "$ 0"}
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Lista de Deudores</CardTitle>
              <CardDescription>
                Clientes que tienen pagos pendientes de operaciones
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={filteredDebtors.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredDebtors.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {debtors.length === 0
                ? "No hay clientes con deudas pendientes"
                : "No se encontraron resultados con los filtros aplicados"}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDebtors.map((debtor) => {
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
                              <TableHead>Vendedor</TableHead>
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
                                  <Badge variant="outline" className="text-xs">
                                    {op.seller_name || "Sin vendedor"}
                                  </Badge>
                                </TableCell>
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
