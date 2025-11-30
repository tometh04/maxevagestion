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
import { FileText, CheckCircle, XCircle, Clock, Send, ExternalLink } from "lucide-react"
import Link from "next/link"

const statusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  PENDING_APPROVAL: "Pendiente Aprobación",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  EXPIRED: "Expirada",
  CONVERTED: "Convertida",
}

const statusIcons: Record<string, any> = {
  DRAFT: FileText,
  SENT: Send,
  PENDING_APPROVAL: Clock,
  APPROVED: CheckCircle,
  REJECTED: XCircle,
  EXPIRED: Clock,
  CONVERTED: CheckCircle,
}

interface Quotation {
  id: string
  quotation_number: string
  destination: string
  region: string
  status: string
  total_amount: number
  currency: string
  valid_until: string
  created_at: string
  lead_id: string | null
  agency_id: string
  seller_id: string
  operator_id: string | null
  operation_id: string | null
  leads?: { contact_name: string; destination: string; status: string } | null
  agencies?: { name: string } | null
  sellers?: { name: string; email: string } | null
  operators?: { name: string } | null
  operations?: { destination: string; status: string } | null
  quotation_items?: Array<{
    id: string
    item_type: string
    description: string
    quantity: number
    unit_price: number
    subtotal: number
    currency: string
  }>
}

interface QuotationDetailDialogProps {
  quotation: Quotation
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefresh?: () => void
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
}

export function QuotationDetailDialog({
  quotation,
  open,
  onOpenChange,
  onRefresh,
  agencies,
  sellers,
  operators,
}: QuotationDetailDialogProps) {
  const [quotationData, setQuotationData] = useState<Quotation | null>(quotation)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && quotation.id) {
      fetchQuotationDetails()
    }
  }, [open, quotation.id])

  const fetchQuotationDetails = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/quotations/${quotation.id}`)
      if (response.ok) {
        const data = await response.json()
        setQuotationData(data.quotation)
      }
    } catch (error) {
      console.error("Error fetching quotation details:", error)
    } finally {
      setLoading(false)
    }
  }

  const StatusIcon = statusIcons[quotationData?.status || "DRAFT"] || FileText

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StatusIcon className="h-5 w-5" />
            Cotización {quotationData?.quotation_number}
          </DialogTitle>
          <DialogDescription>
            Detalles completos de la cotización
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-muted-foreground">Cargando...</div>
          </div>
        ) : quotationData ? (
          <div className="space-y-6">
            {/* Información básica */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Estado</label>
                <div className="mt-1">
                  <Badge variant="outline" className="text-sm">
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {statusLabels[quotationData.status] || quotationData.status}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Destino</label>
                <div className="mt-1 font-medium">{quotationData.destination}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Cliente</label>
                <div className="mt-1">
                  {quotationData.leads?.contact_name || "-"}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Vendedor</label>
                <div className="mt-1">{quotationData.sellers?.name || "-"}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Válida hasta</label>
                <div className="mt-1">
                  {format(new Date(quotationData.valid_until), "dd/MM/yyyy", { locale: es })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Total</label>
                <div className="mt-1 font-semibold text-lg">
                  {quotationData.currency}{" "}
                  {quotationData.total_amount.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            <Separator />

            {/* Items */}
            {quotationData.quotation_items && quotationData.quotation_items.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Items de la cotización</h3>
                <div className="space-y-2">
                  {quotationData.quotation_items.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{item.description}</div>
                        <div className="text-sm text-muted-foreground">
                          {item.item_type} - Cantidad: {item.quantity}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {item.currency}{" "}
                          {item.subtotal.toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {item.currency}{" "}
                          {item.unit_price.toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          c/u
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Acciones */}
            {quotationData.status === "APPROVED" && !quotationData.operation_id && (
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    const response = await fetch(
                      `/api/quotations/${quotationData.id}/convert`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({}),
                      }
                    )
                    if (response.ok) {
                      onRefresh?.()
                      onOpenChange(false)
                    }
                  }}
                >
                  Convertir a Operación
                </Button>
              </div>
            )}

            {quotationData.operation_id && (
              <div>
                <Link href={`/operations/${quotationData.operation_id}`}>
                  <Button variant="outline">
                    Ver Operación <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-muted-foreground p-8">
            No se pudo cargar la cotización
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

