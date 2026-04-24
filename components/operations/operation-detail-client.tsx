"use client"

import { useMemo, useState } from "react"
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
import { ArrowLeft, Pencil, AlertCircle, Trash2, Loader2, RefreshCw, HelpCircle, Receipt, Info, Users, FileText, CreditCard, Wrench, ShoppingBag, Calculator, BarChart3, Bell } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DocumentsSection } from "@/components/documents/documents-section"
import { OperationAccountingSection } from "@/components/operations/operation-accounting-section"
import { PurchaseInvoicesSection } from "@/components/operations/purchase-invoices-section"
import { OperationSaleInvoicesSection } from "@/components/operations/operation-invoices-section"
import { OperationFacturacionSection } from "@/components/operations/operation-facturacion-section"
import { OperationPaymentsSection } from "@/components/operations/operation-payments-section"
import { PassengerBalancesSection } from "@/components/operations/passenger-balances-section"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import dynamic from "next/dynamic"

// Lazy load: edit-operation-dialog pesa ~1200 líneas y sólo se abre al
// clickear "Editar" en la vista de detalle.
const EditOperationDialog = dynamic(
  () => import("./edit-operation-dialog").then((m) => ({ default: m.EditOperationDialog })),
  { ssr: false }
)
import { OperationRequirementsSection } from "./operation-requirements-section"
import { PassengersSection } from "./passengers-section"
import { OperationServicesSection } from "./operation-services-section"
import { ItinerarySection } from "./itinerary-section"
import { useRouter } from "next/navigation"
import {
  buildOpenOperationBasePayableOperators,
  type OperationOperatorPaymentLike,
  type OperationServicePaymentRelationLike,
} from "@/lib/operations/payment-operators"
import { buildOperationPurchaseSummary } from "@/lib/operations/purchase-summary"
import { toast } from "sonner"

type OperationAccessScope = "full" | "own" | "agency-support"

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
  MISSING_INVOICE: "Sin Factura",
  GENERIC: "Genérico",
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

interface OperationService {
  id: string
  service_type: string
  description?: string | null
  operator_id?: string | null
  operator_payment_id?: string | null
  operators?: { id?: string | null; name?: string | null } | null
  sale_amount: number
  cost_amount: number
  sale_currency: "ARS" | "USD"
  cost_currency: "ARS" | "USD"
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
  operationAccessScope: OperationAccessScope
  canAddServicesOnAgencyOperations?: boolean
  commissionRecords?: Array<{ percentage: number | null; seller_id: string; amount: number }>
  operationServices?: OperationService[]
  operatorPayments?: OperationOperatorPaymentLike[]
  /** Operadores asignados a la operación (operation_operators). Usado para
   * poblar el selector de "Pagar a operador" con TODOS los operadores,
   * incluyendo los que aún no tienen operator_payment generado. */
  operationOperators?: Array<{
    operator_id: string
    operators?: { id: string; name: string } | null
  }>
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
  operationAccessScope,
  canAddServicesOnAgencyOperations = false,
  commissionRecords = [],
  operationServices = [],
  operatorPayments = [],
  operationOperators = [],
}: OperationDetailClientProps) {
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isDeletingAlerts, setIsDeletingAlerts] = useState(false)
  const [isGeneratingAlerts, setIsGeneratingAlerts] = useState(false)
  const isSupportMode = operationAccessScope === "agency-support"
  const canEditOperation = !isSupportMode && !["VIEWER", "CONTABLE"].includes(userRole)
  const canManagePassengers = !isSupportMode && !["VIEWER", "CONTABLE"].includes(userRole)
  const canManageDocuments = !isSupportMode && !["VIEWER", "CONTABLE"].includes(userRole)
  const canAddServices = isSupportMode
    ? canAddServicesOnAgencyOperations
    : !["VIEWER", "CONTABLE"].includes(userRole)
  const canManageExistingServices = !isSupportMode && !["VIEWER", "CONTABLE"].includes(userRole)
  const canManageServicePayments = !isSupportMode && !["SELLER", "VIEWER"].includes(userRole)
  const canViewFinancialTabs = !isSupportMode && userRole !== "SELLER"
  const canManageAlerts = !isSupportMode && userRole !== "VIEWER"
  const operatorNameMap = useMemo(
    () => new Map(operators.map((operator) => [operator.id, operator.name])),
    [operators]
  )

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
      toast.error("Error al eliminar alertas")
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
      toast.error("Error al generar alertas")
    } finally {
      setIsGeneratingAlerts(false)
    }
  }

  // Separar pagos de la operación base de pagos de servicios adicionales
  const operationBasePayments = (payments || []).filter((p: any) => !p.operation_service_id)
  const servicePayments = (payments || []).filter((p: any) => p.operation_service_id)
  const payableOperators = useMemo(
    () =>
      buildOpenOperationBasePayableOperators({
        operatorPayments: operatorPayments || [],
        operationServices: operationServices as OperationServicePaymentRelationLike[],
        operationOperators: operationOperators || [],
        fallbackNamesById: operatorNameMap,
      }),
    [operationServices, operatorPayments, operationOperators, operatorNameMap]
  )
  const purchaseSummary = useMemo(
    () =>
      buildOperationPurchaseSummary({
        operation,
        operationServices,
      }),
    [operation, operationServices]
  )

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
            <h1 className="text-2xl font-semibold tracking-tight">Operación #{operation.id.slice(0, 8)}</h1>
            <p className="text-muted-foreground">{operation.destination}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSupportMode && (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              Postventa
            </Badge>
          )}
          <Badge variant="secondary" className="bg-secondary/60 text-secondary-foreground">{statusLabels[operation.status] || operation.status}</Badge>
          {canEditOperation && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/operations/billing/new?operationId=${operation.id}`}>
                <Receipt className="mr-2 h-4 w-4" />
                Facturar
              </Link>
            </Button>
          )}
          {canEditOperation && (
            <Button onClick={() => setEditDialogOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info" className="gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Información
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Clientes ({customers.length})
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Documentos ({documents?.length || 0})
          </TabsTrigger>
          {canViewFinancialTabs && (
            <TabsTrigger value="payments" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Pagos Operación ({operationBasePayments.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="services" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Servicios
          </TabsTrigger>
          {!isSupportMode && (
            <TabsTrigger value="itinerary" className="gap-1.5">
              <ShoppingBag className="h-3.5 w-3.5" />
              Detalle de Compra
            </TabsTrigger>
          )}
          {canViewFinancialTabs && (
            <TabsTrigger value="accounting" className="gap-1.5">
              <Calculator className="h-3.5 w-3.5" />
              Contabilidad
            </TabsTrigger>
          )}
          {canViewFinancialTabs && (
            <TabsTrigger value="metrics" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Métricas
            </TabsTrigger>
          )}
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Alertas ({alerts?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6">
          {/* ── Row 1: Info Básica + Asignaciones ── */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* 📋 Información Básica */}
            <Card className="rounded-xl border border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  📋 Información Básica
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</p>
                    <p className="text-sm font-medium mt-0.5">{typeLabels[operation.type] || operation.type}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</p>
                    <Badge variant="secondary" className="mt-0.5 bg-secondary/60 text-secondary-foreground">{statusLabels[operation.status] || operation.status}</Badge>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Origen</p>
                    <p className="text-sm font-medium mt-0.5">{operation.origin || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Destino</p>
                    <p className="text-sm font-medium mt-0.5">{operation.destination}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Legajo</p>
                    <p className="text-sm font-medium mt-0.5">{operation.file_code || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reserva Aérea</p>
                    <p className="text-sm font-medium mt-0.5">{operation.reservation_code_air || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reserva Hotel</p>
                    <p className="text-sm font-medium mt-0.5">{operation.reservation_code_hotel || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {operation.type === "ASSISTANCE" ? "Inicio Cobertura" : "📅 Salida"}
                    </p>
                    <p className="text-sm font-medium mt-0.5">
                      {(() => {
                        try {
                          if (!operation.departure_date) return "-"
                          return format(new Date(operation.departure_date + 'T12:00:00'), "dd/MM/yyyy", { locale: es })
                        } catch { return "-" }
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {operation.type === "ASSISTANCE" ? "Fin Cobertura" : "📅 Regreso"}
                    </p>
                    <p className="text-sm font-medium mt-0.5">
                      {(() => {
                        try {
                          if (!operation.return_date) return "-"
                          return format(new Date(operation.return_date + 'T12:00:00'), "dd/MM/yyyy", { locale: es })
                        } catch { return "-" }
                      })()}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">👥 Pasajeros</p>
                    <p className="text-sm font-medium mt-0.5">
                      {operation.adults} adultos{operation.children > 0 ? `, ${operation.children} niños` : ""}{operation.infants > 0 ? `, ${operation.infants} infantes` : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 👤 Asignaciones */}
            <Card className="rounded-xl border border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  👤 Asignaciones
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {(operation as any).sellers_secondary ? "Vendedor Principal" : "Vendedor"}
                    </span>
                    <span className="text-sm font-medium">
                      {operation.sellers?.name || "-"}
                      {(operation as any).sellers_secondary && (operation as any).commission_split != null && (
                        <span className="ml-1 text-xs text-muted-foreground">({(operation as any).commission_split}%)</span>
                      )}
                    </span>
                  </div>
                  {(operation as any).sellers_secondary && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendedor Secundario</span>
                      <span className="text-sm font-medium">
                        {(operation as any).sellers_secondary.name}
                        {(operation as any).commission_split != null && (
                          <span className="ml-1 text-xs text-muted-foreground">({100 - (operation as any).commission_split}%)</span>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Operador</span>
                    <span className="text-sm font-medium">{operation.operators?.name || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agencia</span>
                    <span className="text-sm font-medium">{operation.agencies?.name || "-"}</span>
                  </div>
                  {operation.leads && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lead Original</span>
                      <Link href={`/sales/leads?leadId=${operation.leads.id}`}>
                        <Button variant="link" className="p-0 h-auto text-sm">
                          {operation.leads.contact_name}
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {!isSupportMode && (
            <Card className="rounded-xl border border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  🛒 Resumen de Compra
                </CardTitle>
                <CardDescription>
                  Control rapido de compras a operadores y proveedores dentro de la operacion
                </CardDescription>
              </CardHeader>
              <CardContent>
                {purchaseSummary.lines.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
                    Sin compras registradas.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/40 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Concepto</TableHead>
                            <TableHead>Operador</TableHead>
                            <TableHead>Reserva</TableHead>
                            <TableHead className="text-right">Costo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchaseSummary.lines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{line.label}</span>
                                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                      {line.source === "base" ? "Base" : "Servicio"}
                                    </Badge>
                                  </div>
                                  {line.secondaryText && (
                                    <p className="text-xs text-muted-foreground">{line.secondaryText}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{line.operatorName}</TableCell>
                              <TableCell>
                                {line.reservationCode ? (
                                  <span className="font-mono text-xs uppercase tracking-wide">
                                    {line.reservationCode}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatMoney(line.amount, line.currency)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex flex-wrap justify-end gap-6 text-sm">
                      {purchaseSummary.totals.map((total) => (
                        <div key={total.currency} className="text-right">
                          <p className="text-xs text-muted-foreground">Subtotal {total.currency}</p>
                          <p className="font-semibold">{formatMoney(total.amount, total.currency)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Row 2: Financiero (full width) ── */}
          {canViewFinancialTabs && (() => {
            const serviceSaleTotal = operationServices
              .filter(s => s.sale_currency === operation.currency)
              .reduce((sum, s) => sum + (s.sale_amount || 0), 0)
            const serviceCostTotal = operationServices
              .filter(s => s.cost_currency === operation.currency)
              .reduce((sum, s) => sum + (s.cost_amount || 0), 0)
            const totalSale = operation.sale_amount_total + serviceSaleTotal
            const totalCost = operation.operator_cost + serviceCostTotal
            const totalMargin = totalSale - totalCost
            const totalMarginPct = totalSale > 0 ? (totalMargin / totalSale) * 100 : 0
            const hasServices = operationServices.length > 0

            const serviceTypeEmoji: Record<string, string> = {
              HOTEL: "🏨", FLIGHT: "✈️", TRANSFER: "🚐", EXCURSION: "🗺️",
              ASSISTANCE: "🛡️", SEAT: "💺", LUGGAGE: "🧳", VISA: "📄",
            }
            const serviceTypeLabel: Record<string, string> = {
              HOTEL: "Hotel", FLIGHT: "Vuelo", TRANSFER: "Transfer", EXCURSION: "Excursión",
              ASSISTANCE: "Asistencia", SEAT: "Asiento", LUGGAGE: "Equipaje", VISA: "Visa",
            }

            return (
            <Card className="rounded-xl border border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  💰 Financiero
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* KPIs principales */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/50 p-4">
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">💵 Venta Total</p>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                      {operation.currency} {totalSale.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200/50 dark:border-orange-800/50 p-4">
                    <p className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wide">📦 Costo Total</p>
                    <p className="text-xl font-bold text-orange-700 dark:text-orange-300 mt-1">
                      {operation.currency} {totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200/50 dark:border-green-800/50 p-4">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">📊 Margen</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-300 mt-1">
                      {operation.currency} {totalMargin.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/50 p-4">
                    <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">📈 Margen %</p>
                    <p className="text-xl font-bold text-purple-700 dark:text-purple-300 mt-1">
                      {totalMarginPct.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Desglose: Operación Base */}
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">🎯 Operación Base</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">Venta</span>
                        <p className="font-semibold">{operation.currency} {operation.sale_amount_total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">Costo</span>
                        <p className="font-semibold">{operation.currency} {operation.operator_cost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">Margen</span>
                        <p className="font-semibold text-green-600">{operation.currency} {operation.margin_amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desglose: Servicios */}
                {hasServices && (
                  <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
                    <span className="text-sm font-semibold">🔧 Servicios Adicionales</span>
                    <div className="space-y-2">
                      {operationServices.map((svc) => {
                        const margin = svc.sale_currency === svc.cost_currency ? svc.sale_amount - svc.cost_amount : null
                        return (
                          <div key={svc.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{serviceTypeEmoji[svc.service_type] || "📦"}</span>
                              <span className="text-sm font-medium">{serviceTypeLabel[svc.service_type] || svc.service_type}</span>
                              {svc.description && <span className="text-xs text-muted-foreground">— {svc.description}</span>}
                            </div>
                            <div className="flex items-center gap-6 text-sm">
                              <div className="text-right">
                                <span className="text-xs text-muted-foreground">Venta</span>
                                <p className="font-medium">{svc.sale_currency} {svc.sale_amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-xs text-muted-foreground">Costo</span>
                                <p className="font-medium">{svc.cost_currency} {svc.cost_amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                              </div>
                              {margin !== null && (
                                <div className="text-right">
                                  <span className="text-xs text-muted-foreground">Margen</span>
                                  <p className={`font-medium ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {svc.sale_currency} {margin.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            )
          })()}

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
            readOnly={!canManagePassengers}
            onUpdate={() => router.refresh()}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentsSection 
            documents={documents || []} 
            operationId={operation.id} 
            departureDate={operation.departure_date || undefined}
            allowUpload={canManageDocuments}
            allowDelete={canManageDocuments}
          />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <OperationPaymentsSection
            operationId={operation.id}
            payments={operationBasePayments}
            currency={operation.currency}
            saleCurrency={operation.sale_currency || operation.currency}
            saleAmount={operation.sale_amount_total}
            operatorCost={operation.operator_cost}
            userRole={userRole}
            operators={payableOperators}
            operatorPayments={operatorPayments}
            operationServices={operationServices}
            destination={operation.destination || ""}
          />
          <PassengerBalancesSection
            operationId={operation.id}
            customers={customers}
            payments={operationBasePayments}
            currency={operation.currency}
            saleAmount={operation.sale_amount_total}
          />
        </TabsContent>

          {canViewFinancialTabs && (
            <TabsContent value="accounting" className="space-y-4">
            <PurchaseInvoicesSection
              operationId={operation.id}
              operators={operators}
              currency={operation.currency || "USD"}
            />
            <OperationSaleInvoicesSection operationId={operation.id} />
            <OperationFacturacionSection operationId={operation.id} />
          </TabsContent>
        )}

        {canViewFinancialTabs && (
          <TabsContent value="metrics" className="space-y-4">
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
          <Card className="rounded-xl border border-border/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Alertas de la Operación</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Check-in, vencimientos de documentos, pagos pendientes
                </p>
              </div>
              {canManageAlerts && (
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
              )}
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
                    <div key={alert.id} className="flex items-start justify-between p-3 border border-border/40 rounded-xl">
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

        <TabsContent value="services" className="space-y-4">
          <OperationServicesSection
            operationId={operation.id}
            operationStatus={operation.status}
            operators={operators}
            userRole={userRole}
            canAddServices={canAddServices}
            canEditServices={canManageExistingServices}
            canDeleteServices={canManageExistingServices}
            canManagePayments={canManageServicePayments}
            showFinancialColumns={!isSupportMode && userRole !== "SELLER"}
            servicePayments={servicePayments}
            operationCurrency={operation.currency}
            operationData={{
              destination: operation.destination || "",
              departure_date: operation.departure_date || "",
              return_date: operation.return_date || "",
              adults: operation.adults || 0,
              children: operation.children || 0,
              infants: operation.infants || 0,
              origin: operation.origin || "Buenos Aires",
            }}
          />
        </TabsContent>

        {!isSupportMode && (
          <TabsContent value="itinerary" className="space-y-4">
            <ItinerarySection operationId={operation.id} operation={{ ...operation, operation_customers: customers }} />
          </TabsContent>
        )}
      </Tabs>

      {canEditOperation && (
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
      )}
    </div>
  )
}

