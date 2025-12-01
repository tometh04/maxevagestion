"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Package, Check, Calendar, MapPin, Building2 } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"

interface Quota {
  id: string
  destination: string
  accommodation_name?: string
  room_type?: string
  date_from: string
  date_to: string
  total_quota: number
  reserved_quota: number
  available_quota: number
  is_active: boolean
  operators?: { id: string; name: string }
}

interface QuotaSelectorProps {
  operationId: string
  destination?: string
  operatorId?: string
  departureDate?: string
  paxCount?: number
  onReserved?: () => void
}

export function QuotaSelector({
  operationId,
  destination,
  operatorId,
  departureDate,
  paxCount = 1,
  onReserved,
}: QuotaSelectorProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reserving, setReserving] = useState(false)
  const [quotas, setQuotas] = useState<Quota[]>([])
  const [selectedQuota, setSelectedQuota] = useState<Quota | null>(null)
  const [quantity, setQuantity] = useState(paxCount)

  useEffect(() => {
    if (open) {
      fetchQuotas()
    }
  }, [open, destination, operatorId, departureDate])

  useEffect(() => {
    setQuantity(paxCount)
  }, [paxCount])

  async function fetchQuotas() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (destination) params.set("destination", destination)
      if (operatorId) params.set("operatorId", operatorId)
      if (departureDate) params.set("dateFrom", departureDate)
      params.set("isActive", "true")

      const response = await fetch(`/api/quotas?${params.toString()}`)
      const data = await response.json()
      
      // Filtrar solo cupos con disponibilidad
      const available = (data.quotas || []).filter((q: Quota) => q.available_quota > 0)
      setQuotas(available)
    } catch (error) {
      console.error("Error fetching quotas:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleReserve() {
    if (!selectedQuota) return
    
    if (quantity > selectedQuota.available_quota) {
      toast.error(`Solo hay ${selectedQuota.available_quota} cupos disponibles`)
      return
    }

    setReserving(true)
    try {
      const response = await fetch("/api/quotas/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quota_id: selectedQuota.id,
          operation_id: operationId,
          quantity,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al reservar cupo")
      }

      toast.success(`${quantity} cupo(s) reservado(s) exitosamente`)
      setOpen(false)
      setSelectedQuota(null)
      onReserved?.()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setReserving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setSelectedQuota(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Package className="h-4 w-4 mr-2" />
          Reservar Cupo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {selectedQuota ? "Confirmar Reserva" : "Seleccionar Cupo"}
          </DialogTitle>
          <DialogDescription>
            {selectedQuota 
              ? `Reservar cupo en ${selectedQuota.destination}`
              : "Busca y selecciona un cupo disponible"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : selectedQuota ? (
            // Confirmar reserva
            <div className="space-y-4 py-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedQuota.destination}</span>
                </div>
                {selectedQuota.accommodation_name && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedQuota.accommodation_name}</span>
                    {selectedQuota.room_type && (
                      <Badge variant="outline">{selectedQuota.room_type}</Badge>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(new Date(selectedQuota.date_from), "dd/MM/yyyy", { locale: es })} - {format(new Date(selectedQuota.date_to), "dd/MM/yyyy", { locale: es })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span>
                    <span className="text-green-600 font-medium">{selectedQuota.available_quota}</span> cupos disponibles de {selectedQuota.total_quota}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">Cantidad a reservar</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max={selectedQuota.available_quota}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedQuota(null)}
                  className="flex-1"
                >
                  Volver
                </Button>
                <Button 
                  onClick={handleReserve}
                  disabled={reserving || quantity < 1 || quantity > selectedQuota.available_quota}
                  className="flex-1"
                >
                  {reserving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Reservando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Confirmar Reserva
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            // Lista de cupos
            <Command className="rounded-lg border">
              <CommandInput placeholder="Buscar cupo..." />
              <CommandList className="max-h-[400px]">
                <CommandEmpty>No se encontraron cupos disponibles.</CommandEmpty>
                <CommandGroup>
                  {quotas.map((quota) => (
                    <CommandItem
                      key={quota.id}
                      value={`${quota.destination} ${quota.accommodation_name || ""}`}
                      onSelect={() => setSelectedQuota(quota)}
                      className="cursor-pointer"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{quota.destination}</span>
                          {quota.operators && (
                            <Badge variant="outline" className="text-xs">
                              {quota.operators.name}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {quota.accommodation_name && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {quota.accommodation_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(quota.date_from), "dd/MM", { locale: es })} - {format(new Date(quota.date_to), "dd/MM/yy", { locale: es })}
                          </span>
                        </div>
                      </div>
                      <Badge className={quota.available_quota > 5 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                        {quota.available_quota} disp.
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

