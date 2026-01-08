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

    // Query base de operaciones - simplificada
    let operationsQuery = (supabase.from("operations") as any)
      .select(`
        id,
        destination,
        status,
        sale_amount_total,
        operator_cost,
        margin_amount,
        margin_percentage,
        currency,
        departure_date,
        created_at,
        agency_id,
        seller_id
      `)

    // Filtrar por agencia
    if (agencyId && agencyId !== "ALL") {
      operationsQuery = operationsQuery.eq("agency_id", agencyId)
    } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      operationsQuery = operationsQuery.in("agency_id", agencyIds)
    }

    const { data: operations, error: operationsError } = await operationsQuery

    if (operationsError) {
      console.error("Error fetching operations:", operationsError)
      return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
    }

    const now = new Date()

    // Estadísticas por estado
    const statusCounts: Record<string, number> = {
      PRE_RESERVATION: 0,
      RESERVED: 0,
      CONFIRMED: 0,
      CANCELLED: 0,
      TRAVELLED: 0,
      CLOSED: 0,
    }

    const statusLabels: Record<string, string> = {
      PRE_RESERVATION: "Pre-reserva",
      RESERVED: "Reservado",
      CONFIRMED: "Confirmado",
      CANCELLED: "Cancelado",
      TRAVELLED: "Viajado",
      CLOSED: "Cerrado",
    }

    // Estadísticas por destino
    const destinationStats: Record<string, {
      destination: string
      count: number
      totalSales: number
      totalMargin: number
      avgMargin: number
    }> = {}

    // Estadísticas por mes
    const monthlyStats: Record<string, {
      month: string
      monthName: string
      count: number
      sales: number
      margin: number
    }> = {}

    // Inicializar meses
    for (let i = 0; i < months; i++) {
      const date = subMonths(now, months - 1 - i)
      const key = format(date, "yyyy-MM")
      monthlyStats[key] = {
        month: key,
        monthName: format(date, "MMM yy", { locale: es }),
        count: 0,
        sales: 0,
        margin: 0,
      }
    }

    // Procesar operaciones
    let totalSales = 0
    let totalMargin = 0
    let totalOperations = 0
    let confirmedOperations = 0

    for (const op of operations || []) {
      // Contar por estado
      if (statusCounts[op.status] !== undefined) {
        statusCounts[op.status]++
      }

      totalOperations++

      // Solo estadísticas financieras para operaciones confirmadas/viajadas/cerradas
      if (["CONFIRMED", "TRAVELLED", "CLOSED"].includes(op.status)) {
        confirmedOperations++
        const saleAmount = parseFloat(op.sale_amount_total) || 0
        const marginAmount = parseFloat(op.margin_amount) || 0

        totalSales += saleAmount
        totalMargin += marginAmount

        // Por destino
        const dest = op.destination || "Sin destino"
        if (!destinationStats[dest]) {
          destinationStats[dest] = {
            destination: dest,
            count: 0,
            totalSales: 0,
            totalMargin: 0,
            avgMargin: 0,
          }
        }
        destinationStats[dest].count++
        destinationStats[dest].totalSales += saleAmount
        destinationStats[dest].totalMargin += marginAmount

        // Por mes (usando departure_date)
        if (op.departure_date) {
          const monthKey = format(new Date(op.departure_date), "yyyy-MM")
          if (monthlyStats[monthKey]) {
            monthlyStats[monthKey].count++
            monthlyStats[monthKey].sales += saleAmount
            monthlyStats[monthKey].margin += marginAmount
          }
        }
      }
    }

    // Calcular promedios de destinos
    Object.values(destinationStats).forEach(d => {
      d.avgMargin = d.count > 0 ? (d.totalMargin / d.totalSales) * 100 : 0
    })

    // Top 10 destinos por ventas
    const topDestinations = Object.values(destinationStats)
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 10)

    // Conversión de estados a array
    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      label: statusLabels[status] || status,
      count,
    }))

    // Conversión de meses a array
    const monthlyTrend = Object.values(monthlyStats)

    // Estadísticas de rentabilidad
    const avgMarginPercentage = totalSales > 0 ? (totalMargin / totalSales) * 100 : 0
    const avgTicket = confirmedOperations > 0 ? totalSales / confirmedOperations : 0

    // Operaciones pendientes (próximos viajes)
    const pendingOperations = (operations || []).filter((op: any) => 
      ["CONFIRMED", "RESERVED"].includes(op.status) && 
      new Date(op.departure_date) > now
    ).length

    // Conversión rate (confirmadas / total)
    const conversionRate = totalOperations > 0 
      ? ((confirmedOperations / totalOperations) * 100) 
      : 0

    // Top vendedores
    const sellerStats: Record<string, {
      id: string
      name: string
      count: number
      sales: number
      margin: number
    }> = {}

    for (const op of operations || []) {
      if (["CONFIRMED", "TRAVELLED", "CLOSED"].includes(op.status) && op.seller_id) {
        if (!sellerStats[op.seller_id]) {
          sellerStats[op.seller_id] = {
            id: op.seller_id,
            name: 'Vendedor',
            count: 0,
            sales: 0,
            margin: 0,
          }
        }
        sellerStats[op.seller_id].count++
        sellerStats[op.seller_id].sales += parseFloat(op.sale_amount_total) || 0
        sellerStats[op.seller_id].margin += parseFloat(op.margin_amount) || 0
      }
    }

    const topSellers = Object.values(sellerStats)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)

    return NextResponse.json({
      overview: {
        totalOperations,
        confirmedOperations,
        pendingOperations,
        cancelledOperations: statusCounts.CANCELLED,
        totalSales,
        totalMargin,
        avgMarginPercentage: Math.round(avgMarginPercentage * 10) / 10,
        avgTicket: Math.round(avgTicket),
        conversionRate: Math.round(conversionRate * 10) / 10,
      },
      distributions: {
        byStatus: statusDistribution,
        byDestination: topDestinations,
      },
      trends: {
        monthly: monthlyTrend,
      },
      rankings: {
        topDestinations,
        topSellers,
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/operations/statistics:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener estadísticas" },
      { status: 500 }
    )
  }
}
