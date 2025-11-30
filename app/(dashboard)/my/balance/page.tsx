import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DollarSign, TrendingUp, Calendar } from "lucide-react"

export default async function MyBalancePage() {
  const { user } = await getCurrentUser()

  // Solo vendedores pueden acceder
  if (user.role !== "SELLER") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Balance</h1>
          <p className="text-muted-foreground">Solo disponible para vendedores</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  // Obtener comisiones del vendedor
  const { data: commissions } = await supabase
    .from("commission_records")
    .select(
      `
      *,
      operations:operation_id(
        id,
        file_code,
        destination,
        departure_date,
        sale_amount_total,
        margin_amount
      )
    `
    )
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })

  // Calcular totales
  const totalCommissions = (commissions || []).reduce(
    (sum, c: any) => sum + (c.amount || 0),
    0
  )
  const paidCommissions = (commissions || [])
    .filter((c: any) => c.status === "PAID")
    .reduce((sum, c: any) => sum + (c.amount || 0), 0)
  const pendingCommissions = totalCommissions - paidCommissions

  // Obtener leads asignados
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("assigned_seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10)

  // Obtener operaciones del vendedor
  const { data: operations } = await supabase
    .from("operations")
    .select("id, file_code, destination, departure_date, sale_amount_total, status")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10)

  // Obtener pagos vencidos relacionados con sus operaciones
  const operationIds = (operations || []).map((op: any) => op.id)
  let overduePayments: any[] = []
  if (operationIds.length > 0) {
    const today = new Date().toISOString().split("T")[0]
    const { data: payments } = await supabase
      .from("payments")
      .select(
        `
        *,
        operations:operation_id(
          file_code,
          destination
        )
      `
      )
      .in("operation_id", operationIds)
      .eq("direction", "INCOME")
      .eq("payer_type", "CUSTOMER")
      .eq("status", "PENDING")
      .lt("date_due", today)

    overduePayments = payments || []
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mi Balance</h1>
        <p className="text-muted-foreground">Resumen de comisiones y operaciones</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Comisiones</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCommissions)}</div>
            <p className="text-xs text-muted-foreground">
              {commissions?.length || 0} registros
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagadas</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(paidCommissions)}
            </div>
            <p className="text-xs text-muted-foreground">
              {commissions?.filter((c: any) => c.status === "PAID").length || 0} pagadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Calendar className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(pendingCommissions)}
            </div>
            <p className="text-xs text-muted-foreground">
              {commissions?.filter((c: any) => c.status === "PENDING").length || 0} pendientes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="commissions" className="w-full">
        <TabsList>
          <TabsTrigger value="commissions">Comisiones</TabsTrigger>
          <TabsTrigger value="operations">Operaciones</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="overdue">Vencimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="commissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mis Comisiones</CardTitle>
              <CardDescription>Historial de comisiones</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operación</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha Calculada</TableHead>
                      <TableHead>Fecha Pagada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions && commissions.length > 0 ? (
                      commissions.map((commission: any) => (
                        <TableRow key={commission.id}>
                          <TableCell className="font-medium">
                            {commission.operations?.file_code || "-"}
                          </TableCell>
                          <TableCell>{commission.operations?.destination || "-"}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(commission.amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {commission.percentage ? `${commission.percentage}%` : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={commission.status === "PAID" ? "default" : "secondary"}
                            >
                              {commission.status === "PAID" ? "Pagada" : "Pendiente"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(commission.date_calculated), "dd/MM/yyyy", {
                              locale: es,
                            })}
                          </TableCell>
                          <TableCell>
                            {commission.date_paid
                              ? format(new Date(commission.date_paid), "dd/MM/yyyy", {
                                  locale: es,
                                })
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No hay comisiones registradas
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mis Operaciones</CardTitle>
              <CardDescription>Últimas operaciones</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Fecha Salida</TableHead>
                      <TableHead className="text-right">Venta</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operations && operations.length > 0 ? (
                      operations.map((op: any) => (
                        <TableRow key={op.id}>
                          <TableCell className="font-medium">{op.file_code || "-"}</TableCell>
                          <TableCell>{op.destination}</TableCell>
                          <TableCell>
                            {op.departure_date
                              ? format(new Date(op.departure_date), "dd/MM/yyyy", { locale: es })
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(op.sale_amount_total)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{op.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No hay operaciones
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mis Leads</CardTitle>
              <CardDescription>Leads asignados</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads && leads.length > 0 ? (
                      leads.map((lead: any) => (
                        <TableRow key={lead.id}>
                          <TableCell className="font-medium">{lead.contact_name}</TableCell>
                          <TableCell>{lead.destination}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{lead.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: es })}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No hay leads asignados
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overdue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pagos Vencidos</CardTitle>
              <CardDescription>Pagos de clientes vencidos en mis operaciones</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operación</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Fecha Vencimiento</TableHead>
                      <TableHead>Días Vencidos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overduePayments.length > 0 ? (
                      overduePayments.map((payment: any) => {
                        const daysOverdue = Math.floor(
                          (new Date().getTime() - new Date(payment.date_due).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                        return (
                          <TableRow key={payment.id}>
                            <TableCell className="font-medium">
                              {payment.operations?.file_code || "-"}
                            </TableCell>
                            <TableCell>{payment.operations?.destination || "-"}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(payment.amount, payment.currency)}
                            </TableCell>
                            <TableCell>
                              {format(new Date(payment.date_due), "dd/MM/yyyy", { locale: es })}
                            </TableCell>
                            <TableCell>
                              <Badge variant="destructive">{daysOverdue} días</Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No hay pagos vencidos
                        </TableCell>
                      </TableRow>
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

