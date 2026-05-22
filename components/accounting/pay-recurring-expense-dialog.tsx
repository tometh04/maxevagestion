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
import { DecimalInput } from "@/components/ui/decimal-input"
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
import { Label } from "@/components/ui/label"
import { Loader2, Upload, X, FileText } from "lucide-react"
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

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
      setReceiptFile(null)
    }
  }, [open, form])

  // Actualizar moneda de pago cuando se selecciona una cuenta
  const selectedAccountId = form.watch("financial_account_id")
  const expenseCurrency = expense?.currency
  
  useEffect(() => {
    if (selectedAccountId) {
      const selectedAccount = financialAccounts.find((acc) => acc.id === selectedAccountId)
      if (selectedAccount) {
        setPaymentCurrency(selectedAccount.currency)
        // Si cambia la moneda y necesita TC, resetear el campo
        const needsTC = expenseCurrency && expenseCurrency !== selectedAccount.currency
        if (needsTC) {
          form.setValue("exchange_rate", undefined)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, financialAccounts, expenseCurrency])

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

      // Upload receipt if provided
      if (receiptFile) {
        try {
          const formData = new FormData()
          formData.append("file", receiptFile)
          formData.append("recurring_payment_id", expense.id)

          const receiptRes = await fetch("/api/expenses/receipts", {
            method: "POST",
            body: formData,
          })

          if (!receiptRes.ok) {
            console.error("Error uploading receipt, but payment was processed")
            toast.warning("Pago procesado pero no se pudo subir el comprobante")
          }
        } catch (receiptError) {
          console.error("Error uploading receipt:", receiptError)
          toast.warning("Pago procesado pero no se pudo subir el comprobante")
        }
      }

      toast.success("Pago procesado exitosamente")
      form.reset()
      setReceiptFile(null)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
          <form onSubmit={form.handleSubmit(handleSubmit)} className="px-6 py-5 space-y-5">
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
                      <DecimalInput
                        placeholder="Ej: 1200"
                        {...field}
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
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
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

            {/* Receipt upload */}
            <div className="space-y-2">
              <Label>Comprobante (Opcional)</Label>
              {receiptFile ? (
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate flex-1">{receiptFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setReceiptFile(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="receipt-upload-recurring"
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors w-fit"
                  >
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Adjuntar comprobante</span>
                  </label>
                  <input
                    id="receipt-upload-recurring"
                    type="file"
                    className="hidden"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        if (file.size > 10 * 1024 * 1024) {
                          toast.error("El archivo no puede superar 10MB")
                          return
                        }
                        setReceiptFile(file)
                      }
                      e.target.value = ""
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG, WebP o PDF. Max 10MB.
                  </p>
                </div>
              )}
            </div>

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
