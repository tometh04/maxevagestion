import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
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
import { ArrowLeft, FileText, DollarSign, Calendar } from "lucide-react"
import { DocumentsSection } from "@/components/documents/documents-section"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"

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

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Get customer
  const { data: customer, error: customerError } = await (supabase.from("customers") as any)
    .select("*")
    .eq("id", params.id)
    .single()

  if (customerError || !customer) {
    notFound()
  }

  // Get operations for this customer
  const { data: operationCustomers } = await supabase
    .from("operation_customers")
    .select(`
      *,
      operations:operation_id(
        *,
        sellers:seller_id(id, name),
        operators:operator_id(id, name),
        agencies:agency_id(id, name)
      )
    `)
    .eq("customer_id", params.id)
    .order("created_at", { ascending: false })

  // Get payments related to customer's operations
  const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id)
  let payments: any[] = []
  if (operationIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from("payments")
      .select("*")
      .in("operation_id", operationIds)
      .eq("payer_type", "CUSTOMER")
      .order("date_due", { ascending: true })
    payments = paymentsData || []
  }

  // Get documents
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("customer_id", params.id)
    .order("uploaded_at", { ascending: false })

  const operations = (operationCustomers || []).map((oc: any) => oc.operations).filter(Boolean)

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
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="operations">Operaciones ({operations.length})</TabsTrigger>
          <TabsTrigger value="payments">Pagos ({payments.length})</TabsTrigger>
          <TabsTrigger value="documents">Documentos ({documents?.length || 0})</TabsTrigger>
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
                    ARS{" "}
                    {operations
                      .filter((op: any) =>
                        ["CONFIRMED", "TRAVELLED", "CLOSED"].includes(op?.status)
                      )
                      .reduce((sum: number, op: any) => sum + parseFloat(op?.sale_amount_total || 0), 0)
                      .toLocaleString("es-AR", { minimumFractionDigits: 2 })}
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
                        <TableCell>{op.destination}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{format(new Date(op.departure_date), "dd/MM/yyyy", { locale: es })}</div>
                            {op.return_date && (
                              <div className="text-muted-foreground">
                                {format(new Date(op.return_date), "dd/MM/yyyy", { locale: es })}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{op.sellers?.name || "-"}</TableCell>
                        <TableCell>
                          {op.currency} {op.sale_amount_total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
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
          <DocumentsSection documents={documents || []} customerId={params.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

