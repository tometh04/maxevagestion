"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatePicker } from "@/components/ui/date-picker"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

type PayRecurringExpenseFormValues = {
  financial_account_id: string
  payment_date: string
  reference?: string
  exchange_rate?: number
}

interface FinancialAccount {
  id: string
  name: string
  type: string
  currency: "ARS" | "USD"
  current_balance?: number
  is_active?: boolean
}

interface RecurringExpense {
  id: string
  description: string
  amount: number
  currency: "ARS" | "USD"
  provider_name?: string
  operators?: { name: string } | null
}

interface PayRecurringExpenseDialogProps {
  expense: RecurringExpense | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function PayRecurringExpenseDialog({
  expense,
  open,
  onOpenChange,
  onSuccess,
}: PayRecurringExpenseDialogProps) {
  const [loading, setLoading] = useState(false)
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [paymentCurrency, setPaymentCurrency] = useState<"ARS" | "USD">("USD")

  // Verificar si necesita tipo de cambio
  const needsExchangeRate = () => {
    if (!expense) return false
    return expense.currency !== paymentCurrency
  }

  const form = useForm<PayRecurringExpenseFormValues>({
    defaultValues: {
      financial_account_id: "",
      payment_date: new Date().toISOString().split("T")[0],
      reference: "",
      exchange_rate: undefined,
    },
  })

  // Cargar cuentas financieras cuando se abre el dialog
  useEffect(() => {
    if (open) {
      const fetchFinancialAccounts = async () => {
        try {
          const response = await fetch("/api/accounting/financial-accounts?excludeAccountingOnly=true")
          if (response.ok) {
            const data = await response.json()
            const accounts = (data.accounts || []).filter(
              (acc: FinancialAccount) => acc.is_active !== false
            )
            setFinancialAccounts(accounts)
          }
        } catch (error) {
          console.error("Error fetching financial accounts:", error)
        }
      }
      fetchFinancialAccounts()
    } else {
      form.reset()
      setFinancialAccounts([])
    }
  }, [open, form])

  // Actualizar moneda de pago cuando se selecciona una cuenta
  const selectedAccountId = form.watch("financial_account_id")
  
  useEffect(() => {
    if (selectedAccountId) {
      const selectedAccount = financialAccounts.find((acc) => acc.id === selectedAccountId)
      if (selectedAccount) {
        setPaymentCurrency(selectedAccount.currency)
        // Si cambia la moneda y necesita TC, resetear el campo
        const needsTC = expense && expense.currency !== selectedAccount.currency
        if (needsTC) {
          form.setValue("exchange_rate", undefined)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, financialAccounts, expense])

  const handleSubmit = async (values: PayRecurringExpenseFormValues) => {
    if (!expense) return

    // Validaciones
    if (!values.financial_account_id) {
      toast.error("Debe seleccionar una cuenta financiera")
      return
    }

    if (!values.payment_date) {
      toast.error("Debe seleccionar una fecha de pago")
      return
    }

    // Validar tipo de cambio si es necesario
    if (needsExchangeRate() && (!values.exchange_rate || values.exchange_rate <= 0)) {
      toast.error("Debe ingresar el tipo de cambio para convertir monedas")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/recurring-payments/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recurring_payment_id: expense.id,
          financial_account_id: values.financial_account_id,
          payment_date: values.payment_date,
          reference: values.reference || null,
          exchange_rate: values.exchange_rate || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al procesar el pago")
      }

      toast.success("Pago procesado exitosamente")
      form.reset()
      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      console.error("Error paying recurring expense:", error)
      toast.error(error.message || "Error al procesar el pago")
    } finally {
      setLoading(false)
    }
  }

  if (!expense) return null

  const providerName = expense.provider_name || expense.operators?.name || "Proveedor"
  const expenseAmount = expense.amount
  const expenseCurrency = expense.currency

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar Gasto Recurrente</DialogTitle>
          <DialogDescription>
            Procesar el pago de: <strong>{expense.description}</strong>
            <br />
            Proveedor: <strong>{providerName}</strong>
            <br />
            Monto: <strong>{new Intl.NumberFormat("es-AR", {
              style: "currency",
              currency: expenseCurrency === "USD" ? "USD" : "ARS",
            }).format(expenseAmount)}</strong>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="financial_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta Financiera *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cuenta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {financialAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                          {account.current_balance !== undefined && (
                            <span className="text-xs text-muted-foreground ml-2">
                              - Balance: {new Intl.NumberFormat("es-AR", {
                                style: "currency",
                                currency: account.currency === "USD" ? "USD" : "ARS",
                              }).format(account.current_balance)}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {needsExchangeRate() && (
              <FormField
                control={form.control}
                name="exchange_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Cambio *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Ej: 1200"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || "")}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Requerido para convertir {expenseCurrency} a {paymentCurrency}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {needsExchangeRate() && form.watch("exchange_rate") && (
              <div className="bg-muted p-3 rounded-lg">
                <div className="text-sm text-muted-foreground">
                  Monto a pagar en {paymentCurrency}:
                </div>
                <div className="text-lg font-bold">
                  {paymentCurrency === "USD"
                    ? new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "USD",
                      }).format(expenseAmount / (form.watch("exchange_rate") || 1))
                    : new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                      }).format(expenseAmount * (form.watch("exchange_rate") || 1))}
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="payment_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Pago *</FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Seleccionar fecha"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia / Comprobante (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Transferencia #12345, Recibo #456"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Procesar Pago
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
