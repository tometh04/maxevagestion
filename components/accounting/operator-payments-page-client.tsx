"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { BulkPaymentDialog } from "./bulk-payment-dialog"
import { ManualOperatorPaymentDialog } from "./manual-operator-payment-dialog"
import { CreditCard, Download, Plus, HelpCircle, MoreHorizontal, Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import * as XLSX from "xlsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { AlertTriangle, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { DateTypeFilter, type DateTypeOption } from "@/components/ui/date-type-filter"

const operatorPaymentsDateTypes: DateTypeOption[] = [
  { value: "VENCIMIENTO", label: "Vencimiento", shortLabel: "Venc." },
  { value: "OPERACION", label: "Operación", shortLabel: "Op." },
]
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PaymentInfoDialog } from "@/components/payments/payment-info-dialog"

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

const statusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  OVERDUE: "Vencido",
}

const statusColors: Record<string, string> = {
  PENDING: "bg-accent-coral",
  PAID: "bg-accent-coral",
  OVERDUE: "bg-destructive",
}

interface OperatorPaymentsPageClientProps {
  agencies: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
}

export function OperatorPaymentsPageClient({ agencies, operators }: OperatorPaymentsPageClientProps) {
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<string>("UNPAID")
  const [agencyFilter, setAgencyFilter] = useState<string>("ALL")
  const [operatorFilter, setOperatorFilter] = useState<string>("ALL")
  const [dueDateFrom, setDueDateFrom] = useState<Date | undefined>(undefined)
  const [dueDateTo, setDueDateTo] = useState<Date | undefined>(undefined)
  const [dateType, setDateType] = useState<string>("VENCIMIENTO")
  
  // Estados para inputs (valores que el usuario tipea)
  const [amountMinInput, setAmountMinInput] = useState<string>("")
  const [amountMaxInput, setAmountMaxInput] = useState<string>("")
  const [operationSearchInput, setOperationSearchInput] = useState<string>("")
  
  // Estados para filtros aplicados (valores que se usan en el fetch)
  const [amountMin, setAmountMin] = useState<string>("")
  const [amountMax, setAmountMax] = useState<string>("")
  const [operationSearch, setOperationSearch] = useState<string>("")
  
  const [bulkPaymentOpen, setBulkPaymentOpen] = useState(false)
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false)
  const [infoDialogOpen, setInfoDialogOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<any>(null)
  
  // Refs para los timeouts de debounce
  const amountMinTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const amountMaxTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const operationSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounce para amountMin
  useEffect(() => {
    if (amountMinTimeoutRef.current) {
      clearTimeout(amountMinTimeoutRef.current)
    }
    
    amountMinTimeoutRef.current = setTimeout(() => {
      setAmountMin(amountMinInput)
    }, 500) // Espera 500ms después de que el usuario deje de escribir
    
    return () => {
      if (amountMinTimeoutRef.current) {
        clearTimeout(amountMinTimeoutRef.current)
      }
    }
  }, [amountMinInput])

  // Debounce para amountMax
  useEffect(() => {
    if (amountMaxTimeoutRef.current) {
      clearTimeout(amountMaxTimeoutRef.current)
    }
    
    amountMaxTimeoutRef.current = setTimeout(() => {
      setAmountMax(amountMaxInput)
    }, 500) // Espera 500ms después de que el usuario deje de escribir
    
    return () => {
      if (amountMaxTimeoutRef.current) {
        clearTimeout(amountMaxTimeoutRef.current)
      }
    }
  }, [amountMaxInput])

  // Debounce para operationSearch
  useEffect(() => {
    if (operationSearchTimeoutRef.current) {
      clearTimeout(operationSearchTimeoutRef.current)
    }
    
    operationSearchTimeoutRef.current = setTimeout(() => {
      setOperationSearch(operationSearchInput)
    }, 500) // Espera 500ms después de que el usuario deje de escribir
    
    return () => {
      if (operationSearchTimeoutRef.current) {
        clearTimeout(operationSearchTimeoutRef.current)
      }
    }
  }, [operationSearchInput])

  // Fetch de pagos (función reutilizable)
  const fetchPayments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "ALL") {
        params.append("status", statusFilter)
      }
      if (agencyFilter !== "ALL") {
        params.append("agencyId", agencyFilter)
      }
      if (operatorFilter !== "ALL") {
        params.append("operatorId", operatorFilter)
      }
      if (dueDateFrom) {
        params.append("dateFrom", format(dueDateFrom, "yyyy-MM-dd"))
      }
      if (dueDateTo) {
        params.append("dateTo", format(dueDateTo, "yyyy-MM-dd"))
      }
      if (dateType) {
        params.append("dateType", dateType)
      }
      if (amountMin) {
        params.append("amountMin", amountMin)
      }
      if (amountMax) {
        params.append("amountMax", amountMax)
      }
      if (operationSearch.trim()) {
        params.append("operationSearch", operationSearch.trim())
      }

      const response = await fetch(`/api/accounting/operator-payments?${params.toString()}`)
      if (!response.ok) throw new Error("Error al obtener pagos")

      const data = await response.json()
      setPayments(data.payments || [])
    } catch (error) {
      console.error("Error fetching operator payments:", error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, agencyFilter, operatorFilter, dueDateFrom, dueDateTo, dateType, amountMin, amountMax, operationSearch])

  // Ejecutar fetch cuando cambian los filtros
  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  // Sorting
  const { sortedData: sortedPayments, sortConfig, requestSort } = useSortableData(payments, {
    key: "due_date",
    direction: "asc",
  })

  const overdueCount = payments.filter((p) => {
    const isOverdue = p.status === "OVERDUE" || (p.status === "PENDING" && new Date(p.due_date) < new Date())
    return isOverdue
  }).length
  const pendingCount = payments.filter((p) => p.status === "PENDING" && new Date(p.due_date) >= new Date()).length

  // Calcular deuda real (amount - paid_amount) separada por moneda
  const unpaidPayments = payments.filter((p) => p.status === "PENDING" || p.status === "OVERDUE")
  const totalDebtUSD = unpaidPayments
    .filter((p) => p.currency === "USD")
    .reduce((sum, p) => {
      const amount = parseFloat(p.amount || "0")
      const paid = parseFloat(p.paid_amount || "0")
      return sum + (amount - paid)
    }, 0)
  const totalDebtARS = unpaidPayments
    .filter((p) => p.currency !== "USD")
    .reduce((sum, p) => {
      const amount = parseFloat(p.amount || "0")
      const paid = parseFloat(p.paid_amount || "0")
      return sum + (amount - paid)
    }, 0)

  // Exportar a Excel
  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new()

    // Agrupar pagos por operador para resumen
    const operatorSummary: Record<string, {
      operator: string
      totalAmount: number
      totalPaid: number
      totalPending: number
      currency: string
      count: number
      overdueCount: number
    }> = {}

    payments.forEach((payment) => {
      const operatorName = payment.operators?.name || "Sin operador"
      const operatorId = payment.operator_id || "unknown"
      
      if (!operatorSummary[operatorId]) {
        operatorSummary[operatorId] = {
          operator: operatorName,
          totalAmount: 0,
          totalPaid: 0,
          totalPending: 0,
          currency: payment.currency || "ARS",
          count: 0,
          overdueCount: 0,
        }
      }

      const amount = parseFloat(payment.amount || "0") || 0
      const paidAmount = parseFloat(payment.paid_amount || "0") || 0
      const pendingAmount = amount - paidAmount

      operatorSummary[operatorId].totalAmount += amount
      operatorSummary[operatorId].totalPaid += paidAmount
      operatorSummary[operatorId].totalPending += pendingAmount
      operatorSummary[operatorId].count += 1

      if (payment.status === "OVERDUE" || (payment.status === "PENDING" && new Date(payment.due_date) < new Date())) {
        operatorSummary[operatorId].overdueCount += 1
      }
    })

    // Hoja 1: Resumen por Operador
    const summaryData = Object.values(operatorSummary).map((summary) => ({
      Operador: summary.operator,
      "Total a Pagar": summary.totalAmount,
      Moneda: summary.currency,
      "Pagado": summary.totalPaid,
      "Pendiente": summary.totalPending,
      "Cantidad Pagos": summary.count,
      "Vencidos": summary.overdueCount,
    }))

    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen por Operador")

    // Hoja 2: Detalle Completo
    const detailData = payments.map((payment) => {
      const amount = parseFloat(payment.amount || "0") || 0
      const paidAmount = parseFloat(payment.paid_amount || "0") || 0
      const pendingAmount = amount - paidAmount
      const isOverdue = payment.status === "OVERDUE" || (payment.status === "PENDING" && new Date(payment.due_date) < new Date())
      const displayStatus = isOverdue ? "Vencido" : statusLabels[payment.status] || payment.status

      return {
        "Código Operación": payment.operations?.file_code || "-",
        Destino: payment.operations?.destination || "-",
        Operador: payment.operators?.name || "-",
        "Monto Total": amount,
        Moneda: payment.currency || "ARS",
        "Monto Pagado": paidAmount,
        "Pendiente": pendingAmount,
        "Fecha Vencimiento": payment.due_date
          ? format(new Date(payment.due_date), "dd/MM/yyyy", { locale: es })
          : "-",
        Estado: displayStatus,
        "Fecha Pago": payment.paid_at
          ? format(new Date(payment.paid_at), "dd/MM/yyyy", { locale: es })
          : "-",
        "Parcial": paidAmount > 0 && paidAmount < amount ? "Sí" : "No",
      }
    })

    const detailSheet = XLSX.utils.json_to_sheet(detailData)
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalle Pagos")

    // Guardar archivo
    const fileName = `cuentas-por-pagar-${format(new Date(), "yyyy-MM-dd", { locale: es })}.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border/40 p-5">
          <p className="text-xs font-medium text-muted-foreground">Pendientes</p>
          <div className="text-2xl font-semibold tabular-nums tracking-tight mt-1">{pendingCount}</div>
          <p className="text-xs text-muted-foreground mt-1">pagos pendientes</p>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
          <p className="text-xs font-medium text-muted-foreground">Vencidos</p>
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-destructive mt-1">{overdueCount}</div>
          <p className="text-xs text-muted-foreground mt-1">pagos vencidos</p>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
          <p className="text-xs font-medium text-muted-foreground">Deuda Total</p>
          {totalDebtUSD > 0 && (
            <div className="text-2xl font-semibold tabular-nums tracking-tight mt-1">{formatCurrency(totalDebtUSD, "USD")}</div>
          )}
          {totalDebtARS > 0 && (
            <div className={`${totalDebtUSD > 0 ? "text-lg" : "text-2xl"} font-semibold tabular-nums tracking-tight ${totalDebtUSD > 0 ? "mt-1" : "mt-1"}`}>
              {formatCurrency(totalDebtARS, "ARS")}
            </div>
          )}
          {totalDebtUSD === 0 && totalDebtARS === 0 && (
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-success mt-1">$0</div>
          )}
          <p className="text-xs text-muted-foreground mt-1">deuda pendiente</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
          <Select value={agencyFilter} onValueChange={setAgencyFilter}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[120px] w-auto">
              <SelectValue placeholder="Agencia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {agencies.map((agency) => (
                <SelectItem key={agency.id} value={agency.id}>
                  {agency.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={operatorFilter} onValueChange={setOperatorFilter}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[120px] w-auto">
              <SelectValue placeholder="Operador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {operators.map((operator) => (
                <SelectItem key={operator.id} value={operator.id}>
                  {operator.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[120px] w-auto">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNPAID">Pendientes y Vencidos</SelectItem>
              <SelectItem value="PENDING">Solo Pendientes</SelectItem>
              <SelectItem value="OVERDUE">Solo Vencidos</SelectItem>
              <SelectItem value="PAID">Pagados</SelectItem>
              <SelectItem value="ALL">Todos</SelectItem>
            </SelectContent>
          </Select>

          <DateTypeFilter
            types={operatorPaymentsDateTypes}
            includeNone={false}
            value={{ type: dateType, from: dueDateFrom, to: dueDateTo }}
            onChange={(v) => {
              setDateType(v.type)
              setDueDateFrom(v.from)
              setDueDateTo(v.to)
            }}
          />

          <DecimalInput
            placeholder="Deuda mín."
            value={amountMinInput}
            onChange={(v) => setAmountMinInput(v)}
            className="h-8 text-xs rounded-full border-border/60 bg-background w-[120px]"
          />

          <DecimalInput
            placeholder="Deuda máx."
            value={amountMaxInput}
            onChange={(v) => setAmountMaxInput(v)}
            className="h-8 text-xs rounded-full border-border/60 bg-background w-[120px]"
          />

          <Input
            type="text"
            placeholder="Código o destino"
            value={operationSearchInput}
            onChange={(e) => setOperationSearchInput(e.target.value)}
            className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[150px]"
          />

          {(agencyFilter !== "ALL" ||
            operatorFilter !== "ALL" ||
            statusFilter !== "UNPAID" ||
            dueDateFrom !== undefined ||
            dueDateTo !== undefined ||
            amountMin ||
            amountMax ||
            operationSearch) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => {
                setAgencyFilter("ALL")
                setOperatorFilter("ALL")
                setStatusFilter("UNPAID")
                setDueDateFrom(undefined)
                setDueDateTo(undefined)
                setDateType("VENCIMIENTO")
                setAmountMinInput("")
                setAmountMaxInput("")
                setOperationSearchInput("")
                setAmountMin("")
                setAmountMax("")
                setOperationSearch("")
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
      </div>

      {/* Payments Table */}
      <div className="rounded-xl border border-border/40">
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">Pagos a Operadores</h3>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">¿Cómo funciona?</p>
                      <p className="text-xs mb-2"><strong>Cuentas por Pagar:</strong> Lista de deudas pendientes a operadores. Se calcula como: monto total menos monto pagado (permite pagos parciales).</p>
                      <p className="text-xs mb-2"><strong>Cargar Pago Masivo:</strong> Selecciona un operador y moneda, luego elige las deudas a pagar. Puedes pagar múltiples deudas en una sola transacción.</p>
                      <p className="text-xs">Puedes crear deudas manuales sin operación asociada usando el botón &apos;Nueva Deuda Manual&apos;.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Cuentas a pagar a operadores</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={handleExportExcel} disabled={payments.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
              <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={() => setManualPaymentOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Deuda Manual
              </Button>
              <Button size="sm" className="h-8 rounded-full" onClick={() => setBulkPaymentOpen(true)}>
                <CreditCard className="h-4 w-4 mr-2" />
                Cargar Pago Masivo
              </Button>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5">
          {payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No se encontraron pagos
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="operations.file_code" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">Operación</SortableTableHead>
                  <SortableTableHead sortKey="operators.name" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">Operador</SortableTableHead>
                  <SortableTableHead sortKey="amount" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10 text-right">Monto Total</SortableTableHead>
                  <SortableTableHead sortKey="paid_amount" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10 text-right">Pagado</SortableTableHead>
                  <TableHead className="sticky top-0 bg-background z-10 text-right">Pendiente</TableHead>
                  <SortableTableHead sortKey="due_date" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">Vencimiento</SortableTableHead>
                  <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={requestSort} className="sticky top-0 bg-background z-10">Estado</SortableTableHead>
                  {(statusFilter === "PAID" || statusFilter === "ALL") && (
                    <TableHead className="sticky top-0 bg-background z-10">Fecha Pago</TableHead>
                  )}
                  <TableHead className="sticky top-0 bg-background z-10 w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPayments.map((payment) => {
                  const isOverdue =
                    payment.status === "PENDING" &&
                    new Date(payment.due_date) < new Date()
                  const displayStatus = isOverdue ? "OVERDUE" : payment.status
                  const paidAmount = parseFloat(payment.paid_amount || "0") || 0
                  const isPartial = paidAmount > 0 && paidAmount < parseFloat(payment.amount || "0")
                  const isPaid = payment.status === "PAID"
                  // Usar created_at del ledger_movement como fecha de pago (fecha real del pago)
                  // Si no hay ledger_movement, usar updated_at como fallback
                  const ledgerMovement = (payment as any).ledger_movements
                  const paidAt = isPaid && ledgerMovement?.created_at
                    ? format(new Date(ledgerMovement.created_at), "dd/MM/yyyy", { locale: es })
                    : isPaid && payment.updated_at
                    ? format(new Date(payment.updated_at), "dd/MM/yyyy", { locale: es })
                    : null

                  return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {payment.operation_id ? (
                          <Link
                            href={`/operations/${payment.operation_id}`}
                            className="font-mono text-xs text-primary hover:underline"
                            prefetch={false}
                          >
                            {payment.operations?.file_code || "-"}
                          </Link>
                        ) : (
                          <div className="font-mono text-xs">
                            {payment.operations?.file_code || "-"}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {payment.operations?.destination || "-"}
                        </div>
                        {payment.operations?.main_passenger_name && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {payment.operations.main_passenger_name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{payment.operators?.name || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(parseFloat(payment.amount || "0"), payment.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {paidAmount > 0 ? (
                          <span className="text-success dark:text-success font-medium">
                            {formatCurrency(paidAmount, payment.currency)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {(() => {
                          const totalAmount = parseFloat(payment.amount || "0") || 0
                          const debt = totalAmount - paidAmount
                          return isPaid ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <span className={debt > 0 ? "text-destructive dark:text-destructive" : ""}>
                              {formatCurrency(debt, payment.currency)}
                            </span>
                          )
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {format(new Date(payment.due_date), "dd/MM/yyyy", { locale: es })}
                          {isOverdue && (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={statusColors[displayStatus] || "bg-muted-foreground"}>
                            {statusLabels[displayStatus] || displayStatus}
                          </Badge>
                          {isPartial && (
                            <Badge variant="outline" className="text-xs">
                              Parcial
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {(statusFilter === "PAID" || statusFilter === "ALL") && (
                        <TableCell className="text-muted-foreground">
                          {paidAt || "-"}
                        </TableCell>
                      )}
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Abrir menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedPayment(payment)
                                setInfoDialogOpen(true)
                              }}
                            >
                              <Info className="h-4 w-4 mr-2" />
                              Ver info
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Payment Dialog */}
      <BulkPaymentDialog
        open={bulkPaymentOpen}
        onOpenChange={setBulkPaymentOpen}
        operators={operators}
        agencies={agencies}
        selectedAgencyId={agencyFilter !== "ALL" ? agencyFilter : undefined}
      />

      {/* Manual Operator Payment Dialog */}
      <ManualOperatorPaymentDialog
        open={manualPaymentOpen}
        onOpenChange={setManualPaymentOpen}
        onSuccess={() => {
          fetchPayments()
        }}
        operators={operators}
      />

      {/* Payment Info Dialog */}
      <PaymentInfoDialog
        open={infoDialogOpen}
        onOpenChange={setInfoDialogOpen}
        payment={selectedPayment}
        type="operator"
      />
    </div>
  )
}

