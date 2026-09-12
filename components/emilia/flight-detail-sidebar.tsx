"use client"

import { Button } from "@/components/ui/button"
import { FlightResultDetails, type FlightData } from "./flight-result-card"
import { ResultDetailSidebar } from "./result-detail-sidebar"
import { hotelPrice } from "./hotel-detail-sidebar"

export function FlightDetailSidebar({ id, flight, selected, onSelectionChange, onClose }: {
  id?: string; flight: FlightData; selected?: boolean
  onSelectionChange?: (id: string, selected: boolean) => void; onClose: () => void
}) {
  return <ResultDetailSidebar id={id} identity={flight.id} label={`Detalle del vuelo de ${flight.airline.name}`}
    closeLabel="Cerrar detalle del vuelo" title={flight.airline.name}
    subtitle={[flight.provider, `${flight.legs[0]?.departure.city_code || ""} → ${flight.legs[0]?.arrival.city_code || ""}`].filter(Boolean).join(" · ")}
    onClose={onClose}>
    <div className="space-y-5 p-4">
      <section className="space-y-2" aria-label="Resumen del vuelo">
        <p className="text-xl font-semibold tabular-nums">{hotelPrice(flight.price.amount, flight.price.currency)} <span className="text-xs font-normal text-muted-foreground">total del grupo</span></p>
        <p className="text-sm text-muted-foreground">{flight.adults} adultos · {flight.children ?? flight.childrens ?? 0} menores{flight.infants ? ` · ${flight.infants} bebés` : ""}</p>
        {onSelectionChange && <Button className="w-full" variant={selected ? "secondary" : "outline"} onClick={() => onSelectionChange(flight.id, !selected)}>{selected ? "Quitar selección" : "Seleccionar vuelo"}</Button>}
      </section>
      <FlightResultDetails flight={flight} />
      {flight.provider_details?.length ? <section className="space-y-3" aria-label="Información del proveedor">
        <h3 className="text-base font-semibold">Información del proveedor</h3>
        {flight.provider_details.map((section, index) => <details key={`${index}:${section.title}`} open={index === 0} className="group border-t pt-3">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{section.title}</summary>
          <dl className="mt-3 space-y-3 text-sm">
            {section.fields.map((field, fieldIndex) => <div key={fieldIndex} className="space-y-0.5">
              <dt className="break-words text-xs text-muted-foreground">{field.label}</dt>
              <dd className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{field.value}</dd>
            </div>)}
          </dl>
        </details>)}
      </section> : <p className="text-xs text-muted-foreground">Esta búsqueda no incluye el detalle ampliado del proveedor. Volvé a buscar para consultar la información actualizada.</p>}
    </div>
  </ResultDetailSidebar>
}
