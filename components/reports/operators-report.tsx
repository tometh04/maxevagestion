"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ReportsFiltersState } from "./reports-filters"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface OperatorsReportProps {
  filters: ReportsFiltersState
}

interface OperatorData {
  id: string
  name: string
  operationsCount: number
  totalCost: number
  totalPaid: number
  balance: number
  nextDueDate: string | null
  overduePayments: number
}

export function OperatorsReport({ filters }: OperatorsReportProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<OperatorData[]>([])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (filters.agencyId !== "ALL") {
          params.set("agencyId", filters.agencyId)
        }

        const response = await fetch(`/api/operators?${params.toString()}`)
        const operatorsData = await response.json()

        // Get overdue payments
        const overdueRes = await fetch("/api/accounting/operator-payments?status=OVERDUE")
        const overdueData = await overdueRes.json()

        const overdueByOperator = (overdueData.payments || []).reduce((acc: any, payment: any) => {
          const opId = payment.operator_id
          if (!acc[opId]) {
            acc[opId] = 0
          }
          acc[opId] += payment.amount || 0
          return acc
        }, {})

        const operators = (operatorsData.operators || []).map((op: any) => ({
          ...op,
          overduePayments: overdueByOperator[op.id] || 0,
        }))

        setData(operators)
      } catch (error) {
        console.error("Error fetching operators report:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [filters])

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No hay datos disponibles</p>
        </CardContent>
      </Card>
    )
  }

  const totalCost = data.reduce((sum, op) => sum + op.totalCost, 0)
  const totalPaid = data.reduce((sum, op) => sum + op.totalPaid, 0)
  const totalBalance = data.reduce((sum, op) => sum + op.balance, 0)
  const totalOverdue = data.reduce((sum, op) => sum + op.overduePayments, 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCost)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pagado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(totalPaid)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalOverdue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Operators Table */}
      <Card>
        <CardHeader>
          <CardTitle>Operadores</CardTitle>
          <CardDescription>Resumen de operadores y pagos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Operador</TableHead>
                  <TableHead className="text-right min-w-[100px]">Operaciones</TableHead>
                  <TableHead className="text-right min-w-[120px]">Costo Total</TableHead>
                  <TableHead className="text-right min-w-[120px]">Pagado</TableHead>
                  <TableHead className="text-right min-w-[120px]">Saldo</TableHead>
                  <TableHead className="text-right min-w-[120px]">Vencidos</TableHead>
                  <TableHead className="min-w-[120px]">Próximo Vencimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((operator) => (
                  <TableRow key={operator.id}>
                    <TableCell className="font-medium">{operator.name}</TableCell>
                    <TableCell className="text-right">{operator.operationsCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(operator.totalCost)}</TableCell>
                    <TableCell className="text-right text-amber-600">
                      {formatCurrency(operator.totalPaid)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={operator.balance > 0 ? "destructive" : "default"}>
                        {formatCurrency(operator.balance)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {operator.overduePayments > 0 ? (
                        <Badge className="text-red-600">{formatCurrency(operator.overduePayments)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {operator.nextDueDate ? (
                        format(new Date(operator.nextDueDate), "dd/MM/yyyy", { locale: es })
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

