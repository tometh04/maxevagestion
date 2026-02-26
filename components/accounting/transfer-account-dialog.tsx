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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { toast } from "sonner"
import { ArrowRight, Loader2 } from "lucide-react"

interface FinancialAccount {
  id: string
  name: string
  type: string
  currency: "ARS" | "USD"
  current_balance?: number
  is_active?: boolean
}

const transferSchema = z.object({
  from_account_id: z.string().min(1, "Debe seleccionar cuenta origen"),
  to_account_id: z.string().min(1, "Debe seleccionar cuenta destino"),
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  exchange_rate: z.coerce.number().optional(),
  transfer_date: z.date({
    required_error: "La fecha es requerida",
  }),
  notes: z.string().optional(),
})

type TransferFormValues = z.infer<typeof transferSchema>

interface TransferAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function TransferAccountDialog({
  open,
  onOpenChange,
  onSuccess,
}: TransferAccountDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      from_account_id: "",
      to_account_id: "",
      amount: 0,
      currency: "USD",
      exchange_rate: undefined,
      transfer_date: new Date(),
      notes: "",
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

  // Auto-detectar moneda cuando se selecciona cuenta origen
  const fromAccountId = form.watch("from_account_id")
  const toAccountId = form.watch("to_account_id")
  const watchAmount = form.watch("amount")
  const watchExchangeRate = form.watch("exchange_rate")

  useEffect(() => {
    if (fromAccountId) {
      const account = financialAccounts.find((acc) => acc.id === fromAccountId)
      if (account) {
        form.setValue("currency", account.currency)
      }
    }
  }, [fromAccountId, financialAccounts, form])

  const fromAccount = financialAccounts.find((acc) => acc.id === fromAccountId)
  const toAccount = financialAccounts.find((acc) => acc.id === toAccountId)
  const fromBalance = fromAccount?.current_balance ?? 0

  // Detectar cross-currency
  const isCrossCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency

  // Filtrar cuentas destino: todas las activas excepto la origen
  const filteredToAccounts = financialAccounts.filter(
    (acc) => acc.id !== fromAccountId && acc.is_active !== false
  )

  // Calcular monto convertido para preview
  const convertedAmount = useMemo(() => {
    if (!isCrossCurrency || !watchAmount || !watchExchangeRate || watchExchangeRate <= 0) return null
    if (fromAccount?.currency === "ARS" && toAccount?.currency === "USD") {
      return watchAmount / watchExchangeRate
    }
    if (fromAccount?.currency === "USD" && toAccount?.currency === "ARS") {
      return watchAmount * watchExchangeRate
    }
    return null
  }, [isCrossCurrency, watchAmount, watchExchangeRate, fromAccount?.currency, toAccount?.currency])

  const onSubmit = async (values: TransferFormValues) => {
    if (values.from_account_id === values.to_account_id) {
      toast.error("La cuenta origen y destino no pueden ser la misma")
      return
    }

    // Validar exchange_rate si es cross-currency
    if (isCrossCurrency && (!values.exchange_rate || values.exchange_rate <= 0)) {
      toast.error("El tipo de cambio es obligatorio para transferencias entre distintas monedas")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/accounting/financial-accounts/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_account_id: values.from_account_id,
          to_account_id: values.to_account_id,
          amount: values.amount,
          currency: values.currency,
          transfer_date: values.transfer_date.toISOString().split("T")[0],
          notes: values.notes || null,
          ...(isCrossCurrency ? { exchange_rate: values.exchange_rate } : {}),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al realizar la transferencia")
      }

      toast.success(data.message || "Transferencia realizada exitosamente")
      form.reset()
      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      console.error("Error transferring:", error)
      toast.error(error.message || "Error al realizar la transferencia")
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (val: number, cur: "ARS" | "USD") =>
    cur === "USD"
      ? `USD ${val.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
      : `$ ${val.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transferir entre Cuentas Financieras</DialogTitle>
          <DialogDescription>
            Transfiere dinero entre cuentas financieras. Soporta misma moneda y cambio de moneda con tipo de cambio.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="from_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta Origen *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      form.setValue("to_account_id", "")
                      form.setValue("exchange_rate", undefined)
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona cuenta origen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {financialAccounts
                        .filter((acc) => acc.is_active !== false)
                        .map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} ({account.currency}) - Balance:{" "}
                            {formatCurrency(account.current_balance ?? 0, account.currency)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  {fromAccount && (
                    <p className="text-xs text-muted-foreground">
                      Saldo disponible: {formatCurrency(fromBalance, fromAccount.currency)}
                    </p>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="to_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta Destino *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      form.setValue("exchange_rate", undefined)
                    }}
                    disabled={!fromAccountId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={fromAccountId ? "Selecciona cuenta destino" : "Primero selecciona cuenta origen"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredToAccounts.length === 0 ? (
                        <SelectItem value="no-accounts" disabled>
                          No hay cuentas disponibles
                        </SelectItem>
                      ) : (
                        filteredToAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} ({account.currency}) - Balance:{" "}
                            {formatCurrency(account.current_balance ?? 0, account.currency)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={`grid gap-4 ${isCrossCurrency ? "grid-cols-3" : "grid-cols-2"}`}>
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
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                        onFocus={(e) => e.target.select()}
                      />
                    </FormControl>
                    <FormMessage />
                    {fromAccount && watchAmount > fromBalance && (
                      <p className="text-xs text-red-600">
                        Saldo insuficiente. Disponible: {formatCurrency(fromBalance, fromAccount.currency)}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={true}
                    >
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
                    <p className="text-xs text-muted-foreground">
                      Auto-detectada desde cuenta origen
                    </p>
                  </FormItem>
                )}
              />

              {isCrossCurrency && (
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
                          placeholder="Ej: 1450"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                          onFocus={(e) => e.target.select()}
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        1 USD = X ARS
                      </p>
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Preview de conversión cross-currency */}
            {isCrossCurrency && watchAmount > 0 && convertedAmount !== null && convertedAmount > 0 && (
              <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                <p className="text-sm font-medium">Resumen de la operación:</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-red-600 font-medium">
                    Sale: {formatCurrency(watchAmount, fromAccount!.currency)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-green-600 font-medium">
                    Entra: {formatCurrency(convertedAmount, toAccount!.currency)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {fromAccount!.currency === "ARS" ? "Compra de dólares" : "Venta de dólares"} - TC: {watchExchangeRate}
                </p>
              </div>
            )}

            <FormField
              control={form.control}
              name="transfer_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Transferencia *</FormLabel>
                  <FormControl>
                    <DateInputWithCalendar
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="dd/MM/yyyy"
                    />
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
                      placeholder="Notas adicionales sobre la transferencia..."
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
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading || filteredToAccounts.length === 0}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Transfiriendo...
                  </>
                ) : isCrossCurrency ? (
                  fromAccount?.currency === "ARS" ? "Comprar Dólares" : "Vender Dólares"
                ) : (
                  "Realizar Transferencia"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
