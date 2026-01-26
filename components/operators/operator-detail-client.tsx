"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { ArrowLeft, Pencil } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { EditOperatorDialog } from "./edit-operator-dialog"
import { useRouter } from "next/navigation"

interface Operator {
  id: string
  name: string
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  credit_limit?: number | null
}

interface Metrics {
  operationsCount: number
  totalCost: number
  paidAmount: number
  balance: number
  pendingPaymentsCount: number
  nextPaymentDate: string | null
}

interface OperatorDetailClientProps {
  operator: Operator
  operations: any[]
  pendingPayments: any[]
  metrics: Metrics
}

export function OperatorDetailClient({
  operator,
  operations,
  pendingPayments,
  metrics,
}: OperatorDetailClientProps) {
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
              <Link href="/operators">Operadores</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{operator.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/operators">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{operator.name}</h1>
            <p className="text-muted-foreground">Detalle del operador</p>
          </div>
        </div>
        <Button onClick={() => setEditDialogOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </Button>
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
              <p className="font-medium">{operator.contact_name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{operator.contact_email || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Teléfono</p>
              <p className="font-medium">{operator.contact_phone || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Límite de Crédito</p>
              <p className="font-medium">
                {operator.credit_limit
                  ? `$${operator.credit_limit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                  : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="operations" className="w-full">
        <TabsList>
          <TabsTrigger value="operations">Operaciones ({operations.length})</TabsTrigger>
          <TabsTrigger value="payments">Pagos Pendientes ({pendingPayments.length})</TabsTrigger>
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
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
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
                          <TableCell className="text-right">
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
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Moneda</TableHead>
                      <TableHead>Operación</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
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
                          <TableCell className="text-right">
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

      <EditOperatorDialog
        operator={operator}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
      />
    </div>
  )
}

