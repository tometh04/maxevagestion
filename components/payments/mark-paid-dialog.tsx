"use client"

import { useState } from "react"
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
import { DatePicker } from "@/components/ui/date-picker"
import { Loader2, CheckCircle } from "lucide-react"
import { toast } from "sonner"

const markPaidSchema = z.object({
  datePaid: z.string().min(1, "La fecha de pago es requerida"),
  reference: z.string().optional(),
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

  const form = useForm<MarkPaidFormValues>({
    resolver: zodResolver(markPaidSchema) as any,
    defaultValues: {
      datePaid: new Date().toISOString().split("T")[0],
      reference: "",
    },
  })

  const handleSubmit = async (values: MarkPaidFormValues) => {
    if (!payment) return

    setLoading(true)
    try {
      const response = await fetch("/api/payments/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: payment.id,
          datePaid: values.datePaid,
          reference: values.reference || null,
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

