"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"
import { Loader2, AlertCircle, Eye, ArrowLeft, ExternalLink } from "lucide-react"
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
import { Download, Filter, X, Plus, HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import * as XLSX from "xlsx"
import { useDebounce } from "@/hooks/use-debounce"
import { ManualPaymentDialog } from "./manual-payment-dialog"

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
  customer_id: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  customer_document: string | null
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
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL")
  const [customerFilter, setCustomerFilter] = useState<string>("")
  const [sellerFilter, setSellerFilter] = useState<string>("ALL")
  const [dateFromFilter, setDateFromFilter] = useState<Date | undefined>(undefined)
  const [dateToFilter, setDateToFilter] = useState<Date | undefined>(undefined)
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false)

  // Debounce para campos de texto (300ms para búsqueda rápida y responsiva)
  const debouncedCustomerFilter = useDebounce(customerFilter, 300)
  
  // Debounce para fechas (500ms - da tiempo para completar la selección de fecha)
  const debouncedDateFrom = useDebounce(dateFromFilter, 500)
  const debouncedDateTo = useDebounce(dateToFilter, 500)

  const fetchDebtors = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (currencyFilter !== "ALL") {
        params.append("currency", currencyFilter)
      }
      if (debouncedCustomerFilter) {
        params.append("customerId", debouncedCustomerFilter)
      }
      if (sellerFilter !== "ALL") {
        params.append("sellerId", sellerFilter)
      }
      if (debouncedDateFrom) {
        params.append("dateFrom", format(debouncedDateFrom, "yyyy-MM-dd"))
      }
      if (debouncedDateTo) {
        params.append("dateTo", format(debouncedDateTo, "yyyy-MM-dd"))
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
  }, [currencyFilter, debouncedCustomerFilter, sellerFilter, debouncedDateFrom, debouncedDateTo])

  useEffect(() => {
    fetchDebtors()
  }, [fetchDebtors])

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency} ${Math.round(amount).toLocaleString("es-AR")}`
  }

  // Aplanar todas las operaciones con deuda en una sola lista para la tabla
  const allOperations: DebtorOperation[] = useMemo(() => {
    const operations: DebtorOperation[] = []
    debtors.forEach((debtor) => {
      const customerName = extractCustomerName(
        `${debtor.customer.first_name || ""} ${debtor.customer.last_name || ""}`.trim() ||
          debtor.customer.first_name ||
          ""
      )
      debtor.operationsWithDebt.forEach((op) => {
        operations.push({
          ...op,
          customer_id: debtor.customer.id,
          customer_name: customerName,
          customer_email: debtor.customer.email || null,
          customer_phone: debtor.customer.phone || null,
          customer_document: debtor.customer.document_number || null,
        })
      })
    })
    return operations
  }, [debtors])

  // Filtrar operaciones localmente (por búsqueda de nombre de cliente)
  const filteredOperations = useMemo(() => {
    if (!customerFilter.trim()) return allOperations
    
    const searchTerm = customerFilter.toLowerCase().trim()
    return allOperations.filter((op) => {
      const customerName = op.customer_name?.toLowerCase() || ""
      return customerName.includes(searchTerm)
    })
  }, [allOperations, customerFilter])

  // Filtrar deudores para el resumen (mantener compatibilidad)
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

  // Definir columnas para DataTable (ANTES de cualquier return condicional)
  const columns: ColumnDef<DebtorOperation>[] = useMemo(
    () => [
      {
        accessorKey: "customer_name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Cliente" />
        ),
        cell: ({ row }) => {
          const op = row.original
          return (
            <div className="space-y-1">
              <div className="font-medium">{op.customer_name}</div>
              {op.customer_document && (
                <div className="text-xs text-muted-foreground">
                  {op.customer_document}
                </div>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: "file_code",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Código" />
        ),
        cell: ({ row }) => {
          return (
            <div className="font-mono text-xs">
              {row.original.file_code || "-"}
            </div>
          )
        },
      },
      {
        accessorKey: "destination",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Destino" />
        ),
        cell: ({ row }) => {
          return <div className="max-w-[200px] truncate" title={row.original.destination}>
            {row.original.destination}
          </div>
        },
      },
      {
        accessorKey: "seller_name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Vendedor" />
        ),
        cell: ({ row }) => {
          return (
            <Badge variant="outline" className="text-xs">
              {row.original.seller_name || "Sin vendedor"}
            </Badge>
          )
        },
      },
      {
        accessorKey: "departure_date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Fecha Salida" />
        ),
        cell: ({ row }) => {
          const date = row.original.departure_date
          return date
            ? format(new Date(date), "dd/MM/yyyy", { locale: es })
            : "-"
        },
      },
      {
        accessorKey: "sale_amount_total",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Total Venta" />
        ),
        cell: ({ row }) => {
          return (
            <div className="text-right font-medium">
              {formatCurrency(row.original.sale_amount_total, row.original.currency)}
            </div>
          )
        },
      },
      {
        accessorKey: "paid",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Pagado" />
        ),
        cell: ({ row }) => {
          return (
            <div className="text-right text-green-600 font-medium">
              {formatCurrency(row.original.paid, row.original.currency)}
            </div>
          )
        },
      },
      {
        accessorKey: "debt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Deuda" />
        ),
        cell: ({ row }) => {
          return (
            <div className="text-right font-semibold text-red-600">
              {formatCurrency(row.original.debt, row.original.currency)}
            </div>
          )
        },
      },
      {
        id: "actions",
        header: "Acciones",
        enableHiding: false,
        cell: ({ row }) => {
          const op = row.original
          return (
            <div className="flex items-center gap-2">
              <Button variant="default" size="sm" asChild>
                <Link href={`/operations/${op.id}`}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Ver Operación
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/customers/${op.customer_id}`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )
        },
      },
    ],
    []
  )

  // Exportar a Excel
  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new()

    // Hoja 1: Resumen por Cliente (con vendedor promedio o principal)
    const summaryData = filteredDebtors.map((debtor) => {
      const customerName = extractCustomerName(
        `${debtor.customer.first_name || ""} ${debtor.customer.last_name || ""}`.trim() ||
          debtor.customer.first_name ||
          ""
      )
      // Obtener vendedores únicos de las operaciones
      const sellers = Array.from(new Set(debtor.operationsWithDebt.map(op => op.seller_name).filter(Boolean)))
      return {
        Cliente: customerName,
        "Documento": debtor.customer.document_number || "",
        "Email": debtor.customer.email || "",
        "Teléfono": debtor.customer.phone || "",
        "Vendedores": sellers.join(", ") || "Sin vendedor",
        "Deuda Total (USD)": debtor.totalDebt,
        "Cantidad Operaciones": debtor.operationsWithDebt.length,
      }
    })

    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen por Cliente")

    // Hoja 2: Detalle de Operaciones (con vendedor)
    const detailData: any[] = []
    filteredOperations.forEach((op) => {
      detailData.push({
        Cliente: op.customer_name,
        "Documento": op.customer_document || "",
        "Email": op.customer_email || "",
        "Teléfono": op.customer_phone || "",
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
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Deudores por Ventas</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">¿Cómo funciona?</p>
                  <p className="text-xs mb-2"><strong>Cuentas por Cobrar:</strong> Lista de clientes que deben dinero por operaciones vendidas. Se calcula como: monto de venta menos pagos recibidos.</p>
                  <p className="text-xs mb-2"><strong>Marcar como Pagado:</strong> Cuando el cliente paga, marca la cobranza como pagada. Esto impacta en la caja y reduce la deuda.</p>
                  <p className="text-xs">Puedes crear cuentas por cobrar manuales sin operación asociada usando el botón &quot;Nueva Cuenta por Cobrar&quot;.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-muted-foreground">
            Clientes con pagos pendientes de operaciones
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setManualPaymentOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Cuenta por Cobrar
          </Button>
          <Button variant="outline" asChild>
            <Link href="/accounting/ledger">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a Contabilidad
            </Link>
          </Button>
        </div>
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

      {/* Tabla de operaciones con deuda */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Operaciones con Deuda</CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Lista completa de operaciones con deuda pendiente. Haz click en &quot;Ver Operación&quot; para ver detalles y marcar cobranzas como pagadas.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <CardDescription>
                {filteredOperations.length} operación{filteredOperations.length !== 1 ? "es" : ""} con deuda pendiente
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={filteredOperations.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOperations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {allOperations.length === 0
                ? "No hay operaciones con deudas pendientes"
                : "No se encontraron resultados con los filtros aplicados"}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredOperations}
              searchKey="customer_name"
              searchPlaceholder="Buscar por cliente..."
            />
          )}
        </CardContent>
      </Card>

      {/* Dialog para cobranza manual */}
      <ManualPaymentDialog
        open={manualPaymentOpen}
        onOpenChange={setManualPaymentOpen}
        onSuccess={() => {
          fetchDebtors()
        }}
        direction="INCOME"
      />
    </div>
  )
}
