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
  ars: {
    totalIncome: 0,
    totalExpenses: 0,
    netCash: 0,
    pendingCustomers: 0,
    pendingOperators: 0,
  },
  usd: {
    totalIncome: 0,
    totalExpenses: 0,
    netCash: 0,
    pendingCustomers: 0,
    pendingOperators: 0,
  },
}

export function CashPageClient({ agencies, defaultFilters }: CashPageClientProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [payments, setPayments] = useState<Payment[]>([])
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [loadingMovements, setLoadingMovements] = useState(false)

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true)

    // Traer más pagos para poder filtrar correctamente por fecha
    const params = new URLSearchParams()
    params.set("limit", "500") // Traer más para filtrar por fecha en cliente

    if (filters.agencyId !== "ALL") {
      params.set("agencyId", filters.agencyId)
    }

    try {
      const response = await fetch(`/api/payments?${params.toString()}`)
      const data = await response.json()
      let allPayments = data.payments || []

      // Aplicar filtros de fecha y moneda en el cliente
      const dateFrom = new Date(filters.dateFrom)
      const dateTo = new Date(filters.dateTo)
      dateTo.setHours(23, 59, 59, 999)

      allPayments = allPayments.filter((payment: Payment) => {
        // Usar date_due o date_paid según disponibilidad
        const paymentDate = new Date(
          payment.date_due || payment.date_paid || new Date().toISOString()
        )
        const matchesDate = paymentDate >= dateFrom && paymentDate <= dateTo
        
        // Filtrar por moneda
        const matchesCurrency = filters.currency === "ALL" || payment.currency === filters.currency
        
        return matchesDate && matchesCurrency
      })

      setPayments(allPayments)
    } catch (error) {
      console.error("Error fetching payments:", error)
    } finally {
      setLoadingPayments(false)
    }
  }, [filters])

  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true)

    const params = new URLSearchParams()
    params.set("limit", "500") // Traer más para filtrar por fecha en cliente

    if (filters.agencyId !== "ALL") {
      params.set("agencyId", filters.agencyId)
    }

    try {
      const response = await fetch(`/api/cash/movements?${params.toString()}`)
      const data = await response.json()
      let allMovements = data.movements || []

      // Aplicar filtros de fecha y moneda en el cliente
      const dateFrom = new Date(filters.dateFrom)
      const dateTo = new Date(filters.dateTo)
      dateTo.setHours(23, 59, 59, 999)

      allMovements = allMovements.filter((movement: CashMovement) => {
        const movementDate = new Date(movement.movement_date)
        const matchesDate = movementDate >= dateFrom && movementDate <= dateTo
        
        // Filtrar por moneda
        const matchesCurrency = filters.currency === "ALL" || movement.currency === filters.currency
        
        return matchesDate && matchesCurrency
      })

      setMovements(allMovements)
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
    // Filtrar movimientos y pagos por fecha y agencia
    const dateFrom = new Date(filters.dateFrom)
    const dateTo = new Date(filters.dateTo)
    dateTo.setHours(23, 59, 59, 999) // Incluir todo el día final

    let filteredMovements = movements.filter((movement) => {
      const movementDate = new Date(movement.movement_date)
      const matchesDate = movementDate >= dateFrom && movementDate <= dateTo
      
      // Filtrar por agencia si está especificada
      const movementAgencyId = movement.operations?.agency_id || movement.operations?.agencies?.id
      const matchesAgency = filters.agencyId === "ALL" || 
        (movementAgencyId === filters.agencyId)
      
      return matchesDate && matchesAgency
    })

    let filteredPayments = payments.filter((payment) => {
      const paymentDate = new Date(payment.date_due || payment.date_paid || new Date().toISOString())
      const matchesDate = paymentDate >= dateFrom && paymentDate <= dateTo
      
      // Filtrar por agencia si está especificada (a través de operation)
      const matchesAgency = filters.agencyId === "ALL" || 
        (payment.operations?.agency_id === filters.agencyId)
      
      return matchesDate && matchesAgency
    })

    // Calcular KPIs para ARS
    const arsMovements = filteredMovements.filter((m) => m.currency === "ARS")
    const arsPayments = filteredPayments.filter((p) => p.currency === "ARS")

    const arsIncome = arsMovements
      .filter((movement) => movement.type === "INCOME")
      .reduce((sum, movement) => sum + parseFloat(movement.amount.toString()), 0)

    const arsExpenses = arsMovements
      .filter((movement) => movement.type === "EXPENSE")
      .reduce((sum, movement) => sum + parseFloat(movement.amount.toString()), 0)

    const arsPendingCustomers = arsPayments
      .filter((payment) => payment.payer_type === "CUSTOMER" && payment.status !== "PAID")
      .reduce((sum, payment) => sum + parseFloat(payment.amount.toString()), 0)

    const arsPendingOperators = arsPayments
      .filter((payment) => payment.payer_type === "OPERATOR" && payment.status !== "PAID")
      .reduce((sum, payment) => sum + parseFloat(payment.amount.toString()), 0)

    // Calcular KPIs para USD
    const usdMovements = filteredMovements.filter((m) => m.currency === "USD")
    const usdPayments = filteredPayments.filter((p) => p.currency === "USD")

    const usdIncome = usdMovements
      .filter((movement) => movement.type === "INCOME")
      .reduce((sum, movement) => sum + parseFloat(movement.amount.toString()), 0)

    const usdExpenses = usdMovements
      .filter((movement) => movement.type === "EXPENSE")
      .reduce((sum, movement) => sum + parseFloat(movement.amount.toString()), 0)

    const usdPendingCustomers = usdPayments
      .filter((payment) => payment.payer_type === "CUSTOMER" && payment.status !== "PAID")
      .reduce((sum, payment) => sum + parseFloat(payment.amount.toString()), 0)

    const usdPendingOperators = usdPayments
      .filter((payment) => payment.payer_type === "OPERATOR" && payment.status !== "PAID")
      .reduce((sum, payment) => sum + parseFloat(payment.amount.toString()), 0)

    return {
      ars: {
        totalIncome: arsIncome,
        totalExpenses: arsExpenses,
        netCash: arsIncome - arsExpenses,
        pendingCustomers: arsPendingCustomers,
        pendingOperators: arsPendingOperators,
      },
      usd: {
        totalIncome: usdIncome,
        totalExpenses: usdExpenses,
        netCash: usdIncome - usdExpenses,
        pendingCustomers: usdPendingCustomers,
        pendingOperators: usdPendingOperators,
      },
    }
  }, [movements, payments, filters.dateFrom, filters.dateTo, filters.agencyId])

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
