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
import { DecimalInput } from "@/components/ui/decimal-input"
import { DestinationCombobox } from "@/components/ui/destination-combobox"
import { getLeadRegionForDestination } from "@/lib/destinations"
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
import { CalendarIcon, User, MapPin, UserCheck, StickyNote } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const REGION_TO_LIST: Record<string, string> = {
  ARGENTINA: "Leads - Argentina",
  CARIBE: "Leads - Caribe",
  BRASIL: "Leads - Brasil",
  EUROPA: "Leads - Europa",
  EEUU: "Leads - EEUU",
  OTROS: "Leads - Otros",
  CRUCEROS: "Leads - Exoticos",
}

const leadSchema = z.object({
  agency_id: z.string().min(1, "La agencia es requerida"),
  source: z.enum(["Manychat", "Instagram", "WhatsApp", "Meta Ads", "Referido", "Cliente", "Other"]),
  status: z.enum(["NEW", "IN_PROGRESS", "QUOTED", "WON", "LOST"]),
  region: z.enum(["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]),
  destination: z.string().min(1, "El destino es requerido"),
  contact_name: z.string().min(1, "El nombre de contacto es requerido"),
  contact_phone: z.string().min(1, "El teléfono es requerido"),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_instagram: z.string().optional(),
  assigned_seller_id: z.string().optional().nullable(),
  list_name: z.string().optional().nullable(),
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
  const [crmLists, setCrmLists] = useState<string[]>([])
  const [loadingLists, setLoadingLists] = useState(false)

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema) as any,
    defaultValues: {
      agency_id: defaultAgencyId || "",
      // Bug fix 2026-05-06: el default era "Manychat" pero este dialog es
      // para creación MANUAL del user. Marcar todos los manual como
      // "Manychat" rompe analytics/segmentación por canal. "Other" es la
      // fuente correcta — el user puede cambiarla si fue derivado, etc.
      source: "Other",
      status: "NEW",
      region: "ARGENTINA",
      destination: "",
      contact_name: "",
      contact_phone: "",
      contact_email: "",
      contact_instagram: "",
      assigned_seller_id: defaultSellerId || null,
      list_name: REGION_TO_LIST["ARGENTINA"],
      notes: "",
      quoted_price: null,
      has_deposit: false,
      deposit_amount: null,
      deposit_currency: null,
      deposit_method: null,
      deposit_date: null,
    },
  })

  // Bug fix 2026-05-20 (reportado por Martí Lozada vía WhatsApp):
  // Martí cargaba consultas desde el switcher "Rosario" pero los leads
  // quedaban en Madero. Causa: react-hook-form solo aplica `defaultValues`
  // al MONTAR el componente. Si el dialog se reabre con un `defaultAgencyId`
  // distinto al de la primera apertura (porque el user cambió el switcher
  // de agencia del header sin cerrar la página), el form sigue con el
  // valor viejo. Reset al abrir lo arregla.
  //
  // En el caso real: defaultAgencyId del server = agencyIds[0] = "Madero"
  // (primera alfabéticamente). El dialog se abría siempre con Madero
  // preseleccionada y Martí no se daba cuenta porque el campo "Agencia"
  // del form está abajo. 18 de 20 leads creados en una hora quedaron en
  // Madero por este motivo. Combinado con el banner visible (abajo), el
  // bug queda cerrado.
  useEffect(() => {
    if (open) {
      form.reset({
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
        list_name: REGION_TO_LIST["ARGENTINA"],
        notes: "",
        quoted_price: null,
        has_deposit: false,
        deposit_amount: null,
        deposit_currency: null,
        deposit_method: null,
        deposit_date: null,
      })
    }
    // form omitido a propósito de las deps: form.reset es estable de RHF
    // y agregarlo causa loops infinitos en algunas versiones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultAgencyId, defaultSellerId])

  const watchedAgencyId = form.watch("agency_id")
  const selectedAgencyName = agencies.find((a) => a.id === watchedAgencyId)?.name

  const watchedRegion = form.watch("region")
  const watchedDestination = form.watch("destination")

  // Auto-asignar región cuando cambia el destino
  useEffect(() => {
    if (watchedDestination) {
      const detectedRegion = getLeadRegionForDestination(watchedDestination)
      if (detectedRegion) {
        form.setValue("region", detectedRegion as any)
      }
    }
  }, [watchedDestination, form])

  // Auto-asignar lista cuando cambia la región.
  // Bug fix 2026-05-06: antes seteábamos siempre el nombre legacy
  // "Leads - Argentina" / "Leads - Caribe" / etc. Pero los tenants nuevos
  // (Test V7, Madero) tienen listas renombradas a "Argentina" / "Caribe"
  // sin prefijo. El form creaba leads con list_name="Leads - Argentina"
  // que no matcheaba ninguna columna del kanban → el lead aparecía en una
  // columna fantasma invisible y el user pensaba que se perdió.
  //
  // Fix: priorizar matches contra las listas EXISTENTES del tenant
  // (case-insensitive, comparando el nombre de la región contra el final
  // del nombre de la lista). Solo caer al fallback "Leads - X" si no hay
  // ninguna lista en el tenant que matchee.
  useEffect(() => {
    if (!watchedRegion) return
    const regionLower = watchedRegion.toLowerCase()
    // 1) buscar entre las listas existentes del tenant
    const existing = crmLists.find((listName) => {
      const ln = listName.toLowerCase().trim()
      return ln === regionLower || ln.endsWith(` ${regionLower}`) || ln.endsWith(`-${regionLower}`)
    })
    if (existing) {
      form.setValue("list_name", existing)
      return
    }
    // 2) fallback al nombre legacy si el tenant no tiene listas (o ninguna matchea)
    const defaultList = REGION_TO_LIST[watchedRegion]
    if (defaultList) {
      form.setValue("list_name", defaultList)
    }
  }, [watchedRegion, crmLists, form])

  // Cargar listas del CRM cuando cambia la agencia seleccionada
  useEffect(() => {
    const fetchCrmLists = async () => {
      if (!watchedAgencyId) {
        setCrmLists([])
        return
      }

      setLoadingLists(true)
      try {
        const response = await fetch(`/api/manychat/list-order?agencyId=${watchedAgencyId}`)
        const data = await response.json()

        if (data.listNames && Array.isArray(data.listNames) && data.listNames.length > 0) {
          // Antes filtrábamos por `name.startsWith("Leads - ")` para dejar
          // afuera listas legacy de Trello. En el SaaS multi-tenant cada
          // tenant nombra sus listas como quiera, así que ahora aceptamos
          // cualquiera. Si querés filtrar, hacelo por tabla (p.ej. no
          // mostrar listas con source = trello) no por prefijo de nombre.
          setCrmLists(data.listNames as string[])
        } else {
          setCrmLists([])
        }
      } catch (error) {
        console.error("Error fetching CRM lists:", error)
        setCrmLists([])
      } finally {
        setLoadingLists(false)
      }
    }

    if (open && watchedAgencyId) {
      fetchCrmLists()
    }
  }, [watchedAgencyId, open])

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
          list_name: values.list_name || null,
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
      toast.error(error.message || "Error al crear lead")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo Lead</DialogTitle>
          <DialogDescription>Crear un nuevo lead manualmente</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col overflow-hidden flex-1">
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
            {/* Banner agencia seleccionada
                Bug fix 2026-05-20: imposible no ver en qué agencia se está
                creando el lead. Si no hay agencia (caso "ALL" o empty),
                aparece en rojo pidiendo seleccionar abajo. */}
            {selectedAgencyName ? (
              <div className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span>
                  Creando lead en agencia: <strong>{selectedAgencyName}</strong>
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-destructive" />
                <span className="text-destructive">
                  No hay agencia seleccionada. Elegila en el campo "Agencia" más abajo.
                </span>
              </div>
            )}

            {/* Contacto */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground/70">Contacto</span>
              </div>
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
            </div>

            {/* Viaje */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-success" />
                <span className="text-xs font-medium text-foreground/70">Viaje</span>
              </div>
              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destino *</FormLabel>
                    <FormControl>
                      <DestinationCombobox
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Ej: Cancún, París, etc."
                      />
                    </FormControl>
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

            {/* Asignación */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-accent-violet" />
                <span className="text-xs font-medium text-foreground/70">Asignación</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
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

              {/* Selector de Lista del CRM */}
              {watchedAgencyId && (
                <FormField
                  control={form.control}
                  name="list_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lista del CRM</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || REGION_TO_LIST[watchedRegion] || "Leads - Otros"}
                        disabled={loadingLists}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={loadingLists ? "Cargando listas..." : "Seleccionar lista"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {crmLists.length > 0 ? (
                            crmLists.map((listName) => (
                              <SelectItem key={listName} value={listName}>
                                {listName}
                              </SelectItem>
                            ))
                          ) : (
                            // Nota (2026-04-20): antes había un fallback a
                            // Object.values(REGION_TO_LIST) que mostraba 7 listas
                            // hardcoded de Lozada (Argentina/Caribe/etc). En un
                            // SaaS multi-tenant esas listas no deben filtrarse
                            // al UI del resto de orgs. Si el tenant todavía no
                            // creó su lista, mostramos un placeholder claro.
                            <div className="px-3 py-4 text-xs text-muted-foreground">
                              Aún no creaste ninguna lista.<br />
                              Cerrá este diálogo y creá una lista desde el botón
                              “+ Nueva Lista” arriba a la derecha del CRM.
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Detalles */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5 text-accent-teal" />
                <span className="text-xs font-medium text-foreground/70">Detalles</span>
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
                        <SelectItem value="Manychat">Manychat</SelectItem>
                        <SelectItem value="Instagram">Instagram</SelectItem>
                        <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                        <SelectItem value="Meta Ads">Meta Ads</SelectItem>
                        <SelectItem value="Referido">Referido</SelectItem>
                        <SelectItem value="Cliente">Cliente</SelectItem>
                        <SelectItem value="Other">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5 text-accent-coral" />
                <span className="text-xs font-medium text-foreground/70">Información Contable</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="quoted_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio Cotizado</FormLabel>
                      <FormControl>
                        <DecimalInput
                          placeholder="0.00"
                          {...field}
                          value={field.value || ""}
                          onChange={(v) => field.onChange(v ? Number(v) : null)}
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
                          <DecimalInput
                            placeholder="0.00"
                            {...field}
                            value={field.value || ""}
                            onChange={(v) => field.onChange(v ? Number(v) : null)}
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

