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
import { Loader2 } from "lucide-react"

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
  useEffect(() => {
    if (fromAccountId) {
      const account = financialAccounts.find((acc) => acc.id === fromAccountId)
      if (account) {
        form.setValue("currency", account.currency)
      }
    }
  }, [fromAccountId, financialAccounts, form])

  // Filtrar cuentas destino por moneda y excluir cuenta origen
  const filteredToAccounts = financialAccounts.filter(
    (acc) => acc.id !== fromAccountId && acc.currency === form.watch("currency") && acc.is_active !== false
  )

  const onSubmit = async (values: TransferFormValues) => {
    if (values.from_account_id === values.to_account_id) {
      toast.error("La cuenta origen y destino no pueden ser la misma")
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

  const fromAccount = financialAccounts.find((acc) => acc.id === fromAccountId)
  const fromBalance = fromAccount?.current_balance || 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transferir entre Cuentas Financieras</DialogTitle>
          <DialogDescription>
            Transfiere dinero de una cuenta financiera a otra. Ambas cuentas deben estar en la misma moneda.
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
                      form.setValue("to_account_id", "") // Reset destino al cambiar origen
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
                            {account.currency === "USD"
                              ? `US$ ${(account.current_balance || 0).toLocaleString("es-AR", {
                                  minimumFractionDigits: 2,
                                })}`
                              : `$ ${(account.current_balance || 0).toLocaleString("es-AR", {
                                  minimumFractionDigits: 2,
                                })}`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  {fromAccount && (
                    <p className="text-xs text-muted-foreground">
                      Saldo disponible:{" "}
                      {fromAccount.currency === "USD"
                        ? `US$ ${fromBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                        : `$ ${fromBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
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
                    onValueChange={field.onChange}
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
                          No hay cuentas disponibles en {form.watch("currency")}
                        </SelectItem>
                      ) : (
                        filteredToAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} ({account.currency})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
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
                      />
                    </FormControl>
                    <FormMessage />
                    {fromAccount && form.watch("amount") > fromBalance && (
                      <p className="text-xs text-red-600">
                        Saldo insuficiente. Disponible:{" "}
                        {fromAccount.currency === "USD"
                          ? `US$ ${fromBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                          : `$ ${fromBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
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
                      disabled={true} // Auto-detectada desde cuenta origen
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
                      Se detecta automáticamente desde la cuenta origen
                    </p>
                  </FormItem>
                )}
              />
            </div>

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
