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
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

const recurringPaymentSchema = z.object({
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  start_date: z.string().min(1, "La fecha de inicio es requerida"),
  end_date: z.string().optional().nullable(),
  next_due_date: z.string().optional(),
  is_active: z.boolean(),
  description: z.string().min(1, "La descripción es requerida"),
  notes: z.string().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
})

type RecurringPaymentFormValues = z.infer<typeof recurringPaymentSchema>

const frequencyOptions = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quincenal" },
  { value: "MONTHLY", label: "Mensual" },
  { value: "QUARTERLY", label: "Trimestral" },
  { value: "YEARLY", label: "Anual" },
]

interface EditRecurringPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  payment: any
}

export function EditRecurringPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  payment,
}: EditRecurringPaymentDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [hasEndDate, setHasEndDate] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: string; name: string; color: string }>>([])

  const form = useForm<RecurringPaymentFormValues>({
    resolver: zodResolver(recurringPaymentSchema) as any,
    defaultValues: {
      amount: 0,
      currency: "ARS",
      frequency: "MONTHLY",
      start_date: new Date().toISOString().split("T")[0],
      end_date: null,
      next_due_date: new Date().toISOString().split("T")[0],
      is_active: true,
      description: "",
      notes: null,
      invoice_number: null,
      reference: null,
      category_id: null,
    },
  })

  // Cargar categorías
  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/accounting/recurring-payments/categories")
      if (response.ok) {
        const data = await response.json()
        setCategories(data.categories || [])
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
    }
  }

  useEffect(() => {
    if (open) {
      fetchCategories()
      if (payment) {
        form.reset({
          amount: payment.amount || 0,
          currency: payment.currency || "ARS",
          frequency: payment.frequency || "MONTHLY",
          start_date: payment.start_date || new Date().toISOString().split("T")[0],
          end_date: payment.end_date || null,
          next_due_date: payment.next_due_date || new Date().toISOString().split("T")[0],
          is_active: payment.is_active !== undefined ? payment.is_active : true,
          description: payment.description || "",
          notes: payment.notes || null,
          invoice_number: payment.invoice_number || null,
          reference: payment.reference || null,
          category_id: payment.category_id || null,
        })
        setHasEndDate(!!payment.end_date)
      }
    }
  }, [open, payment, form])

  const onSubmit = async (values: RecurringPaymentFormValues) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/recurring-payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          end_date: hasEndDate ? values.end_date : null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al actualizar pago recurrente")
      }

      toast.success("Pago recurrente actualizado exitosamente")
      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error("Error updating recurring payment:", error)
      toast.error(error.message || "Error al actualizar pago recurrente")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/recurring-payments/${payment.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al eliminar pago recurrente")
      }

      toast.success("Pago recurrente eliminado exitosamente")
      onSuccess()
      onOpenChange(false)
      setShowDeleteDialog(false)
    } catch (error: any) {
      console.error("Error deleting recurring payment:", error)
      toast.error(error.message || "Error al eliminar pago recurrente")
    } finally {
      setIsLoading(false)
    }
  }

  if (!payment) return null

  // Obtener nombre del proveedor
  const providerName = payment.provider_name || payment.operators?.name || "-"

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Pago Recurrente</DialogTitle>
            <DialogDescription>
              Modifica la configuración del pago recurrente
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">Proveedor: {providerName}</p>
                <p className="text-xs text-muted-foreground">
                  Última generación: {payment.last_generated_date
                    ? new Date(payment.last_generated_date).toLocaleDateString("es-AR")
                    : "Nunca"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frecuencia *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {frequencyOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
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
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-col justify-end">
                      <FormLabel>Estado</FormLabel>
                      <div className="flex items-center gap-2">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                        <span className="text-sm">{field.value ? "Activo" : "Inactivo"}</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monto *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Inicio *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="next_due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Próxima Fecha de Vencimiento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <div className="flex items-center gap-2">
                        <span>Fecha de Fin (Opcional)</span>
                        <Switch
                          checked={hasEndDate}
                          onCheckedChange={(checked) => {
                            setHasEndDate(checked)
                            if (!checked) {
                              field.onChange(null)
                            }
                          }}
                        />
                      </div>
                    </FormLabel>
                    {hasEndDate && (
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} />
                      </FormControl>
                    )}
                    {!hasEndDate && (
                      <p className="text-sm text-muted-foreground">
                        Si no se especifica, el pago continuará indefinidamente
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría (Opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Sin categoría</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: category.color }}
                              />
                              {category.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="invoice_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Factura (Opcional)</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
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
                      <FormLabel>Referencia (Opcional)</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="flex justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isLoading}
                >
                  Eliminar
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Guardando..." : "Guardar Cambios"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción desactivará el pago recurrente. No se eliminará permanentemente,
              pero dejará de generar pagos automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
