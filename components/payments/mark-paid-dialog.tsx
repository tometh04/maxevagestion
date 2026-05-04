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
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, CheckCircle, Wallet, Calendar, Receipt } from "lucide-react"
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

function isInternationalDestination(destination?: string | null): boolean {
  if (!destination) return false
  const normalized = destination.trim().toLowerCase()
  const domesticKeywords = ["argentina", "nacional", "cabotaje", "domestic"]
  return !domesticKeywords.some((kw) => normalized.includes(kw))
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
  const [operationDestination, setOperationDestination] = useState<string | null>(null)
  const [applyRg5617, setApplyRg5617] = useState(false)
  const [applyRg3819, setApplyRg3819] = useState(false)

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
              setOperationDestination(operation.destination || null)
            }
          }
        } catch (error) {
          console.error("Error fetching operation:", error)
          toast.error("Error al cargar los datos de la operación")
        } finally {
          setLoadingOperation(false)
        }
      }
      fetchOperation()
    } else {
      setOperationCurrency(null)
      setOperationDestination(null)
    }
    // Reset perception checkboxes when dialog opens/closes
    setApplyRg5617(false)
    setApplyRg3819(false)
  }, [open, payment])

  // Calcular si se necesita tipo de cambio
  const needsExchangeRate = useMemo(() => {
    if (!payment || !operationCurrency) return false
    return payment.currency !== operationCurrency
  }, [payment, operationCurrency])

  // Determinar si aplican percepciones (para mostrar checkboxes)
  const isIncome = payment?.direction === "INCOME"
  const isInternational = isInternationalDestination(operationDestination)
  const isCash = payment?.method?.toLowerCase() === "efectivo"
  const showRg5617 = isIncome && isInternational
  const showRg3819 = isIncome && isInternational && isCash

  // Cargar cuentas financieras siempre
  useEffect(() => {
    if (open && payment) {
      const fetchFinancialAccounts = async () => {
        try {
          const response = await fetch("/api/accounting/financial-accounts?excludeAccountingOnly=true")
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
          toast.error("Error al cargar cuentas financieras")
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
          apply_rg5617: showRg5617 ? applyRg5617 : false,
          apply_rg3819: showRg3819 ? applyRg3819 : false,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        // Si el pago ya fue procesado (409 Conflict), mostrar warning y cerrar
        if (response.status === 409 || errorData.already_paid) {
          toast.warning("Este pago ya fue marcado como pagado anteriormente")
          form.reset()
          onOpenChange(false)
          onSuccess() // Refrescar para mostrar estado actualizado
          return
        }
        throw new Error(errorData.error || "Error al marcar como pagado")
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            Marcar como Pagado
          </DialogTitle>
          <DialogDescription>
            {isIncome
              ? "Registrar el pago recibido del cliente"
              : "Registrar el pago realizado al operador"
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col overflow-hidden flex-1">
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
            {/* Resumen del pago */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
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

            {/* Detalles del Pago */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Detalles del Pago</h4>
              </div>
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
            </div>

            {/* Percepciones opcionales */}
            {(showRg5617 || showRg3819) && (
              <div className="rounded-xl border border-border/40 bg-accent-coral/5 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-coral/10">
                    <Receipt className="h-3.5 w-3.5 text-accent-coral" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Percepciones Impositivas</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  Destino: <span className="font-medium text-foreground">{operationDestination}</span> (internacional)
                </p>
                {showRg5617 && (
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="rg5617"
                      checked={applyRg5617}
                      onCheckedChange={(checked) => setApplyRg5617(checked === true)}
                    />
                    <label htmlFor="rg5617" className="text-sm leading-tight cursor-pointer">
                      <span className="font-medium">RG 5617 — 30%</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        Percepción Ganancias/Bienes Personales sobre operaciones internacionales.
                        {payment && (
                          <span className="font-medium text-foreground ml-1">
                            ({payment.currency} {(payment.amount * 0.3).toLocaleString("es-AR", { minimumFractionDigits: 2 })})
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                )}
                {showRg3819 && (
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="rg3819"
                      checked={applyRg3819}
                      onCheckedChange={(checked) => setApplyRg3819(checked === true)}
                    />
                    <label htmlFor="rg3819" className="text-sm leading-tight cursor-pointer">
                      <span className="font-medium">RG 3819 — 5%</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        Percepción adicional por pago en efectivo de turismo internacional.
                        {payment && (
                          <span className="font-medium text-foreground ml-1">
                            ({payment.currency} {(payment.amount * 0.05).toLocaleString("es-AR", { minimumFractionDigits: 2 })})
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Cuenta Financiera */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                  <Wallet className="h-3.5 w-3.5 text-success" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Cuenta</h4>
              </div>
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
            </div>

            </div>
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

