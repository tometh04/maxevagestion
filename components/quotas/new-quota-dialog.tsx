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

const quotaSchema = z.object({
  operator_id: z.string().min(1, "El operador es requerido"),
  tariff_id: z.string().optional().nullable(),
  destination: z.string().min(1, "El destino es requerido"),
  accommodation_name: z.string().optional().nullable(),
  room_type: z.string().optional().nullable(),
  date_from: z.string().min(1, "La fecha de inicio es requerida"),
  date_to: z.string().min(1, "La fecha de fin es requerida"),
  total_quota: z.coerce.number().min(1, "El cupo total debe ser mayor a 0"),
  is_active: z.boolean().default(true),
  notes: z.string().optional().nullable(),
})

type QuotaFormValues = z.infer<typeof quotaSchema>

interface NewQuotaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  operators: Array<{ id: string; name: string }>
}

export function NewQuotaDialog({
  open,
  onOpenChange,
  onSuccess,
  operators,
}: NewQuotaDialogProps) {
  const [loading, setLoading] = useState(false)
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>("")
  const [tariffs, setTariffs] = useState<Array<{ id: string; name: string; destination: string }>>([])
  const [loadingTariffs, setLoadingTariffs] = useState(false)

  const form = useForm<QuotaFormValues>({
    resolver: zodResolver(quotaSchema) as any,
    defaultValues: {
      operator_id: "",
      tariff_id: null,
      destination: "",
      accommodation_name: "",
      room_type: "",
      date_from: "",
      date_to: "",
      total_quota: 1,
      is_active: true,
      notes: "",
    },
  })

  // Fetch tariffs when operator changes
  useEffect(() => {
    const operatorId = form.watch("operator_id")
    if (operatorId && operatorId !== selectedOperatorId) {
      setSelectedOperatorId(operatorId)
      fetchTariffs(operatorId)
    }
  }, [form.watch("operator_id"), selectedOperatorId])

  const fetchTariffs = async (operatorId: string) => {
    setLoadingTariffs(true)
    try {
      const response = await fetch(`/api/tariffs?operatorId=${operatorId}&isActive=true`)
      if (response.ok) {
        const data = await response.json()
        setTariffs(data.tariffs || [])
      }
    } catch (error) {
      console.error("Error fetching tariffs:", error)
    } finally {
      setLoadingTariffs(false)
    }
  }

  const handleSubmit = async (values: QuotaFormValues) => {
    setLoading(true)
    try {
      const response = await fetch("/api/quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          tariff_id: values.tariff_id || null,
          accommodation_name: values.accommodation_name || null,
          room_type: values.room_type || null,
          notes: values.notes || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al crear cupo")
      }

      form.reset()
      setSelectedOperatorId("")
      setTariffs([])
      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      console.error("Error creating quota:", error)
      alert(error.message || "Error al crear cupo")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Cupo</DialogTitle>
          <DialogDescription>Crear un nuevo cupo disponible de operador</DialogDescription>
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
                name="tariff_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tarifario (opcional)</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "NONE" ? null : value)}
                      value={field.value || "NONE"}
                      disabled={loadingTariffs || !form.watch("operator_id")}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingTariffs ? "Cargando..." : "Seleccionar tarifario"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NONE">Sin tarifario</SelectItem>
                        {tariffs.map((tariff) => (
                          <SelectItem key={tariff.id} value={tariff.id}>
                            {tariff.name} - {tariff.destination}
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

              <FormField
                control={form.control}
                name="accommodation_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Alojamiento</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="Ej: Hotel Riu Palace" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="room_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Habitación</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="Ej: Standard, Deluxe, Suite" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="total_quota"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cupo Total *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        min="1"
                        placeholder="Cantidad disponible"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="date_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha desde *</FormLabel>
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
                name="date_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha hasta *</FormLabel>
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ""}
                      placeholder="Notas adicionales sobre el cupo..."
                      rows={3}
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
                    <FormLabel>Cupo Activo</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      El cupo estará disponible para reservas
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
                {loading ? "Creando..." : "Crear Cupo"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

