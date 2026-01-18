"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface Operator {
  id: string
  name: string
}

interface FinancialAccount {
  id: string
  name: string
  type: string
  currency: "ARS" | "USD"
  current_balance?: number
}

interface OperatorPayment {
  id: string
  operation_id: string
  operator_id: string
  amount: number
  paid_amount?: number
  currency: "ARS" | "USD"
  due_date: string
  status: string
  operations?: {
    id: string
    file_code: string | null
    destination: string | null
  }
  operators?: {
    id: string
    name: string
  }
}

interface BulkPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  operators: Operator[]
  agencies: Array<{ id: string; name: string }>
}

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

export function BulkPaymentDialog({
  open,
  onOpenChange,
  operators,
  agencies,
}: BulkPaymentDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  
  // Filtros
  const [operatorId, setOperatorId] = useState<string>("ALL")
  const [currency, setCurrency] = useState<string>("ALL")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  
  // Datos
  const [pendingPayments, setPendingPayments] = useState<OperatorPayment[]>([])
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set())
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, number>>({})
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  
  // Formulario de pago
  const [paymentAccountId, setPaymentAccountId] = useState<string>("")
  const [paymentCurrency, setPaymentCurrency] = useState<"ARS" | "USD">("USD")
  const [exchangeRate, setExchangeRate] = useState<string>("")
  const [receiptNumber, setReceiptNumber] = useState<string>("")
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState<string>("")
  
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Cargar pagos pendientes según filtros
  useEffect(() => {
    if (!open) return
    
    const fetchPendingPayments = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.append("status", "PENDING")
        if (operatorId !== "ALL") {
          params.append("operatorId", operatorId)
        }
        if (agencies.length > 0) {
          params.append("agencyId", agencies[0].id) // Por ahora usar primera agencia
        }

        const response = await fetch(`/api/accounting/operator-payments?${params.toString()}`)
        if (!response.ok) throw new Error("Error al obtener pagos")

        const data = await response.json()
        let payments = (data.payments || []) as OperatorPayment[]

        // Filtrar por moneda si se especifica
        if (currency !== "ALL") {
          payments = payments.filter(p => p.currency === currency)
        }

        // Filtrar por fecha de viaje (usar departure_date de la operación)
        // TODO: Agregar filtro por fecha cuando la API lo soporte

        setPendingPayments(payments)
      } catch (error) {
        console.error("Error fetching pending payments:", error)
        toast({
          title: "Error",
          description: "No se pudieron cargar los pagos pendientes",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchPendingPayments()
  }, [open, operatorId, currency, dateFrom, dateTo, agencies, toast])

  // Cargar cuentas financieras
  useEffect(() => {
    if (!open) return

    const fetchFinancialAccounts = async () => {
      try {
        const response = await fetch("/api/accounting/financial-accounts")
        if (!response.ok) throw new Error("Error al obtener cuentas")

        const data = await response.json()
        const accounts = (data.accounts || []).filter((acc: any) => acc.is_active !== false)
        setFinancialAccounts(accounts)
      } catch (error) {
        console.error("Error fetching financial accounts:", error)
      }
    }

    fetchFinancialAccounts()
  }, [open])

  // Inicializar montos a pagar con el monto pendiente
  useEffect(() => {
    const amounts: Record<string, number> = {}
    selectedPayments.forEach(paymentId => {
      const payment = pendingPayments.find(p => p.id === paymentId)
      if (payment) {
        const paidAmount = payment.paid_amount || 0
        const remaining = payment.amount - paidAmount
        amounts[paymentId] = remaining
      }
    })
    setPaymentAmounts(amounts)
  }, [selectedPayments, pendingPayments])

  const handleTogglePayment = (paymentId: string) => {
    const newSelected = new Set(selectedPayments)
    if (newSelected.has(paymentId)) {
      newSelected.delete(paymentId)
    } else {
      newSelected.add(paymentId)
    }
    setSelectedPayments(newSelected)
  }

  const handleAmountChange = (paymentId: string, value: string) => {
    const payment = pendingPayments.find(p => p.id === paymentId)
    if (!payment) return

    const numValue = parseFloat(value) || 0
    const paidAmount = payment.paid_amount || 0
    const maxAmount = payment.amount - paidAmount

    // No permitir más del pendiente
    const finalValue = Math.min(numValue, maxAmount)

    setPaymentAmounts(prev => ({
      ...prev,
      [paymentId]: finalValue,
    }))
  }

  // Calcular total del pago en la moneda seleccionada
  const calculateTotal = (): number => {
    let total = 0
    selectedPayments.forEach(paymentId => {
      const payment = pendingPayments.find(p => p.id === paymentId)
      const amountToPay = paymentAmounts[paymentId] || 0
      
      if (!payment) return

      // Si la moneda del pago es diferente a la de la operación, necesitamos convertir
      if (paymentCurrency === payment.currency) {
        total += amountToPay
      } else {
        // Conversión necesaria - usar exchange_rate si está disponible
        if (exchangeRate) {
          const rate = parseFloat(exchangeRate)
          if (paymentCurrency === "USD") {
            // Convertir de ARS a USD
            total += amountToPay / rate
          } else {
            // Convertir de USD a ARS
            total += amountToPay * rate
          }
        } else {
          // Sin TC, sumar directamente (mostrar advertencia)
          total += amountToPay
        }
      }
    })
    return total
  }

  const handleSubmit = async () => {
    // Validaciones
    if (selectedPayments.size === 0) {
      toast({
        title: "Error",
        description: "Debe seleccionar al menos un pago",
        variant: "destructive",
      })
      return
    }

    if (!paymentAccountId) {
      toast({
        title: "Error",
        description: "Debe seleccionar una cuenta financiera de origen",
        variant: "destructive",
      })
      return
    }

    // Si hay conversión de moneda, validar TC
    const needsExchangeRate = Array.from(selectedPayments).some(paymentId => {
      const payment = pendingPayments.find(p => p.id === paymentId)
      return payment && payment.currency !== paymentCurrency
    })

    if (needsExchangeRate && !exchangeRate) {
      toast({
        title: "Error",
        description: "Debe ingresar el tipo de cambio para convertir monedas",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      const payments = Array.from(selectedPayments).map(paymentId => {
        const payment = pendingPayments.find(p => p.id === paymentId)!
        return {
          operator_payment_id: paymentId,
          operation_id: payment.operation_id,
          amount_to_pay: paymentAmounts[paymentId] || 0,
        }
      })

      const response = await fetch("/api/accounting/operator-payments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payments,
          payment_account_id: paymentAccountId,
          payment_currency: paymentCurrency,
          exchange_rate: exchangeRate ? parseFloat(exchangeRate) : null,
          receipt_number: receiptNumber,
          payment_date: paymentDate,
          notes: notes || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al procesar pagos")
      }

      toast({
        title: "Éxito",
        description: `Se procesaron ${payments.length} pago(s) correctamente`,
      })

      // Cerrar dialog y refrescar
      onOpenChange(false)
      router.refresh()
    } catch (error: any) {
      console.error("Error submitting bulk payment:", error)
      toast({
        title: "Error",
        description: error.message || "Error al procesar pagos",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const totalPaymentAmount = calculateTotal()
  const needsExchangeRate = Array.from(selectedPayments).some(paymentId => {
    const payment = pendingPayments.find(p => p.id === paymentId)
    return payment && payment.currency !== paymentCurrency
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar Pago Masivo</DialogTitle>
          <DialogDescription>
            Seleccione múltiples pagos pendientes y procéselos en una sola transacción
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Filtros */}
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Operador</Label>
              <Select value={operatorId} onValueChange={setOperatorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los operadores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los operadores</SelectItem>
                  {operators.map(op => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las monedas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="ARS">ARS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Fecha de Viaje Desde</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
          </div>

          {/* Tabla de pagos pendientes */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No se encontraron pagos pendientes con los filtros seleccionados
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedPayments.size === pendingPayments.length && pendingPayments.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedPayments(new Set(pendingPayments.map(p => p.id)))
                          } else {
                            setSelectedPayments(new Set())
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Operación</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Monto Total</TableHead>
                    <TableHead>Pagado</TableHead>
                    <TableHead>Pendiente</TableHead>
                    <TableHead>Moneda</TableHead>
                    <TableHead>Monto a Pagar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayments.map((payment) => {
                    const paidAmount = payment.paid_amount || 0
                    const remaining = payment.amount - paidAmount
                    const isSelected = selectedPayments.has(payment.id)
                    const amountToPay = paymentAmounts[payment.id] || (isSelected ? remaining : 0)

                    return (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleTogglePayment(payment.id)}
                          />
                        </TableCell>
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
                          {formatCurrency(payment.amount, payment.currency)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatCurrency(paidAmount, payment.currency)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(remaining, payment.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.currency}</Badge>
                        </TableCell>
                        <TableCell>
                          {isSelected ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={remaining}
                              value={amountToPay}
                              onChange={(e) => handleAmountChange(payment.id, e.target.value)}
                              className="w-32"
                            />
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Información del pago */}
          {selectedPayments.size > 0 && (
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-semibold">Información del Pago</h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Cuenta Financiera de Origen *</Label>
                  <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {financialAccounts.map(account => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Moneda del Pago *</Label>
                  <Select value={paymentCurrency} onValueChange={(v) => setPaymentCurrency(v as "ARS" | "USD")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ARS">ARS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {needsExchangeRate && (
                  <div>
                    <Label>Tipo de Cambio *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      placeholder="Ej: 1200"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Requerido cuando la moneda del pago difiere de la operación
                    </p>
                  </div>
                )}

                <div>
                  <Label>Número de Comprobante *</Label>
                  <Input
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="Nro. de transferencia/recibo"
                  />
                </div>

                <div>
                  <Label>Fecha de Pago *</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Notas (opcional)</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas adicionales"
                  />
                </div>
              </div>

              {/* Resumen */}
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total del Pago:</span>
                  <span className="text-2xl font-bold">
                    {formatCurrency(totalPaymentAmount, paymentCurrency)}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {selectedPayments.size} operación(es) seleccionada(s)
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || selectedPayments.size === 0}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Procesar {selectedPayments.size > 0 && `(${selectedPayments.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
