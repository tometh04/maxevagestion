"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
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
  const [page, setPage] = useState(0)
  const pageSize = 24
  const pageCount = Math.ceil(flights.length / pageSize)
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const visibleFlights = flights.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  return <>
    <CardCarousel key={`${currentPage}-${visibleFlights[0]?.id}`} count={visibleFlights.length} ariaLabel="Vuelos disponibles" alignCards>
    {visibleFlights.map(flight => <CarouselSlide key={flight.id}>
      <FlightResultCard flight={flight} selected={selectedFlightIds.includes(flight.id)} onSelectionChange={onSelectionChange}
        details={{ expanded: openFlightId === flight.id, panelId, triggerId: `${resultId}-${flight.id}`, onToggle: () => onViewDetails(flight) }} />
    </CarouselSlide>)}
    </CardCarousel>
    {pageCount > 1 && <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
      <Button type="button" variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Vuelos anteriores</Button>
      <span role="status" className="text-xs text-muted-foreground">{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, flights.length)} de {flights.length}</span>
      <Button type="button" variant="outline" size="sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Más vuelos</Button>
    </div>}
  </>
}
