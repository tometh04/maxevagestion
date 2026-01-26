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
import { Loader2, AlertCircle, ChevronRight, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription } from "@/components/ui/alert"

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
  
  // Paso 1: Operador
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>("")
  
  // Paso 2: Moneda
  const [selectedCurrency, setSelectedCurrency] = useState<"ARS" | "USD" | "">("")
  
  // Paso 3: Deudas
  const [pendingPayments, setPendingPayments] = useState<OperatorPayment[]>([])
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set())
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, number>>({})
  const [loadingPayments, setLoadingPayments] = useState(false)
  
  // Paso 4: Información del pago
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [paymentAccountId, setPaymentAccountId] = useState<string>("")
  const [paymentCurrency, setPaymentCurrency] = useState<"ARS" | "USD">("USD")
  const [exchangeRate, setExchangeRate] = useState<string>("")
  const [receiptNumber, setReceiptNumber] = useState<string>("")
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState<string>("")
  
  const [submitting, setSubmitting] = useState(false)

  // Reset cuando se cierra el dialog
  useEffect(() => {
    if (!open) {
      setSelectedOperatorId("")
      setSelectedCurrency("")
      setPendingPayments([])
      setSelectedPayments(new Set())
      setPaymentAmounts({})
      setPaymentAccountId("")
      setPaymentCurrency("USD")
      setExchangeRate("")
      setReceiptNumber("")
      setNotes("")
    }
  }, [open])

  // Cargar cuentas financieras
  useEffect(() => {
    if (!open) return

    const fetchFinancialAccounts = async () => {
      try {
        const response = await fetch("/api/accounting/financial-accounts?excludeAccountingOnly=true")
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

  // Cargar deudas cuando se selecciona operador y moneda
  useEffect(() => {
    if (!open || !selectedOperatorId || !selectedCurrency) {
      setPendingPayments([])
      setSelectedPayments(new Set())
      setPaymentAmounts({})
      return
    }

    const fetchPendingPayments = async () => {
      setLoadingPayments(true)
      try {
        const params = new URLSearchParams()
        params.append("operatorId", selectedOperatorId)
        // NO filtrar por agencia para el pago masivo - mostrar TODAS las deudas del operador
        // El usuario verá todas las deudas pendientes del operador en todas las agencias

        console.log("[BulkPayment] Fetching payments for operator:", selectedOperatorId)
        const response = await fetch(`/api/accounting/operator-payments?${params.toString()}`)
        if (!response.ok) throw new Error("Error al obtener pagos")

        const data = await response.json()
        let payments = (data.payments || []) as OperatorPayment[]

        console.log("[BulkPayment] Total pagos recibidos:", payments.length)
        console.log("[BulkPayment] Primeros pagos:", payments.slice(0, 3).map(p => ({
          id: p.id,
          status: p.status,
          currency: p.currency,
          amount: p.amount,
          paid_amount: p.paid_amount,
          operator: p.operators?.name,
        })))

        // Filtrar por status: PENDING o OVERDUE (son los que tienen deuda pendiente)
        payments = payments.filter(p => p.status === "PENDING" || p.status === "OVERDUE")
        console.log("[BulkPayment] Pagos PENDING/OVERDUE:", payments.length)

        // Filtrar por moneda
        payments = payments.filter(p => p.currency === selectedCurrency)
        console.log("[BulkPayment] Pagos en moneda", selectedCurrency, ":", payments.length)

        // Solo pagos pendientes (con deuda real, no pagados completamente)
        payments = payments.filter(p => {
          const paidAmount = p.paid_amount || 0
          const remaining = p.amount - paidAmount
          return remaining > 0
        })
        console.log("[BulkPayment] Pagos con deuda pendiente:", payments.length)

        setPendingPayments(payments)
      } catch (error) {
        console.error("Error fetching pending payments:", error)
        toast({
          title: "Error",
          description: "No se pudieron cargar las deudas",
          variant: "destructive",
        })
      } finally {
        setLoadingPayments(false)
      }
    }

    fetchPendingPayments()
  }, [open, selectedOperatorId, selectedCurrency, agencies, toast])

  // Actualizar moneda de pago cuando cambia la moneda seleccionada
  useEffect(() => {
    if (selectedCurrency) {
      setPaymentCurrency(selectedCurrency as "ARS" | "USD")
    }
  }, [selectedCurrency])

  // Actualizar moneda de pago automáticamente cuando se selecciona una cuenta financiera
  // Si la cuenta tiene moneda diferente a la de las deudas, se actualiza paymentCurrency
  useEffect(() => {
    if (paymentAccountId && selectedCurrency) {
      const selectedAccount = financialAccounts.find(acc => acc.id === paymentAccountId)
      if (selectedAccount && selectedAccount.currency !== selectedCurrency) {
        // La cuenta tiene moneda diferente a la de las deudas
        // Actualizar paymentCurrency a la moneda de la cuenta
        setPaymentCurrency(selectedAccount.currency)
      }
    }
  }, [paymentAccountId, financialAccounts, selectedCurrency])

  // Inicializar montos a pagar con el pendiente cuando se selecciona
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPayments(new Set(pendingPayments.map(p => p.id)))
    } else {
      setSelectedPayments(new Set())
    }
  }

  const handleAmountChange = (paymentId: string, value: string) => {
    const payment = pendingPayments.find(p => p.id === paymentId)
    if (!payment) return

    const numValue = parseFloat(value) || 0
    const paidAmount = payment.paid_amount || 0
    const maxAmount = payment.amount - paidAmount

    // No permitir más del pendiente ni valores negativos
    const finalValue = Math.max(0, Math.min(numValue, maxAmount))

    setPaymentAmounts(prev => ({
      ...prev,
      [paymentId]: finalValue,
    }))
  }

  // Calcular total del pago
  const calculateTotal = (): number => {
    let total = 0
    selectedPayments.forEach(paymentId => {
      const amountToPay = paymentAmounts[paymentId] || 0
      total += amountToPay
    })
    return total
  }

  // Verificar si necesita tipo de cambio
  const needsExchangeRate = () => {
    // Necesita TC si:
    // 1. La moneda de pago es diferente a la moneda de las deudas, O
    // 2. La cuenta seleccionada tiene moneda diferente a la moneda de las deudas
    if (!selectedCurrency || !paymentAccountId) return false
    
    const selectedAccount = financialAccounts.find(acc => acc.id === paymentAccountId)
    if (selectedAccount) {
      // Si la cuenta tiene moneda diferente a la de las deudas, necesita TC
      return selectedAccount.currency !== selectedCurrency
    }
    
    // Fallback: comparar paymentCurrency con selectedCurrency
    return paymentCurrency !== selectedCurrency
  }

  const handleSubmit = async () => {
    // Validaciones
    if (!selectedOperatorId) {
      toast({
        title: "Error",
        description: "Debe seleccionar un operador",
        variant: "destructive",
      })
      return
    }

    if (!selectedCurrency) {
      toast({
        title: "Error",
        description: "Debe seleccionar una moneda",
        variant: "destructive",
      })
      return
    }

    if (selectedPayments.size === 0) {
      toast({
        title: "Error",
        description: "Debe seleccionar al menos una deuda para pagar",
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

    if (needsExchangeRate() && !exchangeRate) {
      toast({
        title: "Error",
        description: "Debe ingresar el tipo de cambio para convertir monedas",
        variant: "destructive",
      })
      return
    }

    if (!receiptNumber.trim()) {
      toast({
        title: "Error",
        description: "Debe ingresar el número de comprobante",
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
  const selectedOperator = operators.find(op => op.id === selectedOperatorId)

  // Determinar si podemos mostrar las deudas
  const canShowPayments = selectedOperatorId && selectedCurrency
  // Determinar si podemos mostrar el formulario de pago
  const canShowPaymentForm = canShowPayments && selectedPayments.size > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar Pago Masivo</DialogTitle>
          <DialogDescription>
            Seleccione el operador, la moneda y luego las deudas que desea pagar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Paso 1: Seleccionar Operador */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">
              Paso 1: Seleccionar Operador <span className="text-red-500">*</span>
            </Label>
            <Select value={selectedOperatorId} onValueChange={setSelectedOperatorId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un operador" />
              </SelectTrigger>
              <SelectContent>
                {operators.map(op => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOperatorId && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Operador seleccionado: {selectedOperator?.name}</span>
              </div>
            )}
          </div>

          {/* Paso 2: Seleccionar Moneda */}
          {selectedOperatorId && (
            <div className="space-y-2">
              <Label className="text-base font-semibold">
                Paso 2: Seleccionar Moneda <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={selectedCurrency} 
                onValueChange={(value) => setSelectedCurrency(value as "ARS" | "USD")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione la moneda de las deudas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="ARS">ARS</SelectItem>
                </SelectContent>
              </Select>
              {selectedCurrency && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Moneda seleccionada: {selectedCurrency}</span>
                </div>
              )}
            </div>
          )}

          {/* Paso 3: Mostrar Deudas */}
          {canShowPayments && (
            <div className="space-y-2">
              <Label className="text-base font-semibold">
                Paso 3: Seleccionar Deudas a Pagar
              </Label>
              
              {loadingPayments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : pendingPayments.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <div>
                        No se encontraron deudas pendientes para el operador <strong>{selectedOperator?.name}</strong> en <strong>{selectedCurrency}</strong>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Verifique que:
                        <ul className="list-disc list-inside mt-1">
                          <li>El operador tenga pagos con estado &quot;Pendiente&quot; o &quot;Vencido&quot;</li>
                          <li>Los pagos estén en la moneda seleccionada ({selectedCurrency})</li>
                          <li>Los pagos tengan deuda pendiente (no estén completamente pagados)</li>
                        </ul>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedPayments.size === pendingPayments.length && pendingPayments.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Operación</TableHead>
                        <TableHead className="text-right">Monto Total</TableHead>
                        <TableHead className="text-right">Pagado</TableHead>
                        <TableHead className="text-right">Pendiente</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead className="text-right">Monto a Pagar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingPayments.map((payment) => {
                        const paidAmount = payment.paid_amount || 0
                        const remaining = payment.amount - paidAmount
                        const isSelected = selectedPayments.has(payment.id)
                        const amountToPay = paymentAmounts[payment.id] || (isSelected ? remaining : 0)
                        const isOverdue = payment.status === "OVERDUE" || (new Date(payment.due_date) < new Date() && payment.status === "PENDING")
                        const isPartial = paidAmount > 0

                        return (
                          <TableRow key={payment.id} className={isSelected ? "bg-muted/50" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleTogglePayment(payment.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-mono text-xs font-medium">
                                  {payment.operations?.file_code || `OP-${payment.operation_id.slice(0, 8)}`}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {payment.operations?.destination || "Sin destino"}
                                </div>
                                {isPartial && (
                                  <Badge variant="secondary" className="text-xs">
                                    Parcial
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-right">
                              <div className="space-y-1">
                                <div>{formatCurrency(payment.amount, payment.currency)}</div>
                                <div className="text-xs text-muted-foreground">Total</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right">
                              <div className="space-y-1">
                                <div>{formatCurrency(paidAmount, payment.currency)}</div>
                                <div className="text-xs">Pagado</div>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-orange-600 text-right">
                              <div className="space-y-1">
                                <div>{formatCurrency(remaining, payment.currency)}</div>
                                <div className="text-xs">Pendiente</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-xs font-medium">
                                  {new Date(payment.due_date).toLocaleDateString("es-AR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric"
                                  })}
                                </div>
                                {isOverdue && (
                                  <Badge variant="destructive" className="text-xs">
                                    Vencido
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {isSelected ? (
                                <div className="space-y-1 flex flex-col items-end">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={remaining}
                                    value={amountToPay}
                                    onChange={(e) => handleAmountChange(payment.id, e.target.value)}
                                    className="w-32"
                                    placeholder="0.00"
                                  />
                                  <div className="text-xs text-muted-foreground">
                                    Máx: {formatCurrency(remaining, payment.currency)}
                                  </div>
                                </div>
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
            </div>
          )}

          {/* Paso 4: Información del Pago */}
          {canShowPaymentForm && (
            <div className="border rounded-lg p-4 space-y-4">
              <Label className="text-base font-semibold">
                Paso 4: Información del Pago
              </Label>

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
                          {account.current_balance !== undefined && (
                            <span className="text-xs text-muted-foreground ml-2">
                              - Balance: {formatCurrency(account.current_balance, account.currency)}
                            </span>
                          )}
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

                {needsExchangeRate() && (
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
                      Requerido para convertir {selectedCurrency} a {paymentCurrency}
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
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total de Deudas Seleccionadas:</span>
                  <span className="text-xl font-bold">
                    {formatCurrency(totalPaymentAmount, selectedCurrency)}
                  </span>
                </div>
                
                {/* Desglose por operación */}
                <div className="border-t pt-3 space-y-2">
                  <div className="text-sm font-semibold mb-2">Desglose por Operación:</div>
                  {Array.from(selectedPayments).map(paymentId => {
                    const payment = pendingPayments.find(p => p.id === paymentId)
                    if (!payment) return null
                    const amountToPay = paymentAmounts[paymentId] || 0
                    const paidAmount = payment.paid_amount || 0
                    const remaining = payment.amount - paidAmount
                    
                    return (
                      <div key={paymentId} className="flex justify-between items-center text-sm bg-background p-2 rounded">
                        <div className="flex-1">
                          <div className="font-medium">
                            {payment.operations?.file_code || `OP-${payment.operation_id.slice(0, 8)}`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {payment.operations?.destination || "Sin destino"}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="font-medium">
                            {formatCurrency(amountToPay, payment.currency)}
                          </div>
                          {amountToPay < remaining && (
                            <div className="text-xs text-muted-foreground">
                              (Parcial: {((amountToPay / remaining) * 100).toFixed(0)}%)
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {needsExchangeRate() && exchangeRate && (
                  <div className="flex justify-between items-center text-sm text-muted-foreground border-t pt-3">
                    <span>Total a Pagar en {paymentCurrency}:</span>
                    <span className="font-medium text-base">
                      {paymentCurrency === "USD" 
                        ? formatCurrency(totalPaymentAmount / parseFloat(exchangeRate), "USD")
                        : formatCurrency(totalPaymentAmount * parseFloat(exchangeRate), "ARS")
                      }
                    </span>
                  </div>
                )}
                <div className="text-sm text-muted-foreground border-t pt-3">
                  {selectedPayments.size} deuda(s) seleccionada(s)
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={submitting || !canShowPaymentForm}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Procesar Pago{selectedPayments.size > 0 && ` (${selectedPayments.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
