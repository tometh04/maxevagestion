"use client"

import { useState, useEffect, useMemo } from "react"
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
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { useCustomerSettings } from "@/hooks/use-customer-settings"
import { CustomFieldsForm } from "./custom-fields-form"

interface Customer {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string
  instagram_handle?: string | null
  document_type?: string | null
  document_number?: string | null
  date_of_birth?: string | null
  nationality?: string | null
}

interface EditCustomerDialogProps {
  customer: Customer
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const documentTypes = [
  { value: "DNI", label: "DNI" },
  { value: "PASSPORT", label: "Pasaporte" },
  { value: "CUIT", label: "CUIT" },
  { value: "OTHER", label: "Otro" },
]

const nationalities = [
  { value: "Argentina", label: "Argentina" },
  { value: "Brasil", label: "Brasil" },
  { value: "Chile", label: "Chile" },
  { value: "Uruguay", label: "Uruguay" },
  { value: "Paraguay", label: "Paraguay" },
  { value: "Colombia", label: "Colombia" },
  { value: "México", label: "México" },
  { value: "España", label: "España" },
  { value: "Estados Unidos", label: "Estados Unidos" },
  { value: "Otro", label: "Otro" },
]

export function EditCustomerDialog({
  customer,
  open,
  onOpenChange,
  onSuccess,
}: EditCustomerDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { settings, loading: settingsLoading } = useCustomerSettings()

  // Generar schema dinámicamente según configuración
  const customerSchema = useMemo(() => {
    // Schema base
    const baseFields: Record<string, z.ZodTypeAny> = {
      first_name: z.string().min(1, "Nombre es requerido"),
      last_name: z.string().min(1, "Apellido es requerido"),
      phone: z.string().min(1, "Teléfono es requerido"),
      email: z.string().email("Email inválido"),
      instagram_handle: z.string().optional(),
      document_type: z.string().optional(),
      document_number: z.string().optional(),
      date_of_birth: z.string().optional(),
      nationality: z.string().optional(),
    }

    // Aplicar validaciones de configuración
    if (settings?.validations) {
      const validations = settings.validations
      
      if (validations.email?.required) {
        baseFields.email = z.string().min(1, "Email es requerido").email("Email inválido")
      }
      
      if (validations.phone?.required) {
        baseFields.phone = z.string().min(1, "Teléfono es requerido")
      }
    }

    // Agregar campos personalizados al schema
    if (settings?.custom_fields) {
      settings.custom_fields.forEach((field) => {
        let fieldSchema: z.ZodTypeAny
        
        switch (field.type) {
          case 'number':
            fieldSchema = field.required 
              ? z.number({ required_error: `${field.label} es requerido` })
              : z.number().optional()
            break
          case 'email':
            fieldSchema = field.required
              ? z.string().min(1, `${field.label} es requerido`).email(`${field.label} inválido`)
              : z.string().email(`${field.label} inválido`).optional()
            break
          default:
            fieldSchema = field.required
              ? z.string().min(1, `${field.label} es requerido`)
              : z.string().optional()
        }
        
        baseFields[field.name] = fieldSchema
      })
    }

    return z.object(baseFields)
  }, [settings])

  type CustomerFormValues = z.infer<typeof customerSchema>

  // Generar valores por defecto incluyendo campos personalizados
  const defaultValues = useMemo(() => {
    const baseDefaults: any = {
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      instagram_handle: customer.instagram_handle || "",
      document_type: customer.document_type || "",
      document_number: customer.document_number || "",
      date_of_birth: customer.date_of_birth ? customer.date_of_birth.split("T")[0] : "",
      nationality: customer.nationality || "",
    }

    // Agregar valores de campos personalizados desde el customer (si existen)
    if (settings?.custom_fields) {
      settings.custom_fields.forEach((field) => {
        baseDefaults[field.name] = (customer as any)[field.name] || field.default_value || (field.type === 'number' ? undefined : '')
      })
    }

    return baseDefaults
  }, [customer, settings])

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  })

  // Reset form when customer or settings change
  useEffect(() => {
    if (customer && settings && !settingsLoading) {
      form.reset(defaultValues)
    }
  }, [customer, settings, settingsLoading, defaultValues, form])

  const onSubmit = async (values: CustomerFormValues) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          instagram_handle: values.instagram_handle || null,
          document_type: values.document_type || null,
          document_number: values.document_number || null,
          date_of_birth: values.date_of_birth || null,
          nationality: values.nationality || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al actualizar cliente")
      }

      toast.success("Cliente actualizado correctamente")
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("Error updating customer:", error)
      toast.error(error instanceof Error ? error.message : "Error al actualizar cliente")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
          <DialogDescription>
            Modifica los datos del cliente {customer.first_name} {customer.last_name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input placeholder="Juan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido *</FormLabel>
                    <FormControl>
                      <Input placeholder="Pérez" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono *</FormLabel>
                    <FormControl>
                      <Input placeholder="+54 11 1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="juan@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instagram_handle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instagram</FormLabel>
                    <FormControl>
                      <Input placeholder="@usuario" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="document_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Documento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {documentTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
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
                name="document_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Documento</FormLabel>
                    <FormControl>
                      <Input placeholder="12345678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Nacimiento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nacionalidad</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar nacionalidad" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {nationalities.map((nat) => (
                          <SelectItem key={nat.value} value={nat.value}>
                            {nat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Campos personalizados */}
            {settings?.custom_fields && settings.custom_fields.length > 0 && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-medium">Información Adicional</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <CustomFieldsForm 
                    control={form.control} 
                    customFields={settings.custom_fields} 
                  />
                </div>
              </div>
            )}

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

