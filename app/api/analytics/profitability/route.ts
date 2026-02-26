import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns"
import { buildExchangeRateMap, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Parámetros de filtro
    const months = parseInt(searchParams.get("months") || "6")
    const agencyId = searchParams.get("agencyId")

    // Obtener agencias del usuario
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Fecha de inicio (N meses atrás)
    const startDate = startOfMonth(subMonths(new Date(), months - 1))
    const endDate = endOfMonth(new Date())

    // Query base - include sale_currency for conversion
    let query = (supabase.from("operations") as any)
      .select("destination, sale_amount_total, sale_currency, operator_cost, margin_amount, margin_percentage, currency, departure_date, created_at")
      .in("status", ["CONFIRMED", "TRAVELLED", "CLOSED"])
      .gte("departure_date", startDate.toISOString())
      .lte("departure_date", endDate.toISOString())

    // Filtrar por agencia
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      query = query.in("agency_id", agencyIds)
    }

    const { data: operations, error } = await query

    if (error) {
      console.error("Error fetching operations:", error)
      return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 })
    }

    const operationsArray = (operations || []) as any[]

    // Build exchange rate map for ARS operations
    let getRate: (date: any) => number | null = () => null
    let fallbackRate = 1200
    try {
      const arsDates = operationsArray
        .filter((op: any) => (op.sale_currency || op.currency || "USD") === "ARS")
        .map((op: any) => op.departure_date || op.created_at)
      getRate = await buildExchangeRateMap(supabase, arsDates)
      fallbackRate = await getLatestExchangeRate(supabase) || 1200
    } catch (err) {
      console.error("Error building exchange rate map for profitability:", err)
    }

    // Agrupar por destino (convertido a USD)
    const byDestination: Record<string, {
      destination: string
      totalSales: number
      totalCost: number
      totalMargin: number
      operationCount: number
      avgMarginPercentage: number
    }> = {}

    for (const op of operationsArray) {
      const dest = op.destination || "Sin destino"
      if (!byDestination[dest]) {
        byDestination[dest] = {
          destination: dest,
          totalSales: 0,
          totalCost: 0,
          totalMargin: 0,
          operationCount: 0,
          avgMarginPercentage: 0,
        }
      }

      const saleAmount = parseFloat(op.sale_amount_total || "0")
      const costAmount = parseFloat(op.operator_cost || "0")
      const marginAmount = parseFloat(op.margin_amount || "0")
      const saleCurrency = op.sale_currency || op.currency || "USD"

      let saleUsd = saleAmount
      let costUsd = costAmount
      let marginUsd = marginAmount

      if (saleCurrency === "ARS") {
        const operationDate = op.departure_date || op.created_at
        const exchangeRate = getRate(operationDate) || fallbackRate
        saleUsd = saleAmount / exchangeRate
        costUsd = costAmount / exchangeRate
        marginUsd = marginAmount / exchangeRate
      }

      byDestination[dest].totalSales += saleUsd
      byDestination[dest].totalCost += costUsd
      byDestination[dest].totalMargin += marginUsd
      byDestination[dest].operationCount += 1
    }

    // Calcular promedio de margen
    const destinations = Object.values(byDestination).map(d => ({
      ...d,
      avgMarginPercentage: d.totalSales > 0 ? (d.totalMargin / d.totalSales) * 100 : 0,
    }))

    // Ordenar por margen total (más rentables primero)
    destinations.sort((a, b) => b.totalMargin - a.totalMargin)

    // Calcular totales
    const totals = {
      totalSales: destinations.reduce((sum, d) => sum + d.totalSales, 0),
      totalCost: destinations.reduce((sum, d) => sum + d.totalCost, 0),
      totalMargin: destinations.reduce((sum, d) => sum + d.totalMargin, 0),
      totalOperations: destinations.reduce((sum, d) => sum + d.operationCount, 0),
      avgMarginPercentage: 0,
    }
    totals.avgMarginPercentage = totals.totalSales > 0 ? (totals.totalMargin / totals.totalSales) * 100 : 0

    // Top 5 más rentables
    const topProfitable = destinations.slice(0, 5)

    // Top 5 con mayor volumen
    const topVolume = [...destinations].sort((a, b) => b.totalSales - a.totalSales).slice(0, 5)

    return NextResponse.json({
      success: true,
      period: {
        start: format(startDate, "yyyy-MM-dd"),
        end: format(endDate, "yyyy-MM-dd"),
        months,
      },
      totals,
      byDestination: destinations,
      topProfitable,
      topVolume,
    })
  } catch (error: any) {
    console.error("Error in profitability analytics:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
