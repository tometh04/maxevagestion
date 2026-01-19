import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns"
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

    // Query de operaciones
    let operationsQuery = (supabase.from("operations") as any)
      .select(`
        id,
        destination,
        status,
        sale_amount_total,
        sale_currency,
        operator_cost,
        margin_amount,
        margin_percentage,
        currency,
        departure_date,
        created_at,
        agency_id,
        seller_id
      `)
      .gte("departure_date", filterFrom.toISOString())
      .lte("departure_date", filterTo.toISOString())

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

    // Obtener vendedores
    const sellerIds = Array.from(new Set((operations || []).map((op: any) => op.seller_id).filter(Boolean)))
    let sellersMap: Record<string, string> = {}
    
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", sellerIds)
      
      if (sellers) {
        sellers.forEach((s: any) => {
          sellersMap[s.id] = s.full_name || "Sin nombre"
        })
      }
    }

    // Obtener pagos para calcular cobrado vs deuda
    const operationIds = (operations || []).map((op: any) => op.id)
    let paymentsData: any[] = []
    
    if (operationIds.length > 0) {
      const { data: payments } = await supabase
        .from("payments")
        .select("operation_id, amount, amount_usd, currency, exchange_rate, status")
        .in("operation_id", operationIds)
        .eq("direction", "INCOME")
        .eq("payer_type", "CUSTOMER")
        .eq("status", "PAID")
      
      paymentsData = payments || []
    }

    // Agrupar pagos por operación
    const paymentsByOperation: Record<string, number> = {}
    for (const payment of paymentsData) {
      if (!paymentsByOperation[payment.operation_id]) {
        paymentsByOperation[payment.operation_id] = 0
      }
      // Calcular en USD
      let amountUsd = payment.amount_usd || 0
      if (!amountUsd && payment.currency === "ARS" && payment.exchange_rate) {
        amountUsd = payment.amount / payment.exchange_rate
      } else if (!amountUsd && payment.currency === "USD") {
        amountUsd = payment.amount
      }
      paymentsByOperation[payment.operation_id] += amountUsd
    }

    // Obtener tasa de cambio más reciente como fallback
    const latestExchangeRate = await getLatestExchangeRate(supabase) || 1000

    // Procesar operaciones
    let totalSales = 0
    let totalMargin = 0
    let totalCollected = 0
    let totalDebt = 0
    let totalOperations = 0
    let confirmedOperations = 0

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
      collected: number
    }> = {}

    // Inicializar meses en el rango
    let currentDate = startOfMonth(filterFrom)
    while (currentDate <= filterTo) {
      const key = format(currentDate, "yyyy-MM")
      monthlyStats[key] = {
        month: key,
        monthName: format(currentDate, "MMM yy", { locale: es }),
        count: 0,
        sales: 0,
        margin: 0,
        collected: 0,
      }
      currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1))
    }

    // Estadísticas por vendedor
    const sellerStats: Record<string, {
      id: string
      name: string
      count: number
      sales: number
      margin: number
    }> = {}

    for (const op of operations || []) {
      totalOperations++

      // Solo estadísticas financieras para operaciones confirmadas/viajadas
      if (["CONFIRMED", "TRAVELLED", "RESERVED"].includes(op.status)) {
        confirmedOperations++
        const saleCurrency = op.sale_currency || op.currency || "USD"
        const saleAmount = parseFloat(op.sale_amount_total) || 0
        const marginAmount = parseFloat(op.margin_amount) || 0

        // Convertir a USD
        let saleAmountUsd = saleAmount
        let marginAmountUsd = marginAmount
        
        if (saleCurrency === "ARS") {
          const operationDate = op.departure_date || op.created_at
          let exchangeRate = await getExchangeRate(supabase, operationDate ? new Date(operationDate) : new Date())
          if (!exchangeRate) {
            exchangeRate = latestExchangeRate
          }
          saleAmountUsd = saleAmount / exchangeRate
          marginAmountUsd = marginAmount / exchangeRate
        }

        totalSales += saleAmountUsd
        totalMargin += marginAmountUsd

        // Cobrado para esta operación
        const collectedUsd = paymentsByOperation[op.id] || 0
        totalCollected += collectedUsd
        totalDebt += Math.max(0, saleAmountUsd - collectedUsd)

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
        destinationStats[dest].totalSales += saleAmountUsd
        destinationStats[dest].totalMargin += marginAmountUsd

        // Por mes
        if (op.departure_date) {
          const monthKey = format(new Date(op.departure_date), "yyyy-MM")
          if (monthlyStats[monthKey]) {
            monthlyStats[monthKey].count++
            monthlyStats[monthKey].sales += saleAmountUsd
            monthlyStats[monthKey].margin += marginAmountUsd
            monthlyStats[monthKey].collected += collectedUsd
          }
        }

        // Por vendedor
        if (op.seller_id) {
          if (!sellerStats[op.seller_id]) {
            sellerStats[op.seller_id] = {
              id: op.seller_id,
              name: sellersMap[op.seller_id] || 'Sin asignar',
              count: 0,
              sales: 0,
              margin: 0,
            }
          }
          sellerStats[op.seller_id].count++
          sellerStats[op.seller_id].sales += saleAmountUsd
          sellerStats[op.seller_id].margin += marginAmountUsd
        }
      }
    }

    // Calcular promedios de destinos
    Object.values(destinationStats).forEach(d => {
      d.avgMargin = d.totalSales > 0 ? (d.totalMargin / d.totalSales) * 100 : 0
    })

    // Top 10 destinos por ventas
    const topDestinations = Object.values(destinationStats)
      .filter(d => d.count > 0)
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 10)

    // Conversión de meses a array
    const monthlyTrend = Object.values(monthlyStats).sort((a, b) => a.month.localeCompare(b.month))

    // Estadísticas de rentabilidad
    const avgMarginPercentage = totalSales > 0 ? (totalMargin / totalSales) * 100 : 0
    const avgTicket = confirmedOperations > 0 ? totalSales / confirmedOperations : 0

    // Top vendedores
    const topSellers = Object.values(sellerStats)
      .filter(s => s.count > 0)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)

    return NextResponse.json({
      overview: {
        totalOperations,
        confirmedOperations,
        totalSales: Math.round(totalSales * 100) / 100,
        totalMargin: Math.round(totalMargin * 100) / 100,
        totalCollected: Math.round(totalCollected * 100) / 100,
        totalDebt: Math.round(totalDebt * 100) / 100,
        avgMarginPercentage: Math.round(avgMarginPercentage * 10) / 10,
        avgTicket: Math.round(avgTicket),
      },
      trends: {
        monthly: monthlyTrend,
      },
      rankings: {
        topDestinations,
        topSellers,
      },
      filters: {
        dateFrom: format(filterFrom, "yyyy-MM-dd"),
        dateTo: format(filterTo, "yyyy-MM-dd"),
      }
    })
  } catch (error: any) {
    console.error("Error in GET /api/operations/statistics:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener estadísticas" },
      { status: 500 }
    )
  }
}
