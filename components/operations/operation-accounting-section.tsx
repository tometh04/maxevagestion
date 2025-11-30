"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { format } from "date-fns"
import { es } from "date-fns/locale"

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

interface OperationAccountingSectionProps {
  operationId: string
}

export function OperationAccountingSection({ operationId }: OperationAccountingSectionProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    movements: any[]
    ivaSales: any[]
    ivaPurchases: any[]
    operatorPayments: any[]
    clientPayments: any[]
    commissions: any[]
  } | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // Fetch all accounting data for this operation
        const [movementsRes, ivaSalesRes, ivaPurchasesRes, operatorPaymentsRes, clientPaymentsRes, commissionsRes] =
          await Promise.all([
            fetch(`/api/accounting/ledger?operationId=${operationId}`),
            fetch(`/api/accounting/iva?operationId=${operationId}`).catch(() => null),
            fetch(`/api/accounting/iva?operationId=${operationId}&type=purchases`).catch(() => null),
            fetch(`/api/accounting/operator-payments?operationId=${operationId}`).catch(() => null),
            fetch(`/api/payments?operationId=${operationId}&direction=INCOME`).catch(() => null),
            fetch(`/api/commissions?operationId=${operationId}`).catch(() => null),
          ])

        const movements = movementsRes.ok ? (await movementsRes.json()).movements || [] : []
        const ivaSales = ivaSalesRes?.ok ? (await ivaSalesRes.json()).sales || [] : []
        const ivaPurchases = ivaPurchasesRes?.ok
          ? (await ivaPurchasesRes.json()).purchases || []
          : []
        const operatorPayments = operatorPaymentsRes?.ok
          ? (await operatorPaymentsRes.json()).payments || []
          : []
        const clientPayments = clientPaymentsRes?.ok
          ? (await clientPaymentsRes.json()).payments || []
          : []
        const commissions = commissionsRes?.ok
          ? (await commissionsRes.json()).commissions || []
          : []

        setData({
          movements,
          ivaSales,
          ivaPurchases,
          operatorPayments,
          clientPayments,
          commissions,
        })
      } catch (error) {
        console.error("Error fetching accounting data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [operationId])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!data) {
    return <div className="text-center py-8 text-muted-foreground">No se encontraron datos</div>
  }

  const totalIncome = data.movements
    .filter((m) => m.type === "INCOME")
    .reduce((sum, m) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

  const totalExpenses = data.movements
    .filter((m) => m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT")
    .reduce((sum, m) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

  const fxGains = data.movements
    .filter((m) => m.type === "FX_GAIN")
    .reduce((sum, m) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

  const fxLosses = data.movements
    .filter((m) => m.type === "FX_LOSS")
    .reduce((sum, m) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

  const netMargin = totalIncome - totalExpenses + fxGains - fxLosses

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Ingresos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(totalIncome)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Gastos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalExpenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">FX</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              <div className="text-amber-600">+{formatCurrency(fxGains)}</div>
              <div className="text-red-600">-{formatCurrency(fxLosses)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Margen Neto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netMargin >= 0 ? "text-amber-600" : "text-red-600"}`}>
              {formatCurrency(netMargin)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Movements */}
      <Card>
        <CardHeader>
          <CardTitle>Movimientos del Ledger</CardTitle>
          <CardDescription>Historial completo de movimientos contables</CardDescription>
        </CardHeader>
        <CardContent>
          {data.movements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay movimientos registrados
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>ARS Equivalente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>
                      {format(new Date(movement.created_at), "dd/MM/yyyy", { locale: es })}
                    </TableCell>
                    <TableCell>
                      <Badge>{movement.type}</Badge>
                    </TableCell>
                    <TableCell>{movement.concept}</TableCell>
                    <TableCell>
                      {formatCurrency(movement.amount_original, movement.currency)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(movement.amount_ars_equivalent)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* IVA */}
      {(data.ivaSales.length > 0 || data.ivaPurchases.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>IVA</CardTitle>
            <CardDescription>Desglose de IVA en ventas y compras</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {data.ivaSales.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">IVA Ventas</h4>
                  {data.ivaSales.map((sale) => (
                    <div key={sale.id} className="text-sm space-y-1">
                      <div>Total: {formatCurrency(sale.sale_amount_total, sale.currency)}</div>
                      <div>Neto: {formatCurrency(sale.net_amount, sale.currency)}</div>
                      <div className="text-amber-600">
                        IVA: {formatCurrency(sale.iva_amount, sale.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {data.ivaPurchases.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">IVA Compras</h4>
                  {data.ivaPurchases.map((purchase) => (
                    <div key={purchase.id} className="text-sm space-y-1">
                      <div>
                        Total: {formatCurrency(purchase.operator_cost_total, purchase.currency)}
                      </div>
                      <div>Neto: {formatCurrency(purchase.net_amount, purchase.currency)}</div>
                      <div className="text-blue-600">
                        IVA: {formatCurrency(purchase.iva_amount, purchase.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operator Payments */}
      {data.operatorPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pagos a Operadores</CardTitle>
            <CardDescription>Cuentas a pagar</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Fecha Vencimiento</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.operatorPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.operators?.name || "-"}</TableCell>
                    <TableCell>
                      {formatCurrency(payment.amount, payment.currency)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(payment.due_date), "dd/MM/yyyy", { locale: es })}
                    </TableCell>
                    <TableCell>
                      <Badge>{payment.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Commissions */}
      {data.commissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comisiones</CardTitle>
            <CardDescription>Comisiones calculadas para esta operación</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Fecha Cálculo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.commissions.map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell>{commission.sellers?.name || "-"}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(commission.amount || 0, commission.operations?.currency || "ARS")}
                    </TableCell>
                    <TableCell>
                      {commission.percentage ? `${commission.percentage.toFixed(2)}%` : "-"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(commission.date_calculated || commission.created_at), "dd/MM/yyyy", { locale: es })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={commission.status === "PAID" ? "default" : "secondary"}>
                        {commission.status === "PAID" ? "Pagada" : commission.status === "PENDING" ? "Pendiente" : commission.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Client Payments Summary */}
      {data.clientPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pagos de Clientes</CardTitle>
            <CardDescription>Resumen de pagos recibidos</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Monto</TableHead>
                  <TableHead>Fecha Vencimiento</TableHead>
                  <TableHead>Fecha Pago</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.clientPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {formatCurrency(payment.amount, payment.currency)}
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
                        {payment.status === "PAID" ? "Pagado" : payment.status === "OVERDUE" ? "Vencido" : "Pendiente"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

