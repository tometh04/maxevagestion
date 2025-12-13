"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DollarSign, TrendingUp, Clock, CheckCircle } from "lucide-react"
import Link from "next/link"

interface Commission {
  id: string
  amount: number
  currency: string
  status: string
  operation_id: string
  operations?: {
    destination: string
    sale_amount_total: number
  }
}

interface SellerCommissionsCardProps {
  sellerId: string
  className?: string
}

export function SellerCommissionsCard({ sellerId, className }: SellerCommissionsCardProps) {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState({ pending: 0, paid: 0, total: 0 })

  const fetchCommissions = useCallback(async () => {
    try {
      const response = await fetch(`/api/commissions?sellerId=${sellerId}&limit=5`)
      if (response.ok) {
        const data = await response.json()
        const comms = data.commissions || []
        setCommissions(comms)
        
        // Calcular totales
        const pending = comms
          .filter((c: Commission) => c.status === "PENDING")
          .reduce((sum: number, c: Commission) => sum + c.amount, 0)
        const paid = comms
          .filter((c: Commission) => c.status === "PAID")
          .reduce((sum: number, c: Commission) => sum + c.amount, 0)
        
        setTotals({ pending, paid, total: pending + paid })
      }
    } catch (error) {
      console.error("Error fetching commissions:", error)
    } finally {
      setLoading(false)
    }
  }, [sellerId])

  useEffect(() => {
    fetchCommissions()
  }, [fetchCommissions])

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-5 w-[150px]" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Mis Comisiones
          </CardTitle>
          <Link href="/commissions">
            <Button variant="ghost" size="sm">Ver todas</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {/* Resumen de totales */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Pendientes</span>
            </div>
            <p className="text-lg font-bold mt-1">
              ${totals.pending.toLocaleString("es-AR")}
            </p>
          </div>
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Cobradas</span>
            </div>
            <p className="text-lg font-bold mt-1">
              ${totals.paid.toLocaleString("es-AR")}
            </p>
          </div>
        </div>

        {/* Lista de comisiones recientes */}
        {commissions.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No hay comisiones registradas
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Recientes</p>
            {commissions.slice(0, 5).map((comm) => (
              <div 
                key={comm.id} 
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {comm.operations?.destination || "Operación"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Venta: ${comm.operations?.sale_amount_total?.toLocaleString("es-AR") || 0}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    ${comm.amount.toLocaleString("es-AR")}
                  </span>
                  <Badge 
                    variant={comm.status === "PAID" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {comm.status === "PAID" ? "Cobrada" : "Pendiente"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

