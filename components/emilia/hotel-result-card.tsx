"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Hotel,
  MapPin,
  Calendar,
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
}

export function HotelResultCard({
  hotel,
  onRoomSelect,
  selectedRoomId,
  selected = false,
  onSelectionChange,
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
        />
      </CardContent>
    </Card>
  )
}

