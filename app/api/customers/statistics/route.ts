import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns"
import { es } from "date-fns/locale"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Parámetros de filtro
    const agencyId = searchParams.get("agencyId")
    const months = parseInt(searchParams.get("months") || "12")

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
            departure_date,
            agency_id
          )
        )
      `)

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

    // Estadísticas generales
    const totalCustomers = filteredCustomers.length
    
    // Clientes nuevos por mes
    const newCustomersByMonth: Record<string, number> = {}
    const now = new Date()
    
    for (let i = 0; i < months; i++) {
      const date = subMonths(now, months - 1 - i)
      const key = format(date, "yyyy-MM")
      newCustomersByMonth[key] = 0
    }

    filteredCustomers.forEach((customer: any) => {
      const createdAt = new Date(customer.created_at)
      const key = format(createdAt, "yyyy-MM")
      if (newCustomersByMonth[key] !== undefined) {
        newCustomersByMonth[key]++
      }
    })

    // Convertir a array para gráficos
    const newCustomersTrend = Object.entries(newCustomersByMonth).map(([key, count]) => {
      const [year, month] = key.split("-")
      return {
        month: key,
        monthName: format(new Date(parseInt(year), parseInt(month) - 1, 1), "MMM yy", { locale: es }),
        count,
      }
    })

    // Clientes activos vs inactivos (6 meses sin actividad = inactivo)
    const sixMonthsAgo = subMonths(now, 6)
    let activeCustomers = 0
    let inactiveCustomers = 0

    // Estadísticas por cliente
    const customerStats = filteredCustomers.map((customer: any) => {
      const operations = (customer.operation_customers || [])
        .map((oc: any) => oc.operations)
        .filter((op: any) => op && ["CONFIRMED", "TRAVELLED", "CLOSED"].includes(op.status))

      const totalSpent = operations.reduce((sum: number, op: any) => 
        sum + (parseFloat(op.sale_amount_total) || 0), 0
      )

      const totalOperations = operations.length
      const avgTicket = totalOperations > 0 ? totalSpent / totalOperations : 0

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
        name: `${customer.first_name} ${customer.last_name}`,
        email: customer.email,
        phone: customer.phone,
        totalOperations,
        totalSpent,
        avgTicket,
        lastOperationDate: lastOperationDate?.toISOString() || null,
        isActive,
      }
    })

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

    // Clientes por rango de gasto
    const spendingRanges = [
      { range: "$0 - $500k", min: 0, max: 500000, count: 0 },
      { range: "$500k - $1M", min: 500000, max: 1000000, count: 0 },
      { range: "$1M - $2M", min: 1000000, max: 2000000, count: 0 },
      { range: "$2M - $5M", min: 2000000, max: 5000000, count: 0 },
      { range: "+$5M", min: 5000000, max: Infinity, count: 0 },
    ]

    customerStats.forEach(c => {
      const range = spendingRanges.find(r => c.totalSpent >= r.min && c.totalSpent < r.max)
      if (range) range.count++
    })

    // Calcular totales
    const totalSpentAll = customerStats.reduce((sum, c) => sum + c.totalSpent, 0)
    const totalOperationsAll = customerStats.reduce((sum, c) => sum + c.totalOperations, 0)
    const avgSpentPerCustomer = totalCustomers > 0 ? totalSpentAll / totalCustomers : 0
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
        totalSpent: totalSpentAll,
        avgSpentPerCustomer: Math.round(avgSpentPerCustomer),
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
    })
  } catch (error: any) {
    console.error("Error in GET /api/customers/statistics:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener estadísticas" },
      { status: 500 }
    )
  }
}
