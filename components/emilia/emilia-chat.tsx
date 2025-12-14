"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
    Send,
    Loader2,
    Plane,
    Building2,
    AlertCircle,
    Sparkles,
    ChevronRight,
    FileText,
    Hotel as HotelIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { FlightResultCard } from "./flight-result-card"
import { HotelResultCard } from "./hotel-result-card"
import { generateClientId } from "@/lib/emilia/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Message {
    id: string
    role: "user" | "assistant"
    content: MessageContent
    created_at: string
}

interface MessageContent {
    text?: string
    cards?: {
        flights?: SearchResultsFlights
        hotels?: SearchResultsHotels
        requestType?: 'combined' | 'flights-only' | 'hotels-only'
    }
    metadata?: {
        search_id?: string
        results_count?: number
    }
}

interface SearchResultsFlights {
    count: number
    items: any[] // FlightData según especificación
}

interface SearchResultsHotels {
    count: number
    items: any[] // HotelData según especificación
}

interface MissingField {
    field: string
    description: string
    examples: string[]
}

interface SuggestedFollowup {
    type: string
    prompt_example: string
}

export interface FlightResult {
    id: string
    airline: {
        code: string
        name: string
        logo?: string
    }
    price: {
        amount: number
        currency: string
    }
    adults: number
    childrens?: number
    children?: number
    departure_date: string
    return_date?: string
    legs: Array<{
        departure: {
            city_code: string
            city_name: string
            time: string
        }
        arrival: {
            city_code: string
            city_name: string
            time: string
        }
        duration: string
        flight_type: "outbound" | "inbound"
        layovers?: Array<{
            destination_city: string
            destination_code: string
            waiting_time: string
        }>
        arrival_next_day?: boolean
        options?: Array<{
            segments?: Array<{
                baggage?: string
                carryOnBagInfo?: {
                    quantity: string
                }
            }>
        }>
    }>
}

export interface HotelResult {
    id: string
    unique_id?: string
    name: string
    city: string
    address: string
    category: string
    nights: number
    check_in: string
    check_out: string
    adults: number
    children: number
    rooms: Array<{
        type: string
        description: string
        total_price: number
        price_per_night: number
        currency: string
        availability: number
        occupancy_id: string
        adults?: number
        children?: number
        infants?: number
    }>
    images?: string[]
    description?: string
    provider?: string
    policy_cancellation?: string
    policy_lodging?: string
}

interface EmiliaChatProps {
    conversationId: string | null
    userId: string
    userName: string
    onConversationUpdated?: (title: string) => void
}

const WELCOME_SUGGESTIONS = [
    "Vuelo a Miami para 2 adultos el 15 de enero",
    "Hotel all inclusive en Punta Cana",
    "Vuelo y hotel a Cancún del 20 al 27 de febrero",
    "Vuelo directo a Madrid desde Buenos Aires",
]

export function EmiliaChat({ conversationId, userId, userName, onConversationUpdated }: EmiliaChatProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)

    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const scrollToBottom = useCallback(() => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight
            }
        }
    }, [])

    // Cargar mensajes cuando cambia la conversación
    useEffect(() => {
        const loadMessages = async () => {
            // CASO 1: No hay conversación seleccionada
            if (!conversationId) {
                setMessages([])
                setIsLoadingMessages(false)
                return
            }

            // CASO 2: Es conversación optimista (nueva)
            // Sabemos que no tiene mensajes → skip fetch
            if (conversationId.startsWith('temp_')) {
                setMessages([])
                setIsLoadingMessages(false)
                return
            }

            // CASO 3: Es conversación real → fetch normal
            setIsLoadingMessages(true)
            try {
                const response = await fetch(`/api/emilia/conversations/${conversationId}`)
                if (response.ok) {
                    const data = await response.json()
                    setMessages(data.messages || [])
                } else {
                    console.error("Error loading messages")
                    setMessages([])
                }
            } catch (error) {
                console.error("Error loading messages:", error)
                setMessages([])
            } finally {
                setIsLoadingMessages(false)
            }
        }

        loadMessages()
    }, [conversationId])

    useEffect(() => {
        scrollToBottom()
    }, [messages, scrollToBottom])

    const sendMessage = async (messageText: string) => {
        if (!messageText.trim() || isLoading || !conversationId) return

        const clientId = generateClientId()
        const tempId = `temp_${Date.now()}`

        // Mensaje optimista
        const optimisticMessage: Message = {
            id: tempId,
            role: "user",
            content: { text: messageText },
            created_at: new Date().toISOString(),
        }

        setMessages((prev) => [...prev, optimisticMessage])
        setInput("")
        setIsLoading(true)

        try {
            const response = await fetch("/api/emilia/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: messageText,
                    conversationId,
                    clientId,
                }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || "Error al procesar la solicitud")
            }

            const data = await response.json()

            // Construir mensaje del asistente
            const assistantContent: MessageContent = {
                text: buildAssistantContentText(data),
                cards: data.results ? {
                    flights: data.results.flights,
                    hotels: data.results.hotels,
                    requestType: data.requestType || (data.results.flights && data.results.hotels ? 'combined' : data.results.flights ? 'flights-only' : 'hotels-only'),
                } : undefined,
                metadata: {
                    search_id: data.search_id,
                    results_count: (data.results?.flights?.count || 0) + (data.results?.hotels?.count || 0),
                },
            }

            const assistantMessage: Message = {
                id: `msg_${Date.now()}_assistant`,
                role: "assistant",
                content: assistantContent,
                created_at: new Date().toISOString(),
            }

            setMessages((prev) => {
                // Reemplazar mensaje optimista con el real
                const filtered = prev.filter(m => m.id !== tempId)
                return [
                    ...filtered,
                    {
                        ...optimisticMessage,
                        id: `msg_${Date.now()}_user`,
                    },
                    assistantMessage
                ]
            })

            // Notificar actualización del título si cambió
            if (data.conversationTitle) {
                onConversationUpdated?.(data.conversationTitle)
            }
        } catch (error: any) {
            console.error("Error sending message:", error)
            
            const errorContent = error.message || "Error al procesar la solicitud"
            toast.error(errorContent)

            const errorMessage: Message = {
                id: `msg_${Date.now()}_error`,
                role: "assistant",
                content: { text: errorContent },
                created_at: new Date().toISOString(),
            }
            
            setMessages((prev) => {
                const filtered = prev.filter(m => m.id !== tempId)
                return [...filtered, optimisticMessage, errorMessage]
            })
        } finally {
            setIsLoading(false)
            inputRef.current?.focus()
        }
    }

    const buildAssistantContentText = (data: any): string => {
        if (data.status === "error") {
            return data.error?.message || data.error || "Ocurrió un error procesando tu solicitud."
        }

        if (data.status === "incomplete") {
            // Mensaje personalizado cuando falta información
            let message = data.message || "Necesito más información para completar la búsqueda."

            // Agregar campos faltantes si hay
            if (data.missing_fields && data.missing_fields.length > 0) {
                const fieldsText = data.missing_fields.map((f: any) => {
                    if (typeof f === 'string') return f
                    return f.field || f.name
                }).join(", ")
                message += `\n\nFalta especificar: ${fieldsText}`
            }

            // Agregar sugerencias de seguimiento si hay
            if (data.suggested_followups && data.suggested_followups.length > 0) {
                message += "\n\nPor ejemplo:"
                data.suggested_followups.slice(0, 2).forEach((suggestion: any) => {
                    const text = typeof suggestion === 'string' ? suggestion : suggestion.prompt_example
                    if (text) message += `\n• ${text}`
                })
            }

            return message
        }

        if (data.status === "completed" && data.results) {
            const { flights, hotels } = data.results
            const parts: string[] = []

            if (flights?.count > 0) {
                parts.push(`Encontré ${flights.count} vuelo${flights.count > 1 ? "s" : ""} disponible${flights.count > 1 ? "s" : ""}.`)
            }

            if (hotels?.count > 0) {
                parts.push(`Encontré ${hotels.count} hotel${hotels.count > 1 ? "es" : ""} disponible${hotels.count > 1 ? "s" : ""}.`)
            }

            if (parts.length === 0) {
                return "No encontré resultados para tu búsqueda. ¿Querés modificar los criterios?"
            }

            return parts.join(" ")
        }

        return data.message || "Búsqueda procesada correctamente."
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            sendMessage(input)
        }
    }

    const handleSuggestionClick = (suggestion: string) => {
        sendMessage(suggestion)
    }

    const firstName = userName.split(" ")[0]

    return (
        <div className="flex flex-col h-[calc(100vh-12rem)] max-h-[800px]">
            {/* Chat Container */}
            <Card className="flex-1 flex flex-col overflow-hidden border-2 border-border/50 bg-gradient-to-b from-background to-muted/20">
                {/* Messages Area */}
                <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
                    {isLoadingMessages ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : messages.length === 0 && conversationId ? (
                        <WelcomeScreen
                            userName={firstName}
                            onSuggestionClick={handleSuggestionClick}
                        />
                    ) : !conversationId ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            <p>Seleccioná o creá una conversación para comenzar</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((message) => (
                                <MessageBubble
                                    key={message.id}
                                    message={message}
                                    onFollowupClick={handleSuggestionClick}
                                />
                            ))}
                            {isLoading && (
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                                        <Sparkles className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span className="text-sm">Buscando...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>

                {/* Input Area */}
                <CardContent className="p-4 border-t bg-background/80 backdrop-blur-sm">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder={conversationId ? "Escribí tu búsqueda... ej: vuelo a Miami para 2 personas" : "Creá una conversación para comenzar"}
                                disabled={isLoading || !conversationId}
                                className="pr-12 h-12 text-base rounded-xl border-2 focus:border-primary/50"
                            />
                            <Button
                                size="icon"
                                onClick={() => sendMessage(input)}
                                disabled={!input.trim() || isLoading || !conversationId}
                                className="absolute right-1.5 top-1.5 h-9 w-9 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                            >
                                {isLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

interface WelcomeScreenProps {
    userName: string
    onSuggestionClick: (suggestion: string) => void
}

function WelcomeScreen({ userName, onSuggestionClick }: WelcomeScreenProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full py-8 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4 shadow-lg shadow-amber-200 dark:shadow-amber-900/30">
                <Sparkles className="h-8 w-8 text-white" />
            </div>

            <h2 className="text-2xl font-bold mb-2">
                Hola, {userName} 👋
            </h2>

            <p className="text-muted-foreground mb-6 max-w-md">
                Soy <span className="font-semibold text-foreground">Emilia</span>, tu asistente de viajes.
                Puedo ayudarte a buscar vuelos, hoteles y paquetes.
                Contame qué necesitás.
            </p>

            <div className="grid gap-2 w-full max-w-lg">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                    Prueba alguna de estas búsquedas:
                </p>
                {WELCOME_SUGGESTIONS.map((suggestion, index) => (
                    <button
                        key={index}
                        onClick={() => onSuggestionClick(suggestion)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-accent hover:border-primary/30 transition-all text-left group"
                    >
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10">
                            {suggestion.toLowerCase().includes("hotel") ? (
                                <Building2 className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                            ) : (
                                <Plane className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                            )}
                        </div>
                        <span className="text-sm">{suggestion}</span>
                        <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                ))}
            </div>
        </div>
    )
}

interface MessageBubbleProps {
    message: Message
    onFollowupClick: (followup: string) => void
}

function MessageBubble({ message, onFollowupClick }: MessageBubbleProps) {
    const isUser = message.role === "user"
    const content = message.content

    return (
        <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
            {/* Avatar */}
            <div
                className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-gradient-to-br from-amber-500 to-orange-500"
                )}
            >
                {isUser ? (
                    <span className="text-xs font-semibold">TU</span>
                ) : (
                    <Sparkles className="h-4 w-4 text-white" />
                )}
            </div>

            {/* Message Content */}
            <div className={cn("flex flex-col gap-2 max-w-[85%]", isUser && "items-end")}>
                {content.text && (
                    <div
                        className={cn(
                            "rounded-2xl px-4 py-2.5",
                            isUser
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-muted rounded-tl-sm"
                        )}
                    >
                        <p className="text-sm whitespace-pre-wrap">{content.text}</p>
                    </div>
                )}

                {/* Search Results */}
                {content.cards && (
                    <SearchResultsDisplay 
                        flights={content.cards.flights}
                        hotels={content.cards.hotels}
                        requestType={content.cards.requestType}
                    />
                )}

                {/* Timestamp */}
                <span className="text-xs text-muted-foreground">
                    {new Date(message.created_at).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </span>
            </div>
        </div>
    )
}

interface SearchResultsDisplayProps {
    flights?: SearchResultsFlights
    hotels?: SearchResultsHotels
    requestType?: 'combined' | 'flights-only' | 'hotels-only'
}

function SearchResultsDisplay({ flights, hotels, requestType }: SearchResultsDisplayProps) {
    const [selectedFlights, setSelectedFlights] = useState<Set<string>>(new Set())
    const [selectedHotels, setSelectedHotels] = useState<Set<string>>(new Set())
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

    const hasFlights = flights && flights.items && flights.items.length > 0
    const hasHotels = hotels && hotels.items && hotels.items.length > 0

    // Determinar requestType si no viene
    const effectiveRequestType = requestType || 
        (hasFlights && hasHotels ? 'combined' : hasFlights ? 'flights-only' : 'hotels-only')

    const handleFlightSelection = (flightId: string, selected: boolean) => {
        setSelectedFlights((prev) => {
            const next = new Set(prev)
            if (selected) {
                if (next.size >= 4) {
                    toast.warning("Solo se pueden seleccionar hasta 4 vuelos")
                    return prev
                }
                next.add(flightId)
            } else {
                next.delete(flightId)
            }
            return next
        })
    }

    const handleHotelSelection = (hotelId: string, selected: boolean) => {
        setSelectedHotels((prev) => {
            const next = new Set(prev)
            if (selected) {
                if (next.size >= 2) {
                    toast.warning("Solo se pueden seleccionar hasta 2 hoteles")
                    return prev
                }
                next.add(hotelId)
            } else {
                next.delete(hotelId)
            }
            return next
        })
    }

    const handleGeneratePdf = async () => {
        if (selectedFlights.size === 0 && selectedHotels.size === 0) return

        setIsGeneratingPdf(true)
        try {
            // TODO: Implementar generación de PDF
            toast.success("Generando PDF...")
            await new Promise(resolve => setTimeout(resolve, 2000))
        } catch (error) {
            toast.error("Error al generar PDF")
        } finally {
            setIsGeneratingPdf(false)
        }
    }

    const hasAnyResults = hasFlights || hasHotels
    const hasSelection = selectedFlights.size > 0 || selectedHotels.size > 0

    // Determinar tab inicial según requestType
    const defaultTab = effectiveRequestType === 'hotels-only' ? 'hotels' : 'flights'

    // Si es combined, usar Tabs; si no, renderizar contenido directo
    if (effectiveRequestType === 'combined') {
        return (
            <div className="w-full space-y-4">
                <Tabs defaultValue={defaultTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-3">
                        <TabsTrigger value="flights" className="flex items-center gap-2">
                            <Plane className="h-4 w-4" />
                            <span>Vuelos ({flights?.count || 0})</span>
                        </TabsTrigger>
                        <TabsTrigger value="hotels" className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            <span>Hoteles ({hotels?.count || 0})</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="flights" className="space-y-2 mt-0">
                        {hasFlights ? (
                            flights.items.slice(0, 10).map((flight) => (
                                <FlightResultCard 
                                    key={flight.id} 
                                    flight={flight}
                                    selected={selectedFlights.has(flight.id)}
                                    onSelectionChange={handleFlightSelection}
                                />
                            ))
                        ) : (
                            <FlightsEmptyState />
                        )}
                    </TabsContent>

                    <TabsContent value="hotels" className="space-y-2 mt-0">
                        {hasHotels ? (
                            hotels.items.slice(0, 10).map((hotel) => (
                                <HotelResultCard 
                                    key={hotel.id} 
                                    hotel={hotel}
                                    selected={selectedHotels.has(hotel.id)}
                                    onSelectionChange={handleHotelSelection}
                                />
                            ))
                        ) : (
                            <HotelsEmptyState />
                        )}
                    </TabsContent>
                </Tabs>

                {/* Footer: Generar PDF */}
                {hasAnyResults && (
                    <div className="border-t pt-4 mt-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                {selectedFlights.size > 0 && selectedHotels.size > 0 && (
                                    <span>
                                        {selectedFlights.size} vuelo{selectedFlights.size > 1 ? 's' : ''} y {selectedHotels.size} hotel{selectedHotels.size > 1 ? 'es' : ''} seleccionado{selectedFlights.size + selectedHotels.size > 1 ? 's' : ''}
                                    </span>
                                )}
                                {selectedFlights.size > 0 && selectedHotels.size === 0 && (
                                    <span>
                                        {selectedFlights.size} vuelo{selectedFlights.size > 1 ? 's' : ''} seleccionado{selectedFlights.size > 1 ? 's' : ''}
                                    </span>
                                )}
                                {selectedFlights.size === 0 && selectedHotels.size > 0 && (
                                    <span>
                                        {selectedHotels.size} hotel{selectedHotels.size > 1 ? 'es' : ''} seleccionado{selectedHotels.size > 1 ? 's' : ''}
                                    </span>
                                )}
                                {!hasSelection && (
                                    <span>Seleccioná vuelos y/o hoteles para generar la cotización</span>
                                )}
                            </div>
                            <Button
                                onClick={handleGeneratePdf}
                                disabled={!hasSelection || isGeneratingPdf}
                                className="gap-2"
                            >
                                {isGeneratingPdf ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Generando...
                                    </>
                                ) : (
                                    <>
                                        <FileText className="h-4 w-4" />
                                        Generar PDF
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Si es flights-only o hotels-only, renderizar sin tabs
    return (
        <div className="w-full space-y-4">
            {effectiveRequestType === 'flights-only' && (
                <div className="space-y-2">
                    {hasFlights ? (
                        flights.items.slice(0, 10).map((flight) => (
                            <FlightResultCard 
                                key={flight.id} 
                                flight={flight}
                                selected={selectedFlights.has(flight.id)}
                                onSelectionChange={handleFlightSelection}
                            />
                        ))
                    ) : (
                        <FlightsEmptyState />
                    )}
                </div>
            )}

            {effectiveRequestType === 'hotels-only' && (
                <div className="space-y-2">
                    {hasHotels ? (
                        hotels.items.slice(0, 10).map((hotel) => (
                            <HotelResultCard 
                                key={hotel.id} 
                                hotel={hotel}
                                selected={selectedHotels.has(hotel.id)}
                                onSelectionChange={handleHotelSelection}
                            />
                        ))
                    ) : (
                        <HotelsEmptyState />
                    )}
                </div>
            )}

            {/* Footer: Generar PDF */}
            {hasAnyResults && (
                <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            {selectedFlights.size > 0 && selectedHotels.size > 0 && (
                                <span>
                                    {selectedFlights.size} vuelo{selectedFlights.size > 1 ? 's' : ''} y {selectedHotels.size} hotel{selectedHotels.size > 1 ? 'es' : ''} seleccionado{selectedFlights.size + selectedHotels.size > 1 ? 's' : ''}
                                </span>
                            )}
                            {selectedFlights.size > 0 && selectedHotels.size === 0 && (
                                <span>
                                    {selectedFlights.size} vuelo{selectedFlights.size > 1 ? 's' : ''} seleccionado{selectedFlights.size > 1 ? 's' : ''}
                                </span>
                            )}
                            {selectedFlights.size === 0 && selectedHotels.size > 0 && (
                                <span>
                                    {selectedHotels.size} hotel{selectedHotels.size > 1 ? 'es' : ''} seleccionado{selectedHotels.size > 1 ? 's' : ''}
                                </span>
                            )}
                            {!hasSelection && (
                                <span>Seleccioná vuelos y/o hoteles para generar la cotización</span>
                            )}
                        </div>
                        <Button
                            onClick={handleGeneratePdf}
                            disabled={!hasSelection || isGeneratingPdf}
                            className="gap-2"
                        >
                            {isGeneratingPdf ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Generando...
                                </>
                            ) : (
                                <>
                                    <FileText className="h-4 w-4" />
                                    Generar PDF
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

// Empty States según especificación
function FlightsEmptyState() {
    const handleRetryWithStops = () => {
        // TODO: Implementar retry con escalas
        toast.info("Función de repetir búsqueda con escalas pendiente")
    }

    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Plane className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
                No se encontraron vuelos directos para este itinerario
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
                ¿Quieres repetir la búsqueda permitiendo escalas?
            </p>
            <Button variant="outline" onClick={handleRetryWithStops}>
                Repetir búsqueda con escalas
            </Button>
        </div>
    )
}

function HotelsEmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <HotelIcon className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
                No se encontraron hoteles disponibles
            </h3>
            <p className="text-sm text-muted-foreground">
                Verificando códigos de destino en EUROVIPS
            </p>
        </div>
    )
}

