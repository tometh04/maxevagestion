"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
  Plane,
  Clock,
  Luggage,
  Users,
  Navigation,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FlightProviderSection } from "@/lib/emilia/flight-provider-details"
import { formatSegmentBaggage, summarizeSegmentBaggage, type SegmentBaggage } from "@/lib/emilia/flight-baggage"

// Tipos según la especificación
interface FlightLeg {
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
  stops?: number
  segments?: Array<{
    baggage?: SegmentBaggage
    marketing_airline?: string
    operating_airline?: string
    flight_number?: string
    departure?: { airport_code?: string; date?: string; time?: string }
    arrival?: { airport_code?: string; date?: string; time?: string }
  }>
  baggage?: { carry_on: boolean | null; checked: boolean | null }
  options?: Array<{
    segments?: Array<{
      baggage?: string
      carryOnBagInfo?: {
        quantity: string
      }
    }>
  }>
}

export interface FlightData {
  provider_details?: FlightProviderSection[]
  infants?: number
  id: string
  airline: {
    code: string
    name: string
  }
  price: {
    amount: number
    currency: string
    basis?: "GROUP_TOTAL"
  }
  adults: number
  childrens?: number
  children?: number
  departure_date: string
  return_date?: string | null
  /** Mayorista de origen, si la API de Emilia lo envía para el vuelo. */
  provider?: string | null
  cabin_class?: string | null
  refundable?: boolean | null
  legs: FlightLeg[]
}

interface FlightResultCardProps {
  flight: FlightData
  onSelect?: (flight: FlightData) => void
  selected?: boolean
  onSelectionChange?: (flightId: string, selected: boolean) => void
  details?: {
    expanded: boolean
    panelId?: string
    triggerId: string
    onToggle: () => void
  }
}

export function FlightResultCard({ 
  flight, 
  selected = false,
  onSelectionChange,
  details,
}: FlightResultCardProps) {
  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }
  
  const handleCheckboxChange = (checked: boolean) => {
    onSelectionChange?.(flight.id, checked)
  }

  const childrens = flight.childrens || flight.children || 0

  return (
    <Card className={cn("overflow-hidden border-border/50", details && "flex flex-1 flex-col", details?.expanded && "border-primary/60", selected && "ring-2 ring-primary")}>
      <CardHeader className="pb-3">
        <div className={cn("flex items-start justify-between gap-3", details && "flex-wrap")}>
          <div className={cn("flex items-start gap-3 flex-1 min-w-0", details && "basis-full")}>
            <Checkbox
              aria-label={`Seleccionar vuelo de ${flight.airline.name}`}
              checked={selected}
              onCheckedChange={handleCheckboxChange}
              className="mt-1 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className={cn("flex items-center gap-x-2 gap-y-1 mb-1", !details && "flex-wrap")}>
                <Plane className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold truncate" title={flight.airline.name}>{flight.airline.name}</span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {flight.airline.code}
                </Badge>
                {flight.provider ? (
                  <Badge
                    variant="outline"
                    className="max-w-24 truncate text-[10px] font-semibold uppercase tracking-wide shrink-0"
                    title={flight.provider}
                  >
                    {flight.provider}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {flight.adults} adulto{flight.adults > 1 ? "s" : ""}
                  {childrens > 0 && `, ${childrens} niño${childrens > 1 ? "s" : ""}`}
                </span>
              </div>
            </div>
          </div>
          <div className={cn("text-right shrink-0", details && "flex w-full items-center justify-between gap-2 text-left")}>
            <div className="text-2xl font-bold text-primary whitespace-nowrap">
              {formatPrice(flight.price.amount, flight.price.currency)}
            </div>
            <div className="text-xs text-muted-foreground">
              Total para {flight.adults} adulto{flight.adults > 1 ? "s" : ""}
              {childrens > 0 && ` + ${childrens} niño${childrens > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className={cn("pt-4", details ? "flex flex-1 flex-col gap-4" : "space-y-4")}>
        {flight.legs && flight.legs.length > 0 ? (
          flight.legs.map((leg, index) => (
            <div key={index}>
              <FlightLegCard
                leg={leg}
                compact={Boolean(details)}
                departureDate={(leg.flight_type === "outbound" ? flight.departure_date : flight.return_date) ?? undefined}
              />
              {index < flight.legs.length - 1 && <Separator className={details ? "mt-4" : "my-4"} />}
            </div>
          ))
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">
            No hay información de vuelos disponible
          </div>
        )}
        {details ? (
          <Button
            id={details.triggerId}
            type="button"
            variant="outline"
            className="mt-auto w-full gap-2"
            aria-expanded={details.panelId ? details.expanded : undefined}
            aria-controls={details.panelId}
            onClick={details.onToggle}
          >
            Ver detalle del vuelo
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : <FlightConditions flight={flight} />}
      </CardContent>
    </Card>
  )
}

function FlightConditions({ flight }: { flight: FlightData }) {
  return (
    <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
      {flight.cabin_class && <p>Cabina: {flight.cabin_class}</p>}
      <p>{flight.refundable === true ? "Tarifa reembolsable, consultar condiciones y penalidades." : flight.refundable === false ? "Tarifa no reembolsable." : "Reembolso: a confirmar con el proveedor."}</p>
      <p>Precio y disponibilidad sujetos a reconfirmación antes de reservar.</p>
    </div>
  )
}

export function FlightResultDetails({ flight }: { flight: FlightData }) {
  return (
    <div className="space-y-4">
      <div className="min-w-0 space-y-4">
        {flight.legs?.length ? flight.legs.map((leg, index) => (
          <FlightLegCard key={index} leg={leg} showSegments
            departureDate={(leg.flight_type === "outbound" ? flight.departure_date : flight.return_date) ?? undefined} />
        )) : <p className="text-sm text-muted-foreground">No hay información de vuelos disponible</p>}
      </div>
      <FlightConditions flight={flight} />
    </div>
  )
}

interface FlightLegCardProps {
  leg: FlightLeg
  departureDate?: string
  compact?: boolean
  showSegments?: boolean
}

function FlightLegCard({ leg, departureDate, compact = false, showSegments = false }: FlightLegCardProps) {
  // Validación: si no hay datos mínimos, no renderizar
  if (!leg || !leg.departure || !leg.arrival) {
    return null
  }

  const baggageText = compact ? summarizeSegmentBaggage(leg.segments ?? []) ?? getBaggageText(leg) : getBaggageText(leg)
  const segments = leg.segments || []
  const actualDepartureDate = segments[0]?.departure?.date || departureDate
  const arrivalDate = segments[segments.length - 1]?.arrival?.date || (!leg.arrival_next_day ? departureDate : undefined)
  const stops = leg.stops ?? (leg.layovers ? leg.layovers.length : undefined)
  const legLabel = leg.flight_type === "outbound" ? "IDA" : "REGRESO"
  const legIcon = leg.flight_type === "outbound" ? "🛫" : "🔄"

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ""
    try {
      // Mantener formato YYYY-MM-DD según especificación
      return dateStr
    } catch {
      return ""
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      {!compact && <div className="flex items-center gap-2 text-sm font-medium">
        <span>{legIcon}</span>
        <span>{legLabel}</span>
        <Luggage className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="break-words text-xs text-muted-foreground">{baggageText}</span>
      </div>}

      {/* Flight Info Box */}
      <div className="bg-muted/30 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Navigation className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium">{compact ? legLabel : `Vuelo ${legLabel}`}</span>
          <span className="text-muted-foreground ml-auto flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span aria-label={`Duración: ${leg.duration || "A confirmar"}`}>{compact ? "" : "Duración: "}{leg.duration || "A confirmar"}</span>
          </span>
        </div>

        {/* Timeline */}
        <div className="flex items-center gap-2">
          {/* Departure */}
          <div className="min-w-0 flex-1 text-center">
            <div className="text-lg font-bold">{leg.departure?.city_code || "---"}</div>
            <div className="text-base font-medium">{leg.departure?.time || "--:--"}</div>
            {(actualDepartureDate || compact) && (
              <div className="text-xs text-muted-foreground">{formatDate(actualDepartureDate) || "Fecha a confirmar"}</div>
            )}
            <div className={cn("text-xs text-muted-foreground", compact && "min-h-8")}>{leg.departure?.city_name || ""}</div>
          </div>

          {/* Flight Path */}
          <div className={cn("flex items-center", compact ? "w-10 shrink-0" : "flex-1")}>
            <div className="w-2 h-2 rounded-full bg-muted-foreground" />
            <div className="flex-1 h-[2px] bg-gradient-to-r from-muted-foreground to-primary relative">
              <Plane className="h-4 w-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45" />
            </div>
            <div className="w-2 h-2 rounded-full bg-primary" />
          </div>

          {/* Arrival */}
          <div className="min-w-0 flex-1 text-center">
            <div className="text-lg font-bold">{leg.arrival?.city_code || "---"}</div>
            <div className="text-base font-medium flex items-center justify-center gap-1">
              {leg.arrival?.time || "--:--"}
              {leg.arrival_next_day && (
                <Badge variant="outline" className="text-[10px] h-4 shrink-0 px-1 bg-accent-coral/10 text-accent-coral border-accent-coral">
                  Otro día
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {arrivalDate ? formatDate(arrivalDate) : "Fecha a confirmar"}
            </div>
            <div className={cn("text-xs text-muted-foreground", compact && "min-h-8")}>{leg.arrival?.city_name || ""}</div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">{stops == null ? "Escalas a confirmar" : stops === 0 ? "Directo" : `${stops} escala${stops === 1 ? "" : "s"}`} · Horarios locales</p>
        {compact && <p className="min-h-8 text-xs text-muted-foreground">{baggageText}</p>}
        {/* Layovers */}
        {!compact && leg.layovers && leg.layovers.length > 0 && (
          <div className={showSegments ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2" : "space-y-2"}>
            {leg.layovers.map((layover, idx) => (
              <div
                key={idx}
                className="bg-accent-coral/10 border border-accent-coral rounded-md p-2 text-center"
              >
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Clock className="h-3 w-3 text-accent-coral" />
                  <span className="font-medium text-accent-coral">
                    CONEXIÓN
                  </span>
                </div>
                <div className="text-sm font-medium mt-1">
                  {layover.destination_code} · {layover.waiting_time || "Espera a confirmar"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {layover.destination_city}
                </div>
              </div>
            ))}
          </div>
        )}
        {!compact && segments.length > 0 && (
          <details className="text-xs" open={showSegments || undefined}>
            <summary className="cursor-pointer rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Detalle de tramos</summary>
            <ol className={showSegments ? "mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3" : "mt-2 space-y-2"}>
              {segments.map((segment, index) => (
                <li key={index} className="space-y-1 border-t pt-2">
                  <p className="font-medium">{segment.marketing_airline} {segment.flight_number || "Número a confirmar"}</p>
                  <p>{segment.departure?.airport_code || "Origen a confirmar"} {segment.departure?.date} {segment.departure?.time} → {segment.arrival?.airport_code || "Destino a confirmar"} {segment.arrival?.date} {segment.arrival?.time}</p>
                  {segment.operating_airline && <p className="text-muted-foreground">Aerolínea operadora: {segment.operating_airline}</p>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </div>
  )
}

function getBaggageText(leg: FlightLeg): string {
  const detailed = formatSegmentBaggage(leg.segments ?? [])
  if (detailed) return detailed
  if (leg.baggage) {
    const included: string[] = []
    if (leg.baggage.checked === true) included.push("Despachado incluido")
    if (leg.baggage.carry_on === true) included.push("De mano incluido")
    if (leg.baggage.checked === false) included.push("Sin despachado")
    if (leg.baggage.carry_on === false) included.push("Sin equipaje de mano")
    if (leg.baggage.checked == null) included.push("Despachado a confirmar")
    if (leg.baggage.carry_on == null) included.push("De mano a confirmar")
    return `(${included.join(" + ")})`
  }
  const segment = leg.options?.[0]?.segments?.[0]
  const baggage = segment?.baggage
  const carryOn = segment?.carryOnBagInfo?.quantity

  const parts: string[] = []

  if (baggage) {
    const pieces = /^(\d+)\s*PC$/i.exec(baggage.trim())
    parts.push(pieces && Number(pieces[1]) === 0 ? "Sin despachado" : `Despachado: ${baggage}`)
  }

  if (carryOn && parseInt(carryOn, 10) > 0) {
    parts.push(`${parseInt(carryOn, 10)} de mano`)
  } else if (carryOn === "0") {
    parts.push("Sin equipaje de mano")
  }

  if (parts.length > 0) {
    return `(${parts.join(" + ")})`
  }

  return "(Equipaje a confirmar)"
}
