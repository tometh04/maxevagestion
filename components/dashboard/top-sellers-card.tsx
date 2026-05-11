"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Trophy, Medal, Award, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface Seller {
  id: string
  name: string
  phone?: string | null
  totalSales: number
  operationsCount: number
  margin: number
}

interface TopSellersCardProps {
  agencyId?: string
  sellerId?: string
  dateFrom?: string
  dateTo?: string
}

export function TopSellersCard({ agencyId, sellerId, dateFrom, dateTo }: TopSellersCardProps = {}) {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTopSellers = useCallback(async () => {
    try {
      setLoading(true)
      const now = new Date()
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      
      const params = new URLSearchParams()
      // Siempre usar el mes en curso (no depender de filtros del dashboard)
      params.set("dateFrom", firstDayOfMonth.toISOString().split("T")[0])
      params.set("dateTo", lastDayOfMonth.toISOString().split("T")[0])
      if (agencyId && agencyId !== "ALL") {
        params.set("agencyId", agencyId)
      }
      if (sellerId && sellerId !== "ALL") {
        params.set("sellerId", sellerId)
      }
      
      const response = await fetch(`/api/analytics/sellers?${params.toString()}`)
      const data = await response.json()
      
      const topSellers = (data.sellers || [])
        .sort((a: any, b: any) => b.totalSales - a.totalSales)
        .slice(0, 5)
        .map((s: any) => ({
          id: s.id,
          name: s.name || s.phone || "Vendedor",
          phone: s.phone,
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
  }, [agencyId, sellerId])

  useEffect(() => {
    fetchTopSellers()
  }, [fetchTopSellers])

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?"
    // Si es un teléfono (empieza con + o es solo números), mostrar los últimos 2 dígitos
    if (name.startsWith("+") || /^\d+$/.test(name.replace(/\s/g, ""))) {
      const digits = name.replace(/\D/g, "")
      return digits.slice(-2) || "📱"
    }
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
        return <Trophy className="h-3 w-3 text-accent-coral" />
      case 1:
        return <Medal className="h-3 w-3 text-muted-foreground" />
      case 2:
        return <Award className="h-3 w-3 text-accent-coral" />
      default:
        return <span className="text-[10px] font-medium text-muted-foreground w-3 text-center">{index + 1}</span>
    }
  }

  const getRankBg = (index: number) => {
    switch (index) {
      case 0:
        return "bg-accent-coral/10 dark:bg-accent-coral/20 border-accent-coral/30 dark:border-accent-coral/40"
      case 1:
        return "bg-muted dark:bg-card/60 border-border dark:border-border"
      case 2:
        return "bg-accent-coral/5 dark:bg-accent-coral/10 border-accent-coral/15 dark:border-accent-coral/25"
      default:
        return ""
    }
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`
    }
    return `$${value.toFixed(0)}`
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Top Vendedores del Mes
        </CardTitle>
        <CardDescription className="text-xs">Ranking por ventas totales</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : sellers.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Trophy className="h-6 w-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">Sin datos este mes</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sellers.map((seller, index) => (
              <div
                key={seller.id}
                className={cn(
                  "flex items-center gap-2 p-1.5 rounded-md border text-xs",
                  getRankBg(index)
                )}
              >
                <div className="flex items-center justify-center w-4 shrink-0">
                  {getRankIcon(index)}
                </div>
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(seller.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate leading-tight">{seller.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {seller.operationsCount} ops • {formatCurrency(seller.margin)} margen
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-accent-coral dark:text-accent-coral">
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
