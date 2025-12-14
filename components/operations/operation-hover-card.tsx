"use client"

import { useState, useEffect, useCallback } from "react"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CalendarDays, MapPin, Users, DollarSign, Plane } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface OperationHoverCardProps {
  operationId: string
  children: React.ReactNode
}

interface OperationData {
  id: string
  file_code: string | null
  destination: string
  origin: string | null
  departure_date: string
  return_date: string | null
  status: string
  type: string
  currency: string
  sale_amount_total: number
  margin_amount: number
  margin_percentage: number
  adults: number
  children: number
  infants: number
  sellers?: { name: string } | null
  operators?: { name: string } | null
}

const statusLabels: Record<string, string> = {
  PRE_RESERVATION: "Pre-reserva",
  RESERVED: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  TRAVELLED: "Viajado",
  CLOSED: "Cerrado",
}

const statusColors: Record<string, string> = {
  PRE_RESERVATION: "bg-gray-500",
  RESERVED: "bg-blue-500",
  CONFIRMED: "bg-green-500",
  CANCELLED: "bg-red-500",
  TRAVELLED: "bg-purple-500",
  CLOSED: "bg-slate-500",
}

export function OperationHoverCard({ operationId, children }: OperationHoverCardProps) {
  const [operation, setOperation] = useState<OperationData | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const fetchOperationData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/operations/${operationId}`)
      const data = await response.json()
      setOperation(data.operation)
    } catch (error) {
      console.error("Error fetching operation:", error)
    } finally {
      setLoading(false)
    }
  }, [operationId])

  useEffect(() => {
    if (open && !operation) {
      fetchOperationData()
    }
  }, [open, operation, fetchOperationData])

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
  }

  const totalPax = operation 
    ? operation.adults + operation.children + operation.infants 
    : 0

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="top">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : operation ? (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <Link 
                  href={`/operations/${operation.id}`}
                  className="font-semibold hover:underline flex items-center gap-2"
                >
                  <Plane className="h-4 w-4" />
                  {operation.file_code || operation.destination}
                </Link>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3" />
                  {operation.origin && `${operation.origin} → `}{operation.destination}
                </p>
              </div>
              <Badge className={`${statusColors[operation.status]} text-white`}>
                {statusLabels[operation.status] || operation.status}
              </Badge>
            </div>

            {/* Fechas */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              <span>
                {(() => {
                  try {
                    if (!operation.departure_date) return "-"
                    const dep = format(new Date(operation.departure_date + 'T12:00:00'), "dd MMM yyyy", { locale: es })
                    const ret = operation.return_date 
                      ? ` - ${format(new Date(operation.return_date + 'T12:00:00'), "dd MMM yyyy", { locale: es })}`
                      : ""
                    return dep + ret
                  } catch { return "-" }
                })()}
              </span>
            </div>

            {/* Info adicional */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span>{totalPax} pasajeros</span>
              </div>
              <div className="text-muted-foreground">
                Tipo: {operation.type}
              </div>
            </div>

            {/* Financiero */}
            <div className="rounded-lg bg-muted/50 p-2 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Venta:</span>
                <span className="font-medium">
                  {formatCurrency(operation.sale_amount_total, operation.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Margen:</span>
                <span className={`font-medium ${operation.margin_amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(operation.margin_amount, operation.currency)} ({operation.margin_percentage.toFixed(1)}%)
                </span>
              </div>
            </div>

            {/* Vendedor/Operador */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Vendedor: {operation.sellers?.name || "-"}</span>
              <span>Op: {operation.operators?.name || "-"}</span>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-4">
            No se pudo cargar la información
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

