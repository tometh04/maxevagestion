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
  }, [statusFilter, monthFilter])

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
        <h1 className="text-3xl font-bold">Mis Comisiones</h1>
        <p className="text-muted-foreground">Revisa tus comisiones ganadas</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Comisiones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalCommissions.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${pendingCommissions.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${paidCommissions.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="PENDING">Pendientes</SelectItem>
              <SelectItem value="PAID">Pagadas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger>
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
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={fetchCommissions} disabled={loading}>
            Actualizar
          </Button>
        </div>
      </div>

      {/* Monthly Summary */}
      {monthlySummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumen Mensual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {monthlySummary.map((summary) => (
                <div key={summary.month} className="flex items-center justify-between p-2 border rounded">
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
          </CardContent>
        </Card>
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

