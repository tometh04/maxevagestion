"use client"

import { useState, useEffect, useMemo } from "react"
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
import { Loader2, CheckCircle } from "lucide-react"
import { toast } from "sonner"

const markPaidSchema = z.object({
  datePaid: z.string().min(1, "La fecha de pago es requerida"),
  reference: z.string().optional(),
  financial_account_id: z.string().min(1, "Debe seleccionar una cuenta financiera"),
  exchange_rate: z.coerce.number().optional(),
})

type MarkPaidFormValues = z.infer<typeof markPaidSchema>

interface Payment {
  id: string
  amount: number
  currency: string
  payer_type: string
  direction: string
  method: string
  date_due: string
  operation_id?: string
}

interface FinancialAccount {
  id: string
  name: string
  type: string
  currency: "ARS" | "USD"
  current_balance?: number
  is_active?: boolean
}

interface MarkPaidDialogProps {
  payment: Payment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function MarkPaidDialog({
  payment,
  open,
  onOpenChange,
  onSuccess,
}: MarkPaidDialogProps) {
  const [loading, setLoading] = useState(false)
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [operationCurrency, setOperationCurrency] = useState<string | null>(null)
  const [loadingOperation, setLoadingOperation] = useState(false)

  const form = useForm<MarkPaidFormValues>({
    resolver: zodResolver(markPaidSchema) as any,
    defaultValues: {
      datePaid: new Date().toISOString().split("T")[0],
      reference: "",
      financial_account_id: "",
      exchange_rate: undefined,
    },
  })

  // Obtener moneda de la operación cuando se abre el dialog
  useEffect(() => {
    if (open && payment && payment.operation_id) {
      setLoadingOperation(true)
      const fetchOperation = async () => {
        try {
          const response = await fetch(`/api/operations/${payment.operation_id}`)
          if (response.ok) {
            const data = await response.json()
            const operation = data.operation
            if (operation) {
              // Para INCOME (cobranzas): usar sale_currency
              // Para EXPENSE (pagos a operadores): usar operator_cost_currency
              const currency = payment.direction === "INCOME" 
                ? (operation.sale_currency || operation.currency || "USD")
                : (operation.operator_cost_currency || operation.currency || "USD")
              setOperationCurrency(currency)
            }
          }
        } catch (error) {
          console.error("Error fetching operation:", error)
        } finally {
          setLoadingOperation(false)
        }
      }
      fetchOperation()
    } else {
      setOperationCurrency(null)
    }
  }, [open, payment])

  // Calcular si se necesita tipo de cambio
  const needsExchangeRate = useMemo(() => {
    if (!payment || !operationCurrency) return false
    return payment.currency !== operationCurrency
  }, [payment, operationCurrency])

  // Cargar cuentas financieras siempre
  useEffect(() => {
    if (open && payment) {
      const fetchFinancialAccounts = async () => {
        try {
          const response = await fetch("/api/accounting/financial-accounts")
          if (response.ok) {
            const data = await response.json()
            // Filtrar cuentas activas de la misma moneda
            const accounts = (data.accounts || []).filter(
              (acc: FinancialAccount) =>
                acc.is_active !== false &&
                acc.currency === payment.currency
            )
            setFinancialAccounts(accounts)
          }
        } catch (error) {
          console.error("Error fetching financial accounts:", error)
        }
      }
      fetchFinancialAccounts()
    } else {
      setFinancialAccounts([])
      form.setValue("financial_account_id", "")
    }
  }, [open, payment, form])

  const handleSubmit = async (values: MarkPaidFormValues) => {
    if (!payment) return

    // Validar que se haya seleccionado una cuenta financiera
    if (!values.financial_account_id) {
      toast.error("Debe seleccionar una cuenta financiera")
      return
    }

    // Validar tipo de cambio si las monedas difieren
    if (needsExchangeRate && !values.exchange_rate) {
      toast.error("Debe ingresar el tipo de cambio cuando la moneda del pago difiere de la moneda de la operación")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/payments/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: payment.id,
          datePaid: values.datePaid,
          reference: values.reference || null,
          financial_account_id: values.financial_account_id || null,
          exchange_rate: needsExchangeRate ? values.exchange_rate : null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al marcar como pagado")
      }

      toast.success("Pago marcado como pagado")
      form.reset()
      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      console.error("Error marking payment as paid:", error)
      toast.error(error.message || "Error al marcar como pagado")
    } finally {
      setLoading(false)
    }
  }

  if (!payment) return null

  const isIncome = payment.direction === "INCOME"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Marcar como Pagado
          </DialogTitle>
          <DialogDescription>
            {isIncome 
              ? "Registrar el pago recibido del cliente"
              : "Registrar el pago realizado al operador"
            }
          </DialogDescription>
        </DialogHeader>

        {/* Resumen del pago */}
        <div className="rounded-lg border p-4 bg-muted/50">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">Tipo:</div>
            <div className="font-medium">
              {payment.payer_type === "CUSTOMER" ? "Cliente" : "Operador"}
            </div>
            <div className="text-muted-foreground">Dirección:</div>
            <div className="font-medium">
              {isIncome ? "Ingreso" : "Egreso"}
            </div>
            <div className="text-muted-foreground">Monto:</div>
            <div className="font-medium">
              {payment.currency} {payment.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              {operationCurrency && operationCurrency !== payment.currency && (
                <span className="text-xs text-muted-foreground ml-2">
                  (Operación en {operationCurrency})
                </span>
              )}
            </div>
            <div className="text-muted-foreground">Método:</div>
            <div className="font-medium">{payment.method}</div>
            <div className="text-muted-foreground">Vencimiento:</div>
            <div className="font-medium">
              {new Date(payment.date_due).toLocaleDateString("es-AR")}
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="datePaid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Pago</FormLabel>
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

            {/* Mostrar campo de tipo de cambio si las monedas difieren */}
            {needsExchangeRate && (
              <FormField
                control={form.control}
                name="exchange_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Cambio (ARS por 1 USD) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ej: 1500"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e)
                          // Calcular equivalente en moneda de operación
                        }}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {field.value && payment && payment.amount 
                        ? `Equivale a ${operationCurrency} ${(payment.amount / Number(field.value)).toFixed(2)}`
                        : `La operación está en ${operationCurrency}, el pago en ${payment.currency}. Ingrese el tipo de cambio.`
                      }
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Mostrar selector de cuenta financiera siempre */}
            <FormField
              control={form.control}
              name="financial_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta Financiera *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
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
                              - Balance: {account.current_balance.toLocaleString("es-AR", {
                                style: "currency",
                                currency: account.currency,
                              })}
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

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirmar Pago
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

