import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"

export default async function OperatorDetailPage({ params }: { params: { id: string } }) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const operatorId = params.id

  // Get operator details
  const { data: operator, error: operatorError } = await supabase
    .from("operators")
    .select("*")
    .eq("id", operatorId)
    .single()

  if (operatorError || !operator) {
    notFound()
  }

  // Type assertion for operator
  const op = operator as any

  // Get all operations for this operator
  const { data: operations, error: operationsError } = await supabase
    .from("operations")
    .select(
      `
      *,
      sellers:seller_id(id, name),
      agencies:agency_id(id, name),
      payments:payments!operation_id(
        id,
        amount,
        currency,
        status,
        direction,
        date_due,
        date_paid
      )
    `,
    )
    .eq("operator_id", operatorId)
    .order("created_at", { ascending: false })

  if (operationsError) {
    console.error("Error fetching operations:", operationsError)
  }

  // Calculate metrics
  const operationsCount = (operations || []).length
  const totalCost = (operations || []).reduce((sum: number, o: any) => sum + (o.operator_cost || 0), 0)

  const paidAmount = (operations || []).reduce((sum: number, o: any) => {
    const payments = (o.payments || []) as any[]
    const paidPayments = payments.filter((p: any) => p.direction === "EXPENSE" && p.status === "PAID")
    return sum + paidPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
  }, 0)

  const balance = totalCost - paidAmount

  // Get pending payments
  const pendingPayments = (operations || [])
    .flatMap((o: any) => (o.payments || []) as any[])
    .filter((p: any) => p.direction === "EXPENSE" && p.status === "PENDING")
    .sort((a: any, b: any) => new Date(a.date_due).getTime() - new Date(b.date_due).getTime())

  const metrics = {
    operationsCount,
    totalCost,
    paidAmount,
    balance,
    pendingPaymentsCount: pendingPayments.length,
    nextPaymentDate: pendingPayments[0]?.date_due || null,
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
              <Link href="/operators">Operadores</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{op.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-3xl font-bold">{op.name}</h1>
        <p className="text-muted-foreground">Detalle del operador</p>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.operationsCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.totalCost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.paidAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={metrics.balance > 0 ? "destructive" : "default"}>
                ${metrics.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operator Info */}
      <Card>
        <CardHeader>
          <CardTitle>Información de Contacto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Contacto</p>
              <p className="font-medium">{op.contact_name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{op.contact_email || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Teléfono</p>
              <p className="font-medium">{op.contact_phone || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Límite de Crédito</p>
              <p className="font-medium">
                {op.credit_limit
                  ? `$${op.credit_limit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                  : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="operations" className="w-full">
        <TabsList>
          <TabsTrigger value="operations">Operaciones</TabsTrigger>
          <TabsTrigger value="payments">Pagos Pendientes</TabsTrigger>
        </TabsList>

        <TabsContent value="operations">
          <Card>
            <CardHeader>
              <CardTitle>Operaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Destino</TableHead>
                      <TableHead>Fecha Salida</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Costo</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!operations || operations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No hay operaciones
                        </TableCell>
                      </TableRow>
                    ) : (
                      operations.map((op: any) => (
                        <TableRow key={op.id}>
                          <TableCell className="font-medium">{op.destination}</TableCell>
                          <TableCell>
                            {op.departure_date
                              ? format(new Date(op.departure_date), "dd/MM/yyyy", { locale: es })
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                op.status === "CONFIRMED"
                                  ? "default"
                                  : op.status === "CANCELLED"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {op.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {op.currency} {op.operator_cost.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>{op.sellers?.name || "-"}</TableCell>
                          <TableCell>
                            <Link href={`/operations/${op.id}`}>
                              <Button variant="ghost" size="sm">
                                Ver
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Pagos Pendientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha Vencimiento</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Moneda</TableHead>
                      <TableHead>Operación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No hay pagos pendientes
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingPayments.map((payment: any) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {format(new Date(payment.date_due), "dd/MM/yyyy", { locale: es })}
                          </TableCell>
                          <TableCell>
                            {payment.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>{payment.currency}</TableCell>
                          <TableCell>
                            <Link href={`/operations/${payment.operation_id}`}>
                              <Button variant="link" size="sm">
                                Ver operación
                              </Button>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link href={`/cash/payments`}>
                              <Button variant="ghost" size="sm">
                                Gestionar
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

