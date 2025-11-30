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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const tariffSchema = z.object({
  operator_id: z.string().min(1, "El operador es requerido"),
  agency_id: z.string().optional().nullable(),
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  destination: z.string().min(1, "El destino es requerido"),
  region: z.enum(["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]),
  valid_from: z.string().min(1, "La fecha de inicio es requerida"),
  valid_to: z.string().min(1, "La fecha de fin es requerida"),
  tariff_type: z.enum(["ACCOMMODATION", "FLIGHT", "PACKAGE", "TRANSFER", "ACTIVITY", "CRUISE", "OTHER"]),
  currency: z.enum(["ARS", "USD"]).default("ARS"),
  is_active: z.boolean().default(true),
  notes: z.string().optional(),
  terms_and_conditions: z.string().optional(),
})

type TariffFormValues = z.infer<typeof tariffSchema>

interface NewTariffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  operators: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
  defaultAgencyId?: string
}

export function NewTariffDialog({
  open,
  onOpenChange,
  onSuccess,
  operators,
  agencies,
  defaultAgencyId,
}: NewTariffDialogProps) {
  const [loading, setLoading] = useState(false)

  const form = useForm<TariffFormValues>({
    resolver: zodResolver(tariffSchema) as any,
    defaultValues: {
      operator_id: "",
      agency_id: defaultAgencyId || null,
      name: "",
      description: "",
      destination: "",
      region: "ARGENTINA",
      valid_from: "",
      valid_to: "",
      tariff_type: "PACKAGE",
      currency: "ARS",
      is_active: true,
      notes: "",
      terms_and_conditions: "",
    },
  })

  const handleSubmit = async (values: TariffFormValues) => {
    setLoading(true)
    try {
      const response = await fetch("/api/tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          agency_id: values.agency_id || null,
          description: values.description || null,
          notes: values.notes || null,
          terms_and_conditions: values.terms_and_conditions || null,
          items: [], // Por ahora sin items, se pueden agregar después
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al crear tarifario")
      }

      form.reset()
      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      console.error("Error creating tariff:", error)
      alert(error.message || "Error al crear tarifario")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Tarifario</DialogTitle>
          <DialogDescription>Crear un nuevo tarifario de operador</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="operator_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Operador *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar operador" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {operators.map((operator) => (
                          <SelectItem key={operator.id} value={operator.id}>
                            {operator.name}
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
                name="agency_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sucursal (opcional)</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "GLOBAL" ? null : value)}
                      value={field.value || "GLOBAL"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar sucursal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="GLOBAL">Global (todas las sucursales)</SelectItem>
                        {agencies.map((agency) => (
                          <SelectItem key={agency.id} value={agency.id}>
                            {agency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Tarifario *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ej: Caribe Verano 2025" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destino *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ej: Cancún, México" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Región *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ARGENTINA">Argentina</SelectItem>
                        <SelectItem value="CARIBE">Caribe</SelectItem>
                        <SelectItem value="BRASIL">Brasil</SelectItem>
                        <SelectItem value="EUROPA">Europa</SelectItem>
                        <SelectItem value="EEUU">EEUU</SelectItem>
                        <SelectItem value="CRUCEROS">Cruceros</SelectItem>
                        <SelectItem value="OTROS">Otros</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tariff_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Tarifario *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PACKAGE">Paquete</SelectItem>
                        <SelectItem value="ACCOMMODATION">Alojamiento</SelectItem>
                        <SelectItem value="FLIGHT">Vuelo</SelectItem>
                        <SelectItem value="TRANSFER">Traslado</SelectItem>
                        <SelectItem value="ACTIVITY">Actividad</SelectItem>
                        <SelectItem value="CRUISE">Crucero</SelectItem>
                        <SelectItem value="OTHER">Otro</SelectItem>
                      </SelectContent>
                    </Select>
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

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="valid_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Válido desde *</FormLabel>
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
                name="valid_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Válido hasta *</FormLabel>
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
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Descripción del tarifario..."
                      rows={3}
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
                  <FormLabel>Notas Internas</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Notas internas sobre el tarifario..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="terms_and_conditions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Términos y Condiciones</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Términos y condiciones del tarifario..."
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Tarifario Activo</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      El tarifario estará disponible para uso
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creando..." : "Crear Tarifario"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

