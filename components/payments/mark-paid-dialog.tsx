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
  financial_account_id: z.string().optional(),
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

  const form = useForm<MarkPaidFormValues>({
    resolver: zodResolver(markPaidSchema) as any,
    defaultValues: {
      datePaid: new Date().toISOString().split("T")[0],
      reference: "",
      financial_account_id: "",
    },
  })

  // Cargar cuentas financieras cuando el método es "Transferencia"
  useEffect(() => {
    if (open && payment && payment.method === "Transferencia") {
      const fetchFinancialAccounts = async () => {
        try {
          const response = await fetch("/api/accounting/financial-accounts")
          if (response.ok) {
            const data = await response.json()
            // Filtrar solo cuentas bancarias (CHECKING, SAVINGS) de la misma moneda
            const bankAccounts = (data.accounts || []).filter(
              (acc: FinancialAccount) =>
                acc.is_active !== false &&
                (acc.type === "CHECKING_ARS" ||
                  acc.type === "CHECKING_USD" ||
                  acc.type === "SAVINGS_ARS" ||
                  acc.type === "SAVINGS_USD") &&
                acc.currency === payment.currency
            )
            setFinancialAccounts(bankAccounts)
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

    // Validar que si el método es "Transferencia", se haya seleccionado una cuenta
    if (payment.method === "Transferencia" && !values.financial_account_id) {
      toast.error("Debe seleccionar una cuenta receptiva para transferencias bancarias")
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

            {/* Mostrar selector de cuenta solo si el método es "Transferencia" */}
            {payment.method === "Transferencia" && (
              <FormField
                control={form.control}
                name="financial_account_id"
                rules={{ required: "Debe seleccionar una cuenta receptiva" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta Receptiva *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar cuenta bancaria" />
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
            )}

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

