"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  AlertTriangle
} from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface Payment {
  id: string
  amount: number
  currency: string
  direction: string
  status: string
  date_due: string
  date_paid: string | null
  method: string
  operations?: {
    destination: string
    file_code: string
  } | null
}

interface OperatorAccountSectionProps {
  operatorId: string
  creditLimit?: number | null
}

export function OperatorAccountSection({ operatorId, creditLimit }: OperatorAccountSectionProps) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    totalOwed: 0,
    totalPaid: 0,
    pendingPayments: 0,
    overduePayments: 0,
  })

  useEffect(() => {
    fetchOperatorPayments()
  }, [operatorId])

  const fetchOperatorPayments = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/operators/${operatorId}/payments`)
      const data = await response.json()
      
      const allPayments = data.payments || []
      setPayments(allPayments)
      
      // Calcular resumen
      const today = new Date()
      let totalOwed = 0
      let totalPaid = 0
      let pendingCount = 0
      let overdueCount = 0
      
      allPayments.forEach((p: Payment) => {
        if (p.direction === "EXPENSE") {
          if (p.status === "PAID") {
            totalPaid += p.amount
          } else {
            totalOwed += p.amount
            pendingCount++
            if (new Date(p.date_due) < today) {
              overdueCount++
            }
          }
        }
      })
      
      setSummary({
        totalOwed,
        totalPaid,
        pendingPayments: pendingCount,
        overduePayments: overdueCount,
      })
    } catch (error) {
      console.error("Error fetching operator payments:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number, currency: string = "ARS") => {
    return `${currency} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
  }

  const getStatusBadge = (status: string, dateDue: string) => {
    const isOverdue = status === "PENDING" && new Date(dateDue) < new Date()
    
    if (status === "PAID") {
      return <Badge variant="default" className="bg-green-500">Pagado</Badge>
    }
    if (isOverdue) {
      return <Badge variant="destructive">Vencido</Badge>
    }
    return <Badge variant="secondary">Pendiente</Badge>
  }

  const exceedsCreditLimit = creditLimit && summary.totalOwed > creditLimit

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Cuenta Corriente
        </CardTitle>
        <CardDescription>
          Estado de pagos al operador
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Alerta de límite de crédito */}
        {exceedsCreditLimit && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>¡Límite de crédito excedido!</strong> El saldo pendiente ({formatCurrency(summary.totalOwed)}) 
              supera el límite de crédito ({formatCurrency(creditLimit!)}).
            </AlertDescription>
          </Alert>
        )}

        {/* Resumen */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Total Pagado</span>
            </div>
            <p className="text-xl font-bold mt-1">
              {formatCurrency(summary.totalPaid)}
            </p>
          </div>
          
          <div className={`p-4 rounded-lg border ${
            exceedsCreditLimit 
              ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
              : summary.totalOwed > 0 
                ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" 
                : "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700"
          }`}>
            <div className={`flex items-center gap-2 ${
              exceedsCreditLimit 
                ? "text-red-600 dark:text-red-400"
                : summary.totalOwed > 0 
                  ? "text-yellow-600 dark:text-yellow-400" 
                  : "text-gray-600"
            }`}>
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm font-medium">Saldo Adeudado</span>
            </div>
            <p className="text-xl font-bold mt-1">
              {formatCurrency(summary.totalOwed)}
            </p>
            {creditLimit && (
              <p className="text-xs text-muted-foreground mt-1">
                Límite: {formatCurrency(creditLimit)}
              </p>
            )}
          </div>
          
          <div className="p-4 rounded-lg border">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Pagos Pendientes</span>
            </div>
            <p className="text-xl font-bold mt-1">
              {summary.pendingPayments}
            </p>
          </div>
          
          <div className={`p-4 rounded-lg border ${
            summary.overduePayments > 0 
              ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" 
              : ""
          }`}>
            <div className={`flex items-center gap-2 ${
              summary.overduePayments > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
            }`}>
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Vencidos</span>
            </div>
            <p className="text-xl font-bold mt-1">
              {summary.overduePayments}
            </p>
          </div>
        </div>

        {/* Historial de pagos */}
        <div>
          <h4 className="font-medium mb-3">Historial de Pagos</h4>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay pagos registrados</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-3">
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="p-3 rounded-lg border flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        payment.status === "PAID" 
                          ? "bg-green-100 dark:bg-green-900/30" 
                          : "bg-yellow-100 dark:bg-yellow-900/30"
                      }`}>
                        {payment.status === "PAID" ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-yellow-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {payment.operations?.file_code || payment.operations?.destination || "Sin operación"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {payment.status === "PAID" && payment.date_paid
                            ? `Pagado ${format(new Date(payment.date_paid), "dd/MM/yyyy", { locale: es })}`
                            : `Vence ${format(new Date(payment.date_due), "dd/MM/yyyy", { locale: es })}`
                          }
                          <span>•</span>
                          <span>{payment.method}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatCurrency(payment.amount, payment.currency)}
                      </p>
                      {getStatusBadge(payment.status, payment.date_due)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

