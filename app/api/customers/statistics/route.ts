import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { subMonths, startOfMonth, endOfMonth, format, parseISO, differenceInDays, eachDayOfInterval, startOfDay, endOfDay } from "date-fns"
import { es } from "date-fns/locale"
import { getExchangeRate, getLatestExchangeRate, DEFAULT_USD_ARS_FALLBACK_RATE } from "@/lib/accounting/exchange-rates"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL } from "@/lib/feature-flags"
import { getServiceExtrasByOperation } from "@/lib/accounting/operation-services-debt"

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

    // Bug fix 2026-05-15 (P0 cross-tenant): el query base traía TODOS los
    // customers del sistema y luego filtraba en memoria. Para SUPER_ADMIN
    // el filter de agencia hacía bypass → leak cross-tenant (mismo bug que
    // /api/calendar/events).
    //
    // Fix: filtrar por org_id del user al nivel del query (no traer customers
    // de otros orgs nunca). Si el user no tiene org_id, no devolver nada
    // (fail-safe).
    const userOrgId = (user as any).org_id || null
    if (!userOrgId) {
      return NextResponse.json({ customers: [], totals: {}, message: "user sin org_id" })
    }

    // Query base de clientes scopeada a la org
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
            agency_id,
            org_id
          )
        )
      `)
      .eq("org_id", userOrgId)

    const { data: customers, error: customersError } = await customersQuery

    if (customersError) {
      console.error("Error fetching customers:", customersError)
      return NextResponse.json({ error: "Error al obtener clientes" }, { status: 500 })
    }

    // Filtrar por agencia si es necesario
    // Y solo incluir clientes que tengan al menos 1 operación en el rango de fechas
    const filteredCustomers = (customers || []).filter((customer: any) => {
      // Filtro de agencia
      const passesAgencyFilter = (() => {
        if (!agencyId || agencyId === "ALL") {
          if (user.role === "SUPER_ADMIN") return true
          return customer.operation_customers?.some((oc: any) =>
            agencyIds.includes(oc.operations?.agency_id)
          )
        }
        return customer.operation_customers?.some((oc: any) =>
          oc.operations?.agency_id === agencyId
        )
      })()
      if (!passesAgencyFilter) return false

      // Incluir si el cliente fue creado en el rango O tiene operaciones en el rango
      const createdAt = new Date(customer.created_at)
      const isNewInRange = createdAt >= filterFrom && createdAt <= filterTo

      const hasOperationsInRange = customer.operation_customers?.some((oc: any) => {
        const op = oc.operations
        if (!op) return false
        const rawDate = op.departure_date || op.created_at
        if (!rawDate) return false
        const opDateStr = String(rawDate).split("T")[0]
        return opDateStr >= format(filterFrom, "yyyy-MM-dd") && opDateStr <= format(filterTo, "yyyy-MM-dd")
      })

      return isNewInRange || hasOperationsInRange
    })

    // Obtener tasa de cambio más reciente como fallback
    const latestExchangeRate = await getLatestExchangeRate(supabase) || DEFAULT_USD_ARS_FALLBACK_RATE

    // Servicios adicionales (operation_services): si la flag está ON, sumamos su
    // venta a sale_amount_total para que el gasto del cliente refleje también los
    // servicios extra que compró.
    const includeServices = await getOrgFeatureFlag(
      supabase, userOrgId, FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
    )
    let serviceExtras: Record<string, { saleExtra: number; costExtra: number }> = {}
    if (includeServices) {
      const opsForExtras: { id: string; sale_currency?: string | null; currency?: string | null }[] = []
      const seenOpIds = new Set<string>()
      for (const customer of filteredCustomers as any[]) {
        for (const oc of (customer.operation_customers || []) as any[]) {
          const op = oc.operations
          if (!op?.id || seenOpIds.has(op.id)) continue
          seenOpIds.add(op.id)
          opsForExtras.push({ id: op.id, sale_currency: op.sale_currency, currency: op.currency })
        }
      }
      if (opsForExtras.length > 0) {
        serviceExtras = await getServiceExtrasByOperation(supabase, opsForExtras, userOrgId)
      }
    }

    // Estadísticas generales
    const totalCustomers = filteredCustomers.length

    // Clientes nuevos en el rango (para el conteo de "nuevos")
    const newCustomersInRange = filteredCustomers.filter((customer: any) => {
      const createdAt = new Date(customer.created_at)
      return createdAt >= filterFrom && createdAt <= filterTo
    })
    
    // Determinar si agrupar por días o meses (si el rango es <= 31 días, agrupar por días)
    const daysRange = differenceInDays(endOfDay(filterTo), startOfDay(filterFrom))
    const groupByDays = daysRange <= 31
    
    // Clientes nuevos por período (día o mes)
    const newCustomersByPeriod: Record<string, number> = {}
    
    if (groupByDays) {
      // Inicializar días en el rango
      const days = eachDayOfInterval({ start: startOfDay(filterFrom), end: endOfDay(filterTo) })
      days.forEach(day => {
        const key = format(day, "yyyy-MM-dd")
        newCustomersByPeriod[key] = 0
      })

      newCustomersInRange.forEach((customer: any) => {
        const createdAt = new Date(customer.created_at)
        const key = format(createdAt, "yyyy-MM-dd")
        if (newCustomersByPeriod[key] !== undefined) {
          newCustomersByPeriod[key]++
        }
      })
    } else {
      // Inicializar meses en el rango
      let currentDate = startOfMonth(filterFrom)
      while (currentDate <= filterTo) {
        const key = format(currentDate, "yyyy-MM")
        newCustomersByPeriod[key] = 0
        currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1))
      }

      newCustomersInRange.forEach((customer: any) => {
        const createdAt = new Date(customer.created_at)
        const key = format(createdAt, "yyyy-MM")
        if (newCustomersByPeriod[key] !== undefined) {
          newCustomersByPeriod[key]++
        }
      })
    }

    // Convertir a array para gráficos
    const newCustomersTrend = Object.entries(newCustomersByPeriod)
      .map(([key, count]) => {
        if (groupByDays) {
          const date = parseISO(key)
          return {
            month: key,
            monthName: format(date, "dd/MM", { locale: es }),
            count,
          }
        } else {
          const [year, month] = key.split("-")
          return {
            month: key,
            monthName: format(new Date(parseInt(year), parseInt(month) - 1, 1), "MMM yy", { locale: es }),
            count,
          }
        }
      })
      .sort((a, b) => a.month.localeCompare(b.month))

    // Clientes activos vs inactivos (6 meses sin actividad = inactivo)
    const sixMonthsAgo = subMonths(now, 6)
    let activeCustomers = 0
    let inactiveCustomers = 0

    // Estadísticas por cliente (todo en USD)
    // Filtrar operaciones dentro del rango de fechas Y con estado válido
    const filterFromStr = format(filterFrom, "yyyy-MM-dd")
    const filterToStr = format(filterTo, "yyyy-MM-dd")

    const customerStats = await Promise.all(filteredCustomers.map(async (customer: any) => {
      const operations = (customer.operation_customers || [])
        .map((oc: any) => oc.operations)
        .filter((op: any) => {
          if (!op || !["CONFIRMED", "TRAVELLED", "RESERVED"].includes(op.status)) return false
          // Filtrar por rango de fechas
          const rawDate = op.departure_date || op.created_at
          if (!rawDate) return true // Si no tiene fecha, incluir por defecto
          const opDateStr = String(rawDate).split("T")[0]
          return opDateStr >= filterFromStr && opDateStr <= filterToStr
        })

      let totalSpent = 0
      for (const op of operations) {
        const saleCurrency = op.sale_currency || op.currency || "USD"
        const saleAmount = (parseFloat(op.sale_amount_total) || 0) + ((serviceExtras as any)[op.id]?.saleExtra || 0)

        if (saleCurrency === "ARS") {
          const operationDate = op.departure_date || op.created_at
          let exchangeRate = await getExchangeRate(supabase, operationDate ? new Date(operationDate) : new Date())
          if (!exchangeRate) {
            exchangeRate = latestExchangeRate
          }
          totalSpent += saleAmount / exchangeRate
        } else {
          totalSpent += saleAmount
        }
      }

      const totalOperations = operations.length
      const avgTicketUsd = totalOperations > 0 ? totalSpent / totalOperations : 0

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
        totalSpent,
        avgTicketUsd,
        lastOperationDate: lastOperationDate?.toISOString() || null,
        isActive,
      }
    }))

    // Top 10 clientes por gasto
    const topBySpending = [...customerStats]
      .filter(c => c.totalSpent > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent)
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
      const range = spendingRanges.find(r => c.totalSpent >= r.min && c.totalSpent < r.max)
      if (range) range.count++
    })

    // Calcular totales
    const totalSpentAllUsd = customerStats.reduce((sum, c) => sum + c.totalSpent, 0)
    const totalOperationsAll = customerStats.reduce((sum, c) => sum + c.totalOperations, 0)
    const avgSpentPerCustomer = totalCustomers > 0 ? totalSpentAllUsd / totalCustomers : 0
    const avgOperationsPerCustomer = totalCustomers > 0 ? totalOperationsAll / totalCustomers : 0

    // Clientes nuevos este mes
    const thisMonth = format(now, "yyyy-MM")
    const newThisMonth = newCustomersByPeriod[thisMonth] || 0

    // Clientes nuevos mes anterior
    const lastMonth = format(subMonths(now, 1), "yyyy-MM")
    const newLastMonth = newCustomersByPeriod[lastMonth] || 0

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
