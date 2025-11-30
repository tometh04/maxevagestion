"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { CheckCircle, XCircle } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Quota {
  id: string
  destination: string
  accommodation_name: string | null
  room_type: string | null
  date_from: string
  date_to: string
  total_quota: number
  reserved_quota: number
  available_quota: number
  is_active: boolean
  operator_id: string
  tariff_id: string | null
  notes: string | null
  created_at: string
  operators?: { name: string } | null
  tariffs?: { name: string; destination: string } | null
}

interface QuotaDetailDialogProps {
  quota: Quota
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefresh?: () => void
  operators: Array<{ id: string; name: string }>
}

export function QuotaDetailDialog({
  quota,
  open,
  onOpenChange,
  onRefresh,
  operators,
}: QuotaDetailDialogProps) {
  const [quotaData, setQuotaData] = useState<Quota | null>(quota)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && quota.id) {
      fetchQuotaDetails()
    }
  }, [open, quota.id])

  const fetchQuotaDetails = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/quotas/${quota.id}`)
      if (response.ok) {
        const data = await response.json()
        setQuotaData(data.quota)
      }
    } catch (error) {
      console.error("Error fetching quota details:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!quotaData) {
    return null
  }

  const StatusIcon = quotaData.is_active ? CheckCircle : XCircle
  const usedPercent = quotaData.total_quota > 0
    ? (quotaData.reserved_quota / quotaData.total_quota) * 100
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Cupo: {quotaData.destination}
            <Badge
              variant={quotaData.is_active ? "default" : "secondary"}
              className="ml-2"
            >
              <StatusIcon className="mr-1 h-3 w-3" />
              {quotaData.is_active ? "Activo" : "Inactivo"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Detalles del cupo disponible
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Detalles</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Operador</p>
                <p className="text-sm">{quotaData.operators?.name || "-"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Tarifario</p>
                <p className="text-sm">
                  {quotaData.tariffs
                    ? `${quotaData.tariffs.name} - ${quotaData.tariffs.destination}`
                    : "-"}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Destino</p>
                <p className="text-sm">{quotaData.destination}</p>
              </div>
              {quotaData.accommodation_name && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Alojamiento</p>
                  <p className="text-sm">{quotaData.accommodation_name}</p>
                </div>
              )}
              {quotaData.room_type && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Tipo de Habitación</p>
                  <p className="text-sm">{quotaData.room_type}</p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Fecha desde</p>
                <p className="text-sm">
                  {format(new Date(quotaData.date_from), "PPP", { locale: es })}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Fecha hasta</p>
                <p className="text-sm">
                  {format(new Date(quotaData.date_to), "PPP", { locale: es })}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Disponibilidad</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Cupo disponible</span>
                    <span className="font-bold text-lg">
                      {quotaData.available_quota} / {quotaData.total_quota}
                    </span>
                  </div>
                  <Progress value={usedPercent} className="h-3" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{quotaData.reserved_quota} reservado{quotaData.reserved_quota !== 1 ? "s" : ""}</span>
                    <span>{usedPercent.toFixed(1)}% utilizado</span>
                  </div>
                </div>
              </div>
            </div>

            {quotaData.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Notas</p>
                  <p className="text-sm whitespace-pre-wrap">{quotaData.notes}</p>
                </div>
              </>
            )}

            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Creado</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(quotaData.created_at), "PPP 'a las' HH:mm", { locale: es })}
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

