"use client"

import { useEffect, useRef } from "react"
import { ChevronLeft, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { HotelImageCarousel } from "./hotel-result-card"
import type { EurovipsHotel } from "@/lib/emilia/quotation-mapper"
import { matchesRoomFilters, type HotelFilters } from "@/lib/emilia/result-filters"

export function hotelPrice(amount: number, currency: string) {
  if (!Number.isFinite(amount)) return "Precio no informado"
  return `${currency} ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(amount)}`
}

function safeWebsite(value?: string) {
  try {
    const url = value ? new URL(value) : null
    return url && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? value : undefined
  } catch { return undefined }
}

function DetailText({ title, value }: { title: string; value?: string | null }) {
  if (!value) return null
  return <section className="space-y-2"><h3 className="text-sm font-semibold">{title}</h3><p className="whitespace-pre-line break-words text-sm text-muted-foreground">{value}</p></section>
}

interface Props {
  hotel: EurovipsHotel
  selectedRoomId?: string
  filters: HotelFilters
  onRoomSelect: (id: string) => void
  onClose: () => void
}

/** A docked panel keeps the conversation usable on desktop and takes its place on mobile. */
export function HotelDetailSidebar({ hotel, selectedRoomId, filters, onRoomSelect, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const roomsRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [hotel.id])
  const website = safeWebsite(hotel.website)
  const hasCoordinates = typeof hotel.latitude === "number" && Number.isFinite(hotel.latitude)
    && typeof hotel.longitude === "number" && Number.isFinite(hotel.longitude)
  return (
    <aside aria-label={`Detalle de ${hotel.name}`} className="flex h-full min-h-0 w-full shrink-0 flex-col border-l bg-background md:w-[420px] xl:w-[480px]"
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose() } }}>
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0 space-y-1">
          <h2 className="break-words text-lg font-semibold">{hotel.name}</h2>
          <p className="text-sm text-muted-foreground">{[hotel.category, hotel.city].filter(Boolean).join(" · ")}</p>
          <Button variant="link" className="h-auto p-0 text-xs" onClick={() => { roomsRef.current?.scrollIntoView({ block: "start" }); roomsRef.current?.focus({ preventScroll: true }) }}>Ver habitaciones y tarifas</Button>
        </div>
        <Button ref={closeRef} className="order-first shrink-0" variant="ghost" size="icon" aria-label="Cerrar detalle del hotel" onClick={onClose}><ChevronLeft className="h-4 w-4" /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <HotelImageCarousel key={hotel.id} images={hotel.images} alt={hotel.name} provider={hotel.provider || undefined} />
        <div className="space-y-5 p-4">
          <div className="space-y-2 text-sm">
            <p>{hotel.check_in} → {hotel.check_out} · {hotel.nights} noches</p>
            {hotel.search_adults != null && <p className="text-muted-foreground">{hotel.search_adults} adultos · {hotel.search_children || 0} menores</p>}
            {hotel.address && <p className="break-words text-muted-foreground">{hotel.address}</p>}
            {hasCoordinates && <a className="inline-flex items-center gap-1 text-primary underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${hotel.latitude},${hotel.longitude}`}><MapPin className="h-3 w-3" />Ver ubicación</a>}
            {hotel.phone && <p>Teléfono: {hotel.phone}</p>}
            {website && <a href={website} target="_blank" rel="noopener noreferrer" className="block break-all text-primary underline">Sitio web del hotel</a>}
            {hotel.expires_at && <p className="text-xs text-muted-foreground">Vigencia de la oferta: {hotel.expires_at}</p>}
          </div>
          <DetailText title="Sobre el hotel" value={hotel.description} />
          <DetailText title="Servicios" value={hotel.amenities?.join(" · ")} />
          <DetailText title="Accesibilidad" value={hotel.accessibility?.join(" · ")} />
          <section className="space-y-3" aria-label="Habitaciones y tarifas">
            <h3 ref={roomsRef} tabIndex={-1} className="text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Habitaciones y tarifas <span className="text-sm font-normal text-muted-foreground">({hotel.rooms?.length || 0})</span></h3>
            {!hotel.rooms?.length && <p className="text-sm text-muted-foreground">El proveedor no informó habitaciones para esta búsqueda.</p>}
            {hotel.rooms?.map(room => {
              const selected = selectedRoomId === room.occupancy_id
              const unavailable = room.availability_status === "unavailable" || (!room.availability_status && Number.isFinite(room.availability) && room.availability < 2)
              const available = room.availability_status === "available" || (!room.availability_status && room.availability >= 3)
              return <div key={room.occupancy_id} className="space-y-3 border-t py-4">
                <div className="flex items-start justify-between gap-3"><h4 className="text-sm font-semibold">{room.type}</h4>{selected && <Badge>Seleccionada</Badge>}</div>
                <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{room.description}</p>
                {room.board_description || room.board ? <p className="text-sm">Régimen: {room.board_description || room.board}</p> : null}
                <p className="text-lg font-semibold tabular-nums">{hotelPrice(room.total_price, room.currency)} <span className="text-xs font-normal text-muted-foreground">total estadía</span></p>
                <p className="text-xs text-muted-foreground">{hotelPrice(room.price_per_night, room.currency)} por noche</p>
                {room.price_breakdown && <p className="text-xs text-muted-foreground">{room.price_breakdown.base && `Base: ${hotelPrice(room.price_breakdown.base.amount, room.price_breakdown.base.currency)}`}{room.price_breakdown.taxes && ` · Impuestos: ${hotelPrice(room.price_breakdown.taxes.amount, room.price_breakdown.taxes.currency)}`}</p>}
                <p className="text-xs">{unavailable ? "No disponible" : available ? "Disponible al consultar" : "Disponibilidad a consultar"}</p>
                {room.adults != null && <p className="text-xs text-muted-foreground">Ocupación: {room.adults} adultos · {room.children || 0} menores{room.infants ? ` · ${room.infants} bebés` : ""}</p>}
                <div className="flex flex-wrap gap-1">
                  {room.refundable != null && <Badge variant="outline">{room.refundable ? "Reembolsable" : "No reembolsable"}</Badge>}
                  {room.free_cancellation != null && <Badge variant="outline">{room.free_cancellation ? "Cancelación gratuita" : "Sin cancelación gratuita"}</Badge>}
                  {room.payment_at_property != null && <Badge variant="outline">{room.payment_at_property ? "Pago en el hotel" : "Sin pago en el hotel"}</Badge>}
                </div>
                <DetailText title="Servicios de la habitación" value={room.amenities?.join(" · ")} />
                <DetailText title="Cancelación de esta tarifa" value={room.policy_cancellation} />
                {(room.room_type_code || room.rate_plan_code) && <p className="text-xs text-muted-foreground">{room.room_type_code && `Habitación: ${room.room_type_code}`}{room.rate_plan_code && ` · Tarifa: ${room.rate_plan_code}`}</p>}
                {!matchesRoomFilters(room, filters) && <p className="text-xs text-muted-foreground">Esta tarifa no cumple los filtros actuales.</p>}
                <Button className="w-full" variant={selected ? "secondary" : "outline"} disabled={!selected && (unavailable || !Number.isFinite(room.total_price))} onClick={() => onRoomSelect(room.occupancy_id)}>{selected ? "Quitar selección" : "Seleccionar habitación"}</Button>
              </div>
            })}
          </section>
          <DetailText title="Política de alojamiento" value={hotel.policy_lodging} />
          <DetailText title="Política de cancelación del hotel" value={hotel.policy_cancellation} />
          {!hotel.description && !hotel.amenities?.length && !hotel.policy_lodging && !hotel.policy_cancellation && <p className="text-xs text-muted-foreground">El proveedor no informó descripción, servicios ni políticas generales.</p>}
        </div>
      </div>
    </aside>
  )
}
