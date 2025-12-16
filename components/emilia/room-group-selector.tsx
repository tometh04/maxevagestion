"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Bed, Check, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

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
}

interface RoomGroupSelectorProps {
  rooms: HotelRoom[]
  selectedRoomId?: string
  onRoomSelect?: (roomId: string) => void
  maxInitialRooms?: number
  nights: number
}

export function RoomGroupSelector({
  rooms,
  selectedRoomId,
  onRoomSelect,
  maxInitialRooms = 3,
  nights,
}: RoomGroupSelectorProps) {
  const [showAll, setShowAll] = useState(false)

  // Agrupar por tipo de habitación
  const groupedRooms = rooms.reduce((acc, room) => {
    if (!acc[room.type]) {
      acc[room.type] = []
    }
    acc[room.type].push(room)
    return acc
  }, {} as Record<string, HotelRoom[]>)

  // Ordenar cada grupo por precio
  Object.keys(groupedRooms).forEach((type) => {
    groupedRooms[type].sort((a, b) => a.total_price - b.total_price)
  })

  // Obtener habitaciones a mostrar
  const visibleRooms = showAll
    ? rooms
    : Object.values(groupedRooms)
      .map((group) => group[0]) // Primera de cada grupo
      .slice(0, maxInitialRooms)

  const hiddenCount = rooms.length - visibleRooms.length

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Habitaciones disponibles:</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleRooms.map((room) => {
          const group = groupedRooms[room.type]
          const cheapest = group[0]
          const isCheapest = room.occupancy_id === cheapest.occupancy_id
          const isSelected = room.occupancy_id === selectedRoomId

          return (
            <RoomCard
              key={room.occupancy_id}
              room={room}
              isCheapest={isCheapest}
              isSelected={isSelected}
              cheapestPrice={cheapest.total_price}
              nights={nights}
              onSelect={onRoomSelect}
            />
          )
        })}
      </div>

      {hiddenCount > 0 && !showAll && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAll(true)}
          className="w-full"
        >
          Ver más opciones ({hiddenCount} más)
        </Button>
      )}
    </div>
  )
}

interface RoomCardProps {
  room: HotelRoom
  isCheapest: boolean
  isSelected: boolean
  cheapestPrice: number
  nights: number
  onSelect?: (roomId: string) => void
}

function RoomCard({
  room,
  isCheapest,
  isSelected,
  cheapestPrice,
  nights,
  onSelect,
}: RoomCardProps) {
  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const priceDifference = room.total_price - cheapestPrice
  const reasons = getPriceDifferenceReasons(room.description)

  const availabilityConfig = {
    available: room.availability >= 3,
    consult: room.availability === 2,
    unavailable: room.availability < 2,
  }

  return (
    <Card
      className={cn(
        "p-3 cursor-pointer transition-all hover:shadow-md relative",
        isSelected && "ring-2 ring-primary",
        !onSelect && "cursor-default"
      )}
      onClick={() => onSelect?.(room.occupancy_id)}
    >
      {isSelected && (
        <div className="absolute top-2 right-2">
          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
            <Check className="h-4 w-4 text-primary-foreground" />
          </div>
        </div>
      )}

      <div className="space-y-2">
        {/* Precio por noche */}
        <div className="flex items-center gap-2">
          <Bed className="h-4 w-4 text-muted-foreground" />
          <span className="font-bold text-lg">
            {formatPrice(room.price_per_night, room.currency)}/noche
          </span>
        </div>

        {/* Badges de precio */}
        <div className="flex flex-wrap gap-1">
          {isCheapest && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400">
              💰 Mejor precio
            </Badge>
          )}
          {!isCheapest && priceDifference > 0 && (
            <Badge variant="outline" className="text-xs">
              +{formatPrice(priceDifference, room.currency)} vs. opción básica
            </Badge>
          )}
        </div>

        {/* Razones del precio (badges) */}
        {reasons.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {reasons.map((reason, idx) => (
              <Badge key={idx} variant="outline" className="text-[10px]">
                {reason}
              </Badge>
            ))}
          </div>
        )}

        {/* Descripción */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {translateRoomDescription(room.description)}
        </p>

        {/* Disponibilidad */}
        <div className="flex items-center gap-2 text-xs">
          <Circle
            className={cn(
              "h-2 w-2 fill-current",
              availabilityConfig.available && "text-green-500",
              availabilityConfig.consult && "text-yellow-500",
              availabilityConfig.unavailable && "text-red-500"
            )}
          />
          <span className="text-muted-foreground">
            {availabilityConfig.available && "Disponible"}
            {availabilityConfig.consult && "Consultar"}
            {availabilityConfig.unavailable && "No disponible"}
          </span>
        </div>

        {/* Precio total */}
        {nights > 1 && (
          <div className="text-sm font-medium">
            {formatPrice(room.total_price, room.currency)} total
          </div>
        )}
      </div>
    </Card>
  )
}

// Detectar razones del precio superior desde la descripción
function getPriceDifferenceReasons(description: string): string[] {
  const reasons: string[] = []
  const lowerDesc = description.toLowerCase()

  if (lowerDesc.includes("king")) {
    reasons.push("Cama King Size")
  }
  if (lowerDesc.includes("view") || lowerDesc.includes("vista")) {
    reasons.push("Vista especial")
  }
  if (lowerDesc.includes("superior")) {
    reasons.push("Categoría superior")
  }
  if (lowerDesc.includes("suite")) {
    reasons.push("Suite")
  }
  if (lowerDesc.includes("balcon") || lowerDesc.includes("balcony")) {
    reasons.push("Con balcón")
  }
  if (lowerDesc.includes("junior")) {
    reasons.push("Junior Suite")
  }
  if (lowerDesc.includes("executive")) {
    reasons.push("Ejecutiva")
  }

  return reasons
}

// Traducir descripciones comunes de inglés a español
function translateRoomDescription(description: string): string {
  const translations: Record<string, string> = {
    "Double Room": "Habitación Doble",
    "Triple Room": "Habitación Triple",
    "Single Room": "Habitación Individual",
    "ALL INCLUSIVE": "TODO INCLUIDO",
    "All Inclusive": "Todo Incluido",
    "Garden View": "Vista al jardín",
    "Sea View": "Vista al mar",
    "Ocean View": "Vista al océano",
    "Mountain View": "Vista a la montaña",
    "Pool View": "Vista a la piscina",
    "King Size Bed": "Cama King Size",
    "Queen Size Bed": "Cama Queen Size",
    "Twin Beds": "Camas Individuales",
    "Balcony": "Balcón",
    "Superior": "Superior",
    "Deluxe": "De Lujo",
    "Junior Suite": "Junior Suite",
    "Suite": "Suite",
  }

  let translated = description
  Object.entries(translations).forEach(([en, es]) => {
    const regex = new RegExp(en, "gi")
    translated = translated.replace(regex, es)
  })

  return translated
}




