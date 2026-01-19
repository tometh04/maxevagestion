import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { subMonths, startOfMonth, endOfMonth, format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Parámetros de filtro
    const agencyId = searchParams.get("agencyId")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")

    // Si no hay fechas, usar últimos 12 meses por defecto
    const now = new Date()
    const defaultFrom = startOfMonth(subMonths(now, 11))
    const defaultTo = endOfMonth(now)
    
    const filterFrom = dateFrom ? parseISO(dateFrom) : defaultFrom
    const filterTo = dateTo ? parseISO(dateTo) : defaultTo

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Query base de clientes
    let customersQuery = supabase
      .from("customers")
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone,
        created_at,
        operation_customers (
          operation_id,
          operations (
            id,
            status,
            sale_amount_total,
            sale_currency,
            currency,
            departure_date,
            created_at,
            agency_id
          )
        )
      `)
      .gte("created_at", filterFrom.toISOString())
      .lte("created_at", filterTo.toISOString())

    const { data: customers, error: customersError } = await customersQuery

    if (customersError) {
      console.error("Error fetching customers:", customersError)
      return NextResponse.json({ error: "Error al obtener clientes" }, { status: 500 })
    }

    // Filtrar por agencia si es necesario
    const filteredCustomers = (customers || []).filter((customer: any) => {
      if (!agencyId || agencyId === "ALL") {
        if (user.role === "SUPER_ADMIN") return true
        // Verificar que el cliente tenga operaciones en las agencias del usuario
        return customer.operation_customers?.some((oc: any) => 
          agencyIds.includes(oc.operations?.agency_id)
        )
      }
      return customer.operation_customers?.some((oc: any) => 
        oc.operations?.agency_id === agencyId
      )
    })

    // Obtener tasa de cambio más reciente como fallback
    const latestExchangeRate = await getLatestExchangeRate(supabase) || 1000

    // Estadísticas generales
    const totalCustomers = filteredCustomers.length
    
    // Clientes nuevos por mes
    const newCustomersByMonth: Record<string, number> = {}
    
    // Inicializar meses en el rango
    let currentDate = startOfMonth(filterFrom)
    while (currentDate <= filterTo) {
      const key = format(currentDate, "yyyy-MM")
      newCustomersByMonth[key] = 0
      currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1))
    }

    filteredCustomers.forEach((customer: any) => {
      const createdAt = new Date(customer.created_at)
      const key = format(createdAt, "yyyy-MM")
      if (newCustomersByMonth[key] !== undefined) {
        newCustomersByMonth[key]++
      }
    })

    // Convertir a array para gráficos
    const newCustomersTrend = Object.entries(newCustomersByMonth)
      .map(([key, count]) => {
        const [year, month] = key.split("-")
        return {
          month: key,
          monthName: format(new Date(parseInt(year), parseInt(month) - 1, 1), "MMM yy", { locale: es }),
          count,
        }
      })
      .sort((a, b) => a.month.localeCompare(b.month))

    // Clientes activos vs inactivos (6 meses sin actividad = inactivo)
    const sixMonthsAgo = subMonths(now, 6)
    let activeCustomers = 0
    let inactiveCustomers = 0

    // Estadísticas por cliente (todo en USD)
    const customerStats = await Promise.all(filteredCustomers.map(async (customer: any) => {
      const operations = (customer.operation_customers || [])
        .map((oc: any) => oc.operations)
        .filter((op: any) => op && ["CONFIRMED", "TRAVELLED", "RESERVED"].includes(op.status))

      let totalSpentUsd = 0
      for (const op of operations) {
        const saleCurrency = op.sale_currency || op.currency || "USD"
        const saleAmount = parseFloat(op.sale_amount_total) || 0
        
        if (saleCurrency === "ARS") {
          const operationDate = op.departure_date || op.created_at
          let exchangeRate = await getExchangeRate(supabase, operationDate ? new Date(operationDate) : new Date())
          if (!exchangeRate) {
            exchangeRate = latestExchangeRate
          }
          totalSpentUsd += saleAmount / exchangeRate
        } else {
          totalSpentUsd += saleAmount
        }
      }

      const totalOperations = operations.length
      const avgTicketUsd = totalOperations > 0 ? totalSpentUsd / totalOperations : 0

      const lastOperationDate = operations.length > 0
        ? operations
            .map((op: any) => new Date(op.departure_date))
            .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0]
        : null

      const isActive = lastOperationDate && lastOperationDate > sixMonthsAgo
      if (isActive) activeCustomers++
      else inactiveCustomers++

      return {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`.trim() || "Sin nombre",
        email: customer.email,
        phone: customer.phone,
        totalOperations,
        totalSpentUsd,
        avgTicketUsd,
        lastOperationDate: lastOperationDate?.toISOString() || null,
        isActive,
      }
    }))

    // Top 10 clientes por gasto
    const topBySpending = [...customerStats]
      .filter(c => c.totalSpentUsd > 0)
      .sort((a, b) => b.totalSpentUsd - a.totalSpentUsd)
      .slice(0, 10)

    // Top 10 clientes por frecuencia
    const topByFrequency = [...customerStats]
      .filter(c => c.totalOperations > 0)
      .sort((a, b) => b.totalOperations - a.totalOperations)
      .slice(0, 10)

    // Clientes por rango de gasto (en USD)
    const spendingRanges = [
      { range: "$0 - $500", min: 0, max: 500, count: 0 },
      { range: "$500 - $1K", min: 500, max: 1000, count: 0 },
      { range: "$1K - $2K", min: 1000, max: 2000, count: 0 },
      { range: "$2K - $5K", min: 2000, max: 5000, count: 0 },
      { range: "+$5K", min: 5000, max: Infinity, count: 0 },
    ]

    customerStats.forEach(c => {
      const range = spendingRanges.find(r => c.totalSpentUsd >= r.min && c.totalSpentUsd < r.max)
      if (range) range.count++
    })

    // Calcular totales
    const totalSpentAllUsd = customerStats.reduce((sum, c) => sum + c.totalSpentUsd, 0)
    const totalOperationsAll = customerStats.reduce((sum, c) => sum + c.totalOperations, 0)
    const avgSpentPerCustomer = totalCustomers > 0 ? totalSpentAllUsd / totalCustomers : 0
    const avgOperationsPerCustomer = totalCustomers > 0 ? totalOperationsAll / totalCustomers : 0

    // Clientes nuevos este mes
    const thisMonth = format(now, "yyyy-MM")
    const newThisMonth = newCustomersByMonth[thisMonth] || 0

    // Clientes nuevos mes anterior
    const lastMonth = format(subMonths(now, 1), "yyyy-MM")
    const newLastMonth = newCustomersByMonth[lastMonth] || 0

    // Crecimiento porcentual
    const growthPercentage = newLastMonth > 0 
      ? ((newThisMonth - newLastMonth) / newLastMonth) * 100 
      : newThisMonth > 0 ? 100 : 0

    return NextResponse.json({
      overview: {
        totalCustomers,
        activeCustomers,
        inactiveCustomers,
        newThisMonth,
        growthPercentage: Math.round(growthPercentage * 10) / 10,
        totalSpent: Math.round(totalSpentAllUsd * 100) / 100,
        avgSpentPerCustomer: Math.round(avgSpentPerCustomer * 100) / 100,
        avgOperationsPerCustomer: Math.round(avgOperationsPerCustomer * 10) / 10,
      },
      trends: {
        newCustomersByMonth: newCustomersTrend,
      },
      distributions: {
        spendingRanges,
        activeVsInactive: [
          { name: "Activos", value: activeCustomers },
          { name: "Inactivos", value: inactiveCustomers },
        ],
      },
      rankings: {
        topBySpending,
        topByFrequency,
      },
      filters: {
        dateFrom: format(filterFrom, "yyyy-MM-dd"),
        dateTo: format(filterTo, "yyyy-MM-dd"),
      }
    })
  } catch (error: any) {
    console.error("Error in GET /api/customers/statistics:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener estadísticas" },
      { status: 500 }
    )
  }
}
