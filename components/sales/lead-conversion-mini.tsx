"use client"

import { useEffect, useState } from "react"
import { TrendingUp, Loader2 } from "lucide-react"
import Link from "next/link"

interface Overview {
  totalLeads: number
  conversionRate: number
  realConversionRate: number
  realSales: number
  manualSales: number
  discardedLeads: number
}

/**
 * VIB-68: contador compacto de conversión para el header del CRM.
 * Se abastece de /api/sales/statistics (scoped server-side por org/agencias del
 * usuario). Muestra la ventana por defecto del endpoint (últimos 30 días).
 */
export function LeadConversionMini() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch("/api/sales/statistics")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.overview) setData(json.overview)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    )
  }

  if (!data || data.totalLeads === 0) return null

  return (
    <Link
      href="/sales/statistics"
      title="Ver estadísticas de conversión (últimos 30 días)"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 dark:bg-card/80 px-3 py-1 text-xs hover:shadow-sm transition-shadow"
    >
      <TrendingUp className="h-3.5 w-3.5 text-success" />
      <span className="font-semibold text-foreground">{data.conversionRate}%</span>
      <span className="text-muted-foreground">conversión</span>
      <span className="text-muted-foreground/60">·</span>
      <span className="text-success font-medium">{data.realSales} ventas</span>
      {data.manualSales > 0 && (
        <span className="text-muted-foreground">(+{data.manualSales} s/op)</span>
      )}
      <span className="text-muted-foreground/60">·</span>
      <span className="text-muted-foreground">{data.discardedLeads} descartes</span>
      <span className="text-muted-foreground/40 text-[10px]">30d</span>
    </Link>
  )
}
