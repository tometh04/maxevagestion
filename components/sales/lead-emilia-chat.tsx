// components/sales/lead-emilia-chat.tsx
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, ChevronLeft, ChevronRight, MessageSquarePlus, Send, AlertTriangle, CheckCircle2, ExternalLink, X, Sparkles, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { FlightResultCard } from "@/components/emilia/flight-result-card"
import { HotelResultCard } from "@/components/emilia/hotel-result-card"
import { buildQuotationPayload, type EmiliaFlight, type EurovipsHotel } from "@/lib/emilia/quotation-mapper"
import { getPublicQuotationPdfPath } from "@/lib/quotations/public-links"
import { QuotationPdfPriceDialog } from "@/components/sales/quotation-pdf-price-dialog"

const MAX_HOTELS = 4

// -------------------------------------------------------------------------
// CarouselSlide — wrapper unificado para cada card del carrusel.
// Ancho fijo (para el snap horizontal) pero ALTURA NATURAL: la card crece
// con su contenido. Una altura fija + overflow-hidden recortaba el vuelo de
// REGRESO, el "total" del hotel y el ring de selección (`ring-2 ring-primary`).
// -------------------------------------------------------------------------
const SLIDE_WIDTH = 320

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
      <div
        ref={trackRef}
        onScroll={updateNav}
        className="flex gap-3 items-start overflow-x-auto scroll-smooth snap-x snap-mandatory -mx-3 px-3 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
// TypingIndicator — burbuja del lado del asistente (opuesto al mensaje del
// usuario) con tres puntos que laten suave mientras Emilia "piensa", entre el
// envío y la respuesta. Motion sutil (opacity + translateY, sin bounce) y
// respeta prefers-reduced-motion.
// -------------------------------------------------------------------------
function TypingIndicator() {
  return (
    <div className="flex justify-start" role="status" aria-label="Emilia está pensando">
      <style>{`
        @keyframes emilia-typing{0%,70%,100%{opacity:.25;transform:translateY(0)}35%{opacity:1;transform:translateY(-3px)}}
        .emilia-typing-dot{animation:emilia-typing 1.2s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.emilia-typing-dot{animation:none;opacity:.5}}
      `}</style>
      <div className="bg-muted rounded-lg px-3.5 py-3 inline-flex items-center gap-1">
        <span className="emilia-typing-dot h-1.5 w-1.5 rounded-full bg-foreground/45" style={{ animationDelay: "0s" }} />
        <span className="emilia-typing-dot h-1.5 w-1.5 rounded-full bg-foreground/45" style={{ animationDelay: "0.16s" }} />
        <span className="emilia-typing-dot h-1.5 w-1.5 rounded-full bg-foreground/45" style={{ animationDelay: "0.32s" }} />
      </div>
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

interface Message {
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
}

export function LeadEmiliaChat({ lead, onBack, onQuotationCreated, initialConversation }: Props) {
  const [loading, setLoading] = useState(true)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [createdQuotation, setCreatedQuotation] = useState<any | null>(null)
  // Cotización con el dialog "Cambiar precio" abierto antes de generar el PDF
  const [pdfPriceQuotation, setPdfPriceQuotation] = useState<{ id: string; public_token: string } | null>(null)
  // Cargando el prompt sugerido (gpt). Loading sutil: se llena una sola vez.
  const [promptLoading, setPromptLoading] = useState(false)

  // Selección
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null)
  const [selectedHotels, setSelectedHotels] = useState<Map<string, string>>(new Map()) // hotelId → roomId

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
          const count = await loadHistory(conv.id)
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
    return () => { cancelled = true }
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
        setInput(prev => (force || prev.trim() === "" ? prompt : prev))
      }
    } catch {
      // silencioso
    } finally {
      if (!isCancelled()) setPromptLoading(false)
    }
  }

  // Devuelve la cantidad de mensajes cargados (para decidir si re-sugerir prompt).
  async function loadHistory(convId: string): Promise<number> {
    try {
      const res = await fetch(`/api/emilia/conversations/${convId}`)
      if (res.ok) {
        const json = await res.json()
        const msgs = (json?.messages || []).map((m: any): Message => {
          const md = m.content?.metadata || {}
          return {
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
    setMessages(prev => [...prev, { role: "user", text }])
    setSending(true)
    try {
      const res = await fetch("/api/emilia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errText = data?.error || (res.status === 429 ? "Demasiadas búsquedas. Esperá unos segundos." : "No pude buscar ahora.")
        setMessages(prev => [...prev, { role: "assistant", text: errText }])
        return
      }
      if (data.status === "incomplete") {
        setMessages(prev => [...prev, {
          role: "assistant",
          text: data.message || "Necesito más información.",
          meta: { missing_fields: data.missing_fields || [] },
        }])
        return
      }
      setMessages(prev => [...prev, {
        role: "assistant",
        text: data?.assistant_message?.content?.text || "Acá tenés los resultados:",
        cards: {
          flights: data?.results?.flights,
          hotels: data?.results?.hotels,
          requestType: data?.requestType,
        },
        meta: data?.assistant_message?.meta,
      }])
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", text: "Error de red: " + (err?.message || "") }])
    } finally {
      setSending(false)
    }
  }

  // Última respuesta con cards para mostrar selección
  const lastResults = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].cards?.flights?.items?.length || messages[i].cards?.hotels?.items?.length) {
        return messages[i]
      }
    }
    return null
  }, [messages])

  function toggleFlight(id: string) {
    setSelectedFlightId(prev => (prev === id ? null : id))
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
        if (next.size >= MAX_HOTELS) {
          toast.error(`Solo podés seleccionar hasta ${MAX_HOTELS} hoteles. Deseleccioná uno para elegir otro.`)
          return prev
        }
        next.set(hotel.id, hotel.rooms?.[0]?.occupancy_id ?? "")
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
        if (next.size >= MAX_HOTELS) {
          toast.error(`Solo podés seleccionar hasta ${MAX_HOTELS} hoteles. Deseleccioná uno para elegir otro.`)
          return prev
        }
        next.set(hotel.id, roomId)
      }
      return next
    })
  }

  // Auto-scroll al final cuando llegan mensajes nuevos o cards de resultados
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, sending])

  async function handleGenerate() {
    if (generating) return
    // Las cards ahora viven inline en cada mensaje. Aplanamos TODOS los
    // resultados de la conversación (deduplicando por id, último gana) para
    // resolver el vuelo/hotel seleccionado sin importar en qué mensaje esté.
    const flightById = new Map<string, EmiliaFlight>()
    const hotelById = new Map<string, EurovipsHotel>()
    for (const msg of messages) {
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
    const opts = Math.max(hc, 1)
    return `Generar cotización · ${opts} opción${opts > 1 ? "es" : ""} (${fc} vuelo + ${hc} hotel${hc !== 1 ? "es" : ""})`
  }, [selectedFlightId, selectedHotels])

  const canGenerate = (selectedFlightId !== null || selectedHotels.size > 0) && !generating

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">Iniciando chat con Emilia…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-6 py-3 border-b text-sm">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Detalle del lead
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-semibold text-primary inline-flex items-center gap-1">
          <MessageSquarePlus className="h-4 w-4" /> Chat con Emilia
        </span>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Revisá el prompt sugerido y enviá a Emilia.
          </div>
        )}
        {messages.map((m, i) => {
          const mFlights = m.cards?.flights?.items || []
          const mHotels = m.cards?.hotels?.items || []
          const mConfidence = m.meta?.originalRequest?.confidence ?? 1
          const hasCards = mFlights.length > 0 || mHotels.length > 0
          return (
            <div key={i} className="space-y-2">
              {/* Burbuja del mensaje */}
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.text}
                  {m.meta?.missing_fields && m.meta.missing_fields.length > 0 && (
                    <ul className="mt-2 text-xs list-disc list-inside opacity-80">
                      {m.meta.missing_fields.map((f, idx) => <li key={idx}>{f}</li>)}
                    </ul>
                  )}
                </div>
              </div>

              {/* Resultados de ESTE mensaje, inline debajo (flujo de chat real) */}
              {hasCards && (
                <div className="space-y-2">
                  {mConfidence < 0.7 && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>Emilia entendió tu pedido con baja confianza ({Math.round(mConfidence * 100)}%). Verificá los datos antes de generar la cotización.</span>
                    </div>
                  )}

                  {mFlights.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-foreground/60 mb-2">
                        <span>✈️ Vuelos · {mFlights.some(f => f.id === selectedFlightId) ? 1 : 0} de {mFlights.length} seleccionado</span>
                        <span className="text-foreground/40 normal-case">máx 1</span>
                      </div>
                      <CardCarousel count={mFlights.length} ariaLabel="Vuelos disponibles">
                        {mFlights.map((flight) => (
                          <CarouselSlide key={flight.id}>
                            <FlightResultCard
                              flight={flight as any}
                              selected={selectedFlightId === flight.id}
                              onSelectionChange={(id, _selected) => toggleFlight(id)}
                            />
                          </CarouselSlide>
                        ))}
                      </CardCarousel>
                    </div>
                  )}

                  {mHotels.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-foreground/60 mb-2">
                        <span>🏨 Hoteles · {mHotels.filter(h => selectedHotels.has(h.id)).length} de {mHotels.length} seleccionados</span>
                        <span className="text-foreground/40 normal-case">máx 4</span>
                      </div>
                      <CardCarousel count={mHotels.length} ariaLabel="Hoteles disponibles">
                        {mHotels.map((hotel) => (
                          <CarouselSlide key={hotel.id}>
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
                    </div>
                  )}
                </div>
              )}

              {/* Turno de búsqueda SIN resultados: en vez de dejar solo el texto
                  de Emilia, mostramos qué entendió + cómo reintentar. */}
              {!hasCards && m.role === "assistant" && m.meta?.messageType === "search_results" && (
                <EmptySearchNotice meta={m.meta} />
              )}
            </div>
          )
        })}

        {/* Emilia "pensando" mientras esperamos la respuesta del turno */}
        {sending && <TypingIndicator />}

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
            <Button size="sm" variant="outline" onClick={() => window.open(`/cotizacion/${createdQuotation.public_token}`, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver
            </Button>
            {createdQuotation.public_token && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPdfPriceQuotation({ id: createdQuotation.id, public_token: createdQuotation.public_token })}
              >
                <FileText className="h-3.5 w-3.5 mr-1" /> Generar PDF
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setCreatedQuotation(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Cambiar precio antes de generar el PDF */}
      <QuotationPdfPriceDialog
        quotationId={pdfPriceQuotation?.id ?? null}
        onClose={() => setPdfPriceQuotation(null)}
        onGenerate={() => {
          if (pdfPriceQuotation) {
            window.open(getPublicQuotationPdfPath(pdfPriceQuotation.public_token), "_blank", "noopener,noreferrer")
          }
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
              Sugerir prompt inicial
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={promptLoading && !input ? "✨ Generando sugerencia…" : "Escribí a Emilia..."}
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend()
            }}
            disabled={sending}
          />
          <Button onClick={handleSend} disabled={!input.trim() || sending} className="self-end">
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
