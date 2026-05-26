"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle
} from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
// Fix UTC shift en fechas DATE de Postgres (bug reportado por VICO/Andrés
// 2026-05-22): `new Date("2026-06-08")` shifteaba 1 día en zonas con
// offset negativo. parseDateOnlyLocal parsea sin shift.
import { parseDateOnlyLocal } from "@/lib/utils/date-only"

interface Payment {
  id: string
  operation_id?: string | null
  amount: number
  currency: string
  direction: string
  status: string
  date_due: string
  date_paid: string | null
  method: string
  operations?: {
    id?: string
    destination: string
    file_code: string
  } | null
}

interface CustomerAccountSectionProps {
  customerId: string
}

type PerCurrency = Record<string, number>

export function CustomerAccountSection({ customerId }: CustomerAccountSectionProps) {
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

  const fetchCustomerPayments = useCallback(async () => {
    try {
      setLoading(true)
      // Obtener operaciones del cliente y sus pagos
      const response = await fetch(`/api/customers/${customerId}/payments`)
      const data = await response.json()

      const allPayments = data.payments || []
      setPayments(allPayments)

      // Calcular resumen separado por moneda (sumar USD con ARS da numeros falsos)
      const today = new Date()
      const totalOwedByCurrency: PerCurrency = {}
      const totalPaidByCurrency: PerCurrency = {}
      let pendingCount = 0
      let overdueCount = 0

      allPayments.forEach((p: Payment) => {
        if (p.direction === "INCOME") {
          const cur = p.currency || "ARS"
          const amt = Number(p.amount) || 0
          if (p.status === "PAID") {
            totalPaidByCurrency[cur] = (totalPaidByCurrency[cur] || 0) + amt
          } else {
            totalOwedByCurrency[cur] = (totalOwedByCurrency[cur] || 0) + amt
            pendingCount++
            if ((parseDateOnlyLocal(p.date_due) ?? new Date(8640000000000000)) < today) {
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
      console.error("Error fetching customer payments:", error)
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    fetchCustomerPayments()
  }, [fetchCustomerPayments])

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

  const owedEntries = Object.entries(summary.totalOwedByCurrency).filter(([, v]) => v > 0)
  const paidEntries = Object.entries(summary.totalPaidByCurrency).filter(([, v]) => v > 0)
  const hasOwed = owedEntries.length > 0
  const renderAmounts = (entries: [string, number][]) =>
    entries.length === 0
      ? <span>ARS 0,00</span>
      : entries.map(([cur, amt], i) => (
          <span key={cur} className={i > 0 ? "block text-base" : "block"}>
            {formatCurrency(amt, cur)}
          </span>
        ))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Cuenta Corriente
        </CardTitle>
        <CardDescription>
          Estado financiero del cliente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resumen */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <div className="p-4 rounded-lg border bg-success/10 border-success/30">
            <div className="flex items-center gap-2 text-success">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Total Pagado</span>
            </div>
            <div className="text-xl font-bold mt-1">
              {renderAmounts(paidEntries)}
            </div>
          </div>

          <div className={`p-4 rounded-lg border ${
            hasOwed
              ? "bg-accent-coral/5 dark:bg-accent-coral/20 border-accent-coral/15 dark:border-accent-coral"
              : "bg-muted dark:bg-card/50 border-border dark:border-muted-foreground"
          }`}>
            <div className={`flex items-center gap-2 ${
              hasOwed ? "text-accent-coral dark:text-accent-coral" : "text-muted-foreground"
            }`}>
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm font-medium">Saldo Pendiente</span>
            </div>
            <div className="text-xl font-bold mt-1">
              {renderAmounts(owedEntries)}
            </div>
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
              ? "bg-destructive/10 border-destructive/30"
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
          <h4 className="font-medium mb-3">Historial de Movimientos</h4>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay movimientos registrados</p>
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
                          ? "bg-success/10"
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
                          {payment.operation_id ? (
                            <Link href={`/operations/${payment.operation_id}`} className="text-primary hover:underline" prefetch={false}>
                              {payment.operations?.destination || "Sin operación"}
                            </Link>
                          ) : (payment.operations?.destination || "Sin operación")}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {payment.status === "PAID" && payment.date_paid
                            ? `Pagado ${parseDateOnlyLocal(payment.date_paid) ? format(parseDateOnlyLocal(payment.date_paid)!, "dd/MM/yyyy", { locale: es }) : "-"}`
                            : `Vence ${parseDateOnlyLocal(payment.date_due) ? format(parseDateOnlyLocal(payment.date_due)!, "dd/MM/yyyy", { locale: es }) : "-"}`
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

