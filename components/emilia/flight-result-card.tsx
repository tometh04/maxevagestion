"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plane,
  Clock,
  Luggage,
  Users,
  Navigation,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

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
  options?: Array<{
    segments?: Array<{
      baggage?: string
      carryOnBagInfo?: {
        quantity: string
      }
    }>
  }>
}

interface FlightData {
  id: string
  airline: {
    code: string
    name: string
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
  legs: FlightLeg[]
}

interface FlightResultCardProps {
  flight: FlightData
  onSelect?: (flight: FlightData) => void
  selected?: boolean
  onSelectionChange?: (flightId: string, selected: boolean) => void
}

const lightAirlines = ["LA", "H2", "AV", "AM", "JA", "AR"]

export function FlightResultCard({ 
  flight, 
  onSelect, 
  selected = false,
  onSelectionChange 
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

  const getBaggageText = (leg: FlightLeg, airlineCode: string): string => {
    const segment = leg.options?.[0]?.segments?.[0]
    const baggage = segment?.baggage
    const carryOn = segment?.carryOnBagInfo?.quantity

    const parts: string[] = []

    // Equipaje despachado
    if (baggage) {
      const count = parseInt(baggage.replace(/[^0-9]/g, ""), 10)
      if (count > 0) {
        parts.push(`${count} despachada${count > 1 ? "s" : ""}`)
      }
    }

    // Equipaje de mano
    if (carryOn && parseInt(carryOn, 10) > 0) {
      parts.push("1 de mano")
    }

    if (parts.length > 0) {
      return `(${parts.join(" + ")})`
    }

    // Fallback para aerolíneas low cost
    if (lightAirlines.includes(airlineCode)) {
      return "(1 Mochila)"
    }

    return "(1 de mano)"
  }

  const childrens = flight.childrens || flight.children || 0

  return (
    <Card className={cn("overflow-hidden border-border/50", selected && "ring-2 ring-primary")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <Checkbox 
              checked={selected}
              onCheckedChange={handleCheckboxChange}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Plane className="h-4 w-4 text-primary" />
                <span className="font-semibold">{flight.airline.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {flight.airline.code}
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>
                  {flight.adults} adulto{flight.adults > 1 ? "s" : ""}
                  {childrens > 0 && `, ${childrens} niño${childrens > 1 ? "s" : ""}`}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {formatPrice(flight.price.amount, flight.price.currency)}
            </div>
            <div className="text-xs text-muted-foreground">
              para {flight.adults} adulto{flight.adults > 1 ? "s" : ""}
              {childrens > 0 && ` + ${childrens} niño${childrens > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-4 space-y-4">
        {flight.legs && flight.legs.length > 0 ? (
          flight.legs.map((leg, index) => (
            <div key={index}>
              <FlightLegCard
                leg={leg}
                airlineCode={flight.airline.code}
                departureDate={leg.flight_type === "outbound" ? flight.departure_date : flight.return_date}
              />
              {index < flight.legs.length - 1 && <Separator className="my-4" />}
            </div>
          ))
        ) : (
          <div className="text-center text-sm text-muted-foreground py-4">
            No hay información de vuelos disponible
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface FlightLegCardProps {
  leg: FlightLeg
  airlineCode: string
  departureDate?: string
}

function FlightLegCard({ leg, airlineCode, departureDate }: FlightLegCardProps) {
  // Validación: si no hay datos mínimos, no renderizar
  if (!leg || !leg.departure || !leg.arrival) {
    return null
  }

  const baggageText = getBaggageText(leg, airlineCode)
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
    <div className="space-y-3">
      {/* Leg Header - Equipaje al lado del label según spec */}
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>{legIcon}</span>
        <span>{legLabel}</span>
        <Luggage className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{baggageText}</span>
      </div>

      {/* Flight Info Box */}
      <div className="bg-muted/30 rounded-lg p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Navigation className="h-4 w-4 text-primary" />
          <span className="font-medium">Vuelo {legLabel}</span>
          <span className="text-muted-foreground ml-auto flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Duración: {leg.duration}
          </span>
        </div>

        {/* Timeline */}
        <div className="flex items-center gap-4">
          {/* Departure */}
          <div className="flex-1 text-center">
            <div className="text-lg font-bold">{leg.departure?.city_code || "---"}</div>
            <div className="text-base font-medium">{leg.departure?.time || "--:--"}</div>
            {departureDate && (
              <div className="text-xs text-muted-foreground">{formatDate(departureDate)}</div>
            )}
            <div className="text-xs text-muted-foreground">{leg.departure?.city_name || ""}</div>
          </div>

          {/* Flight Path */}
          <div className="flex-[2] flex items-center">
            <div className="w-2 h-2 rounded-full bg-muted-foreground" />
            <div className="flex-1 h-[2px] bg-gradient-to-r from-muted-foreground to-primary relative">
              <Plane className="h-4 w-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45" />
            </div>
            <div className="w-2 h-2 rounded-full bg-primary" />
          </div>

          {/* Arrival */}
          <div className="flex-1 text-center">
            <div className="text-lg font-bold">{leg.arrival?.city_code || "---"}</div>
            <div className="text-base font-medium flex items-center justify-center gap-1">
              {leg.arrival?.time || "--:--"}
              {leg.arrival_next_day && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
                  +1
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {departureDate ? formatDate(departureDate) : ""}
            </div>
            <div className="text-xs text-muted-foreground">{leg.arrival?.city_name || ""}</div>
          </div>
        </div>

        {/* Layovers */}
        {leg.layovers && leg.layovers.length > 0 && (
          <div className="space-y-2">
            {leg.layovers.map((layover, idx) => (
              <div
                key={idx}
                className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md p-2 text-center"
              >
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Clock className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                  <span className="font-medium text-orange-700 dark:text-orange-300">
                    CONEXIÓN
                  </span>
                </div>
                <div className="text-sm font-medium mt-1">
                  {layover.destination_code} - {layover.waiting_time}
                </div>
                <div className="text-xs text-muted-foreground">
                  Cambio de terminal/puerta
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getBaggageText(leg: FlightLeg, airlineCode: string): string {
  const segment = leg.options?.[0]?.segments?.[0]
  const baggage = segment?.baggage
  const carryOn = segment?.carryOnBagInfo?.quantity

  const parts: string[] = []

  if (baggage) {
    const count = parseInt(baggage.replace(/[^0-9]/g, ""), 10)
    if (count > 0) {
      parts.push(`${count} despachada${count > 1 ? "s" : ""}`)
    }
  }

  if (carryOn && parseInt(carryOn, 10) > 0) {
    parts.push("1 de mano")
  }

  if (parts.length > 0) {
    return `(${parts.join(" + ")})`
  }

  if (lightAirlines.includes(airlineCode)) {
    return "(1 Mochila)"
  }

  return "(1 de mano)"
}

