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
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { DollarSign, CalendarIcon, FileText, Loader2, Wallet, CheckCircle } from "lucide-react"
import { toast } from "sonner"

interface Operation {
  id: string
  file_code: string | null
  destination: string
  sale_currency?: string
  operator_cost_currency?: string
}

interface FinancialAccount {
  id: string
  name: string
  type: string
  currency: "ARS" | "USD"
  current_balance?: number
  is_active?: boolean
}

const paymentSchema = z.object({
  operation_id: z.string().min(1, "Debe seleccionar una operación"),
  payer_type: z.enum(["CUSTOMER", "OPERATOR"]),
  direction: z.enum(["INCOME", "EXPENSE"]),
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  method: z.string().min(1, "Debe seleccionar un método"),
  date_due: z.string().min(1, "La fecha de vencimiento es requerida"),
  notes: z.string().optional(),
  // Campos para marcar como pagado
  mark_as_paid: z.boolean().default(false),
  financial_account_id: z.string().optional(),
  date_paid: z.string().optional(),
  reference: z.string().optional(),
})

type PaymentFormValues = z.infer<typeof paymentSchema>

const methodOptions = [
  "Transferencia",
  "Efectivo",
  "Tarjeta Crédito",
  "Tarjeta Débito",
  "MercadoPago",
  "PayPal",
  "Otro",
]

interface NewPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function NewPaymentDialog({ open, onOpenChange, onSuccess }: NewPaymentDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [operations, setOperations] = useState<Operation[]>([])
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [loadingOps, setLoadingOps] = useState(false)
  const [searchOp, setSearchOp] = useState("")

  const today = new Date().toISOString().split("T")[0]

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: {
      operation_id: "",
      payer_type: "OPERATOR",
      direction: "EXPENSE",
      amount: 0,
      currency: "USD",
      method: "Transferencia",
      date_due: today,
      notes: "",
      mark_as_paid: false,
      financial_account_id: "",
      date_paid: today,
      reference: "",
    },
  })

  const watchDirection = form.watch("direction")
  const watchOperationId = form.watch("operation_id")
  const watchCurrency = form.watch("currency")
  const watchMarkAsPaid = form.watch("mark_as_paid")

  // Actualizar payer_type automáticamente según dirección
  useEffect(() => {
    if (watchDirection === "EXPENSE") {
      form.setValue("payer_type", "OPERATOR")
    } else {
      form.setValue("payer_type", "CUSTOMER")
    }
  }, [watchDirection, form])

  // Cargar operaciones
  useEffect(() => {
    if (!open) {
      form.reset()
      setOperations([])
      setFinancialAccounts([])
      setSearchOp("")
      return
    }
    async function fetchOperations() {
      setLoadingOps(true)
      try {
        const response = await fetch("/api/operations?limit=500&sortBy=created_at&sortDirection=desc")
        if (response.ok) {
          const data = await response.json()
          setOperations(data.operations || [])
        }
      } catch (error) {
        console.error("Error fetching operations:", error)
        toast.error("Error al cargar operaciones")
      } finally {
        setLoadingOps(false)
      }
    }
    fetchOperations()
  }, [open, form])

  // Cargar cuentas financieras (filtradas por moneda)
  useEffect(() => {
    if (!open) return
    async function fetchAccounts() {
      try {
        const response = await fetch("/api/accounting/financial-accounts?excludeAccountingOnly=true")
        if (response.ok) {
          const data = await response.json()
          setFinancialAccounts(
            (data.accounts || []).filter(
              (acc: FinancialAccount) => acc.is_active !== false
            )
          )
        }
      } catch (error) {
        console.error("Error fetching financial accounts:", error)
        toast.error("Error al cargar cuentas financieras")
      }
    }
    fetchAccounts()
  }, [open])

  // Filtrar cuentas por moneda seleccionada
  const filteredAccounts = useMemo(() => {
    return financialAccounts.filter((acc) => acc.currency === watchCurrency)
  }, [financialAccounts, watchCurrency])

  // Filtrar operaciones por búsqueda
  const filteredOperations = useMemo(() => {
    if (!searchOp.trim()) return operations.slice(0, 50)
    const s = searchOp.toLowerCase()
    return operations.filter(
      (op) =>
        (op.file_code || "").toLowerCase().includes(s) ||
        op.destination.toLowerCase().includes(s)
    ).slice(0, 50)
  }, [operations, searchOp])

  // Cuando se selecciona operación, auto-setear la moneda
  useEffect(() => {
    if (!watchOperationId) return
    const op = operations.find((o) => o.id === watchOperationId)
    if (!op) return
    const dir = form.getValues("direction")
    if (dir === "EXPENSE" && op.operator_cost_currency) {
      form.setValue("currency", op.operator_cost_currency as "ARS" | "USD")
    } else if (dir === "INCOME" && op.sale_currency) {
      form.setValue("currency", op.sale_currency as "ARS" | "USD")
    }
  }, [watchOperationId, operations, form])

  // Limpiar cuenta financiera si cambia la moneda
  useEffect(() => {
    form.setValue("financial_account_id", "")
  }, [watchCurrency, form])

  const onSubmit = async (values: PaymentFormValues) => {
    // Validar cuenta financiera si se marca como pagado
    if (values.mark_as_paid && !values.financial_account_id) {
      toast.error("Debe seleccionar una cuenta financiera para marcar como pagado")
      return
    }

    setIsLoading(true)
    try {
      // 1. Crear el pago
      const createResponse = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: values.operation_id,
          payer_type: values.payer_type,
          direction: values.direction,
          amount: values.amount,
          currency: values.currency,
          method: values.method,
          date_due: new Date(values.date_due).toISOString(),
          status: "PENDING",
          notes: values.notes || null,
        }),
      })

      if (!createResponse.ok) {
        const error = await createResponse.json()
        throw new Error(error.error || "Error al crear pago")
      }

      const createData = await createResponse.json()

      // 2. Si se marcó como pagado, llamar a mark-paid
      if (values.mark_as_paid && createData.payment?.id) {
        const markPaidResponse = await fetch("/api/payments/mark-paid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: createData.payment.id,
            datePaid: values.date_paid || today,
            reference: values.reference || null,
            financial_account_id: values.financial_account_id,
          }),
        })

        if (!markPaidResponse.ok) {
          const error = await markPaidResponse.json()
          toast.warning("Pago creado pero no se pudo marcar como pagado: " + (error.error || ""))
        } else {
          toast.success("Pago creado y marcado como pagado")
        }
      } else {
        toast.success("Pago pendiente creado correctamente")
      }

      onSuccess()
      onOpenChange(false)
      form.reset()
    } catch (error) {
      console.error("Error creating payment:", error)
      toast.error(error instanceof Error ? error.message : "Error al crear pago")
    } finally {
      setIsLoading(false)
    }
  }

  const selectedOp = operations.find((o) => o.id === watchOperationId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Pago</DialogTitle>
          <DialogDescription>Crear un pago para una operación</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Detalle */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground/70">Detalle</span>
              </div>

              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="EXPENSE">Egreso (pago a operador)</SelectItem>
                        <SelectItem value="INCOME">Ingreso (cobro a cliente)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="operation_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Operación *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingOps ? "Cargando..." : "Seleccionar operación"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <div className="px-2 pb-2">
                          <Input
                            placeholder="Buscar por código o destino..."
                            value={searchOp}
                            onChange={(e) => setSearchOp(e.target.value)}
                            className="h-8 text-xs"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        {filteredOperations.map((op) => (
                          <SelectItem key={op.id} value={op.id}>
                            <span className="font-mono text-xs">{op.file_code || op.id.slice(0, 8)}</span>
                            {" · "}
                            {op.destination}
                          </SelectItem>
                        ))}
                        {filteredOperations.length === 0 && (
                          <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                            No se encontraron operaciones
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedOp && (
                <div className="text-xs text-muted-foreground bg-background rounded-lg p-2">
                  Operación: <span className="font-mono">{selectedOp.file_code || selectedOp.id.slice(0, 8)}</span> · {selectedOp.destination}
                </div>
              )}

              <FormField
                control={form.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de pago *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {methodOptions.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Monto */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-foreground/70">Monto</span>
              </div>
              <div className="grid gap-4 grid-cols-2">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moneda *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="ARS">ARS</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Fecha de vencimiento */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-medium text-foreground/70">Vencimiento</span>
              </div>

              <FormField
                control={form.control}
                name="date_due"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de vencimiento *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Referencia, comprobante, etc."
                        className="resize-none"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Marcar como pagado */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <FormField
                control={form.control}
                name="mark_as_paid"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      <FormLabel className="!mt-0 cursor-pointer">Marcar como pagado ahora</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              {watchMarkAsPaid && (
                <div className="space-y-4 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-medium text-foreground/70">Cuenta y pago</span>
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
                            {filteredAccounts.length === 0 && (
                              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                                No hay cuentas en {watchCurrency}
                              </div>
                            )}
                            {filteredAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name}
                                {account.current_balance !== undefined && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    · {account.currency} {account.current_balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
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

                  <FormField
                    control={form.control}
                    name="date_paid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha de pago</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
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
                            placeholder="Ej: Transferencia #12345"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {watchMarkAsPaid ? "Crear y Pagar" : "Crear Pago Pendiente"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
