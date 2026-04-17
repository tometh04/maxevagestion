"use client"

import { useState, useEffect } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { CreditCard, Landmark, Plus, Trash2, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

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

const CLASSIFICATIONS = [
  { value: "GASTOS_AGENCIA", label: "Gastos Agencia" },
  { value: "VENTAS", label: "Ventas" },
  { value: "RETIRO_PERSONAL", label: "Retiro Personal" },
] as const

const itemSchema = z.object({
  classification: z.enum(["GASTOS_AGENCIA", "VENTAS", "RETIRO_PERSONAL"]),
  description: z.string().min(1, "Requerido"),
  amount: z.coerce.number().min(0.01, "Debe ser mayor a 0"),
  category_id: z.string().optional(),
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
  const [categories, setCategories] = useState<Category[]>([])
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])

  const getDefaultDate = () => {
    const now = new Date()
    return now.toISOString().split("T")[0]
  }

  const form = useForm<CCPaymentFormValues>({
    resolver: zodResolver(ccPaymentSchema),
    defaultValues: {
      credit_card_account_id: "",
      source_account_id: "",
      total_amount: 0,
      currency: "ARS",
      exchange_rate: undefined,
      payment_date: getDefaultDate(),
      notes: "",
      items: [{ classification: "GASTOS_AGENCIA", description: "", amount: 0, category_id: "" }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  const watchCurrency = form.watch("currency")
  const watchTotalAmount = form.watch("total_amount")
  const watchItems = form.watch("items")

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
    }
  }, [open, form])

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
          items: values.items.map((item) => ({
            classification: item.classification,
            description: item.description,
            amount: item.amount,
            category_id: item.category_id || null,
          })),
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
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
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
                      <FormLabel className="text-orange-600">
                        Tipo de Cambio (ARS por 1 USD)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Ej: 1200"
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.value ? Number(e.target.value) : undefined)
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
              <div className="flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-foreground/70">Desglose de items</span>
              </div>

              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="rounded-lg border border-border/30 p-3 space-y-3 bg-background/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Item {index + 1}
                      </span>
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

                    <div className="grid gap-3 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.classification`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Clasificación *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
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
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="h-8 text-sm"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
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
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    classification: "GASTOS_AGENCIA",
                    description: "",
                    amount: 0,
                    category_id: "",
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
                    ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                    : totalNum > 0
                      ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
                      : "bg-muted/30 border border-border/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isBalanced ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : totalNum > 0 ? (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  ) : null}
                  <span>
                    Total items: <strong>{formatCurrency(itemsSum, watchCurrency)}</strong>
                  </span>
                </div>
                <span>
                  Total pago: <strong>{formatCurrency(totalNum, watchCurrency)}</strong>
                  {totalNum > 0 && !isBalanced && (
                    <span className="ml-2 text-red-600">
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
