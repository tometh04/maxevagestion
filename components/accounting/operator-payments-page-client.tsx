"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { BulkPaymentDialog } from "./bulk-payment-dialog"
import { ManualOperatorPaymentDialog } from "./manual-operator-payment-dialog"
import { CreditCard, Download, Plus } from "lucide-react"
import * as XLSX from "xlsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"

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
  PENDING: "bg-yellow-500",
  PAID: "bg-amber-500",
  OVERDUE: "bg-red-500",
}

interface OperatorPaymentsPageClientProps {
  agencies: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
}

export function OperatorPaymentsPageClient({ agencies, operators }: OperatorPaymentsPageClientProps) {
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [agencyFilter, setAgencyFilter] = useState<string>("ALL")
  const [operatorFilter, setOperatorFilter] = useState<string>("ALL")
  const [dueDateFrom, setDueDateFrom] = useState<Date | undefined>(undefined)
  const [dueDateTo, setDueDateTo] = useState<Date | undefined>(undefined)
  
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

  // Fetch de pagos (se ejecuta cuando cambian los filtros aplicados)
  useEffect(() => {
    async function fetchPayments() {
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
        params.append("dueDateFrom", format(dueDateFrom, "yyyy-MM-dd"))
      }
      if (dueDateTo) {
        params.append("dueDateTo", format(dueDateTo, "yyyy-MM-dd"))
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
    }

    fetchPayments()
  }, [statusFilter, agencyFilter, operatorFilter, dueDateFrom, dueDateTo, amountMin, amountMax, operationSearch])

  const overdueCount = payments.filter((p) => p.status === "OVERDUE").length
  const pendingCount = payments.filter((p) => p.status === "PENDING").length
  const totalPending = payments
    .filter((p) => p.status === "PENDING" || p.status === "OVERDUE")
    .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0)

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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">pagos pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-1">pagos vencidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total a Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPending)}</div>
            <p className="text-xs text-muted-foreground mt-1">monto pendiente</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Agencia</Label>
              <Select value={agencyFilter} onValueChange={setAgencyFilter}>
                <SelectTrigger>
                  <SelectValue />
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Operador</Label>
              <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                <SelectTrigger>
                  <SelectValue />
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estado</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los estados</SelectItem>
                  <SelectItem value="PENDING">Pendientes</SelectItem>
                  <SelectItem value="OVERDUE">Vencidos</SelectItem>
                  <SelectItem value="PAID">Pagados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Venc. Desde</Label>
              <DateInputWithCalendar
                value={dueDateFrom}
                onChange={(date) => {
                  setDueDateFrom(date)
                  if (date && dueDateTo && dueDateTo < date) {
                    setDueDateTo(undefined)
                  }
                }}
                placeholder="dd/MM/yyyy"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Venc. Hasta</Label>
              <DateInputWithCalendar
                value={dueDateTo}
                onChange={(date) => {
                  if (date && dueDateFrom && date < dueDateFrom) {
                    return
                  }
                  setDueDateTo(date)
                }}
                placeholder="dd/MM/yyyy"
                minDate={dueDateFrom}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Monto mín.</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={amountMinInput}
                onChange={(e) => setAmountMinInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Monto máx.</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={amountMaxInput}
                onChange={(e) => setAmountMaxInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
              <Label className="text-xs">Buscar operación</Label>
              <Input
                type="text"
                placeholder="Código o destino"
                value={operationSearchInput}
                onChange={(e) => setOperationSearchInput(e.target.value)}
              />
            </div>
          </div>
          {(agencyFilter !== "ALL" ||
            operatorFilter !== "ALL" ||
            statusFilter !== "ALL" ||
            dueDateFrom !== undefined ||
            dueDateTo !== undefined ||
            amountMin ||
            amountMax ||
            operationSearch) && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setAgencyFilter("ALL")
                  setOperatorFilter("ALL")
                  setStatusFilter("ALL")
                  setDueDateFrom(undefined)
                  setDueDateTo(undefined)
                  setAmountMinInput("")
                  setAmountMaxInput("")
                  setOperationSearchInput("")
                  setAmountMin("")
                  setAmountMax("")
                  setOperationSearch("")
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Limpiar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pagos a Operadores</CardTitle>
              <CardDescription>Cuentas a pagar a operadores</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportExcel} disabled={payments.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
              <Button variant="outline" onClick={() => setManualPaymentOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Pago Manual
              </Button>
              <Button onClick={() => setBulkPaymentOpen(true)}>
                <CreditCard className="h-4 w-4 mr-2" />
                Cargar Pago Masivo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No se encontraron pagos
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operación</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Fecha Vencimiento</TableHead>
                  <TableHead>Estado</TableHead>
                  {(statusFilter === "PAID" || statusFilter === "ALL") && (
                    <TableHead>Fecha Pago</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => {
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
                        <div className="font-mono text-xs">
                          {payment.operations?.file_code || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {payment.operations?.destination || "-"}
                        </div>
                      </TableCell>
                      <TableCell>{payment.operators?.name || "-"}</TableCell>
                      <TableCell className="font-medium">
                        <div>{formatCurrency(payment.amount, payment.currency)}</div>
                        {isPartial && (
                          <div className="text-xs text-muted-foreground">
                            Pagado: {formatCurrency(paidAmount, payment.currency)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {format(new Date(payment.due_date), "dd/MM/yyyy", { locale: es })}
                          {isOverdue && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={statusColors[displayStatus] || "bg-gray-500"}>
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
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bulk Payment Dialog */}
      <BulkPaymentDialog
        open={bulkPaymentOpen}
        onOpenChange={setBulkPaymentOpen}
        operators={operators}
        agencies={agencies}
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
    </div>
  )
}

