"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  CalendarDays,
  CreditCard,
  DollarSign,
  FileText,
  Info,
  User,
  Building2,
  Receipt,
  Clock,
  Wallet,
  ArrowDown,
  ArrowUp,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

interface PaymentInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: any | null
  type: "customer" | "operator"
}

interface AccountDetail {
  account: {
    id: string
    name: string
    currency: string
    type: string
  } | null
  movement: {
    receipt_number: string | null
    method: string | null
    notes: string | null
    created_at: string | null
    amount_original: number
    currency: string
  } | null
  balanceBefore: number | null
  balanceAfter: number | null
}

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

function InfoRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: any
  label: string
  value: React.ReactNode
  className?: string
}) {
  if (!value && value !== 0) return null
  return (
    <div className={`flex items-start gap-3 py-1 ${className || ""}`}>
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  )
}

const statusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  OVERDUE: "Vencido",
}

const statusVariants: Record<string, "default" | "secondary" | "destructive"> = {
  PAID: "default",
  PENDING: "secondary",
  OVERDUE: "destructive",
}

const methodLabels: Record<string, string> = {
  CASH: "Efectivo",
  BANK: "Transferencia Bancaria",
  MP: "Mercado Pago",
  USD: "Caja de Ahorro",
  OTHER: "Otro",
}

export function PaymentInfoDialog({
  open,
  onOpenChange,
  payment,
  type,
}: PaymentInfoDialogProps) {
  const [accountDetail, setAccountDetail] = useState<AccountDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const isOperatorPayment = type === "operator"

  // Fetch account detail when dialog opens
  useEffect(() => {
    if (!open || !payment) {
      setAccountDetail(null)
      return
    }

    const ledgerMovementId =
      payment.ledger_movements?.id || payment.ledger_movement_id
    const operationId =
      payment.operation_id || payment.operations?.id
    const operatorId =
      payment.operator_id || payment.operators?.id
    const paymentAmount = payment.paid_amount || payment.amount

    // Need at least one identifier to fetch detail
    if (!ledgerMovementId && !operationId) {
      setAccountDetail(null)
      return
    }

    const fetchDetail = async () => {
      setLoadingDetail(true)
      try {
        const params = new URLSearchParams()
        if (ledgerMovementId) params.append("ledgerMovementId", ledgerMovementId)
        if (operationId) params.append("operationId", operationId)
        if (operatorId) params.append("operatorId", operatorId)
        if (paymentAmount) params.append("paymentAmount", String(paymentAmount))

        const res = await fetch(
          `/api/payments/detail?${params.toString()}`
        )
        if (res.ok) {
          const data = await res.json()
          setAccountDetail(data)
        }
      } catch (error) {
        console.error("Error fetching payment detail:", error)
      } finally {
        setLoadingDetail(false)
      }
    }
    fetchDetail()
  }, [open, payment, isOperatorPayment])

  if (!payment) return null

  // Extract fields
  const operatorName = payment.operators?.name
  const operatorEmail = payment.operators?.contact_email
  const fileCode = payment.operations?.file_code
  const destination = payment.operations?.destination
  const mainPassenger =
    payment.operations?.main_passenger_name ||
    (() => {
      const customers = payment.operations?.operation_customers
      if (!customers || !Array.isArray(customers)) return null
      const main =
        customers.find((c: any) => c.role === "MAIN") || customers[0]
      if (!main?.customers) return null
      return (
        `${main.customers.first_name || ""} ${main.customers.last_name || ""}`.trim() ||
        null
      )
    })()
  const amount = parseFloat(payment.amount || "0")
  const paidAmount = isOperatorPayment
    ? parseFloat(payment.paid_amount || "0")
    : null
  const pendingAmount = isOperatorPayment ? amount - (paidAmount || 0) : null
  const currency = payment.currency || "ARS"
  const dueDate = isOperatorPayment ? payment.due_date : payment.date_due
  const status = payment.status
  const notes = payment.notes || payment.reference
  const createdAt = payment.created_at
  const updatedAt = payment.updated_at

  // Ledger movement info (from linked data or from detail API)
  const ledger = payment.ledger_movements
  const receiptNumber =
    accountDetail?.movement?.receipt_number || ledger?.receipt_number
  const paymentMethod =
    accountDetail?.movement?.method || ledger?.method
  const paymentDate =
    accountDetail?.movement?.created_at || ledger?.created_at
  const ledgerNotes = accountDetail?.movement?.notes || ledger?.notes

  // Customer payment fields
  const payerType = payment.payer_type
  const direction = payment.direction
  const method = payment.method
  const datePaid = payment.date_paid

  const isOverdue =
    status === "PENDING" && dueDate && new Date(dueDate) < new Date()
  const displayStatus = isOverdue ? "OVERDUE" : status

  // Account info
  const accountName = accountDetail?.account?.name
  const accountCurrency = accountDetail?.account?.currency || currency
  const balanceBefore = accountDetail?.balanceBefore
  const balanceAfter = accountDetail?.balanceAfter
  const hasAccountInfo = accountDetail?.account != null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" />
              Detalle del Pago
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Status + Amount */}
        <div className="px-6 pb-5">
          <div className="flex items-center justify-between">
            <Badge
              variant={statusVariants[displayStatus] || "secondary"}
              className="text-xs"
            >
              {statusLabels[displayStatus] || displayStatus}
            </Badge>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums">
                {formatCurrency(amount, currency)}
              </p>
              {isOperatorPayment &&
                paidAmount !== null &&
                paidAmount > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pagado: {formatCurrency(paidAmount, currency)}
                    {pendingAmount !== null && pendingAmount > 0 && (
                      <span className="text-destructive ml-1">
                        | Resta: {formatCurrency(pendingAmount, currency)}
                      </span>
                    )}
                  </p>
                )}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Cuenta Financiera - SECCION PRINCIPAL */}
          <div className="bg-muted/40 border-y px-6 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Cuenta Financiera
            </p>
            {loadingDetail ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : hasAccountInfo ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{accountName}</span>
                </div>
                {/* Balance Before → After */}
                {balanceBefore != null && balanceAfter != null && (
                  <div className="rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-center flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                          Antes
                        </p>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCurrency(balanceBefore as number, accountCurrency)}
                        </p>
                      </div>
                      <div className="flex flex-col items-center shrink-0 px-2">
                        {(balanceAfter as number) < (balanceBefore as number) ? (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        ) : (
                          <TrendingUp className="h-4 w-4 text-success" />
                        )}
                        <span className={`text-xs font-bold tabular-nums ${
                          (balanceAfter as number) < (balanceBefore as number) ? "text-destructive" : "text-success"
                        }`}>
                          {(balanceAfter as number) < (balanceBefore as number) ? "-" : "+"}
                          {formatCurrency(
                            Math.abs((balanceAfter as number) - (balanceBefore as number)),
                            accountCurrency
                          )}
                        </span>
                      </div>
                      <div className="text-center flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                          Despues
                        </p>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCurrency(balanceAfter as number, accountCurrency)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {status === "PENDING"
                  ? "Pago pendiente - sin cuenta asignada"
                  : "Sin informacion de cuenta"}
              </p>
            )}
          </div>

          {/* Rest of info */}
          <div className="px-6 py-4 space-y-4">
            {/* Operation */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Operacion
              </p>
              <InfoRow
                icon={FileText}
                label="Expediente"
                value={
                  fileCode ? (
                    <span className="font-mono text-xs">{fileCode}</span>
                  ) : null
                }
              />
              <InfoRow icon={Building2} label="Destino" value={destination} />
              <InfoRow
                icon={User}
                label="Pasajero Principal"
                value={mainPassenger}
              />
            </div>

            {isOperatorPayment && operatorName && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Operador
                  </p>
                  <InfoRow icon={Building2} label="Nombre" value={operatorName} />
                  {operatorEmail && (
                    <InfoRow icon={User} label="Email" value={operatorEmail} />
                  )}
                </div>
              </>
            )}

            {!isOperatorPayment && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Tipo
                  </p>
                  <InfoRow
                    icon={User}
                    label="Pagador"
                    value={
                      payerType === "CUSTOMER" ? "Cliente" : "Operador"
                    }
                  />
                  <InfoRow
                    icon={DollarSign}
                    label="Direccion"
                    value={direction === "INCOME" ? "Ingreso" : "Egreso"}
                  />
                  <InfoRow
                    icon={CreditCard}
                    label="Metodo"
                    value={method}
                  />
                </div>
              </>
            )}

            <Separator />

            {/* Dates & payment info */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Fechas
              </p>
              <InfoRow
                icon={CalendarDays}
                label="Vencimiento"
                value={
                  dueDate
                    ? format(new Date(dueDate), "dd/MM/yyyy", { locale: es })
                    : null
                }
              />
              {isOperatorPayment && status === "PAID" && (
                <InfoRow
                  icon={CalendarDays}
                  label="Fecha de Pago"
                  value={
                    paymentDate
                      ? format(new Date(paymentDate), "dd/MM/yyyy HH:mm", {
                          locale: es,
                        })
                      : updatedAt
                      ? format(new Date(updatedAt), "dd/MM/yyyy HH:mm", {
                          locale: es,
                        })
                      : null
                  }
                />
              )}
              {!isOperatorPayment && datePaid && (
                <InfoRow
                  icon={CalendarDays}
                  label="Fecha de Pago"
                  value={format(new Date(datePaid), "dd/MM/yyyy", {
                    locale: es,
                  })}
                />
              )}
              <InfoRow
                icon={Receipt}
                label="Comprobante"
                value={receiptNumber}
              />
              {isOperatorPayment && paymentMethod && (
                <InfoRow
                  icon={CreditCard}
                  label="Metodo de Pago"
                  value={methodLabels[paymentMethod] || paymentMethod}
                />
              )}
            </div>

            {(notes || ledgerNotes) && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Notas
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {notes || ledgerNotes}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer - timestamps */}
        <div className="border-t px-6 py-3 flex items-center gap-4 text-[11px] text-muted-foreground bg-muted/30">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Creado:{" "}
            {createdAt
              ? format(new Date(createdAt), "dd/MM/yy HH:mm", { locale: es })
              : "-"}
          </div>
          {updatedAt && updatedAt !== createdAt && (
            <div>
              Actualizado:{" "}
              {format(new Date(updatedAt), "dd/MM/yy HH:mm", { locale: es })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
