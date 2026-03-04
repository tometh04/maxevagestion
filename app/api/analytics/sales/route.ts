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
    const sellerId = searchParams.get("sellerId")

      const supabase = await createServerClient()

      // Get user agencies
      const { data: userAgencies } = await supabase
        .from("user_agencies")
        .select("agency_id")
        .eq("user_id", user.id)

      const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

      let query = supabase.from("operations").select("sale_amount_total, sale_currency, margin_amount, operator_cost, currency, created_at, departure_date")

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

      // Apply date filters using created_at (fecha de venta/carga)
      if (dateFrom) {
        query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`)
      }

      if (dateTo) {
        query = query.lte("created_at", `${dateTo}T23:59:59.999Z`)
      }

      if (agencyId && agencyId !== "ALL") {
        query = query.eq("agency_id", agencyId)
      }

      if (sellerId && sellerId !== "ALL") {
        query = query.eq("seller_id", sellerId)
      }

      const { data: operations, error } = await query

      if (error) {
        console.error("Error fetching sales data:", error)
        throw new Error("Error al obtener datos de ventas")
      }

      // Calcular totales convirtiendo todo a USD (según requisito: todo el sistema en USD)
      const operationsArray = (operations || []) as any[]

      // Batch: construir mapa de tasas de cambio en memoria (2 queries en vez de N)
      let getRate: (date: any) => number | null = () => null
      let fallbackRate = 1200
      try {
        const arsDates = operationsArray
          .filter((op: any) => (op.sale_currency || op.currency || "USD") === "ARS")
          .map((op: any) => op.departure_date || op.created_at)
        getRate = await buildExchangeRateMap(supabase, arsDates)
        fallbackRate = await getLatestExchangeRate(supabase) || 1200
      } catch (err) {
        console.error("Error building exchange rate map for sales:", err)
      }

      let totalSalesUSD = 0
      let totalMarginUSD = 0
      let totalCostUSD = 0

      for (const op of operationsArray) {
        const saleAmount = parseFloat(op.sale_amount_total || "0")
        const marginAmount = parseFloat(op.margin_amount || "0")
        const costAmount = parseFloat(op.operator_cost || "0")
        const saleCurrency = op.sale_currency || op.currency || "USD"

        let saleAmountUsd = saleAmount
        let marginAmountUsd = marginAmount
        let costAmountUsd = costAmount

        if (saleCurrency === "ARS") {
          const operationDate = op.departure_date || op.created_at
          const exchangeRate = getRate(operationDate) || fallbackRate
          saleAmountUsd = saleAmount / exchangeRate
          marginAmountUsd = marginAmount / exchangeRate
          costAmountUsd = costAmount / exchangeRate
        }

        totalSalesUSD += saleAmountUsd
        totalMarginUSD += marginAmountUsd
        totalCostUSD += costAmountUsd
      }

      const operationsCount = (operations || []).length
      const avgMarginPercent = operationsCount > 0 && totalSalesUSD > 0 ? (totalMarginUSD / totalSalesUSD) * 100 : 0

    const result = {
        totalSales: totalSalesUSD, // Ahora en USD
        totalMargin: totalMarginUSD, // Ahora en USD
        totalCost: totalCostUSD, // Ahora en USD
        operationsCount,
        avgMarginPercent,
      }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error in GET /api/analytics/sales:", error)
    return NextResponse.json({ error: error.message || "Error al obtener datos de ventas" }, { status: 500 })
  }
}

