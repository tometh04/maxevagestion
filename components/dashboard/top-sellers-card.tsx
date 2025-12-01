"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Trophy, Medal, Award, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface Seller {
  id: string
  name: string
  totalSales: number
  operationsCount: number
  margin: number
}

export function TopSellersCard() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTopSellers()
  }, [])

  const fetchTopSellers = async () => {
    try {
      setLoading(true)
      // Obtener datos del mes actual
      const now = new Date()
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      
      const params = new URLSearchParams()
      params.set("dateFrom", firstDayOfMonth.toISOString().split("T")[0])
      params.set("dateTo", lastDayOfMonth.toISOString().split("T")[0])
      
      const response = await fetch(`/api/analytics/sellers?${params.toString()}`)
      const data = await response.json()
      
      // Ordenar por ventas totales y tomar top 5
      const topSellers = (data.sellers || [])
        .sort((a: any, b: any) => b.totalSales - a.totalSales)
        .slice(0, 5)
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          totalSales: s.totalSales || 0,
          operationsCount: s.operationsCount || 0,
          margin: s.margin || 0,
        }))
      
      setSellers(topSellers)
    } catch (error) {
      console.error("Error fetching top sellers:", error)
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-4 w-4 text-yellow-500" />
      case 1:
        return <Medal className="h-4 w-4 text-gray-400" />
      case 2:
        return <Award className="h-4 w-4 text-amber-600" />
      default:
        return <span className="text-xs font-medium text-muted-foreground w-4 text-center">{index + 1}</span>
    }
  }

  const getRankBg = (index: number) => {
    switch (index) {
      case 0:
        return "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800"
      case 1:
        return "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700"
      case 2:
        return "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
      default:
        return ""
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Top Vendedores del Mes
        </CardTitle>
        <CardDescription>Ranking por ventas totales</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : sellers.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sin datos este mes</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sellers.map((seller, index) => (
              <div
                key={seller.id}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg border",
                  getRankBg(index)
                )}
              >
                <div className="flex items-center justify-center w-6">
                  {getRankIcon(index)}
                </div>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {getInitials(seller.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{seller.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {seller.operationsCount} ops • {formatCurrency(seller.margin)} margen
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {formatCurrency(seller.totalSales)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

