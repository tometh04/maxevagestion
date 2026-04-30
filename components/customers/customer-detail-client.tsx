"use client"

import { useState } from "react"
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
import { ArrowLeft, Pencil, User, Phone, Mail, AtSign, Calendar, Globe, FileText, CreditCard, Plane, TrendingUp } from "lucide-react"
import { DocumentsSection } from "@/components/documents/documents-section"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { EditCustomerDialog } from "./edit-customer-dialog"
import { CustomerMessagesSection } from "@/components/whatsapp/customer-messages-section"
import { CustomerInteractions } from "./customer-interactions"
import { useRouter } from "next/navigation"

const statusLabels: Record<string, string> = {
  RESERVED: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  TRAVELLING: "En viaje",
  TRAVELLED: "Viajado",
}

const paymentStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  OVERDUE: "Vencido",
}

interface Customer {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string
  instagram_handle?: string | null
  document_type?: string | null
  document_number?: string | null
  date_of_birth?: string | null
  nationality?: string | null
  agency_id?: string
}

interface CustomerDetailClientProps {
  customer: Customer
  operations: any[]
  payments: any[]
  documents: any[]
}

export function CustomerDetailClient({
  customer,
  operations,
  payments,
  documents,
}: CustomerDetailClientProps) {
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
              <Link href="/customers">Clientes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{customer.first_name} {customer.last_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/customers">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {customer.first_name} {customer.last_name}
            </h1>
            <p className="text-xs font-medium text-muted-foreground">{customer.email}</p>
          </div>
        </div>
        <Button onClick={() => setEditDialogOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </Button>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Informacion</TabsTrigger>
          <TabsTrigger value="operations">Operaciones ({operations.length})</TabsTrigger>
          <TabsTrigger value="payments">Pagos ({payments.length})</TabsTrigger>
          <TabsTrigger value="documents">Documentos ({documents?.length || 0})</TabsTrigger>
          <TabsTrigger value="interactions">Interacciones</TabsTrigger>
          <TabsTrigger value="messages">Mensajes</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Datos Personales */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Datos Personales</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">Nombre</p>
                  </div>
                  <p className="text-sm font-medium">
                    {customer.first_name} {customer.last_name}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">Telefono</p>
                  </div>
                  <p className="text-sm font-medium">{customer.phone}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">Email</p>
                  </div>
                  <p className="text-sm font-medium">{customer.email}</p>
                </div>
                {customer.instagram_handle && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <AtSign className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">Instagram</p>
                    </div>
                    <p className="text-sm font-medium">@{customer.instagram_handle}</p>
                  </div>
                )}
                {customer.date_of_birth && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">Fecha de Nacimiento</p>
                    </div>
                    <p className="text-sm font-medium">
                      {format(new Date(customer.date_of_birth), "dd/MM/yyyy", { locale: es })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Documento */}
            <div className="space-y-4">
              {(customer.document_type || customer.document_number || customer.nationality) && (
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                      <FileText className="h-3.5 w-3.5 text-success" />
                    </div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Documento</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {customer.document_type && customer.document_number && (
                      <>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Tipo Documento</p>
                          <p className="text-sm font-medium">{customer.document_type}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Numero Documento</p>
                          <p className="text-sm font-medium">{customer.document_number}</p>
                        </div>
                      </>
                    )}
                    {customer.nationality && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3 w-3 text-muted-foreground" />
                          <p className="text-xs font-medium text-muted-foreground">Nacionalidad</p>
                        </div>
                        <p className="text-sm font-medium">{customer.nationality}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Estadisticas */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Estadisticas</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Total de Viajes</p>
                    <p className="text-2xl font-semibold tabular-nums tracking-tight">{operations.length}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Total Gastado</p>
                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-success">
                      {(() => {
                        // Sumar todos los pagos pagados del cliente (INCOME = pagos recibidos del cliente)
                        const totalPaid = payments
                          .filter((p: any) => p.status === "PAID" && p.direction === "INCOME")
                          .reduce((sum: number, p: any) => {
                            // Convertir a ARS si es necesario
                            const amount = parseFloat(p.amount || 0)
                            if (p.currency === "USD") {
                              // Buscar el exchange_rate en el payment o usar tasa aproximada
                              // Los pagos pueden tener exchange_rate si se guardo al crear el pago
                              const exchangeRate = p.exchange_rate || 1450 // Fallback si no hay tasa guardada
                              return sum + (amount * exchangeRate)
                            }
                            return sum + amount
                          }, 0)

                        return `ARS ${totalPaid.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                <Plane className="h-3.5 w-3.5 text-primary" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Operaciones del Cliente</h4>
            </div>
            {operations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay operaciones</p>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border/40">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 bg-background z-10">
                      <TableHead>Codigo</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Fechas</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operations.map((op: any) => (
                      <TableRow key={op.id}>
                        <TableCell className="font-mono text-xs">
                          {op.file_code || op.id.slice(0, 8)}
                        </TableCell>
                        <TableCell>{op.destination || "-"}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {op.departure_date ? (
                            <div>{format(new Date(op.departure_date), "dd/MM/yyyy", { locale: es })}</div>
                            ) : (
                              <div className="text-muted-foreground">-</div>
                            )}
                            {op.return_date && (
                              <div className="text-muted-foreground">
                                {format(new Date(op.return_date), "dd/MM/yyyy", { locale: es })}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{op.sellers?.name || "-"}</TableCell>
                        <TableCell>
                          {op.currency || "USD"} {op.sale_amount_total ? op.sale_amount_total.toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "0,00"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{statusLabels[op.status] || op.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/operations/${op.id}`}>
                            <Button variant="ghost" size="sm">
                              Ver
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                <CreditCard className="h-3.5 w-3.5 text-success" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Historial de Pagos</h4>
            </div>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay pagos registrados</p>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border/40">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 bg-background z-10">
                      <TableHead>Monto</TableHead>
                      <TableHead>Fecha Vencimiento</TableHead>
                      <TableHead>Fecha Pago</TableHead>
                      <TableHead>Metodo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment: any) => (
                      <TableRow key={payment.id}>
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
                        <TableCell>{payment.method}</TableCell>
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
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentsSection documents={documents || []} customerId={customer.id} />
        </TabsContent>

        <TabsContent value="interactions" className="space-y-4">
          <CustomerInteractions
            customerId={customer.id}
            customerName={`${customer.first_name} ${customer.last_name}`}
          />
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <CustomerMessagesSection
            customerId={customer.id}
            customerName={`${customer.first_name} ${customer.last_name}`}
            customerPhone={customer.phone}
            agencyId={customer.agency_id || ""}
          />
        </TabsContent>
      </Tabs>

      <EditCustomerDialog
        customer={customer}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
      />
    </div>
  )
}
