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
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { ArrowUpDown, DollarSign, CalendarIcon } from "lucide-react"
import { toast } from "sonner"
import { useDefaultCurrency } from "@/hooks/use-default-currency"

interface FinancialAccount {
  id: string
  name: string
  type: string
  currency: "ARS" | "USD"
  current_balance?: number
  is_active?: boolean
}

const cashMovementSchema = z.object({
  operation_id: z.string().optional().nullable(),
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().min(1, "La categoría es requerida"),
  category_id: z.string().optional().nullable(),
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  financial_account_id: z.string().min(1, "Debe seleccionar una cuenta financiera"),
  affects_balance: z.boolean(),
  movement_date: z.string().min(1, "La fecha es requerida"),
  notes: z.string().optional(),
})

type CashMovementFormValues = z.infer<typeof cashMovementSchema>

interface ExpenseCategory {
  id: string
  name: string
  color?: string
}

const incomeCategoryOptions = [
  "Pago Cliente",
  "Otros Ingresos",
]

interface NewCashMovementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  operations?: Array<{ id: string; destination: string }>
}

export function NewCashMovementDialog({
  open,
  onOpenChange,
  onSuccess,
  operations = [],
}: NewCashMovementDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { currency: defaultCurrency } = useDefaultCurrency()
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])

  // Helper to get datetime-local format
  const getDefaultDateTimeLocal = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    const hours = String(now.getHours()).padStart(2, "0")
    const minutes = String(now.getMinutes()).padStart(2, "0")
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const form = useForm<CashMovementFormValues>({
    resolver: zodResolver(cashMovementSchema),
    defaultValues: {
      operation_id: null,
      type: "INCOME",
      category: "",
      category_id: null,
      amount: 0,
      currency: defaultCurrency,
      financial_account_id: "",
      affects_balance: true,
      movement_date: getDefaultDateTimeLocal(),
      notes: "",
    },
  })

  const movementType = form.watch("type")

  // Reset category when switching between INCOME/EXPENSE so a stale selection
  // from the other type doesn't get submitted.
  useEffect(() => {
    form.setValue("category", "")
    form.setValue("category_id", null)
  }, [movementType, form])

  // Sync currency when org default loads after mount
  useEffect(() => {
    form.setValue("currency", defaultCurrency)
  }, [defaultCurrency, form])

  // Cargar cuentas financieras y categorías de gasto cuando se abre el dialog
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
      const fetchExpenseCategories = async () => {
        try {
          const response = await fetch("/api/expenses/categories")
          if (response.ok) {
            const data = await response.json()
            setExpenseCategories(data.categories || [])
          }
        } catch (error) {
          console.error("Error fetching expense categories:", error)
        }
      }
      fetchFinancialAccounts()
      fetchExpenseCategories()
    } else {
      form.reset()
      setFinancialAccounts([])
      setExpenseCategories([])
    }
  }, [open, form])

  const onSubmit = async (values: CashMovementFormValues) => {
    if (!values.financial_account_id) {
      toast.error("Debe seleccionar una cuenta financiera")
      return
    }

    setIsLoading(true)
    try {
      // Convert datetime-local to ISO string
      const movementDate = values.movement_date ? new Date(values.movement_date).toISOString() : new Date().toISOString()
      
      const response = await fetch("/api/cash/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          operation_id: values.operation_id || null,
          financial_account_id: values.financial_account_id,
          category_id: values.category_id || null,
          affects_balance: values.affects_balance,
          movement_date: movementDate,
          notes: values.notes || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al crear movimiento")
      }

      onSuccess()
      onOpenChange(false)
      form.reset()
    } catch (error) {
      console.error("Error creating cash movement:", error)
      toast.error(error instanceof Error ? error.message : "Error al crear movimiento")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Movimiento de Caja</DialogTitle>
          <DialogDescription>Registrar un movimiento de caja manual</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-5 space-y-5">
            {/* Movimiento */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground/70">Movimiento</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="type"
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
                          <SelectItem value="INCOME">Ingreso</SelectItem>
                          <SelectItem value="EXPENSE">Egreso</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría *</FormLabel>
                      {movementType === "EXPENSE" ? (
                        <Select
                          onValueChange={(value) => {
                            const selected = expenseCategories.find((c) => c.id === value)
                            field.onChange(selected?.name || "")
                            form.setValue("category_id", value)
                          }}
                          value={form.watch("category_id") || ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar categoría" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {expenseCategories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value)
                            form.setValue("category_id", null)
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar categoría" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {incomeCategoryOptions.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="operation_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Operación (Opcional)</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin operación" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin operación</SelectItem>
                        {operations.map((operation) => (
                          <SelectItem key={operation.id} value={operation.id}>
                            {operation.destination}
                          </SelectItem>
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
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>

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
                        {financialAccounts
                          .filter((acc) => acc.currency === form.watch("currency"))
                          .map((account) => (
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

              <FormField
                control={form.control}
                name="affects_balance"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl border border-border/40 bg-background/60 p-3">
                    <div className="space-y-1 pr-3">
                      <FormLabel className="m-0">Afecta saldo</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Si lo desactivas, el movimiento queda visible pero no modifica el balance.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Detalles */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5 text-sky-500" />
                <span className="text-xs font-medium text-foreground/70">Detalles</span>
              </div>

              <FormField
                control={form.control}
                name="movement_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha *</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
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
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Notas adicionales..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creando..." : "Crear Movimiento"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

