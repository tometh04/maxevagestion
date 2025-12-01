"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

const operatorSchema = z.object({
  name: z.string().min(1, "Nombre es requerido"),
  contact_name: z.string().optional(),
  contact_email: z.string().email("Email inválido").optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  credit_limit: z.coerce.number().min(0).optional(),
})

type OperatorFormValues = z.infer<typeof operatorSchema>

interface Operator {
  id: string
  name: string
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  credit_limit?: number | null
}

interface EditOperatorDialogProps {
  operator: Operator
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function EditOperatorDialog({
  operator,
  open,
  onOpenChange,
  onSuccess,
}: EditOperatorDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<OperatorFormValues>({
    resolver: zodResolver(operatorSchema),
    defaultValues: {
      name: operator.name || "",
      contact_name: operator.contact_name || "",
      contact_email: operator.contact_email || "",
      contact_phone: operator.contact_phone || "",
      credit_limit: operator.credit_limit || 0,
    },
  })

  // Reset form when operator changes
  useEffect(() => {
    if (operator) {
      form.reset({
        name: operator.name || "",
        contact_name: operator.contact_name || "",
        contact_email: operator.contact_email || "",
        contact_phone: operator.contact_phone || "",
        credit_limit: operator.credit_limit || 0,
      })
    }
  }, [operator, form])

  const onSubmit = async (values: OperatorFormValues) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/operators/${operator.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          contact_name: values.contact_name || null,
          contact_email: values.contact_email || null,
          contact_phone: values.contact_phone || null,
          credit_limit: values.credit_limit || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al actualizar operador")
      }

      toast.success("Operador actualizado correctamente")
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("Error updating operator:", error)
      toast.error(error instanceof Error ? error.message : "Error al actualizar operador")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Operador</DialogTitle>
          <DialogDescription>
            Modifica los datos del operador {operator.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Operador *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Despegar, Avantrip" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Contacto</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre de la persona de contacto" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email de Contacto</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="contacto@operador.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono de Contacto</FormLabel>
                    <FormControl>
                      <Input placeholder="+54 11 1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="credit_limit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Límite de Crédito</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormDescription>
                    Monto máximo de crédito permitido con este operador
                  </FormDescription>
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
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar Cambios"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

