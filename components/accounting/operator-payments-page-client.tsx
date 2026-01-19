"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { BulkPaymentDialog } from "./bulk-payment-dialog"
import { CreditCard, Download } from "lucide-react"
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
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { AlertTriangle } from "lucide-react"

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
  const [bulkPaymentOpen, setBulkPaymentOpen] = useState(false)

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
  }, [statusFilter, agencyFilter])

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
          <div className="flex gap-4">
            <div className="w-48">
              <Label>Agencia</Label>
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
            <div className="w-48">
              <Label>Estado</Label>
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
          </div>
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
    </div>
  )
}

