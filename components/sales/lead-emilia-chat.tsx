// components/sales/lead-emilia-chat.tsx
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, ChevronLeft, MessageSquarePlus, Send, AlertTriangle, CheckCircle2, ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { FlightResultCard } from "@/components/emilia/flight-result-card"
import { HotelResultCard } from "@/components/emilia/hotel-result-card"
import { buildQuotationPayload, type EmiliaFlight, type EurovipsHotel } from "@/lib/emilia/quotation-mapper"

const MAX_HOTELS = 4

interface Message {
  role: "user" | "assistant"
  text: string
  cards?: {
    flights?: { count: number; items: EmiliaFlight[] }
    hotels?: { count: number; items: EurovipsHotel[] }
    requestType?: string
  }
  meta?: {
    confidence?: number
    originalRequest?: any
    missing_fields?: string[]
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
}

export function LeadEmiliaChat({ lead, onBack, onQuotationCreated }: Props) {
  const [loading, setLoading] = useState(true)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [createdQuotation, setCreatedQuotation] = useState<any | null>(null)

  // Selección
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null)
  const [selectedHotels, setSelectedHotels] = useState<Map<string, string>>(new Map()) // hotelId → roomId

  // Inicialización: GET conversación activa, sino POST para crear + pedir prompt
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const getRes = await fetch(`/api/leads/${lead.id}/emilia`)
        if (cancelled) return
        if (getRes.status === 403) {
          toast.error("Esta feature está en beta y no está habilitada para tu organización")
          onBack()
          return
        }
        const getData = await getRes.json()
        if (getData?.data?.id) {
          setConversationId(getData.data.id)
          await loadHistory(getData.data.id)
        } else {
          // No hay conversación activa → crear nueva con prompt sugerido
          const postRes = await fetch(`/api/leads/${lead.id}/emilia`, { method: "POST" })
          if (cancelled) return
          const postData = await postRes.json()
          if (!postRes.ok) {
            toast.error(postData.error || "No se pudo iniciar el chat")
            onBack()
            return
          }
          setConversationId(postData.conversation_id)
          setInput(postData.suggested_prompt || "")
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

  async function loadHistory(convId: string) {
    try {
      const res = await fetch(`/api/emilia/conversations/${convId}`)
      if (res.ok) {
        const json = await res.json()
        const msgs = (json?.messages || []).map((m: any): Message => ({
          role: m.role,
          text: m.content?.text || "",
          cards: m.content?.cards,
          meta: m.content?.metadata,
        }))
        setMessages(msgs)
      }
    } catch {
      // silencioso — historial es nice-to-have
    }
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

  const flightsList = lastResults?.cards?.flights?.items || []
  const hotelsList = lastResults?.cards?.hotels?.items || []
  const confidence = lastResults?.meta?.originalRequest?.confidence ?? 1

  function toggleFlight(id: string) {
    setSelectedFlightId(prev => (prev === id ? null : id))
  }

  function toggleHotel(hotelId: string, roomId?: string) {
    setSelectedHotels(prev => {
      const next = new Map(prev)
      if (next.has(hotelId)) {
        next.delete(hotelId)
      } else {
        if (next.size >= MAX_HOTELS) {
          toast.error(`Solo podés seleccionar hasta ${MAX_HOTELS} hoteles. Deseleccioná uno para elegir otro.`)
          return prev
        }
        next.set(hotelId, roomId || "0")
      }
      return next
    })
  }

  async function handleGenerate() {
    if (generating) return
    const flight = flightsList.find(f => f.id === selectedFlightId) || null
    const selectedHotelArr = hotelsList
      .filter(h => selectedHotels.has(h.id))
      .map(h => ({ hotel: h, roomIndex: parseInt(selectedHotels.get(h.id) || "0", 10) }))

    const originalRequest = lastResults?.meta?.originalRequest
    const generalData = {
      departureDate: originalRequest?.flights?.departureDate || originalRequest?.hotels?.checkinDate || "",
      returnDate: originalRequest?.flights?.returnDate || originalRequest?.hotels?.checkoutDate || null,
      adults: originalRequest?.flights?.adults || originalRequest?.hotels?.adults || 1,
      children: originalRequest?.flights?.children || originalRequest?.hotels?.children || 0,
      infants: originalRequest?.flights?.infants || originalRequest?.hotels?.infants || 0,
    }
    if (!generalData.departureDate) {
      toast.error("Pedile a Emilia que aclare las fechas antes de generar.")
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
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">Iniciando chat con Emilia…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
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
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {m.text}
              {m.meta?.missing_fields && m.meta.missing_fields.length > 0 && (
                <ul className="mt-2 text-xs list-disc list-inside opacity-80">
                  {m.meta.missing_fields.map((f, idx) => <li key={idx}>{f}</li>)}
                </ul>
              )}
            </div>
          </div>
        ))}

        {/* Confidence warning */}
        {confidence < 0.7 && lastResults && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Emilia entendió tu pedido con baja confianza ({Math.round(confidence * 100)}%). Verificá los datos antes de generar la cotización.</span>
          </div>
        )}

        {/* Cards de vuelos */}
        {flightsList.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-foreground/60 mb-2">
              <span>✈️ Vuelos · {selectedFlightId ? 1 : 0} de {flightsList.length} seleccionado</span>
              <span className="text-foreground/40 normal-case">máx 1</span>
            </div>
            <div className="space-y-2">
              {flightsList.map((flight) => (
                <FlightResultCard
                  key={flight.id}
                  flight={flight as any}
                  selected={selectedFlightId === flight.id}
                  onSelectionChange={(id, _selected) => toggleFlight(id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Cards de hoteles */}
        {hotelsList.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-foreground/60 mb-2">
              <span>🏨 Hoteles · {selectedHotels.size} de {hotelsList.length} seleccionados</span>
              <span className="text-foreground/40 normal-case">máx 4</span>
            </div>
            <div className="space-y-2">
              {hotelsList.map((hotel) => (
                <HotelResultCard
                  key={hotel.id}
                  hotel={hotel as any}
                  selected={selectedHotels.has(hotel.id)}
                  selectedRoomId={selectedHotels.get(hotel.id)}
                  onRoomSelect={(roomId) => toggleHotel(hotel.id, roomId)}
                  onSelectionChange={(hid, sel) => sel ? toggleHotel(hid) : toggleHotel(hid)}
                />
              ))}
            </div>
          </div>
        )}

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
            <Button size="sm" variant="ghost" onClick={() => setCreatedQuotation(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Input + CTA */}
      <div className="border-t px-6 py-3 space-y-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí a Emilia (ej. más baratos, otra fecha…)"
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
