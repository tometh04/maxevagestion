// components/sales/lead-emilia-chat.tsx
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, ChevronLeft, ChevronRight, MessageSquarePlus, Send, AlertTriangle, CheckCircle2, ExternalLink, X, Sparkles, FileText, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { FlightResultCard } from "@/components/emilia/flight-result-card"
import { HotelResultCard } from "@/components/emilia/hotel-result-card"
import { buildQuotationPayload, type EmiliaFlight, type EurovipsHotel } from "@/lib/emilia/quotation-mapper"
import { parseHotelSegments, selectHotelForStay } from "@/lib/emilia/hotel-stays"
import { generateClientId } from "@/lib/emilia/utils"
import { EmiliaJobError, waitForEmiliaJob } from "@/lib/emilia/async-turn"
import { applyEmiliaTurnUpdate, interruptEmiliaTurn, type EmiliaChatMessage } from "@/lib/emilia/progressive-turn"
import { ProductSearchStatus } from "@/components/emilia/product-search-status"
import progressStyles from "@/components/emilia/progress-text.module.css"
import {
  filterFlights,
  filterHotels,
  getFlightFilterOptions,
  getHotelFilterOptions,
  hasActiveFlightFilters,
  hasActiveHotelFilters,
  type FlightFilters,
  type FlightFilterOptions,
  type FlightStopsFilter,
  type HotelFilters,
  type HotelFilterOptions,
  type MealPlanFilter,
} from "@/lib/emilia/result-filters"
import { getPublicQuotationPath } from "@/lib/quotations/public-links"
import { downloadQuotationPdfFromPriceDialog } from "@/lib/pdf/quotation-pdf-html"
import { QuotationPdfPriceDialog } from "@/components/sales/quotation-pdf-price-dialog"
import { EmiliaPromptGuide } from "@/components/sales/emilia-prompt-guide"
import { useTours } from "@/components/tours/tours-provider"
import { fetchQuotationDocumentForUser } from "@/lib/quotation-documents/client"
import {
  withDefaultOrigin,
  type EmiliaDefaultOrigin,
} from "@/lib/emilia/origin-context"
import {
  getActiveSearchContextId,
  getMessageSearchContextId,
  hasSearchCards,
} from "@/lib/emilia/search-context"

const ALL_SELECT_VALUE = "__all__"
const DEFAULT_FLIGHT_FILTERS: FlightFilters = { stops: "all" }
const DEFAULT_HOTEL_FILTERS: HotelFilters = { mealPlan: "all" }

const FLIGHT_STOPS_OPTIONS: Array<{ value: FlightStopsFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "direct", label: "Directo" },
  { value: "one", label: "1 escala" },
  { value: "two_plus", label: "2+ escalas" },
]

const HOTEL_MEAL_PLAN_OPTIONS: Array<{ value: MealPlanFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "ALL_INCLUSIVE", label: "All inclusive" },
  { value: "DESAYUNO", label: "Desayuno" },
  { value: "MEDIA_PENSION", label: "Media pensión" },
  { value: "PENSION_COMPLETA", label: "Pensión completa" },
  { value: "SOLO_ALOJAMIENTO", label: "Solo alojamiento" },
]

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatFilterPrice(value: number | null | undefined): string {
  if (value == null) return ""
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(value)
}

interface FlightFiltersBarProps {
  filters: FlightFilters
  options: FlightFilterOptions
  visibleCount: number
  totalCount: number
  onChange: (filters: FlightFilters) => void
  onClear: () => void
}

function FlightFiltersBar({
  filters,
  options,
  visibleCount,
  totalCount,
  onChange,
  onClear,
}: FlightFiltersBarProps) {
  const active = hasActiveFlightFilters(filters)

  return (
    <div className="mb-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className="h-6 rounded-md bg-background text-[11px] font-medium">
          {visibleCount} visibles de {totalCount}
        </Badge>
        {active && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-xs">
            Limpiar filtros
          </Button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select
          value={filters.stops ?? "all"}
          onValueChange={(value) => onChange({ ...filters, stops: value as FlightStopsFilter })}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Filtrar vuelos por escalas">
            <SelectValue placeholder="Escalas" />
          </SelectTrigger>
          <SelectContent>
            {FLIGHT_STOPS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.airline ?? ALL_SELECT_VALUE}
          onValueChange={(value) => onChange({ ...filters, airline: value === ALL_SELECT_VALUE ? null : value })}
          disabled={options.airlines.length === 0}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Filtrar vuelos por aerolínea">
            <SelectValue placeholder="Aerolínea" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SELECT_VALUE}>Todas</SelectItem>
            {options.airlines.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.provider ?? ALL_SELECT_VALUE}
          onValueChange={(value) => onChange({ ...filters, provider: value === ALL_SELECT_VALUE ? null : value })}
          disabled={options.providers.length === 0}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Filtrar vuelos por mayorista">
            <SelectValue placeholder="Mayorista" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SELECT_VALUE}>Todos</SelectItem>
            {options.providers.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          min={0}
          inputMode="decimal"
          aria-label="Precio máximo de vuelo"
          placeholder={options.price.max != null ? `Máx ${formatFilterPrice(options.price.max)}` : "Precio máx"}
          value={filters.maxPrice ?? ""}
          onChange={(event) => onChange({ ...filters, maxPrice: parseOptionalNumber(event.target.value) })}
          className="h-8 text-xs"
        />
      </div>
    </div>
  )
}

interface HotelFiltersBarProps {
  filters: HotelFilters
  options: HotelFilterOptions
  visibleCount: number
  totalCount: number
  onChange: (filters: HotelFilters) => void
  onClear: () => void
}

function HotelFiltersBar({
  filters,
  options,
  visibleCount,
  totalCount,
  onChange,
  onClear,
}: HotelFiltersBarProps) {
  const active = hasActiveHotelFilters(filters)

  return (
    <div className="mb-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className="h-6 rounded-md bg-background text-[11px] font-medium">
          {visibleCount} visibles de {totalCount}
        </Badge>
        {active && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-xs">
            Limpiar filtros
          </Button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select
          value={filters.category ?? ALL_SELECT_VALUE}
          onValueChange={(value) => onChange({ ...filters, category: value === ALL_SELECT_VALUE ? null : value })}
          disabled={options.categories.length === 0}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Filtrar hoteles por categoría">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SELECT_VALUE}>Todas</SelectItem>
            {options.categories.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.mealPlan ?? "all"}
          onValueChange={(value) => onChange({ ...filters, mealPlan: value as MealPlanFilter })}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Filtrar hoteles por régimen">
            <SelectValue placeholder="Régimen" />
          </SelectTrigger>
          <SelectContent>
            {HOTEL_MEAL_PLAN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.provider ?? ALL_SELECT_VALUE}
          onValueChange={(value) => onChange({ ...filters, provider: value === ALL_SELECT_VALUE ? null : value })}
          disabled={options.providers.length === 0}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Filtrar hoteles por mayorista">
            <SelectValue placeholder="Mayorista" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SELECT_VALUE}>Todos</SelectItem>
            {options.providers.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          min={0}
          inputMode="decimal"
          aria-label="Precio máximo de hotel"
          placeholder={options.roomTotal.max != null ? `Máx ${formatFilterPrice(options.roomTotal.max)}` : "Precio máx"}
          value={filters.maxRoomTotal ?? ""}
          onChange={(event) => onChange({ ...filters, maxRoomTotal: parseOptionalNumber(event.target.value) })}
          className="h-8 text-xs"
        />
      </div>
    </div>
  )
}

function FilteredResultsEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-5 text-center text-sm text-muted-foreground">
      <p>Sin opciones con estos filtros.</p>
      <Button type="button" variant="ghost" size="sm" onClick={onClear} className="mt-2 h-7 px-2 text-xs">
        Limpiar filtros
      </Button>
    </div>
  )
}

// -------------------------------------------------------------------------
// CarouselSlide — wrapper unificado para cada card del carrusel.
// Ancho fijo (para el snap horizontal) pero ALTURA NATURAL: la card crece
// con su contenido. Una altura fija + overflow-hidden recortaba el vuelo de
// REGRESO, el "total" del hotel y el ring de selección (`ring-2 ring-primary`).
// 360px: con el modal ancho (max-w-7xl) entran ~3 cards y el contenido de la
// card (aerolínea, precio, horarios) respira sin envolver en 3 líneas.
// -------------------------------------------------------------------------
const SLIDE_WIDTH = 360

function CarouselSlide({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 snap-start" style={{ width: `${SLIDE_WIDTH}px` }}>
      {children}
    </div>
  )
}

// -------------------------------------------------------------------------
// CardCarousel — banda horizontal con snap, flechas y contador.
// Reusada para vuelos y hoteles dentro del chat embebido.
// -------------------------------------------------------------------------
interface CardCarouselProps {
  count: number            // cantidad total de items (para el contador)
  ariaLabel: string
  children: React.ReactNode
}

function CardCarousel({ count, ariaLabel, children }: CardCarouselProps) {
  const itemWidth = SLIDE_WIDTH + 12  // ancho del slide + gap-3 (12px)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const updateNav = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const left = el.scrollLeft
    const max = el.scrollWidth - el.clientWidth - 1
    setCanLeft(left > 0)
    setCanRight(left < max)
    // index del card más cercano al borde izquierdo (con un pequeño offset)
    setActiveIndex(Math.min(count - 1, Math.max(0, Math.round(left / itemWidth))))
  }, [count, itemWidth])

  useEffect(() => {
    updateNav()
  }, [updateNav, count])

  function scrollBy(direction: 1 | -1) {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: direction * itemWidth, behavior: "smooth" })
  }

  return (
    <div className="relative group/carousel" aria-roledescription="carousel" aria-label={ariaLabel}>
      {/* Sin margen negativo: con -mx-3 las cards sangraban sobre el padding
          del modal y el scroll container las recortaba contra el borde.
          px-1 deja lugar para el ring de selección de las cards. */}
      <div
        ref={trackRef}
        onScroll={updateNav}
        className="flex gap-3 items-start overflow-x-auto scroll-smooth snap-x snap-mandatory px-1 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {/* Flechas — solo visibles cuando hay overflow + en hover/focus */}
      <button
        type="button"
        aria-label="Anterior"
        onClick={() => scrollBy(-1)}
        disabled={!canLeft}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 left-1 z-10 h-9 w-9 rounded-full",
          "bg-background/85 backdrop-blur-sm border shadow-md flex items-center justify-center",
          "text-foreground transition-all duration-150",
          "opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100",
          "disabled:cursor-not-allowed disabled:opacity-0",
          "hover:bg-background hover:scale-105"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={() => scrollBy(1)}
        disabled={!canRight}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 right-1 z-10 h-9 w-9 rounded-full",
          "bg-background/85 backdrop-blur-sm border shadow-md flex items-center justify-center",
          "text-foreground transition-all duration-150",
          "opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100",
          "disabled:cursor-not-allowed disabled:opacity-0",
          "hover:bg-background hover:scale-105"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Contador + dots */}
      {count > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1.5">
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === activeIndex
                    ? "w-4 bg-primary"
                    : "w-1.5 bg-muted-foreground/30"
                )}
              />
            ))}
            {count > 8 && (
              <span className="text-[10px] text-muted-foreground/60 ml-1">+{count - 8}</span>
            )}
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            {activeIndex + 1}/{count}
          </span>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------
// EmptySearchNotice — cuando Emilia devuelve un turno de "search_results" pero
// SIN opciones (ej. corrió la búsqueda con origen vacío), mostramos qué entendió
// y cómo reintentar, en vez de dejar solo el texto suelto del asistente.
// -------------------------------------------------------------------------
function EmptySearchNotice({ meta }: { meta: any }) {
  const req = meta?.originalRequest || meta?.parsedRequest
  let summary: string | null = null
  if (req) {
    const f = req.flights
    const h = req.hotels
    const parts: string[] = []
    const pax = (adults?: number, children?: number) => {
      const p: string[] = []
      if (adults) p.push(`${adults} adulto${adults > 1 ? "s" : ""}`)
      if (children) p.push(`${children} menor${children > 1 ? "es" : ""}`)
      return p.join(" + ")
    }
    if (f) {
      if (f.destination) parts.push(`Vuelo a ${f.destination}`)
      if (f.origin) parts.push(`desde ${f.origin}`)
      if (f.departureDate) parts.push(f.departureDate)
      const p = pax(f.adults, f.children)
      if (p) parts.push(p)
    } else if (h) {
      if (h.destination) parts.push(`Hotel en ${h.destination}`)
      if (h.checkinDate) parts.push(`${h.checkinDate}${h.checkoutDate ? ` → ${h.checkoutDate}` : ""}`)
      const p = pax(h.adults, h.children)
      if (p) parts.push(p)
    }
    summary = parts.length ? parts.join(" · ") : null
  }
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">Emilia no devolvió opciones para este pedido.</p>
        {summary && <p className="mt-0.5 opacity-90">Entendió: {summary}.</p>}
        <p className="mt-0.5 opacity-80">
          Probá darle el pedido completo en un solo mensaje (ej. &quot;Vuelo de Buenos Aires a París el 2/6 para 1 adulto y 1 menor&quot;).
        </p>
      </div>
    </div>
  )
}

interface Message extends EmiliaChatMessage {
  role: "user" | "assistant"
  text: string
  cards?: {
    flights?: { count: number; items: EmiliaFlight[] }
    hotels?: { count: number; items: EurovipsHotel[] }
    requestType?: string
  }
  meta?: {
    // Emilia anida confidence dentro de originalRequest en el shape nuevo.
    originalRequest?: {
      confidence?: number
      flights?: { departureDate?: string; returnDate?: string | null; adults?: number; children?: number; infants?: number }
      hotels?: { checkinDate?: string; checkoutDate?: string | null; adults?: number; children?: number; infants?: number }
      [key: string]: any
    }
    parsedRequest?: {
      confidence?: number
      flights?: { departureDate?: string; returnDate?: string | null; adults?: number; children?: number; infants?: number }
      hotels?: { checkinDate?: string; checkoutDate?: string | null; adults?: number; children?: number; infants?: number }
      [key: string]: any
    }
    messageType?: string
    missing_fields?: string[]
    // Emilia agrega muchos campos al meta (routeResult, iterationContext, etc.);
    // permitimos cualquiera para no tipar todo el shape.
    [key: string]: any
  }
}

interface Props {
  lead: {
    id: string
    contact_name: string
    contact_phone?: string | null
    destination?: string | null
    region?: string | null
    agency_id?: string | null
  }
  onBack: () => void                              // Volver al modo "detail"
  onQuotationCreated?: (quotation: any) => void   // Notifica al padre (refresh listado)
  /**
   * Conversación activa ya resuelta por el gate de "Cotizar" (o null si no hay).
   * Perf: evita un GET duplicado en el init. `undefined` = no provista → fetch.
   */
  initialConversation?: { id: string } | null
  /** Ciudad/país resueltos al presionar Cotizar; null = permiso rechazado/no disponible. */
  defaultOrigin?: EmiliaDefaultOrigin | null
}

export function LeadEmiliaChat({
  lead,
  onBack,
  onQuotationCreated,
  initialConversation,
  defaultOrigin,
}: Props) {
  const {
    abort: abortTour,
    activeTour,
    isUnseen,
    start: startTour,
    toursDisabled,
  } = useTours()
  const [loading, setLoading] = useState(true)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [createdQuotation, setCreatedQuotation] = useState<any | null>(null)
  const [createdQuotationDocumentReady, setCreatedQuotationDocumentReady] = useState(false)
  // Cotización con el dialog "Cambiar precio" abierto antes de generar el PDF
  const [pdfPriceQuotation, setPdfPriceQuotation] = useState<{
    id: string
    public_token: string | null
  } | null>(null)
  // Cargando el prompt sugerido (gpt). Loading sutil: se llena una sola vez.
  const [promptLoading, setPromptLoading] = useState(false)
  const pendingJobControllerRef = useRef<AbortController | null>(null)
  const contextualTourStartedRef = useRef(false)
  const activeTourIdRef = useRef<string | null>(null)
  const abortTourRef = useRef(abortTour)
  activeTourIdRef.current = activeTour?.id ?? null
  abortTourRef.current = abortTour

  // El diálogo es el dueño del contexto de esta guía. Si se cierra mientras la
  // guía está activa, la aborta (no la descarta ni la marca como completada) y
  // nunca toca una guía distinta que pudiera haberse abierto en paralelo.
  useEffect(() => {
    return () => {
      if (activeTourIdRef.current === "cotizar-emilia") {
        abortTourRef.current("cotizar-emilia")
      }
    }
  }, [])

  // Selección
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null)
  const [selectedHotels, setSelectedHotels] = useState<Map<string, string>>(new Map()) // hotelId → roomId
  const [flightFiltersByMessage, setFlightFiltersByMessage] = useState<Record<number, FlightFilters>>({})
  const [hotelFiltersByMessage, setHotelFiltersByMessage] = useState<Record<number, HotelFilters>>({})
  const activeSearchContextId = useMemo(() => getActiveSearchContextId(messages), [messages])
  const latestSearchMessageIndex = useMemo(() => {
    if (!activeSearchContextId) return -1
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (
        messages[index].role === "assistant"
        && getMessageSearchContextId(messages[index]) === activeSearchContextId
      ) {
        return index
      }
    }
    return -1
  }, [messages, activeSearchContextId])
  const activeResultMessageIndex = useMemo(() => {
    if (activeSearchContextId) {
      return latestSearchMessageIndex >= 0 && hasSearchCards(messages[latestSearchMessageIndex])
        ? latestSearchMessageIndex
        : -1
    }
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (hasSearchCards(messages[index])) {
        return index
      }
    }
    return -1
  }, [messages, activeSearchContextId, latestSearchMessageIndex])
  const activeResultKey = activeSearchContextId && latestSearchMessageIndex >= 0
    ? `${activeSearchContextId}:${latestSearchMessageIndex}:${messages[latestSearchMessageIndex].attempt || 1}`
    : activeResultMessageIndex >= 0
      ? `legacy:${activeResultMessageIndex}`
    : null
  const activeResultKeyRef = useRef<string | null>(null)
  const activeSearchContextIdRef = useRef<string | null>(null)

  useEffect(() => {
    activeResultKeyRef.current = null
    activeSearchContextIdRef.current = null
    setSelectedFlightId(null)
    setSelectedHotels(new Map())
    setFlightFiltersByMessage({})
    setHotelFiltersByMessage({})
  }, [lead.id])

  // La guía de prompt arranca únicamente dentro del chat autorizado. El gate de
  // "Cotizar" ya resolvió plan, tenant, agencia y leads.write antes de montar
  // este componente, una vez validado el acceso a Emilia.
  useEffect(() => {
    if (
      contextualTourStartedRef.current ||
      loading ||
      promptLoading ||
      !conversationId ||
      messages.length > 0 ||
      activeTour ||
      toursDisabled ||
      !isUnseen("cotizar-emilia")
    ) {
      return
    }

    const timer = window.setTimeout(() => {
      contextualTourStartedRef.current = true
      startTour("cotizar-emilia")
    }, 400)

    return () => window.clearTimeout(timer)
  }, [
    activeTour,
    conversationId,
    isUnseen,
    loading,
    messages.length,
    promptLoading,
    startTour,
    toursDisabled,
  ])

  useEffect(() => {
    if (!activeSearchContextId) return
    if (
      activeSearchContextIdRef.current
      && activeSearchContextIdRef.current !== activeSearchContextId
    ) {
      setSelectedFlightId(null)
      setSelectedHotels(new Map())
      setFlightFiltersByMessage({})
      setHotelFiltersByMessage({})
    }
    activeSearchContextIdRef.current = activeSearchContextId
  }, [activeSearchContextId])

  useEffect(() => {
    if (!activeResultKey) return
    if (activeResultKeyRef.current && activeResultKeyRef.current !== activeResultKey) {
      setSelectedFlightId(null)
      setSelectedHotels(new Map())
      setFlightFiltersByMessage({})
      setHotelFiltersByMessage({})
    }
    activeResultKeyRef.current = activeResultKey
  }, [activeResultKey])

  // Inicialización del chat. Perf:
  //  - Reusamos la conversación que ya trajo el gate de "Cotizar"
  //    (`initialConversation`) para evitar un GET duplicado.
  //  - El prompt sugerido viene del fallback (instantáneo); el prompt mejorado
  //    por gpt se pide en background y se aplica solo si el usuario no escribió.
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        let conv = initialConversation
        if (conv === undefined) {
          // No vino del gate → lo pedimos (defensivo para otros llamadores).
          const getRes = await fetch(`/api/leads/${lead.id}/emilia`)
          if (cancelled) return
          if (getRes.status === 403) {
            toast.error("Esta feature está en beta y no está habilitada para tu organización")
            onBack()
            return
          }
          const getData = await getRes.json()
          conv = getData?.data ?? null
        }

        if (conv?.id) {
          setConversationId(conv.id)
          const count = await loadHistory(conv.id, () => cancelled)
          // Conversación vacía (abriste y cerraste sin enviar) → re-sugerir el prompt.
          if (count === 0 && !cancelled) {
            void applySuggestedPrompt(false, () => cancelled)
          }
        } else {
          // No hay conversación activa → crearla. El prompt sugerido se pide aparte
          // (applySuggestedPrompt) con loading sutil: se llena una sola vez, sin
          // mostrar el fallback y después cambiarlo.
          const postRes = await fetch(`/api/leads/${lead.id}/emilia`, { method: "POST" })
          if (cancelled) return
          const postData = await postRes.json()
          if (!postRes.ok) {
            toast.error(postData.error || "No se pudo iniciar el chat")
            onBack()
            return
          }
          setConversationId(postData.conversation_id)
          void applySuggestedPrompt(false, () => cancelled)
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.error("Error iniciando el chat: " + (err?.message || ""))
          onBack()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
      pendingJobControllerRef.current?.abort()
      pendingJobControllerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  // Pide el prompt sugerido (gpt + fallback determinístico del server) y lo
  // aplica con un loading sutil — en una sola pasada, sin mostrar el fallback y
  // después cambiarlo. force=true (botón "Sugerir prompt inicial") siempre
  // reemplaza; force=false (auto) solo si el input está vacío (no pisa lo escrito).
  // NOTA: el prompt es SIEMPRE el inicial basado en el lead (destino/notas), no
  // toma el historial del chat — es para arrancar/resetear, no un siguiente paso.
  async function applySuggestedPrompt(force = false, isCancelled: () => boolean = () => false) {
    setPromptLoading(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/emilia/suggested-prompt`)
      if (isCancelled()) return
      const data = res.ok ? await res.json() : null
      const prompt = (data?.prompt || "").trim()
      if (prompt) {
        const promptWithOrigin = withDefaultOrigin(prompt, defaultOrigin)
        setInput(prev => (force || prev.trim() === "" ? promptWithOrigin : prev))
      }
    } catch {
      // silencioso
    } finally {
      if (!isCancelled()) setPromptLoading(false)
    }
  }

  // Devuelve la cantidad de mensajes cargados (para decidir si re-sugerir prompt).
  async function loadHistory(convId: string, isCancelled = () => false): Promise<number> {
    try {
      const res = await fetch(`/api/emilia/conversations/${convId}`)
      if (isCancelled()) return 0
      if (res.ok) {
        const json = await res.json()
        if (isCancelled()) return 0
        const msgs = (json?.messages || []).map((m: any): Message => {
          const md = m.content?.metadata || {}
          return {
            id: m.id,
            jobId: md.emilia_job?.job_id,
            jobStatus: m.role === "assistant" ? md.emilia_job?.status : undefined,
            progress: md.progress && md.emilia_job?.status === "failed" ? {
              ...md.progress,
              products: Object.fromEntries(Object.entries(md.progress.products || {}).map(([product, state]) =>
                [product, state === "searching" ? "failed" : state])),
            } : md.progress,
            role: m.role,
            text: m.content?.text || "",
            cards: m.content?.cards,
            // Rehidratar `meta` al MISMO shape que en vivo: el emilia_meta guardado
            // (originalRequest/parsedRequest/messageType/confidence...) se sube al
            // nivel superior. Sin esto, al reabrir el chat se perdían fechas/
            // pasajeros y la confianza, y "Generar cotización" quedaba sin datos.
            meta: { ...md, ...(md.emilia_meta || {}) },
          }
        })
        setMessages(msgs)
        const pendingMessage = [...(json?.messages || [])].reverse().find((message: any) => {
          const job = message.content?.metadata?.emilia_job
          return message.role === "user" && job?.job_id
            && (job.status === "queued" || job.status === "processing")
        })
        const pendingJob = pendingMessage?.content?.metadata?.emilia_job
        if (pendingJob?.job_id) {
          const controller = new AbortController()
          pendingJobControllerRef.current?.abort()
          pendingJobControllerRef.current = controller
          setSending(true)
          setMessages(prev => applyEmiliaTurnUpdate(prev, pendingJob.job_id, {
            job_id: pendingJob.job_id, status: "processing",
          }))
          void waitForEmiliaJob({
            jobId: pendingJob.job_id,
            conversationId: convId,
            signal: controller.signal,
            immediate: true,
            onProgress: update => {
              if (pendingJobControllerRef.current === controller && !controller.signal.aborted) {
                setMessages(prev => applyEmiliaTurnUpdate(prev, pendingJob.job_id, update))
              }
            },
          }).then(data => {
            if (pendingJobControllerRef.current === controller && !controller.signal.aborted) {
              setMessages(prev => applyEmiliaTurnUpdate(prev, pendingJob.job_id, data))
            }
          }).catch((error) => {
            if (error?.name !== "AbortError" && pendingJobControllerRef.current === controller) {
              setMessages(prev => interruptEmiliaTurn(prev, pendingJob.job_id, error.message,
                error instanceof EmiliaJobError && error.kind === "job"))
            }
          }).finally(() => {
            if (pendingJobControllerRef.current === controller) {
              pendingJobControllerRef.current = null
              setSending(false)
            }
          })
        }
        return msgs.length
      }
    } catch {
      // silencioso — historial es nice-to-have
    }
    return 0
  }

  async function handleSend() {
    if (!input.trim() || !conversationId || sending) return
    const text = input.trim()
    setInput("")
    setSending(true)
    const clientId = generateClientId()
    followBottomRef.current = true
    setMessages(prev => applyEmiliaTurnUpdate([...prev, { id: `user_${clientId}`, role: "user", text }], clientId, { status: "queued" }))
    const controller = new AbortController()
    pendingJobControllerRef.current?.abort()
    pendingJobControllerRef.current = controller
    try {
      const res = await fetch("/api/emilia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId,
          clientId,
          // Sólo la primera vuelta necesita el default. Después manda el
          // contexto persistido por Emilia o un origen explícito del usuario.
          defaultOrigin: messages.length === 0 ? defaultOrigin : undefined,
        }),
        signal: controller.signal,
      })
      const initialData = await res.json()
      if (controller.signal.aborted || pendingJobControllerRef.current !== controller) return
      if (!res.ok) {
        const errText = initialData?.error?.message || initialData?.error
          || (res.status === 429 ? "Demasiadas búsquedas. Esperá unos segundos." : "No pude buscar ahora.")
        setMessages(prev => interruptEmiliaTurn(prev, clientId, errText, true))
        return
      }
      setMessages(prev => applyEmiliaTurnUpdate(prev, clientId, initialData))
      const data = initialData.status === "queued" || initialData.status === "processing"
        ? await waitForEmiliaJob({
          jobId: initialData.job_id,
          conversationId,
          pollAfterMs: initialData.poll_after_ms,
          signal: controller.signal,
          onProgress: update => {
            if (pendingJobControllerRef.current === controller && !controller.signal.aborted) {
              setMessages(prev => applyEmiliaTurnUpdate(prev, clientId, update))
            }
          },
        })
        : initialData
      if (!controller.signal.aborted && pendingJobControllerRef.current === controller) {
        setMessages(prev => applyEmiliaTurnUpdate(prev, clientId, data))
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || pendingJobControllerRef.current !== controller) return
      const text = err instanceof EmiliaJobError
        ? err.kind === "job" || err.kind === "http"
          ? err.message
          : err.kind === "timeout"
            ? err.message
            : `Error de conexión: ${err.message}`
        : `No pude completar la búsqueda: ${err?.message || "error inesperado"}`
      setMessages(prev => interruptEmiliaTurn(prev, clientId, text,
        err instanceof EmiliaJobError && err.kind === "job"))
    } finally {
      if (pendingJobControllerRef.current === controller) {
        pendingJobControllerRef.current = null
        setSending(false)
      }
    }
  }

  // Última respuesta con cards para mostrar selección
  const lastResults = useMemo(() => {
    return activeResultMessageIndex >= 0 ? messages[activeResultMessageIndex] : null
  }, [messages, activeResultMessageIndex])

  function toggleFlight(id: string) {
    setSelectedFlightId(prev => (prev === id ? null : id))
  }

  function updateFlightFilters(messageIndex: number, filters: FlightFilters) {
    setFlightFiltersByMessage(prev => ({ ...prev, [messageIndex]: filters }))
  }

  function clearFlightFilters(messageIndex: number) {
    setFlightFiltersByMessage(prev => {
      const next = { ...prev }
      delete next[messageIndex]
      return next
    })
  }

  function updateHotelFilters(messageIndex: number, filters: HotelFilters) {
    setHotelFiltersByMessage(prev => ({ ...prev, [messageIndex]: filters }))
  }

  function clearHotelFilters(messageIndex: number) {
    setHotelFiltersByMessage(prev => {
      const next = { ...prev }
      delete next[messageIndex]
      return next
    })
  }

  // Seleccionar/deseleccionar un hotel desde el checkbox. Al seleccionar,
  // toma por defecto la primera habitación usando su `occupancy_id` real, para
  // que la cotización mapee el room correcto (y el highlight de selección
  // coincida con una room existente).
  function toggleHotelSelection(hotel: EurovipsHotel) {
    setSelectedHotels(prev => {
      const next = new Map(prev)
      if (next.has(hotel.id)) {
        next.delete(hotel.id)
      } else {
        try { return selectHotelForStay(next, hotel, hotel.rooms?.[0]?.occupancy_id ?? "", lastResults?.cards?.hotels?.items || []) }
        catch (error) { toast.error((error as Error).message); return prev }
      }
      return next
    })
  }

  // Elegir una habitación puntual. Si el hotel no estaba seleccionado, lo
  // selecciona con esa habitación; si ya estaba, cambia la habitación (o lo
  // deselecciona si se vuelve a clickear la misma).
  function selectHotelRoom(hotel: EurovipsHotel, roomId: string) {
    setSelectedHotels(prev => {
      const next = new Map(prev)
      if (next.has(hotel.id)) {
        if (next.get(hotel.id) === roomId) {
          next.delete(hotel.id)
        } else {
          next.set(hotel.id, roomId)
        }
      } else {
        try { return selectHotelForStay(next, hotel, roomId, lastResults?.cards?.hotels?.items || []) }
        catch (error) { toast.error((error as Error).message); return prev }
      }
      return next
    })
  }

  // Only follow updates while the user is already reading at the bottom.
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const followBottomRef = useRef(true)
  useEffect(() => {
    if (followBottomRef.current) messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
  }, [messages])

  async function handleGenerate() {
    if (generating || sending || (lastResults?.jobStatus && lastResults.jobStatus !== "completed")) return
    // Una cotización sólo puede usar cards del último turno de resultados de
    // la búsqueda activa. Nunca mezclamos opciones de destinos/iteraciones
    // históricas aunque coincidan sus ids.
    const flightById = new Map<string, EmiliaFlight>()
    const hotelById = new Map<string, EurovipsHotel>()
    for (const msg of lastResults ? [lastResults] : []) {
      for (const f of msg.cards?.flights?.items || []) flightById.set(f.id, f)
      for (const h of msg.cards?.hotels?.items || []) hotelById.set(h.id, h)
    }
    const flight = selectedFlightId ? flightById.get(selectedFlightId) ?? null : null
    // El Map guarda el `occupancy_id` de la room elegida, no un índice.
    // Resolvemos el índice real buscando ese occupancy_id en las rooms del hotel.
    const selectedHotelArr = Array.from(selectedHotels.keys())
      .map((id) => hotelById.get(id))
      .filter((h): h is EurovipsHotel => Boolean(h))
      .map((h) => {
        const occId = selectedHotels.get(h.id)
        const idx = h.rooms?.findIndex(r => r.occupancy_id === occId) ?? -1
        return { hotel: h, roomIndex: idx >= 0 ? idx : 0 }
      })

    // Emilia entrega los datos parseados en `originalRequest` (search_results)
    // o `parsedRequest` (trip_planner). Soportar ambos + caer al flight/hotel
    // seleccionado como última fuente de fechas.
    const meta = (lastResults?.meta || {}) as any
    const req = meta.originalRequest || meta.parsedRequest || {}
    if (process.env.NODE_ENV !== "production") {
      console.debug("[LeadEmiliaChat] meta del último mensaje:", meta)
    }
    const generalData = {
      departureDate:
        req?.flights?.departureDate ||
        req?.hotels?.checkinDate ||
        req?.departureDate ||
        req?.checkinDate ||
        flight?.departure_date ||
        selectedHotelArr[0]?.hotel?.check_in ||
        "",
      returnDate:
        req?.flights?.returnDate ||
        req?.hotels?.checkoutDate ||
        req?.returnDate ||
        req?.checkoutDate ||
        flight?.return_date ||
        selectedHotelArr[0]?.hotel?.check_out ||
        null,
      adults:
        req?.flights?.adults ||
        req?.hotels?.adults ||
        req?.adults ||
        flight?.adults ||
        selectedHotelArr[0]?.hotel?.search_adults ||
        1,
      children:
        req?.flights?.children ||
        req?.hotels?.children ||
        req?.children ||
        flight?.children ||
        selectedHotelArr[0]?.hotel?.search_children ||
        0,
      infants:
        req?.flights?.infants ||
        req?.hotels?.infants ||
        req?.infants ||
        0,
    }
    if (!generalData.departureDate) {
      toast.error(
        "No pude inferir las fechas. Pedile a Emilia que las aclare (ej. 'del 1 al 15 de julio') o cargá una cotización manual."
      )
      return
    }
    if (!lead.agency_id) {
      toast.error("El lead no tiene agencia asociada.")
      return
    }

    setGenerating(true)
    try {
      const payload = buildQuotationPayload({
        lead: {
          id: lead.id,
          contact_name: lead.contact_name,
          destination: lead.destination ?? null,
          region: lead.region ?? null,
          agency_id: lead.agency_id,
        },
        selectedFlight: flight,
        selectedHotels: selectedHotelArr,
        requiredStayIds: Array.from(new Set(parseHotelSegments({ hotel_segments: lastResults?.meta?.hotelSegments }).map(segment => segment.stay_id))),
        generalData,
      })
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error || "No se pudo crear la cotización")
        return
      }
      setCreatedQuotation(json.data)
      setCreatedQuotationDocumentReady(false)
      toast.success(`Cotización ${json.data?.quotation_number} creada`)
      onQuotationCreated?.(json.data)
    } catch (err: any) {
      toast.error("Error generando cotización: " + (err?.message || ""))
    } finally {
      setGenerating(false)
    }
  }

  const generateLabel = useMemo(() => {
    const fc = selectedFlightId ? 1 : 0
    const hc = selectedHotels.size
    if (fc + hc === 0) return "Generar cotización"
    const scoped = lastResults?.cards?.hotels?.items.some(hotel => hotel.search_context)
    const opts = scoped ? 1 : Math.max(hc, 1)
    return `Generar cotización · ${opts} opción${opts > 1 ? "es" : ""} (${fc} vuelo + ${hc} hotel${hc !== 1 ? "es" : ""})`
  }, [selectedFlightId, selectedHotels, lastResults])

  const canGenerate = (selectedFlightId !== null || selectedHotels.size > 0)
    && !generating
    && !sending
    && (!lastResults?.jobStatus || lastResults.jobStatus === "completed")

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">Iniciando chat con Emilia…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-6 py-3 border-b text-sm">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Detalle del lead
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-semibold text-primary inline-flex items-center gap-1">
          <MessageSquarePlus className="h-4 w-4" /> Chat con Emilia
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Ver cómo pedirle una cotización a Emilia"
          onClick={() => startTour("cotizar-emilia")}
          disabled={Boolean(activeTour)}
        >
          <HelpCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Cómo pedir
        </Button>
      </div>

      {/* Mensajes */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3" onScroll={event => {
        const element = event.currentTarget
        followBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100
      }}>
        {messages.length === 0 && (
          <div className="py-6">
            <EmiliaPromptGuide />
          </div>
        )}
        {messages.map((m, i) => {
          const mFlights = m.cards?.flights?.items || []
          const mHotels = m.cards?.hotels?.items || []
          const mConfidence = m.meta?.originalRequest?.confidence ?? 1
          const hasCards = mFlights.length > 0 || mHotels.length > 0
          const messageSearchContextId = getMessageSearchContextId(m)
          const isActiveResultTurn = !hasCards || i === activeResultMessageIndex
          const isNewSearchBoundary = m.role === "assistant"
            && m.meta?.turnSemantics?.relation === "new_search"
            && messages.slice(0, i).some(previous => Boolean(getMessageSearchContextId(previous)))
          const searchSummary = m.meta?.searchSummary?.text
          const flightFilters = flightFiltersByMessage[i] ?? DEFAULT_FLIGHT_FILTERS
          const hotelFilters = hotelFiltersByMessage[i] ?? DEFAULT_HOTEL_FILTERS
          const visibleFlights = filterFlights(mFlights, flightFilters, selectedFlightId)
          const visibleHotels = filterHotels(mHotels, hotelFilters, selectedHotels)
          const flightFilterOptions = getFlightFilterOptions(mFlights)
          const hotelFilterOptions = getHotelFilterOptions(mHotels)
          return (
            <div key={m.id || i} className="space-y-2" data-emilia-job={m.jobId}>
              {isNewSearchBoundary && (
                <div className="flex items-center gap-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  <span>Nueva búsqueda</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              {/* Burbuja del mensaje. Ancho acotado: con el modal ancho,
                  85% serían ~1080px — ilegible para una línea de texto. */}
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[min(85%,42rem)] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <span className={m.role === "assistant" && (m.jobStatus === "queued" || m.jobStatus === "processing") ? progressStyles.active : undefined}>
                    {m.text}
                  </span>
                  {m.meta?.missing_fields && m.meta.missing_fields.length > 0 && (
                    <ul className="mt-2 text-xs list-disc list-inside opacity-80">
                      {m.meta.missing_fields.map((f, idx) => <li key={idx}>{f}</li>)}
                    </ul>
                  )}
                </div>
              </div>

              {m.role === "assistant" && searchSummary && (
                <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Resumen</span>
                  <span className="min-w-0 truncate">{searchSummary}</span>
                  {messageSearchContextId && !isActiveResultTurn && (
                    <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">Histórico</Badge>
                  )}
                </div>
              )}

              {/* Resultados de ESTE mensaje, inline debajo (flujo de chat real) */}
              {(hasCards || m.progress) && (
                <div className={cn(
                  "space-y-2",
                  !isActiveResultTurn && "opacity-60 [&_button]:pointer-events-none [&_button]:cursor-not-allowed"
                )}>
                  {!isActiveResultTurn && (
                    <div className="flex justify-end">
                      <Badge variant="outline" className="text-[10px]">Resultados históricos</Badge>
                    </div>
                  )}
                  {mConfidence < 0.7 && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>Emilia entendió tu pedido con baja confianza ({Math.round(mConfidence * 100)}%). Verificá los datos antes de generar la cotización.</span>
                    </div>
                  )}

                  <ProductSearchStatus product="flights" state={m.progress?.products.flights || m.meta?.productStates?.flights} />
                  {mFlights.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-foreground/60 mb-2">
                        <span>✈️ Vuelos · {mFlights.some(f => f.id === selectedFlightId) ? 1 : 0} de {mFlights.length} seleccionado</span>
                        <span className="text-foreground/40 normal-case">máx 1</span>
                      </div>
                      <FlightFiltersBar
                        filters={flightFilters}
                        options={flightFilterOptions}
                        visibleCount={visibleFlights.length}
                        totalCount={mFlights.length}
                        onChange={(filters) => updateFlightFilters(i, filters)}
                        onClear={() => clearFlightFilters(i)}
                      />
                      {visibleFlights.length > 0 ? (
                        <CardCarousel count={visibleFlights.length} ariaLabel="Vuelos disponibles">
                          {visibleFlights.map((flight) => (
                            <CarouselSlide key={flight.id}>
                              <FlightResultCard
                                flight={flight as any}
                                selected={selectedFlightId === flight.id}
                                onSelectionChange={(id, _selected) => toggleFlight(id)}
                              />
                            </CarouselSlide>
                          ))}
                        </CardCarousel>
                      ) : (
                        <FilteredResultsEmpty onClear={() => clearFlightFilters(i)} />
                      )}
                    </div>
                  )}

                  <ProductSearchStatus product="hotels" state={m.progress?.products.hotels || m.meta?.productStates?.hotels} />
                  {parseHotelSegments({ hotel_segments: m.meta?.hotelSegments }).map(segment => (
                    <p key={`${segment.stay_id}:${segment.destination_option_id}`} className="text-xs text-muted-foreground" role="status">
                      {segment.city} · {segment.check_in} al {segment.check_out}
                      {segment.status === "failed" ? " · No pudimos consultar esta alternativa. Podés reintentar." : segment.status === "empty" ? " · Sin disponibilidad" : " · Disponible"}
                    </p>
                  ))}
                  {mHotels.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-foreground/60 mb-2">
                        <span>🏨 Hoteles · {mHotels.filter(h => selectedHotels.has(h.id)).length} de {mHotels.length} seleccionados</span>
                        <span className="text-foreground/40 normal-case">{mHotels.some(hotel => hotel.search_context) ? "1 hotel por estadía" : "máx 4"}</span>
                      </div>
                      <HotelFiltersBar
                        filters={hotelFilters}
                        options={hotelFilterOptions}
                        visibleCount={visibleHotels.length}
                        totalCount={mHotels.length}
                        onChange={(filters) => updateHotelFilters(i, filters)}
                        onClear={() => clearHotelFilters(i)}
                      />
                      {visibleHotels.length > 0 ? (
                        <CardCarousel count={visibleHotels.length} ariaLabel="Hoteles disponibles">
                          {visibleHotels.map((hotel) => (
                            <CarouselSlide key={hotel.id}>
                              {hotel.search_context && <p className="mb-2 text-xs font-medium">
                                Estadía {hotel.search_context.required_stay_ids.indexOf(hotel.search_context.stay_id) + 1} · {hotel.city} · {hotel.check_in} al {hotel.check_out}
                              </p>}
                              <HotelResultCard
                                hotel={hotel as any}
                                compact
                                selected={selectedHotels.has(hotel.id)}
                                selectedRoomId={selectedHotels.get(hotel.id)}
                                onRoomSelect={(roomId) => selectHotelRoom(hotel, roomId)}
                                onSelectionChange={() => toggleHotelSelection(hotel)}
                              />
                            </CarouselSlide>
                          ))}
                        </CardCarousel>
                      ) : (
                        <FilteredResultsEmpty onClear={() => clearHotelFilters(i)} />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Turno de búsqueda SIN resultados: en vez de dejar solo el texto
                  de Emilia, mostramos qué entendió + cómo reintentar. */}
              {!hasCards && !m.progress && m.jobStatus !== "processing" && m.jobStatus !== "queued" && m.role === "assistant" && m.meta?.messageType
                && ["search_results", "no_results"].includes(m.meta.messageType) && (
                <EmptySearchNotice meta={m.meta} />
              )}
            </div>
          )
        })}

        {/* Sentinela para auto-scroll al final */}
        <div ref={messagesEndRef} />

        {/* Banner post-creación */}
        {createdQuotation && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-900 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Cotización {createdQuotation.quotation_number} creada</div>
              <div className="text-xs opacity-80">{(createdQuotation.quotation_options?.length || 1)} opción(es) · vinculada al lead</div>
            </div>
            {createdQuotation.public_token && createdQuotationDocumentReady && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(getPublicQuotationPath(createdQuotation.public_token), "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setPdfPriceQuotation({
                  id: createdQuotation.id,
                  public_token: createdQuotation.public_token ?? null,
                })
              }
            >
              <FileText className="h-3.5 w-3.5 mr-1" /> Generar PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreatedQuotation(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Mismo modal reutilizado en CRM → Cotizaciones → Editar borrador / Generar PDF */}
      <QuotationPdfPriceDialog
        quotationId={pdfPriceQuotation?.id ?? null}
        onClose={() => setPdfPriceQuotation(null)}
        onGenerate={async (_quotationId, expectedUpdatedAt) => {
          if (!pdfPriceQuotation) return
          const document = await downloadQuotationPdfFromPriceDialog({
            quotationId: pdfPriceQuotation.id,
            publicToken: pdfPriceQuotation.public_token,
            expectedUpdatedAt,
          })
          setCreatedQuotationDocumentReady(true)
          return document
        }}
        sendValidationError={!pdfPriceQuotation?.public_token
          ? "La cotización no tiene enlace público"
          : !(lead.contact_phone?.replace(/[^0-9+]/g, "") || "")
            ? "El lead no tiene un teléfono para WhatsApp"
            : undefined}
        onSend={async (_quotationId, sendWindow, expectedUpdatedAt) => {
          if (!pdfPriceQuotation?.public_token) throw new Error("La cotización no tiene enlace público")
          const phone = lead.contact_phone?.replace(/[^0-9+]/g, "") || ""
          if (!phone) throw new Error("El lead no tiene un teléfono para WhatsApp")
          const document = await fetchQuotationDocumentForUser(pdfPriceQuotation.id, {
            issue: true,
            markSent: true,
            expectedUpdatedAt,
          })
          const publicUrl = `${window.location.origin}${getPublicQuotationPath(pdfPriceQuotation.public_token)}`
          const cleanPhone = phone.startsWith("+") ? phone.slice(1) : phone
          const message = encodeURIComponent(`Hola ${lead.contact_name}! Te paso tu cotización${lead.destination ? ` para ${lead.destination}` : ""}:\n\n${publicUrl}\n\nQuedo a disposición por cualquier consulta.`)
          setCreatedQuotation((current: any | null) => current ? { ...current, status: "SENT" } : current)
          setCreatedQuotationDocumentReady(true)
          if (createdQuotation) onQuotationCreated?.({ ...createdQuotation, status: "SENT" })
          const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`
          sendWindow.location.href = whatsappUrl
          toast.success("Cotización preparada para enviar")
          return document
        }}
      />

      {/* Input + CTA */}
      <div className="border-t px-6 py-3 space-y-3">
        {/* "Sugerir prompt inicial" solo al iniciar el chat (sin mensajes todavía).
            Si ya hay conversación, no aparece. */}
        {messages.length === 0 && (
          <div className="flex">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => applySuggestedPrompt(true)}
              disabled={promptLoading || sending}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {promptLoading
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Sugerir pedido
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            data-tour="emilia.prompt"
            aria-label="Pedido para Emilia"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={promptLoading && !input
              ? "✨ Preparando una sugerencia…"
              : "Ej.: Quiero un vuelo y hotel desde Buenos Aires a Cancún, 10 al 17/10, 2 adultos"}
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend()
            }}
            disabled={sending}
          />
          <Button
            type="button"
            data-tour="emilia.send"
            aria-label="Enviar pedido a Emilia"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="self-end"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full"
          variant="default"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {generateLabel}
        </Button>
      </div>
    </div>
  )
}
