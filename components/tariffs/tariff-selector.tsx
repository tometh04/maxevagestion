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
import { Loader2, Package, Check, Tag, Calendar, MapPin } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface TariffItem {
  id: string
  item_name: string
  item_type: string
  base_price: number
  sale_price: number
  currency: string
  room_type?: string
  max_occupancy?: number
}

interface Tariff {
  id: string
  name: string
  destination: string
  region: string
  tariff_type: string
  currency: string
  valid_from: string
  valid_to: string
  is_active: boolean
  operators?: { id: string; name: string }
  tariff_items?: TariffItem[]
}

interface TariffSelectorProps {
  onSelect: (tariff: Tariff, item?: TariffItem) => void
  destination?: string
  region?: string
  operatorId?: string
}

export function TariffSelector({
  onSelect,
  destination,
  region,
  operatorId,
}: TariffSelectorProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null)

  useEffect(() => {
    if (open) {
      fetchTariffs()
    }
  }, [open, destination, region, operatorId])

  async function fetchTariffs() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("isActive", "true")
      if (destination) params.set("destination", destination)
      if (region) params.set("region", region)
      if (operatorId) params.set("operatorId", operatorId)

      const response = await fetch(`/api/tariffs?${params.toString()}`)
      const data = await response.json()
      setTariffs(data.tariffs || [])
    } catch (error) {
      console.error("Error fetching tariffs:", error)
    } finally {
      setLoading(false)
    }
  }

  function handleSelectTariff(tariff: Tariff) {
    if (tariff.tariff_items && tariff.tariff_items.length > 0) {
      setSelectedTariff(tariff)
    } else {
      onSelect(tariff)
      setOpen(false)
    }
  }

  function handleSelectItem(tariff: Tariff, item: TariffItem) {
    onSelect(tariff, item)
    setOpen(false)
    setSelectedTariff(null)
  }

  const tariffTypeLabels: Record<string, string> = {
    ACCOMMODATION: "Alojamiento",
    FLIGHT: "Vuelo",
    PACKAGE: "Paquete",
    TRANSFER: "Traslado",
    ACTIVITY: "Actividad",
    CRUISE: "Crucero",
    OTHER: "Otro",
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setSelectedTariff(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Package className="h-4 w-4 mr-2" />
          Usar Tarifario
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {selectedTariff ? "Seleccionar Item" : "Seleccionar Tarifario"}
          </DialogTitle>
          <DialogDescription>
            {selectedTariff 
              ? `Selecciona un item del tarifario "${selectedTariff.name}"`
              : "Busca y selecciona un tarifario para aplicar sus precios"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : selectedTariff ? (
            // Mostrar items del tarifario seleccionado
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedTariff(null)}
                className="mb-2"
              >
                ← Volver a tarifarios
              </Button>
              
              {selectedTariff.tariff_items?.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectItem(selectedTariff, item)}
                  className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.item_name}</p>
                      {item.room_type && (
                        <p className="text-sm text-muted-foreground">{item.room_type}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">
                        {item.currency} {item.sale_price.toLocaleString("es-AR")}
                      </p>
                      {item.base_price !== item.sale_price && (
                        <p className="text-xs text-muted-foreground line-through">
                          {item.currency} {item.base_price.toLocaleString("es-AR")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {(!selectedTariff.tariff_items || selectedTariff.tariff_items.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Este tarifario no tiene items configurados
                </p>
              )}
            </div>
          ) : (
            // Mostrar lista de tarifarios
            <Command className="rounded-lg border">
              <CommandInput placeholder="Buscar tarifario..." />
              <CommandList className="max-h-[400px]">
                <CommandEmpty>No se encontraron tarifarios.</CommandEmpty>
                <CommandGroup>
                  {tariffs.map((tariff) => (
                    <CommandItem
                      key={tariff.id}
                      value={`${tariff.name} ${tariff.destination}`}
                      onSelect={() => handleSelectTariff(tariff)}
                      className="cursor-pointer"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tariff.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {tariffTypeLabels[tariff.tariff_type] || tariff.tariff_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {tariff.destination}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(tariff.valid_from), "dd/MM", { locale: es })} - {format(new Date(tariff.valid_to), "dd/MM/yy", { locale: es })}
                          </span>
                          {tariff.operators && (
                            <span className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {tariff.operators.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge className="ml-2">
                        {tariff.currency}
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

