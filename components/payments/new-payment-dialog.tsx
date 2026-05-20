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
import { DecimalInput } from "@/components/ui/decimal-input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { DollarSign, CalendarIcon, FileText, Loader2, Wallet, CheckCircle, Receipt, Plus, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import {
  buildOpenOperationBasePayableOperators,
  type OperationOperatorPaymentLike,
  type OperationServicePaymentRelationLike,
} from "@/lib/operations/payment-operators"

interface Operation {
  id: string
  file_code: string | null
  destination: string
  sale_currency?: string
  operator_cost_currency?: string
  operators?: { id?: string | null; name?: string | null } | null
  operation_operators?: Array<{ operator_id?: string | null; operators?: { id?: string | null; name?: string | null } | null }>
  operation_services?: OperationServicePaymentRelationLike[]
  operator_payments?: OperationOperatorPaymentLike[]
}

interface FinancialAccount {
  id: string
  name: string
  type: string
  currency: "ARS" | "USD"
  current_balance?: number
  is_active?: boolean
}

interface OperationOperator {
  id: string
  name: string
}

const NO_BASE_OPERATOR_DEBT_MESSAGE =
  "No hay deudas pendientes de la operación base. Si necesitás pagar un servicio, hacelo desde la pestaña Servicios de la operación."

const paymentSchema = z.object({
  operation_id: z.string().min(1, "Debe seleccionar una operación"),
  payer_type: z.enum(["CUSTOMER", "OPERATOR"]),
  direction: z.enum(["INCOME", "EXPENSE"]),
  operator_id: z.string().optional(),
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

function isInternationalDestination(destination?: string | null): boolean {
  if (!destination) return false
  const normalized = destination.trim().toLowerCase()
  const domesticKeywords = ["argentina", "nacional", "cabotaje", "domestic"]
  return !domesticKeywords.some((kw) => normalized.includes(kw))
}

export function NewPaymentDialog({ open, onOpenChange, onSuccess }: NewPaymentDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [operations, setOperations] = useState<Operation[]>([])
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [operationOperators, setOperationOperators] = useState<OperationOperator[]>([])
  const [loadingOps, setLoadingOps] = useState(false)
  const [searchOp, setSearchOp] = useState("")
  const [applyRg5617, setApplyRg5617] = useState(false)
  const [applyRg3819, setApplyRg3819] = useState(false)
  // Alerta de pago duplicado (item 9 backlog Santi). Se llena cuando POST /api/payments
  // retorna 409 con code DUPLICATE_PAYMENT. El user puede cancelar o forzar la creación.
  const [duplicateAlert, setDuplicateAlert] = useState<{
    duplicates: Array<{ id: string; amount: number; currency: string; date_paid: string | null; date_due: string | null; created_at: string; reference: string | null; status: string }>
    pendingValues: PaymentFormValues
  } | null>(null)

  const today = new Date().toISOString().split("T")[0]

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: {
      operation_id: "",
      payer_type: "OPERATOR",
      direction: "EXPENSE",
      operator_id: "",
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
  const watchMethod = form.watch("method")
  const watchAmount = form.watch("amount")

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
      setOperationOperators([])
      setSearchOp("")
      setApplyRg5617(false)
      setApplyRg3819(false)
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

  useEffect(() => {
    if (!open || !watchOperationId || watchDirection !== "EXPENSE") {
      setOperationOperators([])
      form.setValue("operator_id", "")
      return
    }

    let cancelled = false

    async function fetchOperationOperators() {
      try {
        const response = await fetch(`/api/operations/${watchOperationId}`)
        if (!response.ok) {
          throw new Error("Error al cargar operadores de la operación")
        }

        const data = await response.json()
        const operation = data.operation as Operation

        const operators = buildOpenOperationBasePayableOperators({
          operatorPayments: operation?.operator_payments || [],
          operationServices: operation?.operation_services || [],
        })

        if (cancelled) return

        setOperationOperators(operators)

        const currentOperatorId = form.getValues("operator_id")
        if (operators.length === 1) {
          form.setValue("operator_id", operators[0].id, { shouldValidate: true })
        } else if (!operators.some((operator) => operator.id === currentOperatorId)) {
          form.setValue("operator_id", "", { shouldValidate: true })
        }
      } catch (error) {
        console.error("Error fetching operation operators:", error)
        if (!cancelled) {
          setOperationOperators([])
          form.setValue("operator_id", "")
        }
      }
    }

    fetchOperationOperators()

    return () => {
      cancelled = true
    }
  }, [form, open, watchDirection, watchOperationId])

  const submitPayment = async (values: PaymentFormValues, opts: { force?: boolean } = {}) => {
    setIsLoading(true)
    try {
      // 1. Crear el pago. Si force=true, salteamos la detección de duplicados del backend.
      const createResponse = await fetch(`/api/payments${opts.force ? "?force=true" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation_id: values.operation_id,
          payer_type: values.payer_type,
          direction: values.direction,
          operator_id: values.payer_type === "OPERATOR" ? values.operator_id || null : null,
          amount: values.amount,
          currency: values.currency,
          method: values.method,
          date_due: new Date(values.date_due).toISOString(),
          status: "PENDING",
          notes: values.notes || null,
        }),
      })

      if (!createResponse.ok) {
        const error = await createResponse.json().catch(() => ({}))
        // 409 con code DUPLICATE_PAYMENT → mostrar alerta y dejar que el user decida.
        if (createResponse.status === 409 && error?.code === "DUPLICATE_PAYMENT" && Array.isArray(error.duplicates)) {
          setDuplicateAlert({ duplicates: error.duplicates, pendingValues: values })
          return
        }
        throw new Error(error.error || "Error al crear pago")
      }

      const createData = await createResponse.json()

      // Si el pago requiere aprobación, NO llamar a mark-paid: el ledger/cash
      // se crea recién cuando un admin aprueba el pago. Avisamos y cerramos.
      if (createData.requires_approval) {
        toast.success("Pago creado. Queda pendiente de aprobación antes de impactar caja.")
        onSuccess()
        onOpenChange(false)
        form.reset()
        return
      }

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
            apply_rg5617: showRg5617 ? applyRg5617 : false,
            apply_rg3819: showRg3819 ? applyRg3819 : false,
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

  const onSubmit = async (values: PaymentFormValues) => {
    if (values.payer_type === "OPERATOR" && operationOperators.length === 0) {
      toast.error(NO_BASE_OPERATOR_DEBT_MESSAGE)
      return
    }

    if (values.payer_type === "OPERATOR" && !values.operator_id) {
      toast.error("Debe seleccionar el operador al que corresponde el pago")
      return
    }

    // Validar cuenta financiera si se marca como pagado
    if (values.mark_as_paid && !values.financial_account_id) {
      toast.error("Debe seleccionar una cuenta financiera para marcar como pagado")
      return
    }

    await submitPayment(values, { force: false })
  }

  const handleConfirmDuplicate = async () => {
    if (!duplicateAlert) return
    const values = duplicateAlert.pendingValues
    setDuplicateAlert(null)
    setIsLoading(true)
    await submitPayment(values, { force: true })
  }

  const selectedOp = operations.find((o) => o.id === watchOperationId)

  // Perception conditions
  const showRg5617 = watchDirection === "INCOME" && watchMarkAsPaid && selectedOp && isInternationalDestination(selectedOp.destination)
  const showRg3819 = showRg5617 && watchMethod?.toLowerCase() === "efectivo"

  // Reset perception checkboxes when conditions change
  useEffect(() => {
    if (!showRg5617) setApplyRg5617(false)
    if (!showRg3819) setApplyRg3819(false)
  }, [showRg5617, showRg3819])

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Bug fix 2026-05-18 (Andres VICO): el dialog tenía max-h-[95vh]
          pero sin overflow-y-auto adentro → el contenido se desbordaba sin
          scroll y forzaba a los usuarios a hacer zoom out del navegador.
          Solución: flex flex-col en DialogContent + wrapper interno con
          flex-1 overflow-y-auto, así el footer queda fijo al pie y el
          contenido scrollea entre header y footer. */}
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nuevo Pago</DialogTitle>
          <DialogDescription>Crear un pago para una operación</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto space-y-5 -mr-2 pr-2">
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

              {watchDirection === "EXPENSE" && (
                <FormField
                  control={form.control}
                  name="operator_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Operador *</FormLabel>
                      {operationOperators.length === 0 ? (
                        <div className="text-xs text-muted-foreground bg-background rounded-lg p-2">
                          {NO_BASE_OPERATOR_DEBT_MESSAGE}
                        </div>
                      ) : operationOperators.length === 1 ? (
                        <Select value={operationOperators[0].id} disabled>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={operationOperators[0].id}>{operationOperators[0].name}</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar operador" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {operationOperators.map((operator) => (
                              <SelectItem key={operator.id} value={operator.id}>
                                {operator.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                <DollarSign className="h-3.5 w-3.5 text-success" />
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
                        <DecimalInput placeholder="0.00" {...field} />
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
                <CalendarIcon className="h-3.5 w-3.5 text-primary" />
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
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                      <FormLabel className="!mt-0 cursor-pointer">Marcar como pagado ahora</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              {watchMarkAsPaid && (
                <div className="space-y-4 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-success" />
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
                        {filteredAccounts.length === 0 && (
                          <a
                            href={`/accounting/financial-accounts?new=1&currency=${watchCurrency || 'USD'}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
                          >
                            <Plus className="h-3 w-3" />
                            Crear cuenta financiera
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </a>
                        )}
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

                  {/* Percepciones opcionales */}
                  {(showRg5617 || showRg3819) && (
                    <div className="rounded-lg border border-accent-coral/30 bg-accent-coral/5 p-3 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5 text-accent-coral" />
                        <span className="text-xs font-medium text-foreground/70">Percepciones Impositivas</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Destino: <span className="font-medium text-foreground">{selectedOp?.destination}</span> (internacional)
                      </p>
                      {showRg5617 && (
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id="new-rg5617"
                            checked={applyRg5617}
                            onCheckedChange={(checked) => setApplyRg5617(checked === true)}
                          />
                          <label htmlFor="new-rg5617" className="text-sm leading-tight cursor-pointer">
                            <span className="font-medium">RG 5617 — 30%</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">
                              Percepción Ganancias/Bienes Personales.
                              {watchAmount > 0 && (
                                <span className="font-medium text-foreground ml-1">
                                  ({watchCurrency} {(watchAmount * 0.3).toLocaleString("es-AR", { minimumFractionDigits: 2 })})
                                </span>
                              )}
                            </span>
                          </label>
                        </div>
                      )}
                      {showRg3819 && (
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id="new-rg3819"
                            checked={applyRg3819}
                            onCheckedChange={(checked) => setApplyRg3819(checked === true)}
                          />
                          <label htmlFor="new-rg3819" className="text-sm leading-tight cursor-pointer">
                            <span className="font-medium">RG 3819 — 5%</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">
                              Percepción adicional por pago en efectivo.
                              {watchAmount > 0 && (
                                <span className="font-medium text-foreground ml-1">
                                  ({watchCurrency} {(watchAmount * 0.05).toLocaleString("es-AR", { minimumFractionDigits: 2 })})
                                </span>
                              )}
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>{/* fin wrapper scrollable */}

            <DialogFooter className="pt-4 border-t border-border/40 mt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading || (watchDirection === "EXPENSE" && Boolean(watchOperationId) && operationOperators.length === 0)}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {watchMarkAsPaid ? "Crear y Pagar" : "Crear Pago Pendiente"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* Alerta de pago duplicado — el user puede confirmar y avanzar igual */}
    <AlertDialog open={duplicateAlert !== null} onOpenChange={(open) => !open && setDuplicateAlert(null)}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Posible pago duplicado</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Encontramos {duplicateAlert?.duplicates.length || 0} pago{(duplicateAlert?.duplicates.length || 0) === 1 ? "" : "s"} similar{(duplicateAlert?.duplicates.length || 0) === 1 ? "" : "es"} en los últimos 7 días con el mismo monto y moneda. Revisalos antes de continuar:
              </p>
              <div className="rounded-md border border-border/40 bg-muted/30 p-3 space-y-2 max-h-48 overflow-y-auto">
                {duplicateAlert?.duplicates.map((d) => (
                  <div key={d.id} className="text-xs space-y-0.5">
                    <div className="font-medium text-foreground">
                      {d.currency} {d.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })} · {d.status}
                    </div>
                    <div className="text-muted-foreground">
                      Creado {new Date(d.created_at).toLocaleString("es-AR")}
                      {d.date_paid && ` · Pagado ${new Date(d.date_paid).toLocaleDateString("es-AR")}`}
                      {d.reference && ` · Ref: ${d.reference}`}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                Si ya verificaste que este pago no es duplicado, podés crearlo igual.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDuplicate} disabled={isLoading}>
            {isLoading ? "Creando..." : "Crear igual"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
