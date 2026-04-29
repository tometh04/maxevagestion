"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SearchableCombobox, type ComboboxOption } from "@/components/ui/searchable-combobox"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { Plus, Trash2, Loader2, Plane, Hotel, Bus, Shield, MapPin, Copy, Send, Globe, ListChecks, StickyNote, DollarSign, Eye, Upload, Image, X, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import {
  formatQuotationCurrency,
  getQuotationOptionPricing,
  normalizeQuotationPricingMode,
  type QuotationPricingMode,
} from "@/lib/quotations/presentation"
import {
  getQuotationOptionCalculatedTotal,
  getQuotationOptionCostTotal,
  normalizeManualQuotationTotal,
  roundQuotationMoney,
} from "@/lib/quotations/totals"

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
  operators?: Array<{ id: string; name: string; admin_fee_percentage?: number | null }>
  onSuccess?: (quotation: any) => void
  /** If set, loads and edits an existing quotation instead of creating new */
  existingQuotationId?: string | null
}

interface StopoverInfo {
  city: string
  wait_time: string // e.g. "2h 30m"
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
  admin_fee_percentage: number
  operator_id: string | null
  generates_commission: boolean
  // Hotel
  destination_city?: string
  hotel_name?: string
  hotel_stars?: number
  hotel_address?: string
  hotel_phone?: string
  hotel_photo_url?: string
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
  flight_screenshot_url?: string
  stopovers?: StopoverInfo[]
  // Transfer
  transfer_description?: string
}

interface QuotationOption {
  id: string
  title: string
  total_amount: number
  calculated_total_amount: number
  manual_total_amount: number | null
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

const PRICING_MODES: Array<{ value: QuotationPricingMode; label: string }> = [
  { value: "PER_PERSON", label: "Por persona" },
  { value: "GROUP_TOTAL", label: "Grupo familiar" },
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
    admin_fee_percentage: 0,
    operator_id: null,
    generates_commission: COMMISSION_TYPES.has(type),
    stopovers: [],
  }
}

function getOptionCalculatedTotal(option: Pick<QuotationOption, "items">) {
  return getQuotationOptionCalculatedTotal(option.items)
}

function getOptionCostTotal(option: Pick<QuotationOption, "items">) {
  return getQuotationOptionCostTotal(option.items)
}

function getEffectiveOptionTotal(option: Pick<QuotationOption, "calculated_total_amount" | "manual_total_amount" | "total_amount">) {
  const manualTotal = normalizeManualQuotationTotal(option.manual_total_amount)
  if (manualTotal != null) {
    return manualTotal
  }

  return roundQuotationMoney(option.calculated_total_amount || option.total_amount || 0)
}

function cloneStopovers(stopovers?: StopoverInfo[]) {
  return (stopovers || []).map((stop) => ({ ...stop }))
}

function cloneQuotationItem(item: QuotationItem, idOverride?: string): QuotationItem {
  return {
    ...item,
    id: idOverride || generateId(),
    stopovers: cloneStopovers(item.stopovers),
  }
}

function createEmptyOption(number: number, items?: QuotationItem[]): QuotationOption {
  const nextItems = items ?? [createEmptyItem("FLIGHT")]
  const calculatedTotal = getQuotationOptionCalculatedTotal(nextItems)

  return {
    id: generateId(),
    title: `Opcion ${number}`,
    total_amount: calculatedTotal,
    calculated_total_amount: calculatedTotal,
    manual_total_amount: null,
    items: nextItems,
  }
}

const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: "EFECTIVO_USD", label: "Efectivo USD" },
  { value: "EFECTIVO_ARS", label: "Efectivo ARS" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "MP", label: "MercadoPago" },
  { value: "CREDITO", label: "Crédito en cuotas" },
]

function createNewQuotationDraft(lead: QuotationBuilderProps["lead"]) {
  return {
    quotationTitle: lead.contact_name,
    destination: lead.destination || "",
    origin: "",
    region: lead.region || "OTROS",
    departureDate: "",
    returnDate: "",
    adults: 1,
    children: 0,
    infants: 0,
    currency: "USD",
    pricingMode: "PER_PERSON" as QuotationPricingMode,
    notes: "",
    paymentMethods: [] as string[],
    options: [createEmptyOption(1)],
  }
}

// Helpers for date conversion
function toDate(s: string | undefined): Date | undefined {
  if (!s) return undefined
  try { return parseISO(s) } catch { return undefined }
}
function toStr(d: Date | undefined): string {
  if (!d) return ""
  try { return format(d, "yyyy-MM-dd") } catch { return "" }
}

// Extract airport code from origin/destination string like "Buenos Aires" -> "BUE" (fallback: first 3 chars)
function cityToCode(city: string): string {
  const known: Record<string, string> = {
    "buenos aires": "BUE", "miami": "MIA", "cancun": "CUN", "cancún": "CUN",
    "punta cana": "PUJ", "nueva york": "NYC", "new york": "NYC", "orlando": "MCO",
    "bogota": "BOG", "bogotá": "BOG", "lima": "LIM", "santiago": "SCL",
    "rio de janeiro": "GIG", "río de janeiro": "GIG", "sao paulo": "GRU", "são paulo": "GRU",
    "madrid": "MAD", "barcelona": "BCN", "roma": "FCO", "paris": "CDG", "parís": "CDG",
    "londres": "LHR", "amsterdam": "AMS", "cartagena": "CTG", "cartagena de indias": "CTG",
    "aruba": "AUA", "curacao": "CUR", "curaçao": "CUR", "montego bay": "MBJ",
    "dubai": "DXB", "estambul": "IST", "bangkok": "BKK", "tokio": "NRT",
    "bariloche": "BRC", "mendoza": "MDZ", "ushuaia": "USH", "salta": "SLA",
    "córdoba": "COR", "iguazú": "IGR", "puerto iguazú": "IGR",
    "florianópolis": "FLN", "salvador": "SSA", "salvador de bahía": "SSA",
    "playa del carmen": "CUN", "riviera maya": "CUN", "tulum": "CUN",
    "los cabos": "SJD", "puerto vallarta": "PVR",
  }
  const key = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
  return known[key] || city.substring(0, 3).toUpperCase()
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

export function QuotationBuilderDialog({ open, onOpenChange, lead, operators = [], onSuccess, existingQuotationId }: QuotationBuilderProps) {
  const initialDraft = createNewQuotationDraft(lead)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [activeQuotationId, setActiveQuotationId] = useState<string | null>(existingQuotationId ?? null)
  const [savedQuotation, setSavedQuotation] = useState<any>(null)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [uploadingFlightScreenshotIds, setUploadingFlightScreenshotIds] = useState<Record<string, boolean>>({})

  // General data
  const [quotationTitle, setQuotationTitle] = useState(initialDraft.quotationTitle)
  const [destination, setDestination] = useState(initialDraft.destination)
  const [origin, setOrigin] = useState("")
  const [region, setRegion] = useState(initialDraft.region)
  const [departureDate, setDepartureDate] = useState("")
  const [returnDate, setReturnDate] = useState("")
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [currency, setCurrency] = useState("USD")
  const [pricingMode, setPricingMode] = useState<QuotationPricingMode>("PER_PERSON")
  const [notes, setNotes] = useState("")
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])

  // Options
  const [options, setOptions] = useState<QuotationOption[]>(initialDraft.options)
  const hasPendingFlightScreenshotUploads = Object.keys(uploadingFlightScreenshotIds).length > 0

  const syncLinkedFlights = useCallback((nextOptions: QuotationOption[]) => {
    if (nextOptions.length === 0) return nextOptions

    const masterFlights = nextOptions[0].items.filter((item) => item.item_type === "FLIGHT")

    return nextOptions.map((option, index) => {
      if (index === 0) {
        return option
      }

      const currentFlights = option.items.filter((item) => item.item_type === "FLIGHT")
      const nonFlights = option.items.filter((item) => item.item_type !== "FLIGHT")
      const syncedFlights = masterFlights.map((flight, flightIndex) =>
        cloneQuotationItem(flight, currentFlights[flightIndex]?.id)
      )

      return {
        ...option,
        items: [...syncedFlights, ...nonFlights],
      }
    })
  }, [])

  const applyOptionsUpdate = useCallback((updater: (current: QuotationOption[]) => QuotationOption[]) => {
    setOptions((current) => syncLinkedFlights(updater(current)))
  }, [syncLinkedFlights])

  const resetFormForNewQuotation = useCallback((nextLead: QuotationBuilderProps["lead"]) => {
    const draft = createNewQuotationDraft(nextLead)
    setActiveQuotationId(null)
    setSavedQuotation(null)
    setLoadingExisting(false)
    setQuotationTitle(draft.quotationTitle)
    setDestination(draft.destination)
    setOrigin(draft.origin)
    setRegion(draft.region)
    setDepartureDate(draft.departureDate)
    setReturnDate(draft.returnDate)
    setAdults(draft.adults)
    setChildren(draft.children)
    setInfants(draft.infants)
    setCurrency(draft.currency)
    setPricingMode(draft.pricingMode)
    setNotes(draft.notes)
    setPaymentMethods(draft.paymentMethods)
    setOptions(draft.options)
  }, [])

  useEffect(() => {
    if (!open) {
      resetFormForNewQuotation(lead)
      return
    }

    if (!existingQuotationId) {
      resetFormForNewQuotation(lead)
    }
  }, [open, existingQuotationId, lead.id, lead.contact_name, lead.destination, lead.region, resetFormForNewQuotation])

  // Load existing quotation for editing
  useEffect(() => {
    if (!open || !existingQuotationId) return
    let cancelled = false
    setActiveQuotationId(existingQuotationId)
    setLoadingExisting(true)
    fetch(`/api/quotations/${existingQuotationId}`, { cache: "no-store" })
      .then(r => r.json())
      .then(({ data }) => {
        if (cancelled || !data) return
        setActiveQuotationId(data.id || existingQuotationId)
        setSavedQuotation(data)
        setQuotationTitle(lead.contact_name)
        setDestination(data.destination || "")
        setOrigin(data.origin || "")
        setRegion(data.region || "OTROS")
        setDepartureDate(data.departure_date || "")
        setReturnDate(data.return_date || "")
        setAdults(data.adults || 1)
        setChildren(data.children || 0)
        setInfants(data.infants || 0)
        setCurrency(data.currency || "USD")
        setPricingMode(normalizeQuotationPricingMode(data.pricing_mode))
        setNotes(data.notes || "")
        setPaymentMethods(Array.isArray(data.payment_methods) ? data.payment_methods : [])
        // Reconstruct options from quotation_options + quotation_items
        const opts = (data.quotation_options || [])
          .sort((a: any, b: any) => a.option_number - b.option_number)
          .map((opt: any) => {
            const items = (data.quotation_items || [])
              .filter((item: any) => item.option_id === opt.id)
              .sort((a: any, b: any) => a.order_index - b.order_index)
              .map((item: any) => ({
                id: generateId(),
                item_type: item.item_type || "OTHER",
                description: item.description || "",
                provider: item.provider || "",
                unit_price: item.sale_amount || item.unit_price || 0,
                quantity: item.quantity || 1,
                cost_amount: item.cost_amount || 0,
                cost_currency: item.cost_currency || "USD",
                admin_fee_percentage: Number(item.admin_fee_percentage) || 0,
                operator_id: item.operator_id || null,
                generates_commission: item.generates_commission || false,
                destination_city: item.destination_city || undefined,
                hotel_name: item.hotel_name || undefined,
                hotel_stars: item.hotel_stars || undefined,
                hotel_address: item.hotel_address || undefined,
                hotel_phone: item.hotel_phone || undefined,
                hotel_photo_url: item.hotel_photo_url || undefined,
                room_type: item.room_type || undefined,
                meal_plan: item.meal_plan || undefined,
                checkin_date: item.checkin_date || undefined,
                checkout_date: item.checkout_date || undefined,
                nights: item.nights || undefined,
                rooms: item.rooms || undefined,
                airline: item.airline || undefined,
                flight_route: item.flight_route || undefined,
                flight_date: item.flight_date || undefined,
                flight_return_date: item.flight_return_date || undefined,
                flight_stops: item.flight_stops ?? 0,
                flight_class: item.flight_class || undefined,
                flight_screenshot_url: item.flight_screenshot_url || undefined,
                transfer_description: item.transfer_description || undefined,
                stopovers: [],
              }))
            const calculatedTotal = opt.calculated_total_amount != null
              ? Number(opt.calculated_total_amount)
              : getQuotationOptionCalculatedTotal(items)
            const manualTotal = normalizeManualQuotationTotal(opt.manual_total_amount)
            const effectiveTotal = manualTotal ?? Number(opt.total_amount || calculatedTotal || 0)

            return {
              id: opt.id,
              title: opt.title || `Opcion ${opt.option_number}`,
              total_amount: roundQuotationMoney(effectiveTotal),
              calculated_total_amount: roundQuotationMoney(calculatedTotal),
              manual_total_amount: manualTotal,
              items,
            }
          })
        if (opts.length > 0) setOptions(syncLinkedFlights(opts))
      })
      .catch(err => console.error("Error loading quotation:", err))
      .finally(() => { if (!cancelled) setLoadingExisting(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingQuotationId, lead.contact_name, syncLinkedFlights])

  // --- Auto-fill flight route when origin/destination change ---
  useEffect(() => {
    if (!origin && !destination) return
    const route = origin && destination
      ? `${cityToCode(origin)} - ${cityToCode(destination)}`
      : ""
    if (!route) return

    applyOptionsUpdate((current) => current.map(opt => ({
      ...opt,
      items: opt.items.map(item => {
        if (item.item_type === "FLIGHT" && !item.flight_route) {
          return { ...item, flight_route: route }
        }
        return item
      })
    })))
  }, [origin, destination, applyOptionsUpdate])

  // --- Auto-fill dates on items when top-level dates change ---
  useEffect(() => {
    if (!departureDate && !returnDate) return
    applyOptionsUpdate((current) => current.map(opt => ({
      ...opt,
      items: opt.items.map(item => {
        const updated = { ...item }
        if (item.item_type === "FLIGHT") {
          if (departureDate && !item.flight_date) updated.flight_date = departureDate
          if (returnDate && !item.flight_return_date) updated.flight_return_date = returnDate
        }
        if ((item.item_type === "HOTEL" || item.item_type === "ACCOMMODATION")) {
          if (departureDate && !item.checkin_date) updated.checkin_date = departureDate
          if (returnDate && !item.checkout_date) updated.checkout_date = returnDate
          // Auto-calc nights
          if (updated.checkin_date && updated.checkout_date) {
            const ci = new Date(updated.checkin_date)
            const co = new Date(updated.checkout_date)
            const diff = Math.round((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24))
            if (diff > 0 && !item.nights) updated.nights = diff
          }
        }
        return updated
      })
    })))
  }, [departureDate, returnDate, applyOptionsUpdate])

  // --- Auto-calculate totals for each option without pisar el override manual ---
  const priceKey = options.map(o => o.items.map(i => `${i.unit_price}:${i.quantity}:${i.cost_amount}`).join(",")).join("|")
  useEffect(() => {
    setOptions(prev => {
      let changed = false

      const next = prev.map((opt) => {
        const calculatedTotal = getOptionCalculatedTotal(opt)
        const effectiveTotal = opt.manual_total_amount != null
          ? normalizeManualQuotationTotal(opt.manual_total_amount) ?? calculatedTotal
          : calculatedTotal

        if (
          Math.abs((opt.calculated_total_amount || 0) - calculatedTotal) > 0.001 ||
          Math.abs((opt.total_amount || 0) - effectiveTotal) > 0.001
        ) {
          changed = true
          return {
            ...opt,
            calculated_total_amount: calculatedTotal,
            total_amount: effectiveTotal,
          }
        }

        return opt
      })

      return changed ? next : prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey])

  // --- Hotel search by destination ---
  // Cache hotel data so we can auto-fill stars/address/photo when selected
  const hotelDataCache = useRef<Record<string, { stars: number; address: string | null; photo_url: string | null; google_rating: number | null }>>({})

  const buildHotelCacheKey = useCallback((hotelName: string, hotelDestination?: string | null) => {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()

    return `${normalize(hotelName)}::${normalize(hotelDestination || "")}`
  }, [])

  const searchHotels = useCallback(async (query: string, hotelDestination?: string): Promise<ComboboxOption[]> => {
    const opts: ComboboxOption[] = []
    if (query && query.length >= 1) {
      opts.push({ value: query, label: query, subtitle: "Escribir nombre manualmente" })
    }
    try {
      const params = new URLSearchParams()
      const selectedDestination = hotelDestination || destination
      if (query) params.set("q", query)
      if (selectedDestination) params.set("destination", selectedDestination)
      params.set("limit", "15")
      const res = await fetch(`/api/hotels/search?${params.toString()}`)
      if (res.ok) {
        const hotels: Array<{ name: string; stars: number; city: string; country: string; zone: string | null; address: string | null; photo_url: string | null; google_rating: number | null }> = await res.json()
        for (const hotel of hotels) {
          const stars = hotel.stars ? "★".repeat(hotel.stars) : ""
          const cityContext = hotel.city || selectedDestination || ""
          const cacheEntry = {
            stars: hotel.stars,
            address: hotel.address,
            photo_url: hotel.photo_url,
            google_rating: hotel.google_rating,
          }
          // Cache for auto-fill on selection by hotel + destination to avoid collisions between cities
          hotelDataCache.current[buildHotelCacheKey(hotel.name, cityContext)] = cacheEntry
          if (selectedDestination) {
            hotelDataCache.current[buildHotelCacheKey(hotel.name, selectedDestination)] = cacheEntry
          }
          opts.push({
            value: hotel.name,
            label: hotel.name,
            subtitle: `${stars} ${hotel.city}${hotel.zone ? ` · ${hotel.zone}` : ""}, ${hotel.country}`,
          })
        }
      }
    } catch {
      // silencioso
    }
    return opts
  }, [buildHotelCacheKey, destination])

  // --- Option management ---
  function addOption() {
    if (options.length >= 4) {
      toast.error("Maximo 4 opciones por cotizacion")
      return
    }
    applyOptionsUpdate((current) => {
      const masterFlights = current[0]?.items
        .filter((item) => item.item_type === "FLIGHT")
        .map((item) => cloneQuotationItem(item)) || []
      return [...current, createEmptyOption(current.length + 1, masterFlights)]
    })
  }

  function removeOption(optionId: string) {
    if (options.length <= 1) {
      toast.error("Debe haber al menos una opcion")
      return
    }
    applyOptionsUpdate((current) => current.filter((o) => o.id !== optionId))
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
      calculated_total_amount: source.calculated_total_amount,
      manual_total_amount: source.manual_total_amount,
      items: source.items.map((item) => cloneQuotationItem(item)),
    }
    applyOptionsUpdate((current) => [...current, newOption])
  }

  function updateOption(optionId: string, field: string, value: any) {
    applyOptionsUpdate((current) => current.map((o) => (o.id === optionId ? { ...o, [field]: value } : o)))
  }

  function updateOptionManualTotal(optionId: string, rawValue: string) {
    applyOptionsUpdate((current) =>
      current.map((option) => {
        if (option.id !== optionId) {
          return option
        }

        const manualTotal = normalizeManualQuotationTotal(rawValue)
        if (manualTotal == null) {
          return {
            ...option,
            manual_total_amount: null,
            total_amount: option.calculated_total_amount,
          }
        }

        return {
          ...option,
          manual_total_amount: manualTotal,
          total_amount: manualTotal,
        }
      })
    )
  }

  function resetOptionManualTotal(optionId: string) {
    applyOptionsUpdate((current) =>
      current.map((option) =>
        option.id === optionId
          ? {
              ...option,
              manual_total_amount: null,
              total_amount: option.calculated_total_amount,
            }
          : option
      )
    )
  }

  // --- Item management ---
  function addItem(optionId: string, type: string = "FLIGHT") {
    const optionIndex = options.findIndex((o) => o.id === optionId)
    if (optionIndex > 0 && type === "FLIGHT") {
      toast.error("Los vuelos se editan desde la opcion 1")
      return
    }
    const newItem = createEmptyItem(type)
    // Auto-fill dates and route on new items
    if (type === "FLIGHT") {
      if (departureDate) newItem.flight_date = departureDate
      if (returnDate) newItem.flight_return_date = returnDate
      if (origin && destination) newItem.flight_route = `${cityToCode(origin)} - ${cityToCode(destination)}`
    }
    if (type === "HOTEL" || type === "ACCOMMODATION") {
      if (destination) newItem.destination_city = destination
      if (departureDate) newItem.checkin_date = departureDate
      if (returnDate) newItem.checkout_date = returnDate
      if (newItem.checkin_date && newItem.checkout_date) {
        const ci = new Date(newItem.checkin_date)
        const co = new Date(newItem.checkout_date)
        const diff = Math.round((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24))
        if (diff > 0) newItem.nights = diff
      }
    }
    applyOptionsUpdate((current) =>
      current.map((o) =>
        o.id === optionId ? { ...o, items: [...o.items, newItem] } : o
      )
    )
  }

  function removeItem(optionId: string, itemId: string) {
    const option = options.find((o) => o.id === optionId)
    const optionIndex = options.findIndex((o) => o.id === optionId)
    const item = option?.items.find((i) => i.id === itemId)
    if (optionIndex > 0 && item?.item_type === "FLIGHT") {
      toast.error("Los vuelos se eliminan desde la opcion 1")
      return
    }
    applyOptionsUpdate((current) =>
      current.map((o) =>
        o.id === optionId ? { ...o, items: o.items.filter((i) => i.id !== itemId) } : o
      )
    )
  }

  function updateItem(optionId: string, itemId: string, field: string, value: any) {
    const optionIndex = options.findIndex((o) => o.id === optionId)
    const option = options.find((o) => o.id === optionId)
    const currentItem = option?.items.find((i) => i.id === itemId)

    if (optionIndex > 0 && currentItem?.item_type === "FLIGHT") {
      toast.error("Los vuelos se editan desde la opcion 1")
      return
    }
    if (optionIndex > 0 && field === "item_type" && value === "FLIGHT") {
      toast.error("Los vuelos se agregan y editan desde la opcion 1")
      return
    }

    applyOptionsUpdate((current) =>
      current.map((o) =>
        o.id === optionId
          ? {
              ...o,
              items: o.items.map((i) => {
                if (i.id !== itemId) return i
                const updated = { ...i, [field]: value }
                if (field === "item_type") {
                  updated.generates_commission = COMMISSION_TYPES.has(value)
                }
                // Auto-fill admin_fee_percentage cuando se selecciona operador,
                // solo si el item todavía no tiene un override (el seller puede
                // pisarlo después manualmente sin que se reescriba).
                if (field === "operator_id" && value) {
                  const op = operators.find((o) => o.id === value)
                  const opFee = Number(op?.admin_fee_percentage) || 0
                  if (opFee > 0 && (!i.admin_fee_percentage || i.admin_fee_percentage === 0)) {
                    updated.admin_fee_percentage = opFee
                  }
                }
                // Auto-fill hotel data when hotel is selected from search
                if (field === "hotel_name" && value) {
                  const cacheKey = buildHotelCacheKey(value, updated.destination_city || destination)
                  const cached = hotelDataCache.current[cacheKey]
                  if (cached?.stars) updated.hotel_stars = cached.stars
                  if (cached?.address) updated.hotel_address = cached.address
                  if (cached?.photo_url) updated.hotel_photo_url = cached.photo_url
                }
                // Auto-calc nights when dates change
                if ((field === "checkin_date" || field === "checkout_date") && updated.checkin_date && updated.checkout_date) {
                  const ci = new Date(updated.checkin_date)
                  const co = new Date(updated.checkout_date)
                  const diff = Math.round((co.getTime() - ci.getTime()) / (1000 * 60 * 60 * 24))
                  if (diff > 0) updated.nights = diff
                }
                // Auto-manage stopovers array when flight_stops changes
                if (field === "flight_stops") {
                  const stops = Number(value) || 0
                  const currentStops = updated.stopovers || []
                  if (stops > currentStops.length) {
                    updated.stopovers = [...currentStops, ...Array(stops - currentStops.length).fill(null).map(() => ({ city: "", wait_time: "" }))]
                  } else {
                    updated.stopovers = currentStops.slice(0, stops)
                  }
                }
                return updated
              }),
            }
          : o
      )
    )
  }

  function updateStopover(optionId: string, itemId: string, stopIndex: number, field: keyof StopoverInfo, value: string) {
    const optionIndex = options.findIndex((o) => o.id === optionId)
    const option = options.find((o) => o.id === optionId)
    const item = option?.items.find((i) => i.id === itemId)
    if (optionIndex > 0 && item?.item_type === "FLIGHT") {
      toast.error("Las escalas se editan desde la opcion 1")
      return
    }
    applyOptionsUpdate((current) =>
      current.map((o) =>
        o.id === optionId
          ? {
              ...o,
              items: o.items.map((i) => {
                if (i.id !== itemId) return i
                const stops = [...(i.stopovers || [])]
                if (stops[stopIndex]) {
                  stops[stopIndex] = { ...stops[stopIndex], [field]: value }
                }
                return { ...i, stopovers: stops }
              }),
            }
          : o
      )
    )
  }

  // --- Calculated totals ---
  const globalTotals = useMemo(() => {
    const allItems = options.flatMap(o => o.items)
    const byType: Record<string, { sale: number; cost: number; count: number }> = {}
    for (const item of allItems) {
      const t = item.item_type
      if (!byType[t]) byType[t] = { sale: 0, cost: 0, count: 0 }
      const adminFeePct = Number(item.admin_fee_percentage) || 0
      const itemTotalCost = (item.cost_amount || 0) * (1 + adminFeePct / 100)
      byType[t].sale += (item.unit_price || 0) * (item.quantity || 1)
      byType[t].cost += itemTotalCost * (item.quantity || 1)
      byType[t].count++
    }
    const totalSale = Object.values(byType).reduce((s, v) => s + v.sale, 0)
    const totalCost = Object.values(byType).reduce((s, v) => s + v.cost, 0)
    const totalClient = options.reduce((s, o) => s + getEffectiveOptionTotal(o), 0)
  const totalMargin = totalClient - totalCost
  return { byType, totalSale, totalCost, totalClient, totalMargin }
  }, [options])

  function setFlightScreenshotUploading(itemId: string, uploading: boolean) {
    setUploadingFlightScreenshotIds((current) => {
      if (uploading) {
        return { ...current, [itemId]: true }
      }

      if (!current[itemId]) {
        return current
      }

      const next = { ...current }
      delete next[itemId]
      return next
    })
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen"))
      reader.readAsDataURL(file)
    })
  }

  async function handleFlightScreenshotUpload(optionId: string, itemId: string, file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La imagen no puede superar 10MB")
      return
    }

    setFlightScreenshotUploading(itemId, true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      if (activeQuotationId) {
        formData.append("quotationId", activeQuotationId)
      }

      const res = await fetch("/api/quotations/upload-flight-screenshot", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        throw new Error("quotation_screenshot_upload_failed")
      }

      const data = await res.json()
      const uploadedUrl = data.url || data.publicUrl

      if (!uploadedUrl) {
        throw new Error("quotation_screenshot_missing_url")
      }

      updateItem(optionId, itemId, "flight_screenshot_url", uploadedUrl)
      toast.success("Screenshot subido correctamente")
    } catch {
      try {
        const dataUrl = await readFileAsDataUrl(file)
        updateItem(optionId, itemId, "flight_screenshot_url", dataUrl)
        toast.success("Screenshot cargado")
      } catch {
        toast.error("No se pudo cargar el screenshot")
      }
    } finally {
      setFlightScreenshotUploading(itemId, false)
    }
  }

  // --- Save ---
  async function handleSave(andSend: boolean = false) {
    if (hasPendingFlightScreenshotUploads) {
      toast.error("Espera a que termine la carga del screenshot antes de guardar")
      return
    }

    const syncedOptions = syncLinkedFlights(options)

    if (!destination.trim()) {
      toast.error("El destino es requerido")
      return
    }
    if (!departureDate) {
      toast.error("La fecha de salida es requerida")
      return
    }
    for (const opt of syncedOptions) {
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

      const optionCostTotal = getOptionCostTotal(opt)
      const effectiveTotal = getEffectiveOptionTotal(opt)
      if (effectiveTotal < optionCostTotal) {
        toast.error(`"${opt.title}" no puede quedar por debajo del costo total`)
        return
      }
    }

    setSaving(true)
    if (andSend) setSending(true)

    try {
      const finalOptions = syncedOptions.map(opt => {
        const calculatedTotal = getOptionCalculatedTotal(opt)
        const manualTotal = normalizeManualQuotationTotal(opt.manual_total_amount)
        const effectiveTotal = manualTotal ?? calculatedTotal

        return {
          ...opt,
          calculated_total_amount: calculatedTotal,
          manual_total_amount: manualTotal,
          total_amount: effectiveTotal,
        }
      })

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
        pricing_mode: normalizeQuotationPricingMode(pricingMode),
        notes: notes || null,
        payment_methods: paymentMethods,
        options: finalOptions.map((opt) => ({
          title: opt.title,
          total_amount: opt.total_amount,
          calculated_total_amount: opt.calculated_total_amount,
          manual_total_amount: opt.manual_total_amount,
          items: opt.items.map((item) => ({
            item_type: item.item_type,
            description: item.description,
            unit_price: item.unit_price,
            sale_amount: item.unit_price,
            subtotal: item.unit_price * item.quantity,
            quantity: item.quantity,
            cost_amount: item.cost_amount || 0,
            cost_currency: item.cost_currency || currency,
            admin_fee_percentage: Number(item.admin_fee_percentage) || 0,
            operator_id: item.operator_id || null,
            generates_commission: item.generates_commission || false,
            provider: item.provider || null,
            destination_city: item.destination_city || null,
            hotel_name: item.hotel_name || null,
            hotel_stars: item.hotel_stars || null,
            hotel_address: item.hotel_address || null,
            hotel_phone: item.hotel_phone || null,
            hotel_photo_url: item.hotel_photo_url || null,
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
            flight_screenshot_url: item.flight_screenshot_url || null,
            transfer_description: item.transfer_description || null,
          })),
        })),
      }

      // If editing existing, use PATCH; otherwise POST to create new
      const isEditing = !!activeQuotationId
      const quotationId = activeQuotationId

      let res: Response
      if (isEditing && quotationId) {
        res = await fetch(`/api/quotations/${quotationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch("/api/quotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Error al guardar cotizacion")
      }

      const { data: quotation } = await res.json()
      setActiveQuotationId(quotation.id)
      setSavedQuotation(quotation)

      if (andSend && quotation) {
        if (quotation.status !== "SENT") {
          await fetch(`/api/quotations/${quotation.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "SENT" }),
          })
        }

        const publicUrl = `${window.location.origin}/cotizacion/${quotation.public_token}`
        const phone = lead.contact_phone?.replace(/[\s\-\(\)]/g, "") || ""
        const cleanPhone = phone.startsWith("+") ? phone.substring(1) : phone
        const message = encodeURIComponent(
          `Hola ${lead.contact_name}! Te paso tu cotizacion para ${destination}:\n\n${publicUrl}\n\nQuedo a disposicion por cualquier consulta.`
        )
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank")

        toast.success(isEditing ? "Cotizacion actualizada y enviada" : "Cotizacion creada y enviada")
        onSuccess?.(quotation)
        onOpenChange(false)
      } else {
        toast.success(isEditing ? "Cotizacion actualizada" : "Cotizacion guardada como borrador")
        onSuccess?.(quotation)
      }
    } catch (error: any) {
      toast.error(error.message || "Error al guardar cotizacion")
    } finally {
      setSaving(false)
      setSending(false)
    }
  }

  function handleViewQuotation() {
    if (savedQuotation?.public_token) {
      window.open(`/cotizacion/${savedQuotation.public_token}`, "_blank")
    }
  }

  const hasActiveQuotation = !!activeQuotationId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0">
        {/* Header — editable lead name */}
        <div className="px-6 pt-5 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="text-lg font-semibold text-muted-foreground">{hasActiveQuotation ? "Editar" : "Nueva"} Cotizacion —</span>
            <input
              value={quotationTitle}
              onChange={(e) => setQuotationTitle(e.target.value)}
              className="text-lg font-semibold bg-transparent border-0 outline-none flex-1 focus:ring-1 focus:ring-primary/30 rounded px-1"
              placeholder="Nombre del cliente"
            />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1" data-scroll-container>
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

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Salida *</Label>
                <DateInputWithCalendar
                  value={toDate(departureDate)}
                  onChange={(d) => setDepartureDate(toStr(d))}
                  placeholder="dd/mm/aaaa"
                  className="h-9 rounded-md"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Regreso</Label>
                <DateInputWithCalendar
                  value={toDate(returnDate)}
                  onChange={(d) => setReturnDate(toStr(d))}
                  placeholder="dd/mm/aaaa"
                  minDate={toDate(departureDate)}
                  className="h-9 rounded-md"
                />
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
              <div className="space-y-1">
                <Label className="text-xs">Mostrar precio como</Label>
                <Select value={pricingMode} onValueChange={(value) => setPricingMode(value as QuotationPricingMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRICING_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Options */}
          {options.map((option, optIndex) => {
            const optionCostTotal = getOptionCostTotal(option)
            const effectiveOptionTotal = getEffectiveOptionTotal(option)
            const hasManualTotal = option.manual_total_amount != null
            const totalBelowCost = effectiveOptionTotal < optionCostTotal

            return (
            <div key={option.id} className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              {(() => {
                const pricing = getQuotationOptionPricing(option, {
                  adults,
                  children,
                  infants,
                  pricing_mode: pricingMode,
                })

                return (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-700">Se mostrara al cliente</p>
                      <p className="text-sm font-semibold text-orange-950">
                        {pricing.primaryLabel}: {formatQuotationCurrency(pricing.primaryAmount, currency)}
                      </p>
                      {pricing.secondaryAmount != null && pricing.secondaryLabel && (
                        <p className="text-xs text-orange-800/80 mt-0.5">
                          {pricing.secondaryLabel}: {formatQuotationCurrency(pricing.secondaryAmount, currency)}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="shrink-0 border-orange-200 bg-white/80 text-orange-700">
                      {pricingMode === "PER_PERSON" ? "Por persona" : "Grupo"}
                    </Badge>
                  </div>
                )
              })()}

              <div className={`rounded-lg border px-3 py-3 space-y-3 ${totalBelowCost ? "border-red-300 bg-red-50/80" : "border-slate-200 bg-white/70"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Precio final de la opción</p>
                    <p className="text-xs text-muted-foreground">
                      Podés redondear el total final sin tocar los precios de los servicios.
                    </p>
                  </div>
                  <Badge variant="secondary" className={hasManualTotal ? "border-blue-200 bg-blue-50 text-blue-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                    {hasManualTotal ? "Manual" : "Automatico"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Suma servicios</Label>
                    <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center text-sm font-mono">
                      {formatQuotationCurrency(option.calculated_total_amount, currency)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Costo total</Label>
                    <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center text-sm font-mono">
                      {formatQuotationCurrency(optionCostTotal, currency)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-blue-700">Precio final a mostrar</Label>
                    <Input
                      type="number"
                      min={optionCostTotal}
                      step={0.01}
                      value={option.manual_total_amount ?? ""}
                      onChange={(e) => updateOptionManualTotal(option.id, e.target.value)}
                      placeholder={option.calculated_total_amount.toFixed(2)}
                      className="text-sm font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={!hasManualTotal}
                      onClick={() => resetOptionManualTotal(option.id)}
                    >
                      Volver a automatico
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span>Total efectivo: <span className="font-medium text-foreground">{formatQuotationCurrency(effectiveOptionTotal, currency)}</span></span>
                  {hasManualTotal && (
                    <span>Diferencia vs suma servicios: <span className="font-medium text-foreground">{formatQuotationCurrency(effectiveOptionTotal - option.calculated_total_amount, currency)}</span></span>
                  )}
                </div>

                {totalBelowCost && (
                  <p className="text-xs text-red-700">
                    El precio final no puede quedar por debajo del costo total de la opción.
                  </p>
                )}
              </div>

              {optIndex > 0 && options[0]?.items.some((item) => item.item_type === "FLIGHT") && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
                  Los vuelos de esta opcion estan vinculados a la opcion 1. Itinerario, precio y screenshot se editan solo ahi.
                </div>
              )}

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
                  const adminFeePct = Number(item.admin_fee_percentage) || 0
                  const totalCost = (item.cost_amount || 0) * (1 + adminFeePct / 100)
                  const itemMargin = (item.unit_price || 0) - totalCost
                  const itemMarginPct = (item.unit_price || 0) > 0
                    ? (itemMargin / (item.unit_price || 1)) * 100
                    : 0
                  const isNegativeMargin = itemMargin < 0 && totalCost > 0
                  const typeConfig = ITEM_TYPES.find(t => t.value === item.item_type)
                  const TypeIcon = typeConfig?.icon || MapPin
                  const isLinkedFlightReadonly = optIndex > 0 && item.item_type === "FLIGHT"

                  return (
                    <div key={item.id} className={`border rounded-lg p-3 space-y-3 ${isNegativeMargin ? "border-red-400 bg-red-50/60 dark:bg-red-950/20" : "bg-muted/30"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <Select
                            value={item.item_type}
                            disabled={isLinkedFlightReadonly}
                            onValueChange={(v) => updateItem(option.id, item.id, "item_type", v)}
                          >
                            <SelectTrigger className="h-7 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ITEM_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value} disabled={optIndex > 0 && t.value === "FLIGHT"}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">#{itemIndex + 1}</span>
                          {isLinkedFlightReadonly && (
                            <Badge variant="outline" className="h-6 border-blue-200 bg-blue-50 text-blue-700">
                              Vinculado
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isLinkedFlightReadonly}
                          onClick={() => removeItem(option.id, item.id)}
                          className="text-destructive h-6 w-6 p-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Common fields */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Descripcion *</Label>
                          <Input
                            value={item.description}
                            disabled={isLinkedFlightReadonly}
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
                              disabled={isLinkedFlightReadonly}
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
                              disabled={isLinkedFlightReadonly}
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
                            disabled={isLinkedFlightReadonly}
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
                              disabled={isLinkedFlightReadonly}
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
                              disabled={isLinkedFlightReadonly}
                              onChange={(e) => updateItem(option.id, item.id, "cost_amount", Number(e.target.value))}
                              placeholder="0.00"
                              className="text-sm font-mono pl-7"
                            />
                          </div>
                          <div className="flex items-center gap-1 pt-0.5">
                            <span className="text-[10px] text-muted-foreground">+ admin</span>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={item.admin_fee_percentage || ""}
                              disabled={isLinkedFlightReadonly}
                              onChange={(e) => updateItem(option.id, item.id, "admin_fee_percentage", Number(e.target.value))}
                              placeholder="0"
                              className="h-6 text-[11px] font-mono w-16 px-1.5"
                            />
                            <span className="text-[10px] text-muted-foreground">%</span>
                            {adminFeePct > 0 && (
                              <span className="text-[10px] font-mono text-orange-600 ml-auto">
                                = {currency} {totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Moneda costo</Label>
                          <Select
                            value={item.cost_currency || "USD"}
                            disabled={isLinkedFlightReadonly}
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
                            <div className={`rounded-md px-2 py-1 text-xs flex items-center gap-1.5 ${isNegativeMargin ? "bg-red-100 dark:bg-red-900/40 ring-1 ring-red-400" : "bg-muted/50"}`}>
                              {isNegativeMargin && <AlertTriangle className="h-3 w-3 text-red-600" />}
                              <span className="text-muted-foreground">Margen:</span>
                              <span className={`font-mono font-semibold ${itemMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {currency} {itemMargin.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </span>
                              {(item.cost_amount || 0) > 0 && (
                                <span className={`font-mono font-semibold ${itemMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  ({itemMarginPct.toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Hotel-specific fields */}
                      {(item.item_type === "HOTEL" || item.item_type === "ACCOMMODATION") && (
                        <div className="rounded-md border border-border/30 bg-background/50 p-3 space-y-3">
                          <div className="flex items-center gap-3">
                            {item.hotel_photo_url ? (
                              <img src={item.hotel_photo_url} alt={item.hotel_name || ""} className="w-20 h-14 object-cover rounded-md border flex-shrink-0" />
                            ) : null}
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Datos del hotel</p>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Ciudad / destino</Label>
                              <Input
                                value={item.destination_city || ""}
                                onChange={(e) => updateItem(option.id, item.id, "destination_city", e.target.value)}
                                placeholder="Ej: Maragogi"
                                className="text-sm"
                              />
                            </div>
                            <div className="col-span-2 space-y-1">
                              <Label className="text-xs">Hotel</Label>
                              <SearchableCombobox
                                value={item.hotel_name || ""}
                                onChange={(v) => updateItem(option.id, item.id, "hotel_name", v)}
                                placeholder="Buscar hotel..."
                                searchPlaceholder="Escribi el nombre del hotel..."
                                emptyMessage="No se encontraron hoteles"
                                initialLabel={item.hotel_name || ""}
                                searchFn={(query) => searchHotels(query, item.destination_city || destination)}
                              />
                              <p className="text-[10px] text-muted-foreground">
                                Busca en: {item.destination_city || destination || "todos los destinos"}
                              </p>
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
                              <DateInputWithCalendar
                                value={toDate(item.checkin_date)}
                                onChange={(d) => updateItem(option.id, item.id, "checkin_date", toStr(d))}
                                placeholder="dd/mm/aaaa"
                                className="h-9 rounded-md text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Check-out</Label>
                              <DateInputWithCalendar
                                value={toDate(item.checkout_date)}
                                onChange={(d) => updateItem(option.id, item.id, "checkout_date", toStr(d))}
                                placeholder="dd/mm/aaaa"
                                minDate={toDate(item.checkin_date)}
                                className="h-9 rounded-md text-sm"
                              />
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
                                disabled={isLinkedFlightReadonly}
                                onChange={(e) => updateItem(option.id, item.id, "airline", e.target.value)}
                                placeholder="Ej: Aerolineas Argentinas"
                                className="text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Ruta</Label>
                              <Input
                                value={item.flight_route || ""}
                                disabled={isLinkedFlightReadonly}
                                onChange={(e) => updateItem(option.id, item.id, "flight_route", e.target.value)}
                                placeholder="Ej: EZE - MIA"
                                className="text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Clase</Label>
                              <Select
                                value={item.flight_class || ""}
                                disabled={isLinkedFlightReadonly}
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
                                disabled={isLinkedFlightReadonly}
                                onChange={(e) => updateItem(option.id, item.id, "flight_stops", Number(e.target.value))}
                                className="text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Fecha ida</Label>
                              <DateInputWithCalendar
                                value={toDate(item.flight_date)}
                                disabled={isLinkedFlightReadonly}
                                onChange={(d) => updateItem(option.id, item.id, "flight_date", toStr(d))}
                                placeholder="dd/mm/aaaa"
                                className="h-9 rounded-md text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Fecha vuelta</Label>
                              <DateInputWithCalendar
                                value={toDate(item.flight_return_date)}
                                disabled={isLinkedFlightReadonly}
                                onChange={(d) => updateItem(option.id, item.id, "flight_return_date", toStr(d))}
                                placeholder="dd/mm/aaaa"
                                minDate={toDate(item.flight_date)}
                                className="h-9 rounded-md text-sm"
                              />
                            </div>
                          </div>
                          {/* Screenshot de vuelo */}
                          <div className="space-y-2 pt-1">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Screenshot del vuelo</p>
                            {!isLinkedFlightReadonly && (
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id={`flight-screenshot-${option.id}-${item.id}`}
                                disabled={Boolean(uploadingFlightScreenshotIds[item.id])}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  await handleFlightScreenshotUpload(option.id, item.id, file)
                                  e.target.value = ""
                                }}
                              />
                            )}
                            {item.flight_screenshot_url ? (
                              <div className="space-y-2">
                                <div className="relative group">
                                  <img
                                    src={item.flight_screenshot_url}
                                    alt="Screenshot del vuelo"
                                    className="w-full max-h-48 object-contain rounded-md border"
                                  />
                                  {!isLinkedFlightReadonly && (
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => updateItem(option.id, item.id, "flight_screenshot_url", "")}
                                      disabled={Boolean(uploadingFlightScreenshotIds[item.id])}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                                {!isLinkedFlightReadonly && (
                                  <div className="flex items-center gap-2">
                                    <label htmlFor={`flight-screenshot-${option.id}-${item.id}`}>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="cursor-pointer"
                                        asChild
                                        disabled={Boolean(uploadingFlightScreenshotIds[item.id])}
                                      >
                                        <span>
                                          {uploadingFlightScreenshotIds[item.id] ? (
                                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                          ) : (
                                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                                          )}
                                          Reemplazar screenshot
                                        </span>
                                      </Button>
                                    </label>
                                    {uploadingFlightScreenshotIds[item.id] ? (
                                      <p className="text-xs text-muted-foreground">Subiendo imagen...</p>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                {isLinkedFlightReadonly ? (
                                  <Button type="button" variant="outline" size="sm" disabled>
                                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                                    Subir screenshot del vuelo
                                  </Button>
                                ) : (
                                  <>
                                    <label htmlFor={`flight-screenshot-${option.id}-${item.id}`}>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="cursor-pointer"
                                        asChild
                                        disabled={Boolean(uploadingFlightScreenshotIds[item.id])}
                                      >
                                        <span>
                                          {uploadingFlightScreenshotIds[item.id] ? (
                                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                          ) : (
                                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                                          )}
                                          Subir screenshot del vuelo
                                        </span>
                                      </Button>
                                    </label>
                                    {uploadingFlightScreenshotIds[item.id] ? (
                                      <p className="text-xs text-muted-foreground mt-2">Subiendo imagen...</p>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Stopover details */}
                          {(item.stopovers || []).length > 0 && (
                            <div className="space-y-2 pt-1">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Escalas</p>
                              {(item.stopovers || []).map((stop, si) => (
                                <div key={si} className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Escala {si + 1} — Ciudad</Label>
                                    <Input
                                      value={stop.city}
                                      disabled={isLinkedFlightReadonly}
                                      onChange={(e) => updateStopover(option.id, item.id, si, "city", e.target.value)}
                                      placeholder="Ej: Panama City"
                                      className="text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Tiempo de espera</Label>
                                    <Input
                                      value={stop.wait_time}
                                      disabled={isLinkedFlightReadonly}
                                      onChange={(e) => updateStopover(option.id, item.id, si, "wait_time", e.target.value)}
                                      placeholder="Ej: 2h 30m"
                                      className="text-sm"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
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
                    const isDisabled = optIndex > 0 && t.value === "FLIGHT"
                    return (
                      <Button
                        key={t.value}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={isDisabled}
                        onClick={() => addItem(option.id, t.value)}
                      >
                        <Plus className="h-3 w-3" />
                        <Icon className="h-3 w-3" />
                        {t.label}
                      </Button>
                    )
                  })}
                </div>
                {optIndex > 0 && options[0]?.items.some((item) => item.item_type === "FLIGHT") && (
                  <p className="text-[11px] text-muted-foreground">
                    Los vuelos se administran desde la opcion 1 y se replican automaticamente en todas las opciones.
                  </p>
                )}
              </div>
            </div>
          )})}

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

          {/* Payment methods (mostradas al cliente en el presupuesto público) */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-emerald-500/10">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Formas de pago aceptadas</h4>
              <span className="text-[10px] text-muted-foreground">(visible al cliente)</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((pm) => {
                const checked = paymentMethods.includes(pm.value)
                return (
                  <label
                    key={pm.value}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition ${
                      checked ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "border-border/40 hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPaymentMethods((prev) => [...prev, pm.value])
                        } else {
                          setPaymentMethods((prev) => prev.filter((v) => v !== pm.value))
                        }
                      }}
                      className="h-4 w-4 accent-emerald-500"
                    />
                    {pm.label}
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        {/* ═══════ STICKY FOOTER ═══════ */}
        <div className="border-t border-border/60 bg-muted/20 px-6 py-3 shrink-0 space-y-3">
          {/* Compact pricing summary */}
          {(globalTotals.totalSale > 0 || globalTotals.totalCost > 0) && (
            <div className="flex items-center justify-between gap-4">
              {/* Left: service breakdown inline */}
              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                {Object.entries(globalTotals.byType).map(([type, vals]) => {
                  const typeConfig = ITEM_TYPES.find(t => t.value === type)
                  const Icon = typeConfig?.icon || MapPin
                  return vals.sale > 0 ? (
                    <span key={type} className="flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      {typeConfig?.label || type} ({vals.count})
                    </span>
                  ) : null
                })}
              </div>
              {/* Right: totals */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Servicios</p>
                  <p className="text-sm font-mono font-semibold">{currency} {globalTotals.totalSale.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Cliente</p>
                  <p className="text-sm font-mono font-semibold">{currency} {globalTotals.totalClient.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                </div>
                {globalTotals.totalCost > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Costo</p>
                    <p className="text-sm font-mono font-semibold">{currency} {globalTotals.totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                {globalTotals.totalCost > 0 && (() => {
                  const totalMarginPct = globalTotals.totalClient > 0
                    ? (globalTotals.totalMargin / globalTotals.totalClient) * 100
                    : 0
                  const isNegative = globalTotals.totalMargin < 0
                  return (
                    <Badge variant="secondary" className={`text-xs font-mono flex items-center gap-1 ${isNegative ? "bg-red-500/15 text-red-700 ring-1 ring-red-400" : "bg-green-500/10 text-green-700"}`}>
                      {isNegative && <AlertTriangle className="h-3 w-3" />}
                      Margen: {currency} {globalTotals.totalMargin.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ({totalMarginPct.toFixed(1)}%)
                    </Badge>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving || hasPendingFlightScreenshotUploads}>
              Cancelar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={saving || hasPendingFlightScreenshotUploads}>
              {saving && !sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {hasActiveQuotation ? "Actualizar borrador" : "Guardar borrador"}
            </Button>
            {savedQuotation?.public_token && (
              <Button variant="secondary" size="sm" onClick={handleViewQuotation}>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Ver cotizacion
              </Button>
            )}
            <Button size="sm" onClick={() => handleSave(true)} disabled={saving || hasPendingFlightScreenshotUploads} className="bg-green-600 hover:bg-green-700">
              {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Guardar y enviar por WhatsApp
            </Button>
          </div>
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
