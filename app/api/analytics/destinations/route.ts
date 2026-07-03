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
    const limit = searchParams.get("limit") || "5"
    // 2026-05-22 (VICO): dateField permite elegir columna.
    const dateField = parseOperationDateField(searchParams.get("dateField"))

    // Validate date format ANTES del fast-path RPC
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
      // FAST PATH: RPC analytics_destinations_summary
      // ============================================
      // GROUP BY destination en SQL en vez de fetch + JS reduce.
      // Si la RPC falla, cae al código viejo intacto.
      //
      // OJO: el RPC solo filtra por created_at. Si el caller pidió otro
      // dateField, saltamos el RPC para que el fallback respete dateField.
      const includeServicesRpc = (user as any).org_id
        ? await getOrgFeatureFlag(supabase, (user as any).org_id, FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL)
        : false
      if (dateField === "created_at") {
      try {
        const t0 = Date.now()
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
          "analytics_destinations_summary",
          {
            p_user_id: user.id,
            p_org_id: (user as any).org_id || null,
            p_role: user.role,
            p_agency_ids: agencyIds,
            p_date_from: dateFrom || null,
            p_date_to: dateTo || null,
            p_agency_id: agencyId && agencyId !== "ALL" ? agencyId : null,
            p_limit: parseInt(limit, 10) || 5,
            p_include_services: includeServicesRpc,
          }
        )
        if (!rpcError && Array.isArray(rpcData)) {
          const destinations = rpcData.map((row: any) => ({
            destination: row.destination,
            totalSales: Number(row.total_sales) || 0,
            totalMargin: Number(row.total_margin) || 0,
            operationsCount: Number(row.operations_count) || 0,
            avgMarginPercent: Number(row.avg_margin_percent) || 0,
          }))
          console.log(`[analytics/destinations] RPC fast-path ok in ${Date.now() - t0}ms → ${destinations.length} rows`)
          return NextResponse.json({ destinations }, {
            headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' }
          })
        }
        if (rpcError) {
          console.warn("[analytics/destinations] RPC failed, falling back to JS:", rpcError.message)
        }
      } catch (rpcEx: any) {
        console.warn("[analytics/destinations] RPC threw, falling back to JS:", rpcEx?.message || rpcEx)
      }
      } // /if (dateField === "created_at")

      // ============================================
      // FALLBACK: lógica vieja (intacta)
      // ============================================
      // Select sale_currency and departure_date for currency conversion
      let query = supabase.from("operations").select("id, destination, destination_id, sale_amount_total, sale_currency, margin_amount, currency, departure_date, created_at, destinations:destination_id(name)")

      // Multi-tenant: scope por org del usuario
      if (user.org_id) query = query.eq("org_id", user.org_id)

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

      // 2026-05-22 (VICO): usar la columna que eligió el caller via dateField.
      if (dateFrom) {
        query = query.gte(dateField, `${dateFrom}T00:00:00.000Z`)
      }

      if (dateTo) {
        query = query.lte(dateField, `${dateTo}T23:59:59.999Z`)
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
      let fallbackRate = DEFAULT_USD_ARS_FALLBACK_RATE
      try {
        const arsDates = operationsArray
          .filter((op: any) => (op.sale_currency || op.currency || "USD") === "ARS")
          .map((op: any) => op.departure_date || op.created_at)
        getRate = await buildExchangeRateMap(supabase, arsDates)
        fallbackRate = await getLatestExchangeRate(supabase) || DEFAULT_USD_ARS_FALLBACK_RATE
      } catch (err) {
        console.error("Error building exchange rate map for destinations:", err)
      }

      // Servicios adicionales (operation_services): si la flag está ON, sumamos
      // su venta a sale_amount_total para que la venta bruta por destino refleje
      // también los servicios extra vendidos al cliente.
      const includeServices = (user as any).org_id
        ? await getOrgFeatureFlag(supabase, (user as any).org_id, FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL)
        : false
      const opsList = operationsArray.map((op: any) => ({
        id: op.id, sale_currency: op.sale_currency, currency: op.currency,
      }))
      const serviceExtras = includeServices && opsList.length > 0
        ? await getServiceExtrasByOperation(supabase, opsList, (user as any).org_id)
        : {}

      // Group by destination, using canonical name from destinations table when available
      const destinationStats = operationsArray.reduce((acc: any, op: any) => {
        const destination = op.destinations?.name || op.destination || "Sin destino"

        if (!acc[destination]) {
          acc[destination] = {
            destination,
            totalSales: 0,
            totalMargin: 0,
            operationsCount: 0,
          }
        }

        const saleAmount = (parseFloat(op.sale_amount_total || "0") || 0) + ((serviceExtras as any)[op.id]?.saleExtra || 0)
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

    return NextResponse.json({ destinations }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' }
    })
  } catch (error: any) {
    console.error("Error in GET /api/analytics/destinations:", error)
    return NextResponse.json({ error: error.message || "Error al obtener datos de destinos" }, { status: 500 })
  }
}
