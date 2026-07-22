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
import { CreditCard, Landmark, Plus, Trash2, AlertCircle, Upload, Loader2 } from "lucide-react"
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

const CURRENCIES: Array<"ARS" | "USD"> = ["ARS", "USD"]

const itemSchema = z
  .object({
    // "EXPENSE" = gasto clasificado (default). "OPERATOR_SETTLEMENT" = cancela
    // una deuda de operador existente (valija/servicio de pasajero).
    type: z.enum(["EXPENSE", "OPERATOR_SETTLEMENT"]),
    currency: z.enum(["ARS", "USD"]),
    classification: z.enum(["GASTOS_AGENCIA", "VENTAS", "RETIRO_PERSONAL"]).optional(),
    description: z.string().optional(),
    amount: z.coerce.number().min(0.01, "Debe ser mayor a 0"),
    category_id: z.string().optional(),
    agency_id: z.string().optional(),
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
  payment_date: z.string().min(1, "La fecha es requerida"),
  notes: z.string().optional(),
  // Cuenta origen por moneda (se valida al enviar según las monedas usadas).
  source_account_ars: z.string().optional(),
  source_account_usd: z.string().optional(),
  exchange_rate_usd: z.coerce.number().optional(),
  items: z.array(itemSchema).min(1, "Debe agregar al menos un item"),
})

type CCPaymentFormValues = z.infer<typeof ccPaymentSchema>

interface CCPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencies?: Array<{ id: string; name: string }>
}

export function CCPaymentDialog({ open, onOpenChange, onSuccess, agencies = [] }: CCPaymentDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { currency: defaultCurrency } = useDefaultCurrency()
  const [categories, setCategories] = useState<Category[]>([])
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  // Deudas de operador pendientes (para items "Cancela deuda").
  const [pendingDebts, setPendingDebts] = useState<PendingDebt[]>([])
  const [debtOperators, setDebtOperators] = useState<Array<{ id: string; name: string }>>([])
  const [debtOperatorId, setDebtOperatorId] = useState<string>("")
  const [debtSearch, setDebtSearch] = useState("")
  const [loadingDebts, setLoadingDebts] = useState(false)
  // Carga del PDF del resumen (desglose automático).
  const [isParsing, setIsParsing] = useState(false)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const statementInputRef = useRef<HTMLInputElement>(null)

  const getDefaultDate = () => formatDateOnlyLocal(new Date()) ?? ""

  const emptyItem = (currency: "ARS" | "USD" = "ARS") => ({
    type: "EXPENSE" as const,
    currency,
    classification: "GASTOS_AGENCIA" as const,
    description: "",
    amount: 0,
    category_id: "",
    agency_id: "",
    operator_payment_id: "",
    operation_id: "",
  })

  const form = useForm<CCPaymentFormValues>({
    resolver: zodResolver(ccPaymentSchema),
    defaultValues: {
      credit_card_account_id: "",
      payment_date: getDefaultDate(),
      notes: "",
      source_account_ars: "",
      source_account_usd: "",
      exchange_rate_usd: undefined,
      items: [emptyItem(defaultCurrency)],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  })

  const watchItems = form.watch("items")

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

  // Cargar deudas pendientes (ambas monedas; el picker de cada item filtra por
  // la moneda del item). Reacciona a operador/búsqueda.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      setLoadingDebts(true)
      try {
        const params = new URLSearchParams()
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
  }, [open, debtOperatorId, debtSearch])

  const formatCurrency = (amount: number, cur: string) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(amount)

  const formatDebtLabel = (d: PendingDebt) => {
    const who = d.passenger_name || d.file_code || d.destination || "Operación"
    const code = d.file_code ? ` · ${d.file_code}` : ""
    return `${who}${code} — ${formatCurrency(d.pending_amount, d.currency)}`
  }

  const creditCardAccounts = financialAccounts.filter((a) => a.type === "CREDIT_CARD")
  const accountsForCurrency = (cur: "ARS" | "USD") =>
    financialAccounts.filter((a) => a.type !== "CREDIT_CARD" && a.currency === cur)

  // Monedas efectivamente usadas por los items, y total por moneda (suma de items).
  const currenciesUsed = CURRENCIES.filter((cur) => (watchItems || []).some((it) => it.currency === cur))
  const totalByCurrency = (cur: "ARS" | "USD") =>
    (watchItems || [])
      .filter((it) => it.currency === cur)
      .reduce((sum, it) => sum + (Number(it.amount) || 0), 0)

  // Subir el PDF del resumen → el sistema lo desglosa y PRECARGA los items.
  const handleStatementFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
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

      const itemsByCurrency: Record<string, Array<{ description: string; amount: number }>> =
        data.items_by_currency || {}

      // Precargar TODOS los consumos (ambas monedas), cada uno con su moneda.
      const rows = CURRENCIES.flatMap((cur) =>
        (itemsByCurrency[cur] || []).map((it) => ({
          ...emptyItem(cur),
          description: it.description,
          amount: it.amount,
        }))
      )

      if (rows.length === 0) {
        toast.error("No se encontraron consumos en el resumen. Cargalo a mano.")
        return
      }

      replace(rows)
      setParseWarnings(Array.isArray(data.warnings) ? data.warnings : [])
      toast.success(`Se desglosaron ${rows.length} consumo(s). Revisá moneda, agencia y clasificación antes de confirmar.`)
    } catch (err) {
      console.error("Error parsing statement:", err)
      toast.error("Error al procesar el resumen")
    } finally {
      setIsParsing(false)
    }
  }

  const onSubmit = async (values: CCPaymentFormValues) => {
    const used = CURRENCIES.filter((cur) => values.items.some((it) => it.currency === cur))
    if (used.length === 0) {
      toast.error("Agregá al menos un item")
      return
    }

    // Armar una pata por moneda usada, validando su cuenta origen.
    const legs: Array<{ currency: string; source_account_id: string; total_amount: number; exchange_rate: number | null }> = []
    for (const cur of used) {
      const src = cur === "ARS" ? values.source_account_ars : values.source_account_usd
      if (!src) {
        toast.error(`Elegí la cuenta origen para la parte en ${cur}`)
        return
      }
      const total = values.items.filter((it) => it.currency === cur).reduce((s, it) => s + (Number(it.amount) || 0), 0)
      legs.push({
        currency: cur,
        source_account_id: src,
        total_amount: total,
        exchange_rate: cur === "USD" ? values.exchange_rate_usd || null : null,
      })
    }

    setIsLoading(true)
    try {
      const res = await fetch("/api/expenses/cc-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credit_card_account_id: values.credit_card_account_id,
          payment_date: new Date(values.payment_date).toISOString(),
          notes: values.notes || null,
          legs,
          items: values.items.map((item) =>
            item.type === "OPERATOR_SETTLEMENT"
              ? {
                  type: "OPERATOR_SETTLEMENT",
                  currency: item.currency,
                  operator_payment_id: item.operator_payment_id,
                  operation_id: item.operation_id,
                  amount: item.amount,
                  description: item.description || null,
                }
              : {
                  type: "EXPENSE",
                  currency: item.currency,
                  classification: item.classification,
                  description: item.description,
                  amount: item.amount,
                  category_id: item.category_id || null,
                  agency_id: item.agency_id || null,
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
            Desglosá el resumen en consumos (gastos o cancelación de deudas). Podés pagar en pesos y dólares en el mismo pago.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-5 space-y-5">
            {/* Datos del pago */}
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
            </div>

            {/* Cuentas origen por moneda (según los items cargados) */}
            {currenciesUsed.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5 text-success" />
                  <span className="text-xs font-medium text-foreground/70">De dónde sale la plata (por moneda)</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {currenciesUsed.map((cur) => {
                    const total = totalByCurrency(cur)
                    const fieldName = cur === "ARS" ? "source_account_ars" : "source_account_usd"
                    return (
                      <div key={cur} className="rounded-lg border border-border/30 p-3 space-y-2 bg-background/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Parte en {cur}</span>
                          <span className="text-sm font-semibold tabular-nums">{formatCurrency(total, cur)}</span>
                        </div>
                        <FormField
                          control={form.control}
                          name={fieldName as any}
                          render={({ field }) => (
                            <FormItem>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder={`Cuenta origen (${cur})`} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {accountsForCurrency(cur).map((acc) => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                      {acc.name}
                                      {acc.current_balance !== undefined && (
                                        <span className="text-xs text-muted-foreground ml-1">
                                          — {formatCurrency(acc.current_balance, acc.currency)}
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
                        {cur === "USD" && (
                          <FormField
                            control={form.control}
                            name="exchange_rate_usd"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <DecimalInput
                                    className="h-8 text-sm"
                                    placeholder="Tipo de cambio (opcional)"
                                    {...field}
                                    onChange={(v) => field.onChange(v ? Number(v) : undefined)}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Items Breakdown */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5 text-success" />
                  <span className="text-xs font-medium text-foreground/70">Desglose de items</span>
                </div>
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

              {/* Buscador de deudas (para items "Cancela deuda"). */}
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
                  const itemCurrency = form.watch(`items.${index}.currency`) || "ARS"
                  const debtsForItem = pendingDebts.filter((d) => d.currency === itemCurrency)
                  return (
                    <div key={field.id} className="rounded-lg border border-border/30 p-3 space-y-3 bg-background/50">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
                          <FormField
                            control={form.control}
                            name={`items.${index}.type`}
                            render={({ field }) => (
                              <Select
                                value={field.value || "EXPENSE"}
                                onValueChange={(v) => {
                                  field.onChange(v)
                                  if (v === "OPERATOR_SETTLEMENT") {
                                    form.setValue(`items.${index}.classification`, undefined)
                                    form.setValue(`items.${index}.category_id`, "")
                                    form.setValue(`items.${index}.agency_id`, "")
                                  } else {
                                    form.setValue(`items.${index}.operator_payment_id`, "")
                                    form.setValue(`items.${index}.operation_id`, "")
                                  }
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs w-[140px] rounded-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="EXPENSE">Gasto</SelectItem>
                                  <SelectItem value="OPERATOR_SETTLEMENT">Cancela deuda</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {/* Moneda del item */}
                          <FormField
                            control={form.control}
                            name={`items.${index}.currency`}
                            render={({ field }) => (
                              <Select
                                value={field.value || "ARS"}
                                onValueChange={(v) => {
                                  field.onChange(v)
                                  // Al cambiar de moneda, limpiar la deuda elegida (era de otra moneda).
                                  form.setValue(`items.${index}.operator_payment_id`, "")
                                  form.setValue(`items.${index}.operation_id`, "")
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs w-[80px] rounded-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ARS">ARS</SelectItem>
                                  <SelectItem value="USD">USD</SelectItem>
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
                                <FormLabel className="text-xs">Deuda a cancelar ({itemCurrency}) *</FormLabel>
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
                                    {debtsForItem.length === 0 ? (
                                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                                        No hay deudas pendientes en {itemCurrency}
                                      </div>
                                    ) : (
                                      debtsForItem.map((d) => (
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
                                    <DecimalInput className="h-8 text-sm" {...field} onChange={(v) => field.onChange(Number(v) || 0)} />
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
                                    <Input className="h-8 text-sm" placeholder="Ej: Valija López" {...field} value={field.value || ""} />
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
                                    <DecimalInput className="h-8 text-sm" {...field} onChange={(v) => field.onChange(Number(v) || 0)} />
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
                                    <Input className="h-8 text-sm" placeholder="Ej: Publicidad Google, Valijas..." {...field} value={field.value || ""} />
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
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger className="h-8 text-sm">
                                        <SelectValue placeholder="Sin categoría" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                          <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
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
                          {/* Agencia (atribución Madero/Rosario). Sólo si hay más de una. */}
                          {agencies.length > 1 && (
                            <FormField
                              control={form.control}
                              name={`items.${index}.agency_id`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Agencia (a qué oficina corresponde)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger className="h-8 text-sm">
                                        <SelectValue placeholder="Sin asignar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {agencies.map((ag) => (
                                        <SelectItem key={ag.id} value={ag.id}>
                                          {ag.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
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
                onClick={() => append(emptyItem(currenciesUsed[0] || defaultCurrency))}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar item
              </Button>
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notas adicionales sobre el pago..." {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Guardando..." : "Registrar Pago"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
