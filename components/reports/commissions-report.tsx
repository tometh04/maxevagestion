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

interface CommissionsReportProps {
  filters: ReportsFiltersState
}

interface CommissionData {
  sellerId: string
  sellerName: string
  totalCommissions: number
  paidCommissions: number
  pendingCommissions: number
  operationsCount: number
  records: Array<{
    id: string
    operationId: string
    operationCode: string
    commissionAmount: number
    percentage: number
    status: string
    createdAt: string
  }>
}

export function CommissionsReport({ filters }: CommissionsReportProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<CommissionData[]>([])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("dateFrom", filters.dateFrom)
        params.set("dateTo", filters.dateTo)
        if (filters.agencyId !== "ALL") {
          params.set("agencyId", filters.agencyId)
        }
        if (filters.sellerId !== "ALL") {
          params.set("sellerId", filters.sellerId)
        }

        const response = await fetch(`/api/commissions?${params.toString()}`)
        const commissionsData = await response.json()

        // Group by seller
        const sellerMap = new Map<string, CommissionData>()

        ;(commissionsData.commissions || []).forEach((record: any) => {
          const sellerId = record.seller_id
          const sellerName = record.sellers?.name || "Sin nombre"

          if (!sellerMap.has(sellerId)) {
            sellerMap.set(sellerId, {
              sellerId,
              sellerName,
              totalCommissions: 0,
              paidCommissions: 0,
              pendingCommissions: 0,
              operationsCount: 0,
              records: [],
            })
          }

          const seller = sellerMap.get(sellerId)!
          seller.totalCommissions += record.amount || 0
          seller.operationsCount += 1

          if (record.status === "PAID") {
            seller.paidCommissions += record.amount || 0
          } else {
            seller.pendingCommissions += record.amount || 0
          }

          seller.records.push({
            id: record.id,
            operationId: record.operation_id,
            operationCode: record.operations?.file_code || "-",
            commissionAmount: record.amount || 0,
            percentage: record.percentage || 0,
            status: record.status,
            createdAt: record.date_calculated || record.created_at,
          })
        })

        setData(Array.from(sellerMap.values()).sort((a, b) => b.totalCommissions - a.totalCommissions))
      } catch (error) {
        console.error("Error fetching commissions report:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [filters])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
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

  const totalCommissions = data.reduce((sum, seller) => sum + seller.totalCommissions, 0)
  const totalPaid = data.reduce((sum, seller) => sum + seller.paidCommissions, 0)
  const totalPending = data.reduce((sum, seller) => sum + seller.pendingCommissions, 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Comisiones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCommissions)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(totalPaid)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{formatCurrency(totalPending)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sellers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Comisiones por Vendedor</CardTitle>
          <CardDescription>Desglose de comisiones por vendedor</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Vendedor</TableHead>
                  <TableHead className="text-right min-w-[120px]">Total</TableHead>
                  <TableHead className="text-right min-w-[120px]">Pagadas</TableHead>
                  <TableHead className="text-right min-w-[120px]">Pendientes</TableHead>
                  <TableHead className="text-right min-w-[100px]">Operaciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((seller) => (
                  <TableRow key={seller.sellerId}>
                    <TableCell className="font-medium">{seller.sellerName}</TableCell>
                    <TableCell className="text-right">{formatCurrency(seller.totalCommissions)}</TableCell>
                    <TableCell className="text-right text-amber-600">
                      {formatCurrency(seller.paidCommissions)}
                    </TableCell>
                    <TableCell className="text-right text-yellow-600">
                      {formatCurrency(seller.pendingCommissions)}
                    </TableCell>
                    <TableCell className="text-right">{seller.operationsCount}</TableCell>
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

