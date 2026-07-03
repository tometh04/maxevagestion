import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { buildExchangeRateMap, getLatestExchangeRate, DEFAULT_USD_ARS_FALLBACK_RATE } from "@/lib/accounting/exchange-rates"
import { parseOperationDateField } from "@/lib/analytics/date-filter"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL } from "@/lib/feature-flags"
import { getServiceExtrasByOperation } from "@/lib/accounting/operation-services-debt"

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
    // 2026-05-22: dateField permite elegir entre created_at (carga),
    // operation_date (venta) o departure_date (salida). Default legacy
    // = created_at. Whitelist en lib/analytics/date-filter.ts.
    const dateField = parseOperationDateField(searchParams.get("dateField"))

      // Validate date format if provided (mantener antes del fast-path RPC)
      if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
        console.error("Invalid dateFrom format:", dateFrom)
        return NextResponse.json({ error: "Formato de fecha inválido (dateFrom)" }, { status: 400 })
      }
      if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        console.error("Invalid dateTo format:", dateTo)
        return NextResponse.json({ error: "Formato de fecha inválido (dateTo)" }, { status: 400 })
      }

      const supabase = await createServerClient()

      // Get user agencies
      const { data: userAgencies } = await supabase
        .from("user_agencies")
        .select("agency_id")
        .eq("user_id", user.id)

      const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

      // ============================================
      // FAST PATH: RPC analytics_sales_summary (A3)
      // ============================================
      // Intenta calcular vía SUM SQL en una sola query. Si falla por
      // cualquier motivo (RPC no existe, error, edge case raro), cae al
      // código viejo de abajo. Validado side-by-side: numbers matchean
      // exacto vs el JS sum loop.
      //
      // OJO: el RPC solo filtra por created_at. Si el caller pidió otro
      // dateField, saltamos el RPC para que el fallback respete dateField.
      // Flag per-org: sumar operation_services a venta/margen/costo también en el fast-path.
      const includeServicesRpc = await getOrgFeatureFlag(
        supabase, user.org_id, FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
      )
      if (dateField === "created_at") {
      try {
        const t0 = Date.now()
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
          "analytics_sales_summary",
          {
            p_user_id: user.id,
            p_org_id: user.org_id || null,
            p_role: user.role,
            p_agency_ids: agencyIds,
            p_date_from: dateFrom || null,
            p_date_to: dateTo || null,
            p_agency_id: agencyId && agencyId !== "ALL" ? agencyId : null,
            p_seller_id: sellerId && sellerId !== "ALL" ? sellerId : null,
            p_include_services: includeServicesRpc,
          }
        )

        if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
          const row = rpcData[0] as any
          const result = {
            totalSales: Number(row.total_sales_usd) || 0,
            totalMargin: Number(row.total_margin_usd) || 0,
            totalCost: Number(row.total_cost_usd) || 0,
            operationsCount: Number(row.operations_count) || 0,
            avgMarginPercent: Number(row.avg_margin_percent) || 0,
          }
          console.log(`[analytics/sales] RPC fast-path ok in ${Date.now() - t0}ms`)
          return NextResponse.json(result, {
            headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' }
          })
        }
        // Si la RPC no existe en la DB todavía o devolvió shape raro,
        // logueamos y caemos al fallback. NO throw — queremos seguir.
        if (rpcError) {
          console.warn("[analytics/sales] RPC failed, falling back to JS:", rpcError.message)
        }
      } catch (rpcEx: any) {
        console.warn("[analytics/sales] RPC threw, falling back to JS:", rpcEx?.message || rpcEx)
      }
      } // /if (dateField === "created_at")

      // ============================================
      // FALLBACK: lógica vieja (intacta) — fetch + JS sum
      // ============================================

      // Bug fix 2026-05-15 (P0 cross-tenant): si user.org_id era null,
      // el query no filtraba por nada → leak total. Ahora fail-safe.
      if (!user.org_id) {
        return NextResponse.json({ totals: {}, byMonth: [], message: "user sin org_id" })
      }

      let query = supabase.from("operations").select("id, sale_amount_total, sale_currency, margin_amount, operator_cost, currency, created_at, departure_date")
        .eq("org_id", user.org_id)

      // Apply role-based filtering
      if (user.role === "SELLER") {
        query = query.eq("seller_id", user.id)
      } else if (agencyIds.length > 0) {
        // Siempre scopear por las agencias del user (ya filtradas a su org).
        // Sin bypass de SUPER_ADMIN: en SaaS, SUPER_ADMIN es owner de la org.
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

      // 2026-05-22: usamos la columna que el caller eligió vía dateField.
      // Default = created_at (legacy). Postgres acepta el string con tiempo
      // tanto para columnas TIMESTAMP como DATE (descarta el time si es DATE).
      if (dateFrom) {
        query = query.gte(dateField, `${dateFrom}T00:00:00.000Z`)
      }

      if (dateTo) {
        query = query.lte(dateField, `${dateTo}T23:59:59.999Z`)
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
      let fallbackRate = DEFAULT_USD_ARS_FALLBACK_RATE
      try {
        const arsDates = operationsArray
          .filter((op: any) => (op.sale_currency || op.currency || "USD") === "ARS")
          .map((op: any) => op.departure_date || op.created_at)
        getRate = await buildExchangeRateMap(supabase, arsDates)
        fallbackRate = await getLatestExchangeRate(supabase) || DEFAULT_USD_ARS_FALLBACK_RATE
      } catch (err) {
        console.error("Error building exchange rate map for sales:", err)
      }

      // Servicios adicionales (operation_services): si la flag está ON, sumamos
      // su venta a sale_amount_total para que la venta bruta refleje también los
      // servicios extra vendidos al cliente.
      const includeServices = await getOrgFeatureFlag(
        supabase, user.org_id, FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
      )
      const opsList = operationsArray.map((op: any) => ({
        id: op.id, sale_currency: op.sale_currency, currency: op.currency,
      }))
      const serviceExtras = includeServices && opsList.length > 0
        ? await getServiceExtrasByOperation(supabase, opsList, user.org_id)
        : {}

      let totalSalesUSD = 0
      let totalMarginUSD = 0
      let totalCostUSD = 0

      for (const op of operationsArray) {
        const saleAmount = (parseFloat(op.sale_amount_total || "0") || 0) + ((serviceExtras as any)[op.id]?.saleExtra || 0)
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

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' }
    })
  } catch (error: any) {
    console.error("Error in GET /api/analytics/sales:", error)
    return NextResponse.json({ error: error.message || "Error al obtener datos de ventas" }, { status: 500 })
  }
}

