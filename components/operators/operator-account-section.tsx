"use client"

import { useEffect, useState, useCallback } from "react"
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
import { parseDateOnlyLocal } from "@/lib/utils/date-only"
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

type PerCurrency = Record<string, number>

export function OperatorAccountSection({ operatorId, creditLimit }: OperatorAccountSectionProps) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<{
    totalOwedByCurrency: PerCurrency
    totalPaidByCurrency: PerCurrency
    pendingPayments: number
    overduePayments: number
  }>({
    totalOwedByCurrency: {},
    totalPaidByCurrency: {},
    pendingPayments: 0,
    overduePayments: 0,
  })

  const fetchOperatorPayments = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/operators/${operatorId}/payments`)
      const data = await response.json()

      const allPayments = data.payments || []
      setPayments(allPayments)

      // Resumen separado por moneda (sumar USD con ARS da numeros falsos)
      const today = new Date()
      const totalOwedByCurrency: PerCurrency = {}
      const totalPaidByCurrency: PerCurrency = {}
      let pendingCount = 0
      let overdueCount = 0

      allPayments.forEach((p: Payment) => {
        if (p.direction === "EXPENSE") {
          const cur = p.currency || "ARS"
          const amt = Number(p.amount) || 0
          if (p.status === "PAID") {
            totalPaidByCurrency[cur] = (totalPaidByCurrency[cur] || 0) + amt
          } else {
            totalOwedByCurrency[cur] = (totalOwedByCurrency[cur] || 0) + amt
            pendingCount++
            if ((parseDateOnlyLocal(p.date_due) ?? new Date(p.date_due)) < today) {
              overdueCount++
            }
          }
        }
      })

      setSummary({
        totalOwedByCurrency,
        totalPaidByCurrency,
        pendingPayments: pendingCount,
        overduePayments: overdueCount,
      })
    } catch (error) {
      console.error("Error fetching operator payments:", error)
    } finally {
      setLoading(false)
    }
  }, [operatorId])

  useEffect(() => {
    fetchOperatorPayments()
  }, [fetchOperatorPayments])

  const formatCurrency = (amount: number, currency: string = "ARS") => {
    return `${currency} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
  }

  const getStatusBadge = (status: string, dateDue: string) => {
    const isOverdue = status === "PENDING" && new Date(dateDue) < new Date()
    
    if (status === "PAID") {
      return <Badge variant="default" className="bg-success">Pagado</Badge>
    }
    if (isOverdue) {
      return <Badge variant="destructive">Vencido</Badge>
    }
    return <Badge variant="secondary">Pendiente</Badge>
  }

  const owedEntries = Object.entries(summary.totalOwedByCurrency).filter(([, v]) => v > 0)
  const paidEntries = Object.entries(summary.totalPaidByCurrency).filter(([, v]) => v > 0)
  const hasOwed = owedEntries.length > 0
  // creditLimit comparado solo en ARS — es el caso comun historico
  const totalOwedArs = summary.totalOwedByCurrency["ARS"] || 0
  const exceedsCreditLimit = creditLimit && totalOwedArs > creditLimit
  const renderAmounts = (entries: [string, number][]) =>
    entries.length === 0
      ? <span>ARS 0,00</span>
      : entries.map(([cur, amt], i) => (
          <span key={cur} className={i > 0 ? "block text-base" : "block"}>
            {formatCurrency(amt, cur)}
          </span>
        ))

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
        {/* Alerta de límite de crédito — compara solo saldo en ARS */}
        {exceedsCreditLimit && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>¡Límite de crédito excedido!</strong> El saldo pendiente en ARS ({formatCurrency(totalOwedArs, "ARS")})
              supera el límite de crédito ({formatCurrency(creditLimit!, "ARS")}).
            </AlertDescription>
          </Alert>
        )}

        {/* Resumen */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <div className="p-4 rounded-lg border bg-success/5 dark:bg-success/20 border-success/15 dark:border-success">
            <div className="flex items-center gap-2 text-success dark:text-success">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Total Pagado</span>
            </div>
            <div className="text-xl font-bold mt-1">
              {renderAmounts(paidEntries)}
            </div>
          </div>

          <div className={`p-4 rounded-lg border ${
            exceedsCreditLimit
              ? "bg-destructive/10 border-destructive"
              : hasOwed
                ? "bg-accent-coral/10 border-accent-coral"
                : "bg-muted dark:bg-card/50 border-border dark:border-muted-foreground"
          }`}>
            <div className={`flex items-center gap-2 ${
              exceedsCreditLimit
                ? "text-destructive"
                : hasOwed
                  ? "text-accent-coral"
                  : "text-muted-foreground"
            }`}>
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm font-medium">Saldo Adeudado</span>
            </div>
            <div className="text-xl font-bold mt-1">
              {renderAmounts(owedEntries)}
            </div>
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
              ? "bg-destructive/10 border-destructive"
              : ""
          }`}>
            <div className={`flex items-center gap-2 ${
              summary.overduePayments > 0 ? "text-destructive" : "text-muted-foreground"
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
                          ? "bg-success/10 dark:bg-success/30" 
                          : "bg-accent-coral/10 dark:bg-accent-coral/30"
                      }`}>
                        {payment.status === "PAID" ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : (
                          <Clock className="h-4 w-4 text-accent-coral" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {payment.operations?.file_code || payment.operations?.destination || "Sin operación"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {payment.status === "PAID" && payment.date_paid
                            ? `Pagado ${format(parseDateOnlyLocal(payment.date_paid) ?? new Date(payment.date_paid), "dd/MM/yyyy", { locale: es })}`
                            : `Vence ${format(parseDateOnlyLocal(payment.date_due) ?? new Date(payment.date_due), "dd/MM/yyyy", { locale: es })}`
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

