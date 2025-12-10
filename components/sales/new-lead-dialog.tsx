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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"

const leadSchema = z.object({
  agency_id: z.string().min(1, "La agencia es requerida"),
  source: z.enum(["Instagram", "WhatsApp", "Meta Ads", "Other"]),
  status: z.enum(["NEW", "IN_PROGRESS", "QUOTED", "WON", "LOST"]),
  region: z.enum(["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]),
  destination: z.string().min(1, "El destino es requerido"),
  contact_name: z.string().min(1, "El nombre de contacto es requerido"),
  contact_phone: z.string().min(1, "El teléfono es requerido"),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_instagram: z.string().optional(),
  assigned_seller_id: z.string().optional().nullable(),
  trello_list_id: z.string().optional().nullable(),
  notes: z.string().optional(),
  quoted_price: z.coerce.number().min(0).optional().nullable(),
  has_deposit: z.boolean().default(false),
  deposit_amount: z.coerce.number().min(0).optional().nullable(),
  deposit_currency: z.enum(["ARS", "USD"]).optional().nullable(),
  deposit_method: z.string().optional().nullable(),
  deposit_date: z.date().optional().nullable(),
})

type LeadFormValues = z.infer<typeof leadSchema>

interface NewLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  defaultAgencyId?: string
  defaultSellerId?: string
}

interface TrelloList {
  id: string
  name: string
}

export function NewLeadDialog({
  open,
  onOpenChange,
  onSuccess,
  agencies,
  sellers,
  defaultAgencyId,
  defaultSellerId,
}: NewLeadDialogProps) {
  const [loading, setLoading] = useState(false)
  const [trelloLists, setTrelloLists] = useState<TrelloList[]>([])
  const [loadingLists, setLoadingLists] = useState(false)

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema) as any,
    defaultValues: {
      agency_id: defaultAgencyId || "",
      source: "Other",
      status: "NEW",
      region: "ARGENTINA",
      destination: "",
      contact_name: "",
      contact_phone: "",
      contact_email: "",
      contact_instagram: "",
      assigned_seller_id: defaultSellerId || null,
      trello_list_id: null,
      notes: "",
      quoted_price: null,
      has_deposit: false,
      deposit_amount: null,
      deposit_currency: null,
      deposit_method: null,
      deposit_date: null,
    },
  })

  const watchedAgencyId = form.watch("agency_id")

  // Cargar listas de Trello cuando cambia la agencia seleccionada
  useEffect(() => {
    const fetchTrelloLists = async () => {
      if (!watchedAgencyId) {
        setTrelloLists([])
        form.setValue("trello_list_id", null)
        return
      }

      setLoadingLists(true)
      try {
        const response = await fetch(`/api/trello/lists?agencyId=${watchedAgencyId}`)
        const data = await response.json()
        
        if (data.lists && Array.isArray(data.lists)) {
          setTrelloLists(data.lists)
        } else {
          setTrelloLists([])
        }
      } catch (error) {
        console.error("Error fetching Trello lists:", error)
        setTrelloLists([])
      } finally {
        setLoadingLists(false)
      }
    }

    if (open && watchedAgencyId) {
      fetchTrelloLists()
    }
  }, [watchedAgencyId, open, form])

  const handleSubmit = async (values: LeadFormValues) => {
    setLoading(true)
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          contact_email: values.contact_email || null,
          contact_instagram: values.contact_instagram || null,
          assigned_seller_id: values.assigned_seller_id || null,
          trello_list_id: values.trello_list_id || null,
          notes: values.notes || null,
          quoted_price: values.quoted_price || null,
          has_deposit: values.has_deposit || false,
          deposit_amount: values.deposit_amount || null,
          deposit_currency: values.deposit_currency || null,
          deposit_method: values.deposit_method || null,
          deposit_date: values.deposit_date ? values.deposit_date.toISOString().split("T")[0] : null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al crear lead")
      }

      form.reset()
      onOpenChange(false)
      onSuccess()
    } catch (error: any) {
      console.error("Error creating lead:", error)
      alert(error.message || "Error al crear lead")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Lead</DialogTitle>
          <DialogDescription>Crear un nuevo lead manualmente</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="agency_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agencia *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origen</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Instagram">Instagram</SelectItem>
                        <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                        <SelectItem value="Meta Ads">Meta Ads</SelectItem>
                        <SelectItem value="Other">Otro</SelectItem>
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
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
                        <SelectItem value="OTROS">Otros</SelectItem>
                        <SelectItem value="CRUCEROS">Cruceros</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="destination"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destino *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Cancún, París, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Selector de Lista de Trello - Solo si hay listas disponibles */}
            {watchedAgencyId && trelloLists.length > 0 && (
              <FormField
                control={form.control}
                name="trello_list_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lista de Trello (Opcional)</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                      value={field.value || "none"}
                      disabled={loadingLists}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingLists ? "Cargando listas..." : "Sin lista de Trello"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin lista de Trello</SelectItem>
                        {trelloLists.map((list) => (
                          <SelectItem key={list.id} value={list.id}>
                            {list.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de Contacto *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre completo" {...field} />
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
                    <FormLabel>Teléfono *</FormLabel>
                    <FormControl>
                      <Input placeholder="+54 9 11 1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@ejemplo.com" {...field} />
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
                      <Input placeholder="@usuario" {...field} />
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
                    <Textarea placeholder="Notas adicionales sobre el lead..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-4">Información Contable</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="quoted_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio Cotizado</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="has_deposit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>¿Tiene depósito recibido?</FormLabel>
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <span className="text-sm text-muted-foreground">
                            {field.value ? "Sí" : "No"}
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {form.watch("has_deposit") && (
                <div className="grid gap-4 md:grid-cols-2 mt-4">
                  <FormField
                    control={form.control}
                    name="deposit_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monto del Depósito</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
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
                        <FormLabel>Moneda del Depósito</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar moneda" />
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

                  <FormField
                    control={form.control}
                    name="deposit_method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Método de Pago</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: Transferencia, Efectivo, etc." {...field} value={field.value || ""} />
                        </FormControl>
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
                                  !field.value && "text-muted-foreground",
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
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creando..." : "Crear Lead"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

