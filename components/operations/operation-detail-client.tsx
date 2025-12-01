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
import { ArrowLeft, Pencil, AlertCircle } from "lucide-react"
import { DocumentsSection } from "@/components/documents/documents-section"
import { OperationAccountingSection } from "@/components/operations/operation-accounting-section"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { EditOperationDialog } from "./edit-operation-dialog"
import { useRouter } from "next/navigation"

const statusLabels: Record<string, string> = {
  PRE_RESERVATION: "Pre-reserva",
  RESERVED: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  TRAVELLED: "Viajado",
  CLOSED: "Cerrado",
}

const typeLabels: Record<string, string> = {
  FLIGHT: "Vuelo",
  HOTEL: "Hotel",
  PACKAGE: "Paquete",
  CRUISE: "Crucero",
  TRANSFER: "Transfer",
  MIXED: "Mixto",
}

const paymentStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  OVERDUE: "Vencido",
}

const alertTypeLabels: Record<string, string> = {
  PAYMENT_DUE: "Pago Pendiente",
  OPERATOR_DUE: "Pago Operador",
  UPCOMING_TRIP: "Viaje Próximo",
  MISSING_DOC: "Documento Faltante",
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
}: OperationDetailClientProps) {
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const handleEditSuccess = () => {
    router.refresh()
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
                <CardTitle>Información Básica</CardTitle>
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
                    <p className="text-sm font-medium text-muted-foreground">Fecha Salida</p>
                    <p className="text-sm">
                      {format(new Date(operation.departure_date), "dd/MM/yyyy", { locale: es })}
                    </p>
                  </div>
                  {operation.return_date && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Fecha Regreso</p>
                      <p className="text-sm">
                        {format(new Date(operation.return_date), "dd/MM/yyyy", { locale: es })}
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
                <CardTitle>Financiero</CardTitle>
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
                <CardTitle>Asignaciones</CardTitle>
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
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clientes de la Operación</CardTitle>
            </CardHeader>
            <CardContent>
              {customers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay clientes asociados</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Rol</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((oc: any) => (
                      <TableRow key={oc.id}>
                        <TableCell>
                          <Link href={`/customers/${oc.customer_id}`} className="hover:underline">
                            {oc.customers?.first_name} {oc.customers?.last_name}
                          </Link>
                        </TableCell>
                        <TableCell>{oc.customers?.email || "-"}</TableCell>
                        <TableCell>{oc.customers?.phone || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{oc.role === "MAIN" ? "Principal" : "Acompañante"}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentsSection documents={documents || []} operationId={operation.id} />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pagos</CardTitle>
            </CardHeader>
            <CardContent>
              {!payments || payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay pagos registrados</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Fecha Vencimiento</TableHead>
                      <TableHead>Fecha Pago</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment: any) => (
                      <TableRow key={payment.id}>
                        <TableCell>{payment.payer_type === "CUSTOMER" ? "Cliente" : "Operador"}</TableCell>
                        <TableCell>
                          <Badge variant={payment.direction === "INCOME" ? "default" : "destructive"}>
                            {payment.direction === "INCOME" ? "Ingreso" : "Egreso"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {payment.currency} {payment.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          {format(new Date(payment.date_due), "dd/MM/yyyy", { locale: es })}
                        </TableCell>
                        <TableCell>
                          {payment.date_paid
                            ? format(new Date(payment.date_paid), "dd/MM/yyyy", { locale: es })
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              payment.status === "PAID"
                                ? "default"
                                : payment.status === "OVERDUE"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {paymentStatusLabels[payment.status] || payment.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounting" className="space-y-4">
          <OperationAccountingSection operationId={operation.id} />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alertas</CardTitle>
            </CardHeader>
            <CardContent>
              {!alerts || alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay alertas</p>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert: any) => (
                    <div key={alert.id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">{alertTypeLabels[alert.type] || alert.type}</p>
                          <p className="text-xs text-muted-foreground">{alert.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Vence: {format(new Date(alert.date_due), "dd/MM/yyyy HH:mm", { locale: es })}
                          </p>
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

