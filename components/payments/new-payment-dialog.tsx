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
import { DollarSign, CalendarIcon, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Operation {
  id: string
  file_code: string | null
  destination: string
  sale_currency?: string
  operator_cost_currency?: string
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
  const [loadingOps, setLoadingOps] = useState(false)
  const [searchOp, setSearchOp] = useState("")

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      operation_id: "",
      payer_type: "OPERATOR",
      direction: "EXPENSE",
      amount: 0,
      currency: "USD",
      method: "Transferencia",
      date_due: new Date().toISOString().split("T")[0],
      notes: "",
    },
  })

  const watchDirection = form.watch("direction")
  const watchOperationId = form.watch("operation_id")

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
      } finally {
        setLoadingOps(false)
      }
    }
    fetchOperations()
  }, [open, form])

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

  const onSubmit = async (values: PaymentFormValues) => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/payments", {
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

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al crear pago")
      }

      toast.success("Pago creado correctamente")
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
          <DialogDescription>Crear un pago pendiente para una operación</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Tipo */}
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

            {/* Fecha */}
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear Pago
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
