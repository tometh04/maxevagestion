"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { FileText, CheckCircle, XCircle, Globe, Building2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DatePicker } from "@/components/ui/date-picker"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const tariffTypeLabels: Record<string, string> = {
  ACCOMMODATION: "Alojamiento",
  FLIGHT: "Vuelo",
  PACKAGE: "Paquete",
  TRANSFER: "Traslado",
  ACTIVITY: "Actividad",
  CRUISE: "Crucero",
  OTHER: "Otro",
}

const regionColors: Record<string, string> = {
  ARGENTINA: "bg-blue-500",
  CARIBE: "bg-cyan-500",
  BRASIL: "bg-amber-500",
  EUROPA: "bg-purple-500",
  EEUU: "bg-red-500",
  OTROS: "bg-gray-500",
  CRUCEROS: "bg-orange-500",
}

interface Tariff {
  id: string
  name: string
  description: string | null
  destination: string
  region: string
  valid_from: string
  valid_to: string
  tariff_type: string
  currency: string
  is_active: boolean
  operator_id: string
  agency_id: string | null
  notes: string | null
  terms_and_conditions: string | null
  created_at: string
  operators?: { name: string } | null
  agencies?: { name: string } | null
  created_by_user?: { name: string } | null
}

interface TariffDetailDialogProps {
  tariff: Tariff
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefresh?: () => void
  operators: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
}

const tariffEditSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional().nullable(),
  destination: z.string().min(1, "El destino es requerido"),
  region: z.enum(["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]),
  valid_from: z.string().min(1, "La fecha de inicio es requerida"),
  valid_to: z.string().min(1, "La fecha de fin es requerida"),
  tariff_type: z.enum(["ACCOMMODATION", "FLIGHT", "PACKAGE", "TRANSFER", "ACTIVITY", "CRUISE", "OTHER"]),
  currency: z.enum(["ARS", "USD"]),
  is_active: z.boolean(),
  notes: z.string().optional().nullable(),
  terms_and_conditions: z.string().optional().nullable(),
})

type TariffEditFormValues = z.infer<typeof tariffEditSchema>

export function TariffDetailDialog({
  tariff,
  open,
  onOpenChange,
  onRefresh,
  operators,
  agencies,
}: TariffDetailDialogProps) {
  const [tariffData, setTariffData] = useState<Tariff | null>(tariff)
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const form = useForm<TariffEditFormValues>({
    resolver: zodResolver(tariffEditSchema) as any,
    defaultValues: {
      name: tariff.name,
      description: tariff.description || "",
      destination: tariff.destination,
      region: tariff.region as any,
      valid_from: tariff.valid_from,
      valid_to: tariff.valid_to,
      tariff_type: tariff.tariff_type as any,
      currency: tariff.currency as any,
      is_active: tariff.is_active,
      notes: tariff.notes || "",
      terms_and_conditions: tariff.terms_and_conditions || "",
    },
  })

  useEffect(() => {
    if (open && tariff.id) {
      fetchTariffDetails()
    }
  }, [open, tariff.id])

  useEffect(() => {
    if (tariffData) {
      form.reset({
        name: tariffData.name,
        description: tariffData.description || "",
        destination: tariffData.destination,
        region: tariffData.region as any,
        valid_from: tariffData.valid_from,
        valid_to: tariffData.valid_to,
        tariff_type: tariffData.tariff_type as any,
        currency: tariffData.currency as any,
        is_active: tariffData.is_active,
        notes: tariffData.notes || "",
        terms_and_conditions: tariffData.terms_and_conditions || "",
      })
    }
  }, [tariffData, form])

  const fetchTariffDetails = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tariffs/${tariff.id}`)
      if (response.ok) {
        const data = await response.json()
        setTariffData(data.tariff)
      }
    } catch (error) {
      console.error("Error fetching tariff details:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (values: TariffEditFormValues) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tariffs/${tariff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al actualizar tarifario")
      }

      setIsEditing(false)
      onRefresh?.()
      fetchTariffDetails()
    } catch (error: any) {
      console.error("Error updating tariff:", error)
      alert(error.message || "Error al actualizar tarifario")
    } finally {
      setLoading(false)
    }
  }

  if (!tariffData) {
    return null
  }

  const StatusIcon = tariffData.is_active ? CheckCircle : XCircle

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tariffData.name}
            <Badge
              variant={tariffData.is_active ? "default" : "secondary"}
              className="ml-2"
            >
              <StatusIcon className="mr-1 h-3 w-3" />
              {tariffData.is_active ? "Activo" : "Inactivo"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Detalles del tarifario
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Detalles</TabsTrigger>
            <TabsTrigger value="edit">Editar</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Operador</p>
                <p className="text-sm">{tariffData.operators?.name || "-"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Sucursal</p>
                <p className="text-sm flex items-center gap-1">
                  {tariffData.agency_id ? (
                    <>
                      <Building2 className="h-4 w-4" />
                      {tariffData.agencies?.name || "-"}
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4" />
                      Global (todas las sucursales)
                    </>
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Destino</p>
                <p className="text-sm">{tariffData.destination}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Región</p>
                <Badge
                  variant="outline"
                  className={
                    regionColors[tariffData.region]
                      ? `${regionColors[tariffData.region]} text-white`
                      : ""
                  }
                >
                  {tariffData.region}
                </Badge>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                <Badge variant="secondary">
                  {tariffTypeLabels[tariffData.tariff_type] || tariffData.tariff_type}
                </Badge>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Moneda</p>
                <p className="text-sm">{tariffData.currency}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Válido desde</p>
                <p className="text-sm">
                  {format(new Date(tariffData.valid_from), "PPP", { locale: es })}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Válido hasta</p>
                <p className="text-sm">
                  {format(new Date(tariffData.valid_to), "PPP", { locale: es })}
                </p>
              </div>
            </div>

            {tariffData.description && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Descripción</p>
                  <p className="text-sm whitespace-pre-wrap">{tariffData.description}</p>
                </div>
              </>
            )}

            {tariffData.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Notas Internas</p>
                  <p className="text-sm whitespace-pre-wrap">{tariffData.notes}</p>
                </div>
              </>
            )}

            {tariffData.terms_and_conditions && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Términos y Condiciones</p>
                  <p className="text-sm whitespace-pre-wrap">{tariffData.terms_and_conditions}</p>
                </div>
              </>
            )}

            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Creado por</p>
              <p className="text-sm">{tariffData.created_by_user?.name || "-"}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(tariffData.created_at), "PPP 'a las' HH:mm", { locale: es })}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="edit">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleUpdate)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del Tarifario *</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                          <Input {...field} />
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
                        <FormLabel>Tipo *</FormLabel>
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
                        <Textarea {...field} value={field.value || ""} rows={3} />
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
                        <Textarea {...field} value={field.value || ""} rows={3} />
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
                        <Textarea {...field} value={field.value || ""} rows={4} />
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
                    onClick={() => setIsEditing(false)}
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Guardando..." : "Guardar Cambios"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

