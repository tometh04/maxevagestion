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

// Esquema base para leads normales
const baseLeadSchema = z.object({
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
  deposit_account_id: z.string().optional().nullable().or(z.literal("none")),
  estimated_checkin_date: z.date().optional().nullable(),
  estimated_departure_date: z.date().optional().nullable(),
  follow_up_date: z.date().optional().nullable(),
})

// Esquema para leads de Trello (campos de contacto opcionales porque vienen de Trello)
const trelloLeadSchema = z.object({
  agency_id: z.string().optional(),
  source: z.enum(["Instagram", "WhatsApp", "Meta Ads", "Other", "Trello"]).optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "QUOTED", "WON", "LOST"]).optional(),
  region: z.enum(["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]).optional(),
  destination: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(), // No requerido para Trello
  contact_email: z.string().optional(),
  contact_instagram: z.string().optional(),
  assigned_seller_id: z.string().optional().nullable().or(z.literal("none")),
  notes: z.string().optional(),
  quoted_price: z.coerce.number().min(0).optional().nullable(),
  has_deposit: z.boolean().default(false),
  deposit_amount: z.coerce.number().min(0).optional().nullable(),
  deposit_currency: z.enum(["ARS", "USD"]).optional().nullable().or(z.literal("none")),
  deposit_method: z.string().optional().nullable(),
  deposit_date: z.date().optional().nullable(),
  deposit_account_id: z.string().optional().nullable().or(z.literal("none")),
  estimated_checkin_date: z.date().optional().nullable(),
  estimated_departure_date: z.date().optional().nullable(),
  follow_up_date: z.date().optional().nullable(),
})

const leadSchema = baseLeadSchema

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
  external_id?: string | null
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
  deposit_account_id?: string | null
  estimated_checkin_date?: string | null
  estimated_departure_date?: string | null
  follow_up_date?: string | null
}

interface FinancialAccount {
  id: string
  name: string
  currency: string
  type: string
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
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  // Solo bloquear edición si el lead está sincronizado activamente con Trello (tiene external_id)
  // Los leads de Manychat que crean tarjetas pero no están sincronizados pueden editarse completamente
  const isSyncedWithTrello = lead ? (lead.source === "Trello" && lead.external_id && lead.trello_url) : false

  // Cargar cuentas financieras
  useEffect(() => {
    async function loadAccounts() {
      try {
        const response = await fetch("/api/cash/accounts")
        if (response.ok) {
          const data = await response.json()
          setFinancialAccounts(data.accounts || [])
        }
      } catch (error) {
        console.error("Error loading financial accounts:", error)
      }
    }
    if (open) {
      loadAccounts()
    }
  }, [open])

  // Usar el esquema de Trello solo si está sincronizado con Trello
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(isSyncedWithTrello ? trelloLeadSchema : leadSchema) as any,
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
      deposit_account_id: null,
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
          deposit_account_id: lead.deposit_account_id || "none",
          estimated_checkin_date: lead.estimated_checkin_date ? new Date(lead.estimated_checkin_date as string) : null,
          estimated_departure_date: lead.estimated_departure_date ? new Date(lead.estimated_departure_date as string) : null,
          follow_up_date: lead.follow_up_date ? new Date(lead.follow_up_date as string) : null,
        })
      } catch (error) {
        console.error("Error resetting form:", error)
        toast.error("Error al cargar los datos del lead")
      }
    }
  }, [lead, open, form, agencies])

  const handleSubmit = async (values: LeadFormValues) => {
    if (!lead) return

    setLoading(true)
    try {
      // Preparar datos para enviar
      let updateData: any = {
        ...values,
        assigned_seller_id: values.assigned_seller_id === "none" ? null : values.assigned_seller_id,
      }

      // Si está sincronizado con Trello, solo enviar campos permitidos
      if (isSyncedWithTrello) {
        const allowedFields = ["assigned_seller_id", "notes"]
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
            {isSyncedWithTrello && (
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
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!isSyncedWithTrello}>
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
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!isSyncedWithTrello}>
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
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!isSyncedWithTrello}>
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
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!!isSyncedWithTrello}>
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
                          <Input placeholder="Ej: Cancún, México" {...field} disabled={!!isSyncedWithTrello} />
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
                          <Input placeholder="Nombre completo" {...field} disabled={!!isSyncedWithTrello} />
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
                          <Input placeholder="+54 11 1234-5678" {...field} disabled={!!isSyncedWithTrello} />
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
                          <Input type="email" placeholder="email@ejemplo.com" {...field} disabled={!!isSyncedWithTrello} />
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
                          <Input placeholder="@usuario" {...field} disabled={!!isSyncedWithTrello} />
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

