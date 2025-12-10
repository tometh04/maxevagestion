"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { CashKPIs, CashSummary } from "./cash-kpis"
import { PaymentsTable, Payment } from "./payments-table"
import { MovementsTable, CashMovement } from "./movements-table"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"

interface CashPageClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: CashFiltersState
}

const emptySummary: CashSummary = {
  totalIncome: 0,
  totalExpenses: 0,
  netCash: 0,
  pendingCustomers: 0,
  pendingOperators: 0,
  currency: "ARS",
}

export function CashPageClient({ agencies, defaultFilters }: CashPageClientProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [payments, setPayments] = useState<Payment[]>([])
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [loadingMovements, setLoadingMovements] = useState(false)

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true)

    const params = new URLSearchParams()
    params.set("dateFrom", filters.dateFrom)
    params.set("dateTo", filters.dateTo)
    params.set("currency", filters.currency)
    params.set("limit", "100")

    if (filters.agencyId !== "ALL") {
      params.set("agencyId", filters.agencyId)
    }

    try {
      const response = await fetch(`/api/payments?${params.toString()}`)
      const data = await response.json()
      setPayments(data.payments || [])
    } catch (error) {
      console.error("Error fetching payments:", error)
    } finally {
      setLoadingPayments(false)
    }
  }, [filters])

  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true)

    const params = new URLSearchParams()
    params.set("dateFrom", filters.dateFrom)
    params.set("dateTo", filters.dateTo)
    params.set("currency", filters.currency)

    if (filters.agencyId !== "ALL") {
      params.set("agencyId", filters.agencyId)
    }

    try {
      const response = await fetch(`/api/cash/movements?${params.toString()}`)
      const data = await response.json()
      setMovements(data.movements || [])
    } catch (error) {
      console.error("Error fetching movements:", error)
    } finally {
      setLoadingMovements(false)
    }
  }, [filters])

  useEffect(() => {
    fetchPayments()
    fetchMovements()
  }, [fetchPayments, fetchMovements])

  const summary = useMemo<CashSummary>(() => {
    if (filters.currency === "ALL") {
      return { ...emptySummary, currency: filters.currency }
    }

    const filteredMovements = movements.filter((movement) => movement.currency === filters.currency)
    const filteredPayments = payments.filter((payment) => payment.currency === filters.currency)

    const totalIncome = filteredMovements
      .filter((movement) => movement.type === "INCOME")
      .reduce((sum, movement) => sum + movement.amount, 0)

    const totalExpenses = filteredMovements
      .filter((movement) => movement.type === "EXPENSE")
      .reduce((sum, movement) => sum + movement.amount, 0)

    const pendingCustomers = filteredPayments
      .filter((payment) => payment.payer_type === "CUSTOMER" && payment.status !== "PAID")
      .reduce((sum, payment) => sum + payment.amount, 0)

    const pendingOperators = filteredPayments
      .filter((payment) => payment.payer_type === "OPERATOR" && payment.status !== "PAID")
      .reduce((sum, payment) => sum + payment.amount, 0)

    return {
      totalIncome,
      totalExpenses,
      netCash: totalIncome - totalExpenses,
      pendingCustomers,
      pendingOperators,
      currency: filters.currency,
    }
  }, [movements, payments, filters.currency])

  const paymentsPreview = useMemo(() => payments.slice(0, 5), [payments])
  const movementsPreview = useMemo(() => movements.slice(0, 5), [movements])

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Caja</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-3xl font-bold">Caja & Finanzas</h1>
        <p className="text-muted-foreground">Monitorea el estado de la caja y los pagos pendientes</p>
      </div>

      <CashFilters agencies={agencies} value={filters} defaultValue={defaultFilters} onChange={setFilters} />

      <CashKPIs summary={summary} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pagos próximos</h2>
          <Button variant="link" asChild>
            <Link href="/cash/payments">Ver todos</Link>
          </Button>
        </div>
        <PaymentsTable
          payments={paymentsPreview}
          isLoading={loadingPayments}
          onRefresh={fetchPayments}
          emptyMessage="No hay pagos en el rango seleccionado"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Últimos movimientos</h2>
          <Button variant="link" asChild>
            <Link href="/cash/movements">Ver todos</Link>
          </Button>
        </div>
        <MovementsTable
          movements={movementsPreview}
          isLoading={loadingMovements}
          emptyMessage="No hay movimientos en el rango seleccionado"
        />
      </div>
    </div>
  )
}
