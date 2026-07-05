"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Hotel,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { RoomGroupSelector } from "./room-group-selector"
import { cn } from "@/lib/utils"

// Interfaces según la especificación
interface HotelRoom {
  type: string
  description: string
  price_per_night: number
  total_price: number
  currency: string
  availability: number
  occupancy_id: string
  adults?: number
  children?: number
  infants?: number
  fare_id_broker?: string
}

interface HotelData {
  id: string
  unique_id?: string
  name: string
  category: string
  city: string
  address: string
  phone?: string
  website?: string
  description?: string
  images?: string[]
  /** Mayorista de origen (proviene del campo `provider` de la API de Emilia). */
  provider?: string
  rooms: HotelRoom[]
  check_in: string
  check_out: string
  nights: number
  policy_cancellation?: string
  policy_lodging?: string
}

interface HotelResultCardProps {
  hotel: HotelData
  onRoomSelect?: (roomId: string) => void
  selectedRoomId?: string
  selected?: boolean
  onSelectionChange?: (hotelId: string, selected: boolean) => void
  /** Carrusel angosto (chat embebido): fuerza 1 columna de habitaciones. */
  compact?: boolean
}

/**
 * Mini carrusel de fotos del hotel + bandera del mayorista.
 * Usa <img> nativo (los dominios de imagen de Emilia son dinámicos y no
 * dependen de `next.config` remotePatterns); si una foto falla, la descarta.
 */
function HotelImageCarousel({
  images,
  alt,
  provider,
  compact = false,
}: {
  images?: string[]
  alt: string
  provider?: string
  compact?: boolean
}) {
  const validImages = (images ?? []).filter(
    (src) => typeof src === "string" && src.trim().length > 0
  )
  const [broken, setBroken] = useState<string[]>([])
  const [index, setIndex] = useState(0)

  const usable = validImages.filter((src) => !broken.includes(src))
  const safeIndex = usable.length > 0 ? Math.min(index, usable.length - 1) : 0
  const hasMultiple = usable.length > 1

  const go = (next: number) => {
    if (usable.length === 0) return
    setIndex(((next % usable.length) + usable.length) % usable.length)
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-muted",
        compact ? "h-28" : "h-36"
      )}
    >
      {usable.length > 0 ? (
        <img
          key={usable[safeIndex]}
          src={usable[safeIndex]}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken((prev) => [...prev, usable[safeIndex]])}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <Hotel className="h-6 w-6 opacity-50" />
          <span className="text-[11px]">Sin foto</span>
        </div>
      )}

      {/* Bandera mayorista */}
      {provider ? (
        <Badge
          variant="outline"
          className="absolute left-2 top-2 z-10 border-border/60 bg-background/90 text-[10px] font-semibold uppercase tracking-wide shadow-sm backdrop-blur-sm"
        >
          {provider}
        </Badge>
      ) : null}

      {hasMultiple ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              go(safeIndex - 1)
            }}
            className="absolute left-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border/50 bg-background/85 text-foreground shadow-sm transition-colors hover:bg-background"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Foto siguiente"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              go(safeIndex + 1)
            }}
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border/50 bg-background/85 text-foreground shadow-sm transition-colors hover:bg-background"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {usable.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === safeIndex}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  go(i)
                }}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === safeIndex
                    ? "w-4 bg-white"
                    : "w-1.5 bg-white/60 hover:bg-white/80"
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export function HotelResultCard({
  hotel,
  onRoomSelect,
  selectedRoomId,
  selected = false,
  onSelectionChange,
  compact = false,
}: HotelResultCardProps) {
  const formatDate = (dateStr: string) => {
    // Mantener formato YYYY-MM-DD según especificación
    return dateStr
  }

  const handleCheckboxChange = (checked: boolean) => {
    onSelectionChange?.(hotel.id, checked)
  }

  return (
    <Card className={cn("overflow-hidden border-border/50", selected && "ring-2 ring-primary")}>
      <HotelImageCarousel
        images={hotel.images}
        alt={hotel.name}
        provider={hotel.provider}
        compact={compact}
      />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <Checkbox 
              checked={selected}
              onCheckedChange={handleCheckboxChange}
              className="mt-1"
            />
            <div className="flex-1 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2">
                <Hotel className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-base">{hotel.name}</h3>
                <Badge variant="secondary" className="text-xs">
                  {hotel.category}
                </Badge>
              </div>

            {/* Location */}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{hotel.city}</span>
            </div>

            {/* Address */}
            <div className="text-xs text-muted-foreground">
              {hotel.address}
            </div>

            {/* Dates */}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">
                {formatDate(hotel.check_in)} → {formatDate(hotel.check_out)} ({hotel.nights} noche{hotel.nights > 1 ? "s" : ""})
              </span>
            </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-4">
        <RoomGroupSelector
          rooms={hotel.rooms}
          selectedRoomId={selectedRoomId}
          onRoomSelect={onRoomSelect}
          nights={hotel.nights}
          maxInitialRooms={3}
          compact={compact}
        />
      </CardContent>
    </Card>
  )
}

