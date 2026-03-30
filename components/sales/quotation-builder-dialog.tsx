"use client"

import { useState, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox"
import { Plus, Trash2, Loader2, Plane, Hotel, Bus, Shield, MapPin, Copy, Send, Globe, ListChecks, StickyNote, DollarSign } from "lucide-react"
import { toast } from "sonner"

interface QuotationBuilderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: {
    id: string
    contact_name: string
    contact_phone?: string | null
    contact_email?: string | null
    destination?: string | null
    region?: string | null
    agency_id?: string | null
  }
  operators?: Array<{ id: string; name: string }>
  onSuccess?: (quotation: any) => void
}

interface QuotationItem {
  id: string
  item_type: string
  description: string
  provider: string
  unit_price: number
  quantity: number
  cost_amount: number
  cost_currency: string
  operator_id: string | null
  generates_commission: boolean
  // Hotel
  hotel_name?: string
  hotel_stars?: number
  hotel_address?: string
  hotel_phone?: string
  room_type?: string
  meal_plan?: string
  checkin_date?: string
  checkout_date?: string
  nights?: number
  rooms?: number
  // Flight
  airline?: string
  flight_route?: string
  flight_date?: string
  flight_return_date?: string
  flight_stops?: number
  flight_class?: string
  // Transfer
  transfer_description?: string
}

interface QuotationOption {
  id: string
  title: string
  total_amount: number
  items: QuotationItem[]
}

const ITEM_TYPES = [
  { value: "FLIGHT", label: "Vuelo", icon: Plane },
  { value: "HOTEL", label: "Hotel", icon: Hotel },
  { value: "TRANSFER", label: "Traslado", icon: Bus },
  { value: "ASSISTANCE", label: "Asistencia", icon: Shield },
  { value: "EXCURSION", label: "Excursion", icon: MapPin },
  { value: "OTHER", label: "Otro", icon: MapPin },
]

const COMMISSION_TYPES = new Set(["HOTEL", "FLIGHT", "TRANSFER", "EXCURSION", "ASSISTANCE"])

const MEAL_PLANS = [
  { value: "SOLO_ALOJAMIENTO", label: "Solo alojamiento" },
  { value: "DESAYUNO", label: "Desayuno" },
  { value: "MEDIA_PENSION", label: "Media pension" },
  { value: "PENSION_COMPLETA", label: "Pension completa" },
  { value: "ALL_INCLUSIVE", label: "All Inclusive" },
]

const FLIGHT_CLASSES = [
  { value: "ECONOMY", label: "Economy" },
  { value: "PREMIUM_ECONOMY", label: "Premium Economy" },
  { value: "BUSINESS", label: "Business" },
  { value: "FIRST", label: "First Class" },
]

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function createEmptyItem(type: string = "FLIGHT"): QuotationItem {
  return {
    id: generateId(),
    item_type: type,
    description: "",
    provider: "",
    unit_price: 0,
    quantity: 1,
    cost_amount: 0,
    cost_currency: "USD",
    operator_id: null,
    generates_commission: COMMISSION_TYPES.has(type),
  }
}

function createEmptyOption(number: number): QuotationOption {
  return {
    id: generateId(),
    title: `Opcion ${number}`,
    total_amount: 0,
    items: [createEmptyItem("FLIGHT")],
  }
}

// --- Search functions ---
async function searchAirports(query: string): Promise<ComboboxOption[]> {
  if (!query || query.length < 2) return []
  const options: ComboboxOption[] = [
    { value: query, label: query, subtitle: "Usar texto libre" },
  ]
  try {
    const res = await fetch(`/api/airports?q=${encodeURIComponent(query)}`)
    if (res.ok) {
      const data: Array<{ code: string; name: string; city: string; country: string }> = await res.json()
      for (const airport of data) {
        options.push({
          value: airport.city,
          label: `${airport.code} — ${airport.city}`,
          subtitle: `${airport.name}, ${airport.country}`,
        })
      }
    }
  } catch {
    // silencioso
  }
  return options
}

export function QuotationBuilderDialog({ open, onOpenChange, lead, operators = [], onSuccess }: QuotationBuilderProps) {
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  // General data
  const [destination, setDestination] = useState(lead.destination || "")
  const [origin, setOrigin] = useState("")
  const [region, setRegion] = useState(lead.region || "OTROS")
  const [departureDate, setDepartureDate] = useState("")
  const [returnDate, setReturnDate] = useState("")
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [currency, setCurrency] = useState("USD")
  const [notes, setNotes] = useState("")

  // Options
  const [options, setOptions] = useState<QuotationOption[]>([createEmptyOption(1)])

  // --- Hotel search by destination (base local, sin API externa) ---
  const searchHotels = useCallback(async (query: string): Promise<ComboboxOption[]> => {
    const options: ComboboxOption[] = []
    // Si hay query, agregar opcion de texto libre
    if (query && query.length >= 1) {
      options.push({ value: query, label: query, subtitle: "Escribir nombre manualmente" })
    }
    try {
      const params = new URLSearchParams()
      if (query) params.set("q", query)
      if (destination) params.set("destination", destination)
      params.set("limit", "15")
      const res = await fetch(`/api/hotels/search?${params.toString()}`)
      if (res.ok) {
        const hotels: Array<{ name: string; stars: number; city: string; country: string; zone: string | null }> = await res.json()
        for (const hotel of hotels) {
          const stars = hotel.stars ? "★".repeat(hotel.stars) : ""
          options.push({
            value: hotel.name,
            label: hotel.name,
            subtitle: `${stars} ${hotel.city}${hotel.zone ? ` · ${hotel.zone}` : ""}, ${hotel.country}`,
          })
        }
      }
    } catch {
      // silencioso — el input manual sigue funcionando
    }
    return options
  }, [destination])

  // --- Option management ---
  function addOption() {
    if (options.length >= 4) {
      toast.error("Maximo 4 opciones por cotizacion")
      return
    }
    setOptions([...options, createEmptyOption(options.length + 1)])
  }

  function removeOption(optionId: string) {
    if (options.length <= 1) {
      toast.error("Debe haber al menos una opcion")
      return
    }
    setOptions(options.filter((o) => o.id !== optionId))
  }

  function duplicateOption(optionId: string) {
    if (options.length >= 4) {
      toast.error("Maximo 4 opciones")
      return
    }
    const source = options.find((o) => o.id === optionId)
    if (!source) return
    const newOption: QuotationOption = {
      id: generateId(),
      title: `${source.title} (copia)`,
      total_amount: source.total_amount,
      items: source.items.map((item) => ({ ...item, id: generateId() })),
    }
    setOptions([...options, newOption])
  }

  function updateOption(optionId: string, field: string, value: any) {
    setOptions(options.map((o) => (o.id === optionId ? { ...o, [field]: value } : o)))
  }

  // --- Item management ---
  function addItem(optionId: string, type: string = "FLIGHT") {
    setOptions(
      options.map((o) =>
        o.id === optionId ? { ...o, items: [...o.items, createEmptyItem(type)] } : o
      )
    )
  }

  function removeItem(optionId: string, itemId: string) {
    setOptions(
      options.map((o) =>
        o.id === optionId ? { ...o, items: o.items.filter((i) => i.id !== itemId) } : o
      )
    )
  }

  function updateItem(optionId: string, itemId: string, field: string, value: any) {
    setOptions(
      options.map((o) =>
        o.id === optionId
          ? {
              ...o,
              items: o.items.map((i) => {
                if (i.id !== itemId) return i
                const updated = { ...i, [field]: value }
                if (field === "item_type") {
                  updated.generates_commission = COMMISSION_TYPES.has(value)
                }
                return updated
              }),
            }
          : o
      )
    )
  }

  // --- Calculated totals per option ---
  function getOptionCostTotal(opt: QuotationOption) {
    return opt.items.reduce((sum, i) => sum + (i.cost_amount || 0) * (i.quantity || 1), 0)
  }
  function getOptionSaleTotal(opt: QuotationOption) {
    return opt.items.reduce((sum, i) => sum + (i.unit_price || 0) * (i.quantity || 1), 0)
  }

  // --- Save ---
  async function handleSave(andSend: boolean = false) {
    if (!destination.trim()) {
      toast.error("El destino es requerido")
      return
    }
    if (!departureDate) {
      toast.error("La fecha de salida es requerida")
      return
    }
    for (const opt of options) {
      if (!opt.total_amount || opt.total_amount <= 0) {
        toast.error(`"${opt.title}" necesita un precio total`)
        return
      }
      if (opt.items.length === 0) {
        toast.error(`"${opt.title}" necesita al menos un servicio`)
        return
      }
      for (const item of opt.items) {
        if (!item.description.trim()) {
          toast.error(`Completa la descripcion de todos los servicios en "${opt.title}"`)
          return
        }
      }
    }

    setSaving(true)
    if (andSend) setSending(true)

    try {
      const payload = {
        lead_id: lead.id,
        agency_id: lead.agency_id,
        destination,
        origin: origin || null,
        region,
        departure_date: departureDate,
        return_date: returnDate || null,
        adults,
        children,
        infants,
        currency,
        notes: notes || null,
        options: options.map((opt) => ({
          title: opt.title,
          total_amount: opt.total_amount,
          items: opt.items.map((item) => ({
            item_type: item.item_type,
            description: item.description,
            unit_price: item.unit_price,
            sale_amount: item.unit_price,
            subtotal: item.unit_price * item.quantity,
            quantity: item.quantity,
            cost_amount: item.cost_amount || 0,
            cost_currency: item.cost_currency || currency,
            operator_id: item.operator_id || null,
            generates_commission: item.generates_commission || false,
            provider: item.provider || null,
            hotel_name: item.hotel_name || null,
            hotel_stars: item.hotel_stars || null,
            hotel_address: item.hotel_address || null,
            hotel_phone: item.hotel_phone || null,
            room_type: item.room_type || null,
            meal_plan: item.meal_plan || null,
            checkin_date: item.checkin_date || null,
            checkout_date: item.checkout_date || null,
            nights: item.nights || null,
            rooms: item.rooms || 1,
            airline: item.airline || null,
            flight_route: item.flight_route || null,
            flight_date: item.flight_date || null,
            flight_return_date: item.flight_return_date || null,
            flight_stops: item.flight_stops ?? 0,
            flight_class: item.flight_class || null,
            transfer_description: item.transfer_description || null,
          })),
        })),
      }

      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Error al crear cotizacion")
      }

      const { data: quotation } = await res.json()

      if (andSend && quotation) {
        await fetch(`/api/quotations/${quotation.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "SENT" }),
        })

        const publicUrl = `${window.location.origin}/cotizacion/${quotation.public_token}`
        const phone = lead.contact_phone?.replace(/[\s\-\(\)]/g, "") || ""
        const cleanPhone = phone.startsWith("+") ? phone.substring(1) : phone
        const message = encodeURIComponent(
          `Hola ${lead.contact_name}! Te paso tu cotizacion para ${destination}:\n\n${publicUrl}\n\nQuedo a disposicion por cualquier consulta.`
        )
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank")

        toast.success("Cotizacion creada y enviada")
      } else {
        toast.success("Cotizacion guardada como borrador")
      }

      onSuccess?.(quotation)
      onOpenChange(false)
    } catch (error: any) {
      toast.error(error.message || "Error al guardar cotizacion")
    } finally {
      setSaving(false)
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0">
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-2">
            <FileIcon className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Nueva Cotizacion — {lead.contact_name}</h2>
          </div>
        </div>

        <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">
          {/* Datos generales */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-blue-500/10">
                <Globe className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Datos del viaje</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Destino *</Label>
                <SearchableCombobox
                  value={destination}
                  onChange={setDestination}
                  placeholder="Buscar destino..."
                  searchPlaceholder="Escribi el destino..."
                  emptyMessage="No se encontraron resultados"
                  initialLabel={destination}
                  searchFn={searchAirports}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Origen</Label>
                <SearchableCombobox
                  value={origin}
                  onChange={setOrigin}
                  placeholder="Ciudad de origen..."
                  searchPlaceholder="Buscar ciudad..."
                  emptyMessage="No se encontraron resultados"
                  initialLabel={origin}
                  searchFn={searchAirports}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Region</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Salida *</Label>
                <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Regreso</Label>
                <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Adultos</Label>
                <Input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Menores</Label>
                <Input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ARS">ARS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Options */}
          {options.map((option, optIndex) => {
            const costTotal = getOptionCostTotal(option)
            const saleTotal = getOptionSaleTotal(option)
            const margin = (option.total_amount || 0) - costTotal

            return (
              <div key={option.id} className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-orange-500/10">
                    <ListChecks className="h-3.5 w-3.5 text-orange-500" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Opcion {optIndex + 1}</h4>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                      Opcion {optIndex + 1}
                    </Badge>
                    <Input
                      value={option.title}
                      onChange={(e) => updateOption(option.id, "title", e.target.value)}
                      className="h-7 w-48 text-sm"
                      placeholder="Nombre de la opcion"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => duplicateOption(option.id)} title="Duplicar opcion">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {options.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeOption(option.id)} className="text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Items */}
                  {option.items.map((item, itemIndex) => {
                    const itemMargin = (item.unit_price || 0) - (item.cost_amount || 0)
                    const typeConfig = ITEM_TYPES.find(t => t.value === item.item_type)
                    const TypeIcon = typeConfig?.icon || MapPin

                    return (
                      <div key={item.id} className="border rounded-lg p-3 space-y-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <Select
                              value={item.item_type}
                              onValueChange={(v) => updateItem(option.id, item.id, "item_type", v)}
                            >
                              <SelectTrigger className="h-7 w-36 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ITEM_TYPES.map((t) => (
                                  <SelectItem key={t.value} value={t.value}>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">#{itemIndex + 1}</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeItem(option.id, item.id)} className="text-destructive h-6 w-6 p-0">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Common fields */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Descripcion *</Label>
                            <Input
                              value={item.description}
                              onChange={(e) => updateItem(option.id, item.id, "description", e.target.value)}
                              placeholder="Ej: Vuelo directo Buenos Aires - Miami"
                              className="text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Operador</Label>
                            {operators.length > 0 ? (
                              <Select
                                value={item.operator_id || ""}
                                onValueChange={(v) => updateItem(option.id, item.id, "operator_id", v || null)}
                              >
                                <SelectTrigger className="text-sm"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent>
                                  {operators.map((op) => (
                                    <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={item.provider}
                                onChange={(e) => updateItem(option.id, item.id, "provider", e.target.value)}
                                placeholder="Ej: Aerolineas, Hyatt..."
                                className="text-sm"
                              />
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Cantidad</Label>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateItem(option.id, item.id, "quantity", Number(e.target.value))}
                              className="text-sm"
                            />
                          </div>
                        </div>

                        {/* Pricing row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-blue-600">Precio venta</Label>
                            <div className="relative">
                              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.unit_price || ""}
                                onChange={(e) => updateItem(option.id, item.id, "unit_price", Number(e.target.value))}
                                placeholder="0.00"
                                className="text-sm font-mono pl-7"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-orange-600">Costo operador</Label>
                            <div className="relative">
                              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.cost_amount || ""}
                                onChange={(e) => updateItem(option.id, item.id, "cost_amount", Number(e.target.value))}
                                placeholder="0.00"
                                className="text-sm font-mono pl-7"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Moneda costo</Label>
                            <Select
                              value={item.cost_currency || "USD"}
                              onValueChange={(v) => updateItem(option.id, item.id, "cost_currency", v)}
                            >
                              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="ARS">ARS</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end pb-1.5">
                            {item.unit_price > 0 && (
                              <div className="rounded-md bg-muted/50 px-2 py-1 text-xs">
                                <span className="text-muted-foreground">Margen: </span>
                                <span className={`font-mono font-semibold ${itemMargin >= 0 ? "text-green-600" : "text-red-500"}`}>
                                  {currency} {itemMargin.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Hotel-specific fields */}
                        {(item.item_type === "HOTEL" || item.item_type === "ACCOMMODATION") && (
                          <div className="rounded-md border border-border/30 bg-background/50 p-3 space-y-3">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Datos del hotel</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">Hotel</Label>
                                <SearchableCombobox
                                  value={item.hotel_name || ""}
                                  onChange={(v) => updateItem(option.id, item.id, "hotel_name", v)}
                                  placeholder="Buscar hotel..."
                                  searchPlaceholder="Escribi el nombre del hotel..."
                                  emptyMessage="No se encontraron hoteles"
                                  initialLabel={item.hotel_name || ""}
                                  searchFn={searchHotels}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Estrellas</Label>
                                <Select
                                  value={String(item.hotel_stars || "")}
                                  onValueChange={(v) => updateItem(option.id, item.id, "hotel_stars", Number(v))}
                                >
                                  <SelectTrigger className="text-sm"><SelectValue placeholder="--" /></SelectTrigger>
                                  <SelectContent>
                                    {[1, 2, 3, 4, 5].map((s) => (
                                      <SelectItem key={s} value={String(s)}>{s} estrellas</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Habitacion</Label>
                                <Input
                                  value={item.room_type || ""}
                                  onChange={(e) => updateItem(option.id, item.id, "room_type", e.target.value)}
                                  placeholder="Doble, Suite..."
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Regimen</Label>
                                <Select
                                  value={item.meal_plan || ""}
                                  onValueChange={(v) => updateItem(option.id, item.id, "meal_plan", v)}
                                >
                                  <SelectTrigger className="text-sm"><SelectValue placeholder="--" /></SelectTrigger>
                                  <SelectContent>
                                    {MEAL_PLANS.map((mp) => (
                                      <SelectItem key={mp.value} value={mp.value}>{mp.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Check-in</Label>
                                <Input type="date" value={item.checkin_date || ""} onChange={(e) => updateItem(option.id, item.id, "checkin_date", e.target.value)} className="text-sm" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Check-out</Label>
                                <Input type="date" value={item.checkout_date || ""} onChange={(e) => updateItem(option.id, item.id, "checkout_date", e.target.value)} className="text-sm" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Noches</Label>
                                <Input type="number" min={1} value={item.nights || ""} onChange={(e) => updateItem(option.id, item.id, "nights", Number(e.target.value))} className="text-sm" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Habitaciones</Label>
                                <Input type="number" min={1} value={item.rooms || 1} onChange={(e) => updateItem(option.id, item.id, "rooms", Number(e.target.value))} className="text-sm" />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Flight-specific fields */}
                        {item.item_type === "FLIGHT" && (
                          <div className="rounded-md border border-border/30 bg-background/50 p-3 space-y-3">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Datos del vuelo</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Aerolinea</Label>
                                <Input
                                  value={item.airline || ""}
                                  onChange={(e) => updateItem(option.id, item.id, "airline", e.target.value)}
                                  placeholder="Ej: Aerolineas Argentinas"
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Ruta</Label>
                                <Input
                                  value={item.flight_route || ""}
                                  onChange={(e) => updateItem(option.id, item.id, "flight_route", e.target.value)}
                                  placeholder="Ej: EZE - MIA"
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Clase</Label>
                                <Select
                                  value={item.flight_class || ""}
                                  onValueChange={(v) => updateItem(option.id, item.id, "flight_class", v)}
                                >
                                  <SelectTrigger className="text-sm"><SelectValue placeholder="--" /></SelectTrigger>
                                  <SelectContent>
                                    {FLIGHT_CLASSES.map((fc) => (
                                      <SelectItem key={fc.value} value={fc.value}>{fc.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Escalas</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.flight_stops ?? 0}
                                  onChange={(e) => updateItem(option.id, item.id, "flight_stops", Number(e.target.value))}
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Fecha ida</Label>
                                <Input type="date" value={item.flight_date || ""} onChange={(e) => updateItem(option.id, item.id, "flight_date", e.target.value)} className="text-sm" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Fecha vuelta</Label>
                                <Input type="date" value={item.flight_return_date || ""} onChange={(e) => updateItem(option.id, item.id, "flight_return_date", e.target.value)} className="text-sm" />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Transfer-specific fields */}
                        {item.item_type === "TRANSFER" && (
                          <div className="rounded-md border border-border/30 bg-background/50 p-3 space-y-3">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Datos del traslado</p>
                            <div className="space-y-1">
                              <Label className="text-xs">Detalle</Label>
                              <Input
                                value={item.transfer_description || ""}
                                onChange={(e) => updateItem(option.id, item.id, "transfer_description", e.target.value)}
                                placeholder="Ej: Aeropuerto - Hotel, privado"
                                className="text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Add item buttons */}
                  <div className="flex flex-wrap gap-1">
                    {ITEM_TYPES.map((t) => {
                      const Icon = t.icon
                      return (
                        <Button
                          key={t.value}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => addItem(option.id, t.value)}
                        >
                          <Plus className="h-3 w-3" />
                          <Icon className="h-3 w-3" />
                          {t.label}
                        </Button>
                      )
                    })}
                  </div>
                </div>

                {/* Option footer — totals */}
                <div className="rounded-lg border border-border/50 bg-background p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Suma precios individuales</span>
                    <span className="font-mono">{currency} {saleTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Costo total operadores</span>
                    <span className="font-mono">{currency} {costTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Precio final al cliente</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">{currency}</span>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={option.total_amount || ""}
                        onChange={(e) => updateOption(option.id, "total_amount", Number(e.target.value))}
                        className="w-36 text-right font-mono font-semibold text-base"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  {option.total_amount > 0 && (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-muted-foreground">Margen estimado</span>
                      <span className={`font-mono font-semibold ${margin >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {currency} {margin.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        {option.total_amount > 0 && (
                          <span className="ml-1 text-muted-foreground">
                            ({((margin / option.total_amount) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Add option button */}
          {options.length < 4 && (
            <Button variant="outline" onClick={addOption} className="w-full border-dashed">
              <Plus className="h-4 w-4 mr-2" />
              Agregar otra opcion
            </Button>
          )}

          {/* Notes */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-violet-500/10">
                <StickyNote className="h-3.5 w-3.5 text-violet-500" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Notas internas</h4>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">No se muestran al cliente</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas internas sobre esta cotizacion..."
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="border-t bg-background px-6 py-4 flex flex-col sm:flex-row gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
            {saving && !sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Guardar borrador
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving} className="bg-green-600 hover:bg-green-700">
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Guardar y enviar por WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  )
}
