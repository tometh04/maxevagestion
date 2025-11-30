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

interface SalesReportProps {
  filters: ReportsFiltersState
}

interface SalesData {
  totalSales: number
  totalMargin: number
  totalCost: number
  operationsCount: number
  avgMarginPercent: number
  sellers: Array<{
    sellerId: string
    sellerName: string
    totalSales: number
    totalMargin: number
    operationsCount: number
    avgMarginPercent: number
  }>
  destinations: Array<{
    destination: string
    totalSales: number
    totalMargin: number
    operationsCount: number
    avgMarginPercent: number
  }>
}

export function SalesReport({ filters }: SalesReportProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SalesData | null>(null)

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

        const [salesRes, sellersRes, destinationsRes] = await Promise.all([
          fetch(`/api/analytics/sales?${params.toString()}`),
          fetch(`/api/analytics/sellers?${params.toString()}`),
          fetch(`/api/analytics/destinations?${params.toString()}&limit=10`),
        ])

        const salesData = await salesRes.json()
        const sellersData = await sellersRes.json()
        const destinationsData = await destinationsRes.json()

        setData({
          ...salesData,
          sellers: sellersData.sellers || [],
          destinations: destinationsData.destinations || [],
        })
      } catch (error) {
        console.error("Error fetching sales report:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [filters])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
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

  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No hay datos disponibles</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalSales)}</div>
            <p className="text-xs text-muted-foreground">{data.operationsCount} operaciones</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margen Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(data.totalMargin)}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.avgMarginPercent.toFixed(2)}% promedio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalCost)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.operationsCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sellers Table */}
      {data.sellers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ventas por Vendedor</CardTitle>
            <CardDescription>Desglose de ventas por vendedor</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Vendedor</TableHead>
                    <TableHead className="text-right min-w-[120px]">Ventas</TableHead>
                    <TableHead className="text-right min-w-[120px]">Margen</TableHead>
                    <TableHead className="text-right min-w-[100px]">% Margen</TableHead>
                    <TableHead className="text-right min-w-[100px]">Operaciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sellers.map((seller) => (
                    <TableRow key={seller.sellerId}>
                      <TableCell className="font-medium">{seller.sellerName}</TableCell>
                      <TableCell className="text-right">{formatCurrency(seller.totalSales)}</TableCell>
                      <TableCell className="text-right text-amber-600">
                        {formatCurrency(seller.totalMargin)}
                      </TableCell>
                      <TableCell className="text-right">
                        {seller.avgMarginPercent.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">{seller.operationsCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Destinations Table */}
      {data.destinations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ventas por Destino</CardTitle>
            <CardDescription>Top destinos por ventas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Destino</TableHead>
                    <TableHead className="text-right min-w-[120px]">Ventas</TableHead>
                    <TableHead className="text-right min-w-[120px]">Margen</TableHead>
                    <TableHead className="text-right min-w-[100px]">% Margen</TableHead>
                    <TableHead className="text-right min-w-[100px]">Operaciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.destinations.map((dest, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{dest.destination}</TableCell>
                      <TableCell className="text-right">{formatCurrency(dest.totalSales)}</TableCell>
                      <TableCell className="text-right text-amber-600">
                        {formatCurrency(dest.totalMargin)}
                      </TableCell>
                      <TableCell className="text-right">
                        {dest.avgMarginPercent.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">{dest.operationsCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

