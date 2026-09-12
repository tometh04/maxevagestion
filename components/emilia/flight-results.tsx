"use client"

import { useId } from "react"
import { FlightResultCard, type FlightData } from "./flight-result-card"
import { CardCarousel, CarouselSlide } from "./result-carousel"

interface FlightResultsProps {
  flights: FlightData[]
  selectedFlightIds: string[]
  onSelectionChange: (flightId: string, selected: boolean) => void
  onViewDetails: (flight: FlightData) => void
  openFlightId?: string
  panelId?: string
}

/** The chat owns the docked sidebar; the horizontal track contains only compact cards. */
export function FlightResults({ flights, selectedFlightIds, onSelectionChange, onViewDetails, openFlightId, panelId }: FlightResultsProps) {
  const resultId = useId()
  return <CardCarousel count={flights.length} ariaLabel="Vuelos disponibles" alignCards>
    {flights.map(flight => <CarouselSlide key={flight.id}>
      <FlightResultCard flight={flight} selected={selectedFlightIds.includes(flight.id)} onSelectionChange={onSelectionChange}
        details={{ expanded: openFlightId === flight.id, panelId, triggerId: `${resultId}-${flight.id}`, onToggle: () => onViewDetails(flight) }} />
    </CarouselSlide>)}
  </CardCarousel>
}
