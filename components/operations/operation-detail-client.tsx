"use client"

import { useState } from "react"
// Card removed in redesign - using sub-cards directly
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
// Table import removed - not used in detail view
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { ArrowLeft, Pencil, AlertCircle, Trash2, Loader2, RefreshCw, Receipt, Plane, MapPin, Calendar, Users, DollarSign, Building2, UserCheck, Briefcase, TrendingUp } from "lucide-react"
// Tooltips removed in redesign
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
import { OperationServicesSection } from "./operation-services-section"
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
  ASSISTANCE: "Asistencia al Viajero",
}

const alertTypeLabels: Record<string, string> = {
  PAYMENT_DUE: "Pago Pendiente",
  OPERATOR_DUE: "Pago Operador",
  UPCOMING_TRIP: "Viaje Próximo",
  MISSING_DOC: "Documento Faltante",
  PASSPORT_EXPIRY: "Documento Vencido",
  GENERIC: "Genérico",
}

interface OperationService {
  id: string
  service_type: string
  name?: string | null
  price: number
  cost: number
  currency: "ARS" | "USD"
  generates_commission: boolean
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
  commissionRecords?: Array<{ percentage: number | null; seller_id: string; amount: number }>
  operationServices?: OperationService[]
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
  commissionRecords = [],
  operationServices = [],
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

  // Separar pagos de la operación base de pagos de servicios adicionales
  const operationBasePayments = (payments || []).filter((p: any) => !p.operation_service_id)
  const servicePayments = (payments || []).filter((p: any) => p.operation_service_id)

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
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {operation.destination || "Operación"}
              </h1>
              <Badge
                variant="secondary"
                className={
                  operation.status === "CONFIRMED" ? "bg-success/10 text-success border-success/20" :
                  operation.status === "CANCELLED" ? "bg-destructive/10 text-destructive border-destructive/20" :
                  operation.status === "TRAVELLING" ? "bg-primary/10 text-primary border-primary/20" :
                  operation.status === "TRAVELLED" ? "bg-muted text-muted-foreground" :
                  "bg-warning/10 text-warning border-warning/20"
                }
              >
                {statusLabels[operation.status] || operation.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              #{operation.id.slice(0, 8)} · {typeLabels[operation.type] || operation.type} · {operation.agencies?.name || "Sin agencia"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href={`/operations/billing/new?operationId=${operation.id}`}>
              <Receipt className="mr-1.5 h-3.5 w-3.5" />
              Facturar
            </Link>
          </Button>
          <Button size="sm" className="h-8" onClick={() => setEditDialogOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="customers">Clientes ({customers.length})</TabsTrigger>
          <TabsTrigger value="documents">Documentos ({documents?.length || 0})</TabsTrigger>
          {userRole !== "SELLER" && (
            <TabsTrigger value="payments">Pagos Operación ({operationBasePayments.length})</TabsTrigger>
          )}
          <TabsTrigger value="services">Servicios</TabsTrigger>
          {userRole !== "SELLER" && (
            <TabsTrigger value="accounting">Contabilidad</TabsTrigger>
          )}
          <TabsTrigger value="alerts">Alertas ({alerts?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6">
          {/* Row 1: Datos del Viaje + Financiero */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Datos del Viaje */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <Plane className="h-3.5 w-3.5 text-primary" />
                </div>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Datos del Viaje</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Ruta */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 col-span-2">
                  <div className="flex items-center gap-1.5 mb-3">
                    <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-medium text-foreground/70">Ruta</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-0.5">Origen</p>
                      <p className="text-sm font-medium">{operation.origin || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-0.5">Destino</p>
                      <p className="text-sm font-medium">{operation.destination}</p>
                    </div>
                  </div>
                </div>

                {/* Fechas */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Calendar className="h-3.5 w-3.5 text-sky-500" />
                    <span className="text-xs font-medium text-foreground/70">Fechas</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-0.5">
                        {operation.type === "ASSISTANCE" ? "Inicio Cobertura" : "Salida"}
                      </p>
                      <p className="text-sm font-medium">
                        {(() => {
                          try {
                            if (!operation.departure_date) return "-"
                            return format(new Date(operation.departure_date + 'T12:00:00'), "dd MMM yyyy", { locale: es })
                          } catch { return "-" }
                        })()}
                      </p>
                    </div>
                    {operation.return_date && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-0.5">
                          {operation.type === "ASSISTANCE" ? "Fin Cobertura" : "Regreso"}
                        </p>
                        <p className="text-sm font-medium">
                          {(() => {
                            try {
                              return format(new Date(operation.return_date + 'T12:00:00'), "dd MMM yyyy", { locale: es })
                            } catch { return "-" }
                          })()}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-0.5">Creación</p>
                      <p className="text-sm font-medium">
                        {(() => {
                          try {
                            const dateStr = operation.operation_date || operation.created_at
                            if (!dateStr) return "-"
                            const d = dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00'
                            return format(new Date(d), "dd MMM yyyy", { locale: es })
                          } catch { return "-" }
                        })()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pasajeros */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Users className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-medium text-foreground/70">Pasajeros</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">Adultos</p>
                      <p className="text-sm font-semibold tabular-nums">{operation.adults}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">Niños</p>
                      <p className="text-sm font-semibold tabular-nums">{operation.children}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">Infantes</p>
                      <p className="text-sm font-semibold tabular-nums">{operation.infants}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Financiero + Asignaciones */}
            <div className="space-y-5">
              {userRole !== "SELLER" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-6 w-6 rounded-md bg-warning/10">
                      <DollarSign className="h-3.5 w-3.5 text-warning" />
                    </div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Financiero</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Montos */}
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-xs font-medium text-foreground/70">Venta</span>
                      </div>
                      <p className="text-xl font-semibold tabular-nums tracking-tight">
                        {operation.currency} {operation.sale_amount_total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </p>
                      <div className="mt-3 pt-3 border-t border-border/30">
                        <p className="text-[11px] text-muted-foreground mb-0.5">Costo Operador</p>
                        <p className="text-sm font-medium tabular-nums">
                          {operation.currency} {operation.operator_cost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {/* Margen */}
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <TrendingUp className="h-3.5 w-3.5 text-success" />
                        <span className="text-xs font-medium text-foreground/70">Margen</span>
                      </div>
                      <p className="text-xl font-semibold tabular-nums tracking-tight text-success">
                        {operation.currency} {operation.margin_amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </p>
                      <div className="mt-3 pt-3 border-t border-border/30">
                        <p className="text-[11px] text-muted-foreground mb-0.5">Porcentaje</p>
                        <p className="text-sm font-semibold text-success tabular-nums">
                          {operation.margin_percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Asignaciones */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-violet-500/10">
                    <UserCheck className="h-3.5 w-3.5 text-violet-500" />
                  </div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Asignaciones</h3>
                </div>

                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <UserCheck className="h-3 w-3 text-violet-500" />
                        <p className="text-[11px] text-muted-foreground">
                          {(operation as any).sellers_secondary ? "Vendedor Principal" : "Vendedor"}
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {operation.sellers?.name || "-"}
                        {(operation as any).sellers_secondary && (operation as any).commission_split != null && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            ({(operation as any).commission_split}%)
                          </span>
                        )}
                      </p>
                    </div>
                    {(operation as any).sellers_secondary && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Users className="h-3 w-3 text-violet-400" />
                          <p className="text-[11px] text-muted-foreground">Vendedor Secundario</p>
                        </div>
                        <p className="text-sm font-medium">
                          {(operation as any).sellers_secondary.name}
                          {(operation as any).commission_split != null && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground">
                              ({100 - (operation as any).commission_split}%)
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Briefcase className="h-3 w-3 text-sky-500" />
                        <p className="text-[11px] text-muted-foreground">Operador</p>
                      </div>
                      <p className="text-sm font-medium">{operation.operators?.name || "-"}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Building2 className="h-3 w-3 text-amber-500" />
                        <p className="text-[11px] text-muted-foreground">Agencia</p>
                      </div>
                      <p className="text-sm font-medium">{operation.agencies?.name || "-"}</p>
                    </div>
                    {operation.leads && (
                      <div className="col-span-2">
                        <p className="text-[11px] text-muted-foreground mb-1">Lead Original</p>
                        <Link href={`/sales/leads?leadId=${operation.leads.id}`}>
                          <Button variant="link" className="p-0 h-auto text-sm">
                            {operation.leads.contact_name}
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Requisitos del destino */}
          <OperationRequirementsSection
            destination={operation.destination}
            departureDate={operation.departure_date || undefined}
          />

          {/* Resumen financiero global (operación + servicios) */}
          {servicePayments.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                </div>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Resumen Financiero Global</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <p className="text-[11px] text-muted-foreground mb-1">Venta operación</p>
                  <p className="text-base font-semibold tabular-nums">
                    {operation.currency} {Number(operation.sale_amount_total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <p className="text-[11px] text-muted-foreground mb-1">Cobrado en servicios</p>
                  {(() => {
                    const totals: Record<string, number> = {}
                    servicePayments.filter(p => p.direction === "INCOME" && p.status === "PAID").forEach(p => {
                      totals[p.currency] = (totals[p.currency] || 0) + Number(p.amount)
                    })
                    return Object.keys(totals).length > 0
                      ? Object.entries(totals).map(([cur, amt]) => (
                          <p key={cur} className="text-base font-semibold text-success tabular-nums">
                            {cur} {amt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </p>
                        ))
                      : <p className="text-muted-foreground text-sm">Sin cobros</p>
                  })()}
                </div>
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <p className="text-[11px] text-muted-foreground mb-1">Pagado a proveedores</p>
                  {(() => {
                    const totals: Record<string, number> = {}
                    servicePayments.filter(p => p.direction === "EXPENSE" && p.status === "PAID").forEach(p => {
                      totals[p.currency] = (totals[p.currency] || 0) + Number(p.amount)
                    })
                    return Object.keys(totals).length > 0
                      ? Object.entries(totals).map(([cur, amt]) => (
                          <p key={cur} className="text-base font-semibold text-destructive tabular-nums">
                            {cur} {amt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </p>
                        ))
                      : <p className="text-muted-foreground text-sm">Sin pagos</p>
                  })()}
                </div>
              </div>
            </div>
          )}
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
            payments={operationBasePayments}
            currency={operation.currency}
            saleAmount={operation.sale_amount_total}
            operatorCost={operation.operator_cost}
            userRole={userRole}
          />
        </TabsContent>

        {userRole !== "SELLER" && (
          <TabsContent value="accounting" className="space-y-4">
            <OperationAccountingSection
              operationId={operation.id}
              saleAmount={operation.sale_amount_total || 0}
              operatorCost={operation.operator_cost || 0}
              currency={operation.currency || "USD"}
              commissionPercent={
                commissionRecords.length > 0 && commissionRecords[0]?.percentage
                  ? commissionRecords[0].percentage
                  : 10
              }
              operationServices={operationServices}
            />
          </TabsContent>
        )}

        <TabsContent value="alerts" className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-destructive/10">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Alertas</h3>
                  <p className="text-[11px] text-muted-foreground">Check-in, vencimientos, pagos pendientes</p>
                </div>
              </div>
              <div className="flex gap-2">
                {alerts && alerts.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-destructive hover:text-destructive/80"
                    onClick={handleDeleteAlerts}
                    disabled={isDeletingAlerts}
                  >
                    {isDeletingAlerts ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Limpiar
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleGenerateAlerts}
                  disabled={isGeneratingAlerts}
                >
                  {isGeneratingAlerts ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Regenerar
                </Button>
              </div>
            </div>

              {!alerts || alerts.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-muted mx-auto mb-3">
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No hay alertas para esta operación</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Usa &quot;Regenerar&quot; para crear alertas automáticas
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert: any) => (
                    <div key={alert.id} className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-warning/10 mt-0.5">
                          <AlertCircle className="h-3.5 w-3.5 text-warning" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{alertTypeLabels[alert.type] || alert.type}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                          {alert.date_due && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {(() => {
                                try {
                                  const d = alert.date_due.includes('T') ? alert.date_due : alert.date_due + 'T12:00:00'
                                  return format(new Date(d), "dd MMM yyyy", { locale: es })
                                } catch { return "-" }
                              })()}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          alert.status === "DONE" ? "bg-success/10 text-success" :
                          alert.status === "IGNORED" ? "bg-muted text-muted-foreground" :
                          "bg-warning/10 text-warning"
                        }
                      >
                        {alert.status === "DONE" ? "Completada" : alert.status === "IGNORED" ? "Ignorada" : "Pendiente"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <OperationServicesSection
            operationId={operation.id}
            operationStatus={operation.status}
            operators={operators}
            userRole={userRole}
            servicePayments={servicePayments}
            operationCurrency={operation.currency}
          />
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
        userRole={userRole}
      />
    </div>
  )
}

