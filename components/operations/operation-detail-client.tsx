"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { ArrowLeft, Pencil, AlertCircle, Trash2, Loader2, RefreshCw, HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DocumentsSection } from "@/components/documents/documents-section"
import { OperationAccountingSection } from "@/components/operations/operation-accounting-section"
import { OperationPaymentsSection } from "@/components/operations/operation-payments-section"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { EditOperationDialog } from "./edit-operation-dialog"
import { OperationRequirementsSection } from "./operation-requirements-section"
import { PassengersSection } from "./passengers-section"
import { useRouter } from "next/navigation"

const statusLabels: Record<string, string> = {
  RESERVED: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  TRAVELLING: "En viaje",
  TRAVELLED: "Viajado",
}

const typeLabels: Record<string, string> = {
  FLIGHT: "Vuelo",
  HOTEL: "Hotel",
  PACKAGE: "Paquete",
  CRUISE: "Crucero",
  TRANSFER: "Transfer",
  MIXED: "Mixto",
}

const alertTypeLabels: Record<string, string> = {
  PAYMENT_DUE: "Pago Pendiente",
  OPERATOR_DUE: "Pago Operador",
  UPCOMING_TRIP: "Viaje Próximo",
  MISSING_DOC: "Documento Faltante",
  PASSPORT_EXPIRY: "Documento Vencido",
  GENERIC: "Genérico",
}

interface OperationDetailClientProps {
  operation: any
  customers: any[]
  documents: any[]
  payments: any[]
  alerts: any[]
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  userRole: string
}

export function OperationDetailClient({
  operation,
  customers,
  documents,
  payments,
  alerts,
  agencies,
  sellers,
  operators,
  userRole,
}: OperationDetailClientProps) {
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isDeletingAlerts, setIsDeletingAlerts] = useState(false)
  const [isGeneratingAlerts, setIsGeneratingAlerts] = useState(false)

  const handleEditSuccess = () => {
    router.refresh()
  }

  const handleDeleteAlerts = async () => {
    if (!confirm("¿Eliminar todas las alertas auto-generadas de esta operación?")) {
      return
    }
    
    setIsDeletingAlerts(true)
    try {
      const response = await fetch(`/api/alerts/cleanup?operationId=${operation.id}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Error")
      router.refresh()
    } catch (error) {
      alert("Error al eliminar alertas")
    } finally {
      setIsDeletingAlerts(false)
    }
  }

  const handleGenerateAlerts = async () => {
    setIsGeneratingAlerts(true)
    try {
      const response = await fetch(`/api/alerts/generate-operation-alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: operation.id }),
      })
      if (!response.ok) throw new Error("Error")
      router.refresh()
    } catch (error) {
      alert("Error al generar alertas")
    } finally {
      setIsGeneratingAlerts(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/operations">Operaciones</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>#{operation.id.slice(0, 8)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/operations">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Operación #{operation.id.slice(0, 8)}</h1>
            <p className="text-muted-foreground">{operation.destination}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{statusLabels[operation.status] || operation.status}</Badge>
          <Button onClick={() => setEditDialogOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="customers">Clientes ({customers.length})</TabsTrigger>
          <TabsTrigger value="documents">Documentos ({documents?.length || 0})</TabsTrigger>
          <TabsTrigger value="payments">Pagos ({payments?.length || 0})</TabsTrigger>
          <TabsTrigger value="accounting">Contabilidad</TabsTrigger>
          <TabsTrigger value="alerts">Alertas ({alerts?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Información Básica</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">Datos generales de la operación: tipo de viaje, destino, fechas y cantidad de pasajeros. Esta información se usa para generación automática de alertas y reportes.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                    <p className="text-sm">{typeLabels[operation.type] || operation.type}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Estado</p>
                    <Badge variant="secondary">{statusLabels[operation.status] || operation.status}</Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Origen</p>
                    <p className="text-sm">{operation.origin || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Destino</p>
                    <p className="text-sm">{operation.destination}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Fecha Operación</p>
                    <p className="text-sm font-semibold">
                      {(() => {
                        try {
                          const dateStr = operation.operation_date || operation.created_at
                          if (!dateStr) return "-"
                          const d = dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00'
                          return format(new Date(d), "dd/MM/yyyy", { locale: es })
                        } catch { return "-" }
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Fecha Salida</p>
                    <p className="text-sm">
                      {(() => {
                        try {
                          if (!operation.departure_date) return "-"
                          return format(new Date(operation.departure_date + 'T12:00:00'), "dd/MM/yyyy", { locale: es })
                        } catch { return "-" }
                      })()}
                    </p>
                  </div>
                  {operation.return_date && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Fecha Regreso</p>
                      <p className="text-sm">
                        {(() => {
                          try {
                            return format(new Date(operation.return_date + 'T12:00:00'), "dd/MM/yyyy", { locale: es })
                          } catch { return "-" }
                        })()}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Pasajeros</p>
                    <p className="text-sm">
                      {operation.adults} adultos, {operation.children} niños, {operation.infants} infantes
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Financiero</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">Montos de venta, costo de operadores y margen bruto calculado automáticamente. El margen es la ganancia antes de gastos operativos (venta - costo operador).</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Monto Venta</p>
                    <p className="text-lg font-semibold">
                      {operation.currency} {operation.sale_amount_total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Costo Operador</p>
                    <p className="text-lg font-semibold">
                      {operation.currency} {operation.operator_cost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Margen</p>
                    <p className="text-lg font-semibold text-green-600">
                      {operation.currency} {operation.margin_amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Margen %</p>
                    <p className="text-lg font-semibold text-green-600">
                      {operation.margin_percentage.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Asignaciones</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">Vendedor asignado (para cálculo de comisiones), operador que provee el servicio, y agencia responsable. El vendedor determina quién recibe la comisión de la venta.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Vendedor</p>
                  <p className="text-sm">{operation.sellers?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Operador</p>
                  <p className="text-sm">{operation.operators?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Agencia</p>
                  <p className="text-sm">{operation.agencies?.name || "-"}</p>
                </div>
                {operation.leads && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Lead Original</p>
                    <Link href={`/sales/leads?leadId=${operation.leads.id}`}>
                      <Button variant="link" className="p-0 h-auto">
                        {operation.leads.contact_name}
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Requisitos del destino */}
          <OperationRequirementsSection 
            destination={operation.destination} 
            departureDate={operation.departure_date || undefined}
          />
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <PassengersSection
            operationId={operation.id}
            initialCustomers={customers}
            onUpdate={() => router.refresh()}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentsSection 
            documents={documents || []} 
            operationId={operation.id} 
            departureDate={operation.departure_date || undefined}
          />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <OperationPaymentsSection
            operationId={operation.id}
            payments={payments || []}
            currency={operation.currency}
            saleAmount={operation.sale_amount_total}
            operatorCost={operation.operator_cost}
            userRole={userRole}
          />
        </TabsContent>

        <TabsContent value="accounting" className="space-y-4">
          <OperationAccountingSection 
            operationId={operation.id}
            saleAmount={operation.sale_amount_total || 0}
            operatorCost={operation.operator_cost || 0}
            currency={operation.currency || "USD"}
            commissionPercent={10}
          />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Alertas de la Operación</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Check-in, vencimientos de documentos, pagos pendientes
                </p>
              </div>
              <div className="flex gap-2">
                {alerts && alerts.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={handleDeleteAlerts}
                    disabled={isDeletingAlerts}
                  >
                    {isDeletingAlerts ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Limpiar
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleGenerateAlerts}
                  disabled={isGeneratingAlerts}
                >
                  {isGeneratingAlerts ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Regenerar alertas
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!alerts || alerts.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No hay alertas para esta operación</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Usa &quot;Regenerar alertas&quot; para crear alertas de check-in y vencimientos
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert: any) => (
                    <div key={alert.id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">{alertTypeLabels[alert.type] || alert.type}</p>
                          <p className="text-xs text-muted-foreground">{alert.description}</p>
                          {alert.date_due && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Fecha: {(() => {
                                try {
                                  const d = alert.date_due.includes('T') ? alert.date_due : alert.date_due + 'T12:00:00'
                                  return format(new Date(d), "dd/MM/yyyy", { locale: es })
                                } catch { return "-" }
                              })()}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant={alert.status === "DONE" ? "default" : "secondary"}>
                        {alert.status === "DONE" ? "Completada" : alert.status === "IGNORED" ? "Ignorada" : "Pendiente"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EditOperationDialog
        operation={operation}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
        agencies={agencies}
        sellers={sellers}
        operators={operators}
      />
    </div>
  )
}

