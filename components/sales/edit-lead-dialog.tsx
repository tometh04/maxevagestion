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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const leadSchema = z.object({
  agency_id: z.string().min(1, "La agencia es requerida"),
  source: z.enum(["Instagram", "WhatsApp", "Meta Ads", "Other", "Trello"]),
  status: z.enum(["NEW", "IN_PROGRESS", "QUOTED", "WON", "LOST"]),
  region: z.enum(["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]),
  destination: z.string().min(1, "El destino es requerido"),
  contact_name: z.string().min(1, "El nombre de contacto es requerido"),
  contact_phone: z.string().min(1, "El teléfono es requerido"),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_instagram: z.string().optional(),
  assigned_seller_id: z.string().optional().nullable().or(z.literal("none")),
  notes: z.string().optional(),
  quoted_price: z.coerce.number().min(0).optional().nullable(),
  has_deposit: z.boolean().default(false),
  deposit_amount: z.coerce.number().min(0).optional().nullable(),
  deposit_currency: z.enum(["ARS", "USD"]).optional().nullable().or(z.literal("none")),
  deposit_method: z.string().optional().nullable(),
  deposit_date: z.date().optional().nullable(),
  estimated_checkin_date: z.date().optional().nullable(),
  estimated_departure_date: z.date().optional().nullable(),
  follow_up_date: z.date().optional().nullable(),
})

type LeadFormValues = z.infer<typeof leadSchema>

interface Lead {
  id: string
  contact_name: string
  contact_phone: string
  contact_email: string | null
  contact_instagram: string | null
  destination: string
  region: string
  status: string
  source: string
  trello_url: string | null
  trello_list_id: string | null
  assigned_seller_id: string | null
  agency_id?: string
  notes: string | null
  quoted_price?: number | null
  has_deposit?: boolean
  deposit_amount?: number | null
  deposit_currency?: string | null
  deposit_method?: string | null
  deposit_date?: string | null
  estimated_checkin_date?: string | null
  estimated_departure_date?: string | null
  follow_up_date?: string | null
}

interface EditLeadDialogProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
}

export function EditLeadDialog({
  lead,
  open,
  onOpenChange,
  onSuccess,
  agencies,
  sellers,
}: EditLeadDialogProps) {
  const [loading, setLoading] = useState(false)
  const isFromTrello = lead ? (lead.source === "Trello" && lead.trello_url) : false

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema) as any,
    defaultValues: {
      agency_id: "",
      source: "Other",
      status: "NEW",
      region: "ARGENTINA",
      destination: "",
      contact_name: "",
      contact_phone: "",
      contact_email: "",
      contact_instagram: "",
      assigned_seller_id: "none",
      notes: "",
      quoted_price: null,
      has_deposit: false,
      deposit_amount: null,
      deposit_currency: null,
      deposit_method: null,
      deposit_date: null,
      estimated_checkin_date: null,
      estimated_departure_date: null,
      follow_up_date: null,
    },
  })

  useEffect(() => {
    if (lead && open) {
      try {
        // Validar que deposit_date sea una fecha válida antes de convertirla
        let depositDate: Date | null = null
        if (lead.deposit_date) {
          try {
            const depositDateValue = lead.deposit_date as any
            if (depositDateValue instanceof Date) {
              depositDate = depositDateValue
            } else if (typeof depositDateValue === 'string') {
              const parsed = new Date(depositDateValue)
              if (!isNaN(parsed.getTime())) {
                depositDate = parsed
              }
            }
          } catch (e) {
            console.warn("Invalid deposit_date:", lead.deposit_date)
          }
        }

        form.reset({
          agency_id: lead.agency_id || agencies[0]?.id || "",
          source: (lead.source as any) || "Other",
          status: (lead.status as any) || "NEW",
          region: (lead.region as any) || "ARGENTINA",
          destination: lead.destination || "",
          contact_name: lead.contact_name || "",
          contact_phone: lead.contact_phone || "",
          contact_email: lead.contact_email || "",
          contact_instagram: lead.contact_instagram || "",
          assigned_seller_id: lead.assigned_seller_id || "none",
          notes: lead.notes || "",
          quoted_price: lead.quoted_price ?? null,
          has_deposit: lead.has_deposit ?? false,
          deposit_amount: lead.deposit_amount ?? null,
          deposit_currency: (lead.deposit_currency as any) || "none",
          deposit_method: lead.deposit_method || null,
          deposit_date: depositDate,
          estimated_checkin_date: lead.estimated_checkin_date ? new Date(lead.estimated_checkin_date as string) : null,
          estimated_departure_date: lead.estimated_departure_date ? new Date(lead.estimated_departure_date as string) : null,
          follow_up_date: lead.follow_up_date ? new Date(lead.follow_up_date as string) : null,
        })
      } catch (error) {
        console.error("Error resetting form:", error)
        toast.error("Error al cargar los datos del lead")
      }
    }
  }, [lead, open, form])

  const handleSubmit = async (values: LeadFormValues) => {
    if (!lead) return

    setLoading(true)
    try {
      // Preparar datos para enviar
      let updateData: any = {
        ...values,
        assigned_seller_id: values.assigned_seller_id === "none" ? null : values.assigned_seller_id,
        deposit_currency: values.deposit_currency === "none" ? null : values.deposit_currency,
        deposit_date: values.deposit_date ? (values.deposit_date instanceof Date ? values.deposit_date.toISOString().split("T")[0] : values.deposit_date) : null,
        estimated_checkin_date: values.estimated_checkin_date ? (values.estimated_checkin_date instanceof Date ? values.estimated_checkin_date.toISOString().split("T")[0] : values.estimated_checkin_date) : null,
        estimated_departure_date: values.estimated_departure_date ? (values.estimated_departure_date instanceof Date ? values.estimated_departure_date.toISOString().split("T")[0] : values.estimated_departure_date) : null,
        follow_up_date: values.follow_up_date ? (values.follow_up_date instanceof Date ? values.follow_up_date.toISOString().split("T")[0] : values.follow_up_date) : null,
      }

      // Si es de Trello, solo enviar campos permitidos
      if (isFromTrello) {
        const allowedFields = ["assigned_seller_id", "notes", "quoted_price", "has_deposit", "deposit_amount", "deposit_currency", "deposit_method", "deposit_date"]
        const filteredData: any = {}
        for (const field of allowedFields) {
          if (updateData[field] !== undefined) {
            filteredData[field] = updateData[field]
          }
        }
        updateData = filteredData
      }

      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al actualizar lead")
      }

      toast.success("Lead actualizado correctamente")
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error("Error updating lead:", error)
      toast.error(error instanceof Error ? error.message : "Error al actualizar lead")
    } finally {
      setLoading(false)
    }
  }

  if (!lead) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lead</DialogTitle>
          <DialogDescription>
            {isFromTrello && (
              <span className="text-amber-600 dark:text-amber-400">
                ⚠️ Este lead está sincronizado con Trello. Solo puedes editar ciertos campos.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Información General */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Información General</CardTitle>
                <CardDescription>Datos básicos del lead y asignación</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="agency_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agencia</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!isFromTrello}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar agencia" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
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

                  <FormField
                    control={form.control}
                    name="source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Origen</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!isFromTrello}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar origen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Instagram">Instagram</SelectItem>
                            <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                            <SelectItem value="Meta Ads">Meta Ads</SelectItem>
                            <SelectItem value="Other">Otro</SelectItem>
                            <SelectItem value="Trello">Trello</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!isFromTrello}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar estado" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="NEW">Nuevo</SelectItem>
                            <SelectItem value="IN_PROGRESS">En Progreso</SelectItem>
                            <SelectItem value="QUOTED">Cotizado</SelectItem>
                            <SelectItem value="WON">Ganado</SelectItem>
                            <SelectItem value="LOST">Perdido</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="region"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Región</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!isFromTrello}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar región" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ARGENTINA">Argentina</SelectItem>
                            <SelectItem value="CARIBE">Caribe</SelectItem>
                            <SelectItem value="BRASIL">Brasil</SelectItem>
                            <SelectItem value="EUROPA">Europa</SelectItem>
                            <SelectItem value="EEUU">EEUU</SelectItem>
                            <SelectItem value="OTROS">Otros</SelectItem>
                            <SelectItem value="CRUCEROS">Cruceros</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="destination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destino</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: Cancún, México" {...field} disabled={!!isFromTrello} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="assigned_seller_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendedor Asignado</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Sin asignar" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Sin asignar</SelectItem>
                            {sellers.map((seller) => (
                              <SelectItem key={seller.id} value={seller.id}>
                                {seller.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Información de Contacto */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Información de Contacto</CardTitle>
                <CardDescription>Datos de contacto del cliente</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="contact_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de Contacto</FormLabel>
                        <FormControl>
                          <Input placeholder="Nombre completo" {...field} disabled={!!isFromTrello} />
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
                        <FormLabel>Teléfono</FormLabel>
                        <FormControl>
                          <Input placeholder="+54 11 1234-5678" {...field} disabled={!!isFromTrello} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contact_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="email@ejemplo.com" {...field} disabled={!!isFromTrello} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contact_instagram"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Instagram</FormLabel>
                        <FormControl>
                          <Input placeholder="@usuario" {...field} disabled={!!isFromTrello} />
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
                          placeholder="Información adicional sobre el lead..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Información Financiera */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Información Financiera</CardTitle>
                <CardDescription>Precios y depósitos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="quoted_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio Cotizado</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={form.control}
                  name="has_deposit"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-muted/50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base font-semibold">Tiene depósito recibido?</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Activa esta opción si el cliente ya realizó un depósito
                        </p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {form.watch("has_deposit") && (
                  <div className="space-y-4 pt-2">
                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="deposit_amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Monto del Depósito</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="0"
                                {...field}
                                value={field.value || ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="deposit_currency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Moneda</FormLabel>
                            <Select 
                              onValueChange={(value) => field.onChange(value === "none" ? null : value)} 
                              value={field.value || "none"}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">Seleccionar</SelectItem>
                                <SelectItem value="ARS">ARS</SelectItem>
                                <SelectItem value="USD">USD</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="deposit_date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Fecha del Depósito</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value || undefined}
                                  onSelect={field.onChange}
                                  disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="deposit_method"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Método de Pago</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: Transferencia, Efectivo, Mercado Pago, etc." {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fechas Importantes</CardTitle>
                <CardDescription>Fechas para recordatorios y seguimiento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="estimated_checkin_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fecha Estimada de Check-in</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="estimated_departure_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fecha Estimada de Salida</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="follow_up_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fecha de Seguimiento</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? format(field.value, "PPP", { locale: es }) : <span>Seleccionar</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

