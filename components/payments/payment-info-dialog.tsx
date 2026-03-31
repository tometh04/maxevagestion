"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarDays, CreditCard, DollarSign, FileText, Info, User, Building2, Receipt, Clock, Banknote } from "lucide-react"

interface PaymentInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: any | null
  type: "customer" | "operator"
}

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

function InfoRow({ icon: Icon, label, value, className }: { icon: any; label: string; value: React.ReactNode; className?: string }) {
  if (!value && value !== 0) return null
  return (
    <div className={`flex items-start gap-3 ${className || ""}`}>
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

export function PaymentInfoDialog({ open, onOpenChange, payment, type }: PaymentInfoDialogProps) {
  if (!payment) return null

  const isOperatorPayment = type === "operator"

  // Operator payment fields
  const operatorName = payment.operators?.name
  const operatorEmail = payment.operators?.contact_email
  const fileCode = payment.operations?.file_code
  const destination = payment.operations?.destination
  // Get main passenger name from operation_customers or direct field
  const mainPassenger = payment.operations?.main_passenger_name || (() => {
    const customers = payment.operations?.operation_customers
    if (!customers || !Array.isArray(customers)) return null
    const main = customers.find((c: any) => c.role === "MAIN") || customers[0]
    if (!main?.customers) return null
    return `${main.customers.first_name || ""} ${main.customers.last_name || ""}`.trim() || null
  })()
  const amount = parseFloat(payment.amount || "0")
  const paidAmount = isOperatorPayment ? parseFloat(payment.paid_amount || "0") : null
  const pendingAmount = isOperatorPayment ? amount - (paidAmount || 0) : null
  const currency = payment.currency || "ARS"
  const dueDate = isOperatorPayment ? payment.due_date : payment.date_due
  const status = payment.status
  const notes = payment.notes || payment.reference
  const createdAt = payment.created_at
  const updatedAt = payment.updated_at

  // Ledger movement info (from linked ledger_movement)
  const ledger = payment.ledger_movements
  const receiptNumber = ledger?.receipt_number
  const paymentMethod = ledger?.method
  const paymentDate = ledger?.created_at
  const ledgerNotes = ledger?.notes
  const accountName = ledger?.financial_accounts?.name || ledger?.account_name

  // Customer payment fields
  const payerType = payment.payer_type
  const direction = payment.direction
  const method = payment.method
  const datePaid = payment.date_paid

  const isOverdue = status === "PENDING" && dueDate && new Date(dueDate) < new Date()
  const displayStatus = isOverdue ? "OVERDUE" : status

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Detalle del Pago
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + Amount header */}
          <div className="flex items-center justify-between">
            <Badge variant={statusVariants[displayStatus] || "secondary"} className="text-sm">
              {statusLabels[displayStatus] || displayStatus}
            </Badge>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums">
                {formatCurrency(amount, currency)}
              </p>
              {isOperatorPayment && paidAmount !== null && paidAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Pagado: {formatCurrency(paidAmount, currency)}
                  {pendingAmount !== null && pendingAmount > 0 && (
                    <span className="text-red-500 ml-1">
                      | Resta: {formatCurrency(pendingAmount, currency)}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Operation info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operacion</p>
            <InfoRow
              icon={FileText}
              label="Expediente"
              value={fileCode ? (
                <span className="font-mono">{fileCode}</span>
              ) : null}
            />
            <InfoRow icon={Building2} label="Destino" value={destination} />
            <InfoRow icon={User} label="Pasajero Principal" value={mainPassenger} />
          </div>

          {isOperatorPayment && operatorName && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operador</p>
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
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo</p>
                <InfoRow
                  icon={User}
                  label="Pagador"
                  value={payerType === "CUSTOMER" ? "Cliente" : "Operador"}
                />
                <InfoRow
                  icon={DollarSign}
                  label="Direccion"
                  value={direction === "INCOME" ? "Ingreso" : "Egreso"}
                />
                <InfoRow icon={CreditCard} label="Metodo" value={method} />
              </div>
            </>
          )}

          <Separator />

          {/* Payment details */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pago</p>
            <InfoRow
              icon={CalendarDays}
              label="Vencimiento"
              value={dueDate ? format(new Date(dueDate), "dd/MM/yyyy", { locale: es }) : null}
            />
            {/* Operator: payment date from ledger or updated_at */}
            {isOperatorPayment && status === "PAID" && (
              <InfoRow
                icon={CalendarDays}
                label="Fecha de Pago"
                value={paymentDate
                  ? format(new Date(paymentDate), "dd/MM/yyyy HH:mm", { locale: es })
                  : updatedAt
                  ? format(new Date(updatedAt), "dd/MM/yyyy HH:mm", { locale: es })
                  : null}
              />
            )}
            {/* Customer: date_paid */}
            {!isOperatorPayment && datePaid && (
              <InfoRow
                icon={CalendarDays}
                label="Fecha de Pago"
                value={format(new Date(datePaid), "dd/MM/yyyy", { locale: es })}
              />
            )}
            <InfoRow icon={Banknote} label="Cuenta" value={accountName} />
            <InfoRow icon={Receipt} label="Comprobante" value={receiptNumber} />
            <InfoRow icon={CreditCard} label="Metodo" value={isOperatorPayment ? paymentMethod : null} />
          </div>

          {(notes || ledgerNotes) && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notas</p>
                <p className="text-sm text-muted-foreground">{notes || ledgerNotes}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Creado: {createdAt ? format(new Date(createdAt), "dd/MM/yy HH:mm", { locale: es }) : "-"}
            </div>
            {updatedAt && updatedAt !== createdAt && (
              <div>
                Actualizado: {format(new Date(updatedAt), "dd/MM/yy HH:mm", { locale: es })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
