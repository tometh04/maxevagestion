"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { ArrowLeft, Pencil } from "lucide-react"
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
import { useRouter } from "next/navigation"

const statusLabels: Record<string, string> = {
  PRE_RESERVATION: "Pre-reserva",
  RESERVED: "Reservado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  TRAVELLED: "Viajado",
  CLOSED: "Cerrado",
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
            <h1 className="text-3xl font-bold">
              {customer.first_name} {customer.last_name}
            </h1>
            <p className="text-muted-foreground">{customer.email}</p>
          </div>
        </div>
        <Button onClick={() => setEditDialogOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </Button>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="operations">Operaciones ({operations.length})</TabsTrigger>
          <TabsTrigger value="payments">Pagos ({payments.length})</TabsTrigger>
          <TabsTrigger value="documents">Documentos ({documents?.length || 0})</TabsTrigger>
          <TabsTrigger value="messages">Mensajes</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Información Personal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Nombre</p>
                    <p className="text-sm">
                      {customer.first_name} {customer.last_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Teléfono</p>
                    <p className="text-sm">{customer.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Email</p>
                    <p className="text-sm">{customer.email}</p>
                  </div>
                  {customer.instagram_handle && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Instagram</p>
                      <p className="text-sm">@{customer.instagram_handle}</p>
                    </div>
                  )}
                  {customer.document_type && customer.document_number && (
                    <>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Tipo Documento</p>
                        <p className="text-sm">{customer.document_type}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Número Documento</p>
                        <p className="text-sm">{customer.document_number}</p>
                      </div>
                    </>
                  )}
                  {customer.date_of_birth && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Fecha de Nacimiento</p>
                      <p className="text-sm">
                        {format(new Date(customer.date_of_birth), "dd/MM/yyyy", { locale: es })}
                      </p>
                    </div>
                  )}
                  {customer.nationality && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Nacionalidad</p>
                      <p className="text-sm">{customer.nationality}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Estadísticas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total de Viajes</p>
                  <p className="text-2xl font-bold">{operations.length}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Gastado</p>
                  <p className="text-2xl font-bold text-green-600">
                    {(() => {
                      // Sumar todos los pagos pagados del cliente (INCOME = pagos recibidos del cliente)
                      const totalPaid = payments
                        .filter((p: any) => p.status === "PAID" && p.direction === "INCOME")
                        .reduce((sum: number, p: any) => {
                          // Convertir a ARS si es necesario
                          const amount = parseFloat(p.amount || 0)
                          if (p.currency === "USD") {
                            // Buscar el exchange_rate en el payment o usar tasa aproximada
                            // Los pagos pueden tener exchange_rate si se guardó al crear el pago
                            const exchangeRate = p.exchange_rate || 1000 // Fallback si no hay tasa guardada
                            return sum + (amount * exchangeRate)
                          }
                          return sum + amount
                        }, 0)
                      
                      return `ARS ${totalPaid.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                    })()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Operaciones del Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              {operations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay operaciones</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Pagos</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay pagos registrados</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Monto</TableHead>
                      <TableHead>Fecha Vencimiento</TableHead>
                      <TableHead>Fecha Pago</TableHead>
                      <TableHead>Método</TableHead>
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <DocumentsSection documents={documents || []} customerId={customer.id} />
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

