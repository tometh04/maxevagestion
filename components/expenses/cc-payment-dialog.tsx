"use client"

import { useState, useEffect, useRef } from "react"
import { useForm, useFieldArray } from "react-hook-form"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { CreditCard, Landmark, Plus, Trash2, AlertCircle, CheckCircle2, Upload, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useDefaultCurrency } from "@/hooks/use-default-currency"
// Fix UTC shift en fechas DATE (VICO 2026-05-22)
import { formatDateOnlyLocal } from "@/lib/utils/date-only"

interface Category {
  id: string
  name: string
  color: string
}

interface FinancialAccount {
  id: string
  name: string
  currency: "ARS" | "USD"
  type?: string
  current_balance?: number
  is_active?: boolean
}

interface PendingDebt {
  id: string
  operation_id: string
  operator_id: string
  operator_name: string
  currency: string
  pending_amount: number
  due_date: string | null
  file_code: string | null
  destination: string | null
  passenger_name: string | null
}

const CLASSIFICATIONS = [
  { value: "GASTOS_AGENCIA", label: "Gastos Agencia" },
  { value: "VENTAS", label: "Ventas" },
  { value: "RETIRO_PERSONAL", label: "Retiro Personal" },
] as const

const itemSchema = z
  .object({
    // "EXPENSE" = gasto clasificado (default). "OPERATOR_SETTLEMENT" = cancela
    // una deuda de operador existente (valija/servicio de pasajero).
    type: z.enum(["EXPENSE", "OPERATOR_SETTLEMENT"]),
    classification: z.enum(["GASTOS_AGENCIA", "VENTAS", "RETIRO_PERSONAL"]).optional(),
    description: z.string().optional(),
    amount: z.coerce.number().min(0.01, "Debe ser mayor a 0"),
    category_id: z.string().optional(),
    // Sólo para OPERATOR_SETTLEMENT:
    operator_payment_id: z.string().optional(),
    operation_id: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "OPERATOR_SETTLEMENT") {
      if (!val.operator_payment_id || !val.operation_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Elegí la deuda a cancelar", path: ["operator_payment_id"] })
      }
    } else {
      if (!val.classification) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requerido", path: ["classification"] })
      }
      if (!val.description) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requerido", path: ["description"] })
      }
    }
  })

const ccPaymentSchema = z.object({
  credit_card_account_id: z.string().min(1, "Seleccione una tarjeta"),
  source_account_id: z.string().min(1, "Seleccione una cuenta origen"),
  total_amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  exchange_rate: z.coerce.number().optional(),
  payment_date: z.string().min(1, "La fecha es requerida"),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "Debe agregar al menos un item"),
})

type CCPaymentFormValues = z.infer<typeof ccPaymentSchema>

interface CCPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CCPaymentDialog({ open, onOpenChange, onSuccess }: CCPaymentDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { currency: defaultCurrency } = useDefaultCurrency()
  const [categories, setCategories] = useState<Category[]>([])
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  // Deudas de operador pendientes (para items "Cancela deuda").
  const [pendingDebts, setPendingDebts] = useState<PendingDebt[]>([])
  const [debtOperators, setDebtOperators] = useState<Array<{ id: string; name: string }>>([])
  const [debtOperatorId, setDebtOperatorId] = useState<string>("") // "" = operador por defecto (Tarjeta de crédito)
  const [debtSearch, setDebtSearch] = useState("")
  const [loadingDebts, setLoadingDebts] = useState(false)
  // Carga del PDF del resumen (desglose automático).
  const [isParsing, setIsParsing] = useState(false)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const statementInputRef = useRef<HTMLInputElement>(null)

  const getDefaultDate = () => {
    const now = new Date()
    return formatDateOnlyLocal(now) ?? ""
  }

  const form = useForm<CCPaymentFormValues>({
    resolver: zodResolver(ccPaymentSchema),
    defaultValues: {
      credit_card_account_id: "",
      source_account_id: "",
      total_amount: 0,
      currency: defaultCurrency,
      exchange_rate: undefined,
      payment_date: getDefaultDate(),
      notes: "",
      items: [{ type: "EXPENSE", classification: "GASTOS_AGENCIA", description: "", amount: 0, category_id: "", operator_payment_id: "", operation_id: "" }],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  })

  const watchCurrency = form.watch("currency")
  const watchTotalAmount = form.watch("total_amount")
  const watchItems = form.watch("items")

  useEffect(() => {
    form.setValue("currency", defaultCurrency)
  }, [defaultCurrency, form])

  const itemsSum = (watchItems || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const totalNum = Number(watchTotalAmount) || 0
  const difference = Math.abs(totalNum - itemsSum)
  const isBalanced = totalNum > 0 && difference < 0.01

  useEffect(() => {
    if (open) {
      Promise.all([
        fetch("/api/expenses/categories").then((r) => r.json()),
        fetch("/api/accounting/financial-accounts?excludeAccountingOnly=true").then((r) => r.json()),
      ])
        .then(([catData, accData]) => {
          setCategories(catData.categories || [])
          setFinancialAccounts(
            (accData.accounts || []).filter((a: FinancialAccount) => a.is_active !== false)
          )
        })
        .catch(console.error)
    } else {
      form.reset()
      setCategories([])
      setFinancialAccounts([])
      setParseWarnings([])
    }
  }, [open, form])

  // Cargar deudas pendientes según moneda del resumen + operador/búsqueda.
  // La deuda debe estar en la misma moneda que el resumen (saldos independientes).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      setLoadingDebts(true)
      try {
        const params = new URLSearchParams({ currency: watchCurrency })
        if (debtOperatorId) params.set("operatorId", debtOperatorId)
        if (debtSearch.trim()) params.set("search", debtSearch.trim())
        const res = await fetch(`/api/expenses/cc-payment/pending-debts?${params}`)
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setPendingDebts(data.debts || [])
            setDebtOperators(data.operators || [])
          }
        }
      } catch (err) {
        console.error("Error fetching pending debts:", err)
      } finally {
        if (!cancelled) setLoadingDebts(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, watchCurrency, debtOperatorId, debtSearch])

  const formatDebtLabel = (d: PendingDebt) => {
    const who = d.passenger_name || d.file_code || d.destination || "Operación"
    const code = d.file_code ? ` · ${d.file_code}` : ""
    return `${who}${code} — ${new Intl.NumberFormat("es-AR", { style: "currency", currency: d.currency }).format(d.pending_amount)}`
  }

  const creditCardAccounts = financialAccounts.filter((a) => a.type === "CREDIT_CARD")
  const sourceAccounts = financialAccounts.filter(
    (a) => a.type !== "CREDIT_CARD" && a.currency === watchCurrency
  )

  const formatCurrency = (amount: number, cur: string) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
    }).format(amount)

  // Subir el PDF del resumen → el sistema lo desglosa y PRECARGA los items.
  // No crea nada: son datos candidatos que el usuario revisa y confirma.
  const handleStatementFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Permitir volver a subir el mismo archivo.
    if (statementInputRef.current) statementInputRef.current.value = ""
    if (!file) return

    if (file.type !== "application/pdf") {
      toast.error("El resumen debe ser un PDF")
      return
    }

    setIsParsing(true)
    setParseWarnings([])
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("extract_only", "true")
      const res = await fetch("/api/expenses/cc-payment/parse-statement", { method: "POST", body: fd })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data?.error || "No se pudo leer el resumen")
        return
      }
      if (!data.ocr_extracted) {
        toast.error(data.ocr_error || "No se pudo leer el resumen. Cargalo a mano.")
        return
      }

      const currencies: string[] = data.detected?.currencies || []
      const itemsByCurrency: Record<string, Array<{ description: string; amount: number }>> =
        data.items_by_currency || {}
      const totals: Record<string, number> = data.detected?.totals_by_currency || {}

      if (currencies.length === 0) {
        toast.error("No se encontraron consumos en el resumen. Cargalo a mano.")
        return
      }

      // Elegir la moneda a precargar: la seleccionada si está presente, si no la
      // de mayor total. La otra moneda se registra en un pago aparte (aviso).
      const chosen = currencies.includes(watchCurrency)
        ? watchCurrency
        : currencies.slice().sort((a, b) => (totals[b] || 0) - (totals[a] || 0))[0]

      form.setValue("currency", chosen as "ARS" | "USD")

      const rows = (itemsByCurrency[chosen] || []).map((it) => ({
        type: "EXPENSE" as const,
        classification: "GASTOS_AGENCIA" as const,
        description: it.description,
        amount: it.amount,
        category_id: "",
        operator_payment_id: "",
        operation_id: "",
      }))

      if (rows.length === 0) {
        toast.error("No se encontraron consumos para precargar.")
        return
      }

      replace(rows)
      form.setValue("total_amount", totals[chosen] ?? rows.reduce((s, r) => s + r.amount, 0))

      const warns: string[] = Array.isArray(data.warnings) ? [...data.warnings] : []
      const otherCurrencies = currencies.filter((c) => c !== chosen)
      for (const oc of otherCurrencies) {
        const count = (itemsByCurrency[oc] || []).length
        warns.push(`Hay ${count} consumo(s) en ${oc}: registralos en un pago aparte (moneda ${oc}).`)
      }
      setParseWarnings(warns)

      toast.success(`Se desglosaron ${rows.length} consumo(s) en ${chosen}. Revisalos antes de confirmar.`)
    } catch (err) {
      console.error("Error parsing statement:", err)
      toast.error("Error al procesar el resumen")
    } finally {
      setIsParsing(false)
    }
  }

  const onSubmit = async (values: CCPaymentFormValues) => {
    if (!isBalanced) {
      toast.error("La suma de los items debe ser igual al monto total")
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch("/api/expenses/cc-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credit_card_account_id: values.credit_card_account_id,
          source_account_id: values.source_account_id,
          total_amount: values.total_amount,
          currency: values.currency,
          exchange_rate: values.exchange_rate || null,
          payment_date: new Date(values.payment_date).toISOString(),
          notes: values.notes || null,
          items: values.items.map((item) =>
            item.type === "OPERATOR_SETTLEMENT"
              ? {
                  type: "OPERATOR_SETTLEMENT",
                  operator_payment_id: item.operator_payment_id,
                  operation_id: item.operation_id,
                  amount: item.amount,
                  description: item.description || null,
                }
              : {
                  type: "EXPENSE",
                  classification: item.classification,
                  description: item.description,
                  amount: item.amount,
                  category_id: item.category_id || null,
                }
          ),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Error al crear pago de tarjeta")
      }

      onSuccess()
      onOpenChange(false)
      form.reset()
    } catch (error) {
      console.error("Error creating cc payment:", error)
      toast.error(error instanceof Error ? error.message : "Error al crear pago de tarjeta")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pago de Tarjeta de Crédito</DialogTitle>
          <DialogDescription>
            Desglosar el pago del resumen en Gastos de Agencia, Ventas y Retiros Personales
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-5 space-y-5">
            {/* Payment Info */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground/70">Datos del pago</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="credit_card_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tarjeta de Crédito *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tarjeta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {creditCardAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name} ({acc.currency})
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
                  name="source_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cuenta Origen (desde donde se paga) *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar cuenta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sourceAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name}
                              {acc.current_balance !== undefined && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  — Saldo: {formatCurrency(acc.current_balance, acc.currency)}
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

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="total_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto Total *</FormLabel>
                      <FormControl>
                        <DecimalInput
                          {...field}
                          onChange={(v) => field.onChange(Number(v) || 0)}
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
                          <SelectItem value="ARS">ARS</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="payment_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Pago *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {watchCurrency === "ARS" && (
                <FormField
                  control={form.control}
                  name="exchange_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-accent-coral">
                        Tipo de Cambio (ARS por 1 USD)
                      </FormLabel>
                      <FormControl>
                        <DecimalInput
                          placeholder="Ej: 1200"
                          {...field}
                          onChange={(v) =>
                            field.onChange(v ? Number(v) : undefined)
                          }
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Opcional. Para calcular el equivalente en USD.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Items Breakdown */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5 text-success" />
                  <span className="text-xs font-medium text-foreground/70">Desglose de items</span>
                </div>
                {/* Subir el PDF del resumen → precarga el desglose (revisás y confirmás). */}
                <input
                  ref={statementInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleStatementFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full text-xs"
                  disabled={isParsing}
                  onClick={() => statementInputRef.current?.click()}
                >
                  {isParsing ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Leyendo resumen...</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5 mr-1.5" /> Subir resumen (PDF)</>
                  )}
                </Button>
              </div>

              {parseWarnings.length > 0 && (
                <div className="rounded-lg border border-accent-coral/30 bg-accent-coral/5 p-2.5 space-y-1">
                  {parseWarnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent-coral" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Controles del buscador de deudas (para items "Cancela deuda").
                  Por defecto busca en el operador "Tarjeta de crédito"; se puede
                  cambiar a otro operador por si algo quedó mal cargado. */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/30 bg-background/50 p-2">
                <span className="text-[11px] font-medium text-muted-foreground">Buscar deudas en:</span>
                <Select value={debtOperatorId || "DEFAULT"} onValueChange={(v) => setDebtOperatorId(v === "DEFAULT" ? "" : v)}>
                  <SelectTrigger className="h-7 text-xs w-[220px] rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFAULT">Tarjeta de crédito (por defecto)</SelectItem>
                    {debtOperators.map((op) => (
                      <SelectItem key={op.id} value={op.id}>
                        {op.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-7 text-xs w-[200px]"
                  placeholder="Buscar pasajero / file / destino"
                  value={debtSearch}
                  onChange={(e) => setDebtSearch(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                {fields.map((field, index) => {
                  const itemType = form.watch(`items.${index}.type`) || "EXPENSE"
                  return (
                  <div
                    key={field.id}
                    className="rounded-lg border border-border/30 p-3 space-y-3 bg-background/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Item {index + 1}
                        </span>
                        <FormField
                          control={form.control}
                          name={`items.${index}.type`}
                          render={({ field }) => (
                            <Select
                              value={field.value || "EXPENSE"}
                              onValueChange={(v) => {
                                field.onChange(v)
                                // Al cambiar de tipo, limpiar los campos del otro modo.
                                if (v === "OPERATOR_SETTLEMENT") {
                                  form.setValue(`items.${index}.classification`, undefined)
                                  form.setValue(`items.${index}.category_id`, "")
                                } else {
                                  form.setValue(`items.${index}.operator_payment_id`, "")
                                  form.setValue(`items.${index}.operation_id`, "")
                                }
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs w-[150px] rounded-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="EXPENSE">Gasto</SelectItem>
                                <SelectItem value="OPERATOR_SETTLEMENT">Cancela deuda</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                          className="h-6 w-6 p-0 text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {itemType === "OPERATOR_SETTLEMENT" ? (
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.operator_payment_id`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Deuda a cancelar *</FormLabel>
                              <Select
                                value={field.value || ""}
                                onValueChange={(debtId) => {
                                  const debt = pendingDebts.find((d) => d.id === debtId)
                                  field.onChange(debtId)
                                  if (debt) {
                                    form.setValue(`items.${index}.operation_id`, debt.operation_id)
                                    form.setValue(`items.${index}.amount`, debt.pending_amount)
                                    if (!form.getValues(`items.${index}.description`)) {
                                      const label = debt.passenger_name || debt.file_code || debt.destination || "Servicio de pasajero"
                                      form.setValue(`items.${index}.description`, label)
                                    }
                                  }
                                }}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={loadingDebts ? "Cargando deudas..." : "Seleccionar deuda pendiente"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {pendingDebts.length === 0 ? (
                                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                                      No hay deudas pendientes en {watchCurrency}
                                    </div>
                                  ) : (
                                    pendingDebts.map((d) => (
                                      <SelectItem key={d.id} value={d.id}>
                                        {formatDebtLabel(d)}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid gap-3 md:grid-cols-2">
                          <FormField
                            control={form.control}
                            name={`items.${index}.amount`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Monto a cancelar *</FormLabel>
                                <FormControl>
                                  <DecimalInput
                                    className="h-8 text-sm"
                                    {...field}
                                    onChange={(v) => field.onChange(Number(v) || 0)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.description`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Nota (opcional)</FormLabel>
                                <FormControl>
                                  <Input
                                    className="h-8 text-sm"
                                    placeholder="Ej: Valija López"
                                    {...field}
                                    value={field.value || ""}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    ) : (
                    <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.classification`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Clasificación *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Seleccionar" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {CLASSIFICATIONS.map((c) => (
                                  <SelectItem key={c.value} value={c.value}>
                                    {c.label}
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
                        name={`items.${index}.amount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Monto *</FormLabel>
                            <FormControl>
                              <DecimalInput
                                className="h-8 text-sm"
                                {...field}
                                onChange={(v) => field.onChange(Number(v) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.description`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Descripción *</FormLabel>
                            <FormControl>
                              <Input
                                className="h-8 text-sm"
                                placeholder="Ej: Publicidad Google, Valijas..."
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`items.${index}.category_id`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Categoría (opcional)</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Sin categoría" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {categories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: cat.color }}
                                      />
                                      {cat.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    </>
                    )}
                  </div>
                  )
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    type: "EXPENSE",
                    classification: "GASTOS_AGENCIA",
                    description: "",
                    amount: 0,
                    category_id: "",
                    operator_payment_id: "",
                    operation_id: "",
                  })
                }
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar item
              </Button>

              {/* Balance indicator */}
              <div
                className={`flex items-center justify-between rounded-lg p-3 text-sm ${
                  isBalanced
                    ? "bg-success/5 dark:bg-success/30 border border-success/15 dark:border-success"
                    : totalNum > 0
                      ? "bg-destructive/5 dark:bg-destructive/30 border border-destructive/15 dark:border-destructive"
                      : "bg-muted/30 border border-border/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isBalanced ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : totalNum > 0 ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : null}
                  <span>
                    Total items: <strong>{formatCurrency(itemsSum, watchCurrency)}</strong>
                  </span>
                </div>
                <span>
                  Total pago: <strong>{formatCurrency(totalNum, watchCurrency)}</strong>
                  {totalNum > 0 && !isBalanced && (
                    <span className="ml-2 text-destructive">
                      (Diferencia: {formatCurrency(difference, watchCurrency)})
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notas adicionales sobre el pago..." {...field} />
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
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading || !isBalanced}>
                {isLoading ? "Guardando..." : "Registrar Pago"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
