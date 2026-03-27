"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CommissionsTable, Commission } from "./commissions-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"

interface CommissionsPageClientProps {
  sellerId: string
}

interface MonthlySummary {
  month: string
  total: number
  pending: number
  paid: number
  count: number
}

export function CommissionsPageClient({ sellerId }: CommissionsPageClientProps) {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [monthFilter, setMonthFilter] = useState("ALL")

  const fetchCommissions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("sellerId", sellerId) // Usar sellerId para commission_records
      if (statusFilter !== "ALL") {
        params.set("status", statusFilter)
      }
      if (monthFilter !== "ALL") {
        params.set("month", monthFilter)
      }

      const response = await fetch(`/api/commissions?${params.toString()}`)
      const data = await response.json()
      setCommissions(data.commissions || [])
      setMonthlySummary(data.monthlySummary || [])
    } catch (error) {
      console.error("Error fetching commissions:", error)
    } finally {
      setLoading(false)
    }
  }, [sellerId, statusFilter, monthFilter])

  useEffect(() => {
    fetchCommissions()
  }, [fetchCommissions])

  const totalCommissions = useMemo(() => {
    return commissions.reduce((sum, comm) => sum + comm.amount, 0)
  }, [commissions])

  const pendingCommissions = useMemo(() => {
    return commissions.filter((comm) => comm.status === "PENDING").reduce((sum, comm) => sum + comm.amount, 0)
  }, [commissions])

  const paidCommissions = useMemo(() => {
    return commissions.filter((comm) => comm.status === "PAID").reduce((sum, comm) => sum + comm.amount, 0)
  }, [commissions])

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const options = []
    const today = new Date()
    for (let i = 0; i < 12; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      const monthLabel = date.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
      options.push({ value: monthKey, label: monthLabel })
    }
    return options
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis Comisiones</h1>
        <p className="text-muted-foreground">Revisa tus comisiones ganadas</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">Total Comisiones</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              ${totalCommissions.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
        </div>

        <div className="rounded-xl border border-border/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">Pendientes</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              ${pendingCommissions.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
        </div>

        <div className="rounded-xl border border-border/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">Pagadas</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              ${paidCommissions.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="PENDING">Pendientes</SelectItem>
              <SelectItem value="PAID">Pagadas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los meses</SelectItem>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>


          <Button size="sm" onClick={fetchCommissions} disabled={loading} className="rounded-full">
            Actualizar
          </Button>
      </div>

      {/* Monthly Summary */}
      {monthlySummary.length > 0 && (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="p-5">
            <p className="text-xs font-medium text-muted-foreground mb-3">Resumen Mensual</p>
            <div className="space-y-2">
              {monthlySummary.map((summary) => (
                <div key={summary.month} className="flex items-center justify-between p-2 border border-border/40 rounded-xl">
                  <div>
                    <p className="font-medium">
                      {new Date(summary.month + "-01").toLocaleDateString("es-AR", {
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-sm text-muted-foreground">{summary.count} comisiones</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      ${summary.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${summary.paid.toLocaleString("es-AR", { minimumFractionDigits: 2 })} pagadas
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Commissions Table */}
      <CommissionsTable
        commissions={commissions}
        isLoading={loading}
        emptyMessage="No hay comisiones con los filtros seleccionados"
      />
    </div>
  )
}

