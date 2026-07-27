"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DollarSign, TrendingUp, Clock, CheckCircle } from "lucide-react"
import Link from "next/link"
import {
  emptyTotalsByCurrency,
  isEmptyBucket,
  totalsByCurrency,
  type CommissionCurrency,
  type CommissionTotalsByCurrency,
} from "@/lib/commissions/currency"

interface Commission {
  id: string
  amount: number
  currency: string
  status: string
  operation_id: string
  operation?: {
    currency?: string | null
    sale_currency?: string | null
  } | null
  operations?: {
    destination: string
    sale_amount_total: number
  }
}

/** Formato con el símbolo que corresponde a cada moneda. */
const fmt = (value: number, currency: CommissionCurrency) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value || 0)

interface SellerCommissionsCardProps {
  sellerId: string
  className?: string
}

export function SellerCommissionsCard({ sellerId, className }: SellerCommissionsCardProps) {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState<CommissionTotalsByCurrency>(emptyTotalsByCurrency())

  const fetchCommissions = useCallback(async () => {
    try {
      const response = await fetch(`/api/commissions?sellerId=${sellerId}&limit=5`)
      if (response.ok) {
        const data = await response.json()
        const comms = data.commissions || []
        setCommissions(comms)
        // Separado por moneda: sumar ARS con USD daba un número sin sentido,
        // encima mostrado con "$".
        setTotals(totalsByCurrency(comms))
      }
    } catch (error) {
      console.error("Error fetching commissions:", error)
    } finally {
      setLoading(false)
    }
  }, [sellerId])

  /** Monedas con algo para mostrar; si no hay nada, se muestra ARS en cero. */
  const activeCurrencies = (["ARS", "USD"] as CommissionCurrency[]).filter(
    (c) => !isEmptyBucket(totals[c])
  )
  const shownCurrencies = activeCurrencies.length > 0 ? activeCurrencies : (["ARS"] as const)

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
        {/* Resumen de totales, una línea por moneda (nunca sumadas entre sí) */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg bg-accent-coral/5 dark:bg-accent-coral/30 p-3">
            <div className="flex items-center gap-2 text-accent-coral dark:text-accent-coral">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Pendientes</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {shownCurrencies.map((currency) => (
                <p key={currency} className="text-lg font-bold tabular-nums leading-tight">
                  {fmt(totals[currency].pending, currency)}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-success/5 dark:bg-success/30 p-3">
            <div className="flex items-center gap-2 text-success dark:text-success">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Cobradas</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {shownCurrencies.map((currency) => (
                <p key={currency} className="text-lg font-bold tabular-nums leading-tight">
                  {fmt(totals[currency].paid, currency)}
                </p>
              ))}
            </div>
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

