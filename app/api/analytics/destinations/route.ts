import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { buildExchangeRateMap, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

// Forzar ruta dinámica (usa cookies para autenticación)
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId")
    const limit = searchParams.get("limit") || "5"

      const supabase = await createServerClient()

      // Get user agencies
      const { data: userAgencies } = await supabase
        .from("user_agencies")
        .select("agency_id")
        .eq("user_id", user.id)

      const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

      // Select sale_currency and departure_date for currency conversion
      let query = supabase.from("operations").select("destination, sale_amount_total, sale_currency, margin_amount, currency, departure_date, created_at")

      // Apply role-based filtering
      if (user.role === "SELLER") {
        query = query.eq("seller_id", user.id)
      } else if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
        query = query.in("agency_id", agencyIds)
      }

      // Validate date format if provided
      if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
        console.error("Invalid dateFrom format:", dateFrom)
        return NextResponse.json({ error: "Formato de fecha inválido (dateFrom)" }, { status: 400 })
      }

      if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        console.error("Invalid dateTo format:", dateTo)
        return NextResponse.json({ error: "Formato de fecha inválido (dateTo)" }, { status: 400 })
      }

      // Apply filters
      if (dateFrom) {
        query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`)
      }

      if (dateTo) {
        query = query.lte("created_at", `${dateTo}T23:59:59.999Z`)
      }

      if (agencyId && agencyId !== "ALL") {
        query = query.eq("agency_id", agencyId)
      }

      const { data: operations, error } = await query

      if (error) {
        console.error("Error fetching destinations data:", error)
        throw new Error("Error al obtener datos de destinos")
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
        console.error("Error building exchange rate map for destinations:", err)
      }

      // Group by destination, converting ARS to USD
      const destinationStats = operationsArray.reduce((acc: any, op: any) => {
        const destination = op.destination || "Sin destino"

        if (!acc[destination]) {
          acc[destination] = {
            destination,
            totalSales: 0,
            totalMargin: 0,
            operationsCount: 0,
          }
        }

        const saleAmount = parseFloat(op.sale_amount_total || "0")
        const marginAmount = parseFloat(op.margin_amount || "0")
        const saleCurrency = op.sale_currency || op.currency || "USD"

        let saleAmountUsd = saleAmount
        let marginAmountUsd = marginAmount

        if (saleCurrency === "ARS") {
          const operationDate = op.departure_date || op.created_at
          const exchangeRate = getRate(operationDate) || fallbackRate
          saleAmountUsd = saleAmount / exchangeRate
          marginAmountUsd = marginAmount / exchangeRate
        }

        acc[destination].totalSales += saleAmountUsd
        acc[destination].totalMargin += marginAmountUsd
        acc[destination].operationsCount += 1

        return acc
      }, {})

      const destinations = Object.values(destinationStats)
        .map((dest: any) => ({
          ...dest,
          avgMarginPercent: dest.totalSales > 0 ? (dest.totalMargin / dest.totalSales) * 100 : 0,
        }))
        .sort((a: any, b: any) => b.totalSales - a.totalSales)
        .slice(0, Number(limit))

    return NextResponse.json({ destinations })
  } catch (error: any) {
    console.error("Error in GET /api/analytics/destinations:", error)
    return NextResponse.json({ error: error.message || "Error al obtener datos de destinos" }, { status: 500 })
  }
}
