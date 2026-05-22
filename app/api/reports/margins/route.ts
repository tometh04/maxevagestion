import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  buildExchangeRateMap,
  getLatestExchangeRate,
  DEFAULT_USD_ARS_FALLBACK_RATE,
} from "@/lib/accounting/exchange-rates"

/**
 * GET /api/reports/margins
 *
 * Devuelve el reporte de márgenes agrupado por vendedor, operador, producto
 * o como detalle de operaciones. Multi-moneda: NO colapsa a una sola moneda
 * por fila — cada fila trae buckets ARS y USD separados, más un equivalente
 * en USD para ordenar el ranking.
 *
 * Bug histórico que esto arregla: la versión anterior elegía la "moneda
 * dominante" por fila con `total_sale_ars > total_sale_usd ? "ARS" : "USD"`
 * y descartaba la otra. Yami lo reportó: "los vendedores que aparecen en
 * pesos también tienen ventas en dólares y no se ven". Confirmado en código.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // 🔴 Fix cross-tenant CRÍTICO (2026-05-18, sweep /reports/*): defense-in-depth
    // RLS no está protegiendo confiablemente; agregamos .eq("org_id", user.org_id)
    // explícito a la query de operations.
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const sellerId = searchParams.get("sellerId")
    const agencyId = searchParams.get("agencyId")
    const viewType = searchParams.get("viewType") || "seller" // seller, operator, product, detail

    // Base query — RLS + filtro explícito (defense-in-depth)
    let query = (supabase
      .from("operations") as any)
      .select(`
        id,
        file_code,
        destination,
        operation_date,
        departure_date,
        sale_amount_total,
        sale_currency,
        operator_cost,
        margin_amount,
        margin_percentage,
        currency,
        status,
        product_type,
        seller_id,
        agency_id,
        operator_id,
        sellers:seller_id(id, name),
        agencies:agency_id(id, name),
        operators:operator_id(id, name)
      `)
      .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
      .not("status", "eq", "CANCELLED")

    // Filtros de fecha
    if (dateFrom) {
      query = query.gte("operation_date", dateFrom)
    }
    if (dateTo) {
      query = query.lte("operation_date", dateTo)
    }

    // Filtro de vendedor
    if (sellerId && sellerId !== "ALL" && sellerId !== "") {
      query = query.eq("seller_id", sellerId)
    } else if (user.role === "SELLER") {
      query = query.eq("seller_id", user.id)
    }

    // Filtro de agencia
    if (agencyId && agencyId !== "ALL" && agencyId !== "") {
      query = query.eq("agency_id", agencyId)
    }

    const { data: operations, error } = (await query.order("operation_date", {
      ascending: false,
    })) as { data: any[] | null; error: any }

    if (error) {
      console.error("Error fetching margins report:", error)
      return NextResponse.json({ error: "Error al obtener reporte" }, { status: 500 })
    }

    // -----------------------------------------------------------------------
    // FX map: una sola query batched para todas las fechas en el rango
    // (antes hacía 1 query por operation = N+1 lento). Reutiliza tasas
    // contiguas y cachea fallback latest.
    // -----------------------------------------------------------------------
    const opDates = (operations || []).map(
      (op: any) => op.departure_date || op.operation_date || op.created_at
    )
    const fxLookup = await buildExchangeRateMap(supabase as any, opDates)
    const latestExchangeRate =
      (await getLatestExchangeRate(supabase as any)) || DEFAULT_USD_ARS_FALLBACK_RATE

    /**
     * Convierte un monto a USD-equivalente. ARS se divide por la tasa.
     * USD se devuelve tal cual. Si no hay tasa, usa la más reciente.
     */
    const toUsd = (amount: number, currency: string, opDate: string | null): number => {
      if (currency !== "ARS") return amount
      const rate = fxLookup(opDate) || latestExchangeRate
      return rate > 0 ? amount / rate : 0
    }

    // -----------------------------------------------------------------------
    // Totales globales (KPIs top): siempre se consolidan a USD-equiv.
    // Mantenemos también total_sale_ars/usd separados para retro-compat.
    // -----------------------------------------------------------------------
    const totals: any = {
      count: operations?.length || 0,
      total_sale_usd: 0,
      total_sale_ars: 0,
      total_cost_usd: 0,
      total_cost_ars: 0,
      total_margin_usd: 0,
      total_margin_ars: 0,
      currency: "USD", // KPI top siempre en USD
      total_sale: 0,
      total_cost: 0,
      total_margin: 0,
      total_sale_other: 0,
      total_margin_other: 0,
      avg_margin_percent: 0,
    }

    for (const op of operations || []) {
      const saleCurrency = op.sale_currency || op.currency || "USD"
      const sale = Number(op.sale_amount_total) || 0
      const cost = Number(op.operator_cost) || 0
      const margin = Number(op.margin_amount) || 0
      const opDate = op.departure_date || op.operation_date || op.created_at

      if (saleCurrency === "ARS") {
        totals.total_sale_ars += sale
        totals.total_cost_ars += cost
        totals.total_margin_ars += margin
      } else {
        totals.total_sale_usd += sale
        totals.total_cost_usd += cost
        totals.total_margin_usd += margin
      }

      totals.total_sale += toUsd(sale, saleCurrency, opDate)
      totals.total_cost += toUsd(cost, saleCurrency, opDate)
      totals.total_margin += toUsd(margin, saleCurrency, opDate)
    }

    totals.total_sale_other = totals.total_sale_ars
    totals.total_margin_other = totals.total_margin_ars
    totals.avg_margin_percent =
      totals.total_sale > 0 ? (totals.total_margin / totals.total_sale) * 100 : 0

    const result: any = { totals, operations: operations || [] }

    // -----------------------------------------------------------------------
    // Helper: agrupa operaciones por una key arbitraria. Cada bucket de salida
    // mantiene ARS y USD separados Y un total_*_usd_equiv para ordenar/calcular
    // % margen sin perder ninguna moneda.
    // -----------------------------------------------------------------------
    type GroupBucket = {
      key: string
      meta: Record<string, any>
      count: number
      total_sale_ars: number
      total_sale_usd: number
      total_cost_ars: number
      total_cost_usd: number
      total_margin_ars: number
      total_margin_usd: number
      total_sale_usd_equiv: number
      total_cost_usd_equiv: number
      total_margin_usd_equiv: number
    }

    const groupOperations = (
      keyOf: (op: any) => string,
      metaOf: (op: any) => Record<string, any>
    ): GroupBucket[] => {
      const buckets = new Map<string, GroupBucket>()

      for (const op of operations || []) {
        const key = keyOf(op)
        let bucket = buckets.get(key)
        if (!bucket) {
          bucket = {
            key,
            meta: metaOf(op),
            count: 0,
            total_sale_ars: 0,
            total_sale_usd: 0,
            total_cost_ars: 0,
            total_cost_usd: 0,
            total_margin_ars: 0,
            total_margin_usd: 0,
            total_sale_usd_equiv: 0,
            total_cost_usd_equiv: 0,
            total_margin_usd_equiv: 0,
          }
          buckets.set(key, bucket)
        }

        bucket.count++

        const sale = Number(op.sale_amount_total) || 0
        const cost = Number(op.operator_cost) || 0
        const margin = Number(op.margin_amount) || 0
        const saleCur = op.sale_currency || op.currency || "USD"
        const opDate = op.departure_date || op.operation_date || op.created_at

        if (saleCur === "ARS") {
          bucket.total_sale_ars += sale
          bucket.total_cost_ars += cost
          bucket.total_margin_ars += margin
        } else {
          bucket.total_sale_usd += sale
          bucket.total_cost_usd += cost
          bucket.total_margin_usd += margin
        }

        bucket.total_sale_usd_equiv += toUsd(sale, saleCur, opDate)
        bucket.total_cost_usd_equiv += toUsd(cost, saleCur, opDate)
        bucket.total_margin_usd_equiv += toUsd(margin, saleCur, opDate)
      }

      return Array.from(buckets.values())
    }

    // -----------------------------------------------------------------------
    // Agrupar por vendedor
    // -----------------------------------------------------------------------
    if (viewType === "seller" || viewType === "all") {
      const buckets = groupOperations(
        (op) => op.seller_id || "unknown",
        (op) => ({
          seller_id: op.seller_id || "unknown",
          seller_name: (op.sellers as any)?.name || "Sin asignar",
        })
      )

      result.bySeller = buckets
        .map((b) => ({
          seller_id: b.meta.seller_id,
          seller_name: b.meta.seller_name,
          count: b.count,
          total_sale_ars: b.total_sale_ars,
          total_sale_usd: b.total_sale_usd,
          total_cost_ars: b.total_cost_ars,
          total_cost_usd: b.total_cost_usd,
          total_margin_ars: b.total_margin_ars,
          total_margin_usd: b.total_margin_usd,
          total_sale_usd_equiv: b.total_sale_usd_equiv,
          total_margin_usd_equiv: b.total_margin_usd_equiv,
          avg_margin_percent:
            b.total_sale_usd_equiv > 0
              ? (b.total_margin_usd_equiv / b.total_sale_usd_equiv) * 100
              : 0,
        }))
        .sort((a, b) => b.total_margin_usd_equiv - a.total_margin_usd_equiv)
    }

    // -----------------------------------------------------------------------
    // Agrupar por operador
    // -----------------------------------------------------------------------
    if (viewType === "operator" || viewType === "all") {
      const buckets = groupOperations(
        (op) => op.operator_id || "unknown",
        (op) => ({
          operator_id: op.operator_id || "unknown",
          operator_name: (op.operators as any)?.name || "Sin operador",
        })
      )

      result.byOperator = buckets
        .map((b) => ({
          operator_id: b.meta.operator_id,
          operator_name: b.meta.operator_name,
          count: b.count,
          total_cost_ars: b.total_cost_ars,
          total_cost_usd: b.total_cost_usd,
          total_margin_ars: b.total_margin_ars,
          total_margin_usd: b.total_margin_usd,
          total_cost_usd_equiv: b.total_cost_usd_equiv,
          total_margin_usd_equiv: b.total_margin_usd_equiv,
          // Para operadores, % margen se calcula sobre costo (revenue del operador
          // = costo nuestro). Mantenemos la convención que ya tenía el endpoint.
          avg_margin_percent:
            b.total_cost_usd_equiv > 0
              ? (b.total_margin_usd_equiv / b.total_cost_usd_equiv) * 100
              : 0,
        }))
        .sort((a, b) => b.total_margin_usd_equiv - a.total_margin_usd_equiv)
    }

    // -----------------------------------------------------------------------
    // Agrupar por tipo de producto
    // -----------------------------------------------------------------------
    if (viewType === "product" || viewType === "all") {
      const buckets = groupOperations(
        (op) => op.product_type || "Sin clasificar",
        (op) => ({
          product_type: op.product_type || "Sin clasificar",
        })
      )

      result.byProduct = buckets
        .map((b) => ({
          product_type: b.meta.product_type,
          count: b.count,
          total_sale_ars: b.total_sale_ars,
          total_sale_usd: b.total_sale_usd,
          total_margin_ars: b.total_margin_ars,
          total_margin_usd: b.total_margin_usd,
          total_sale_usd_equiv: b.total_sale_usd_equiv,
          total_margin_usd_equiv: b.total_margin_usd_equiv,
          avg_margin_percent:
            b.total_sale_usd_equiv > 0
              ? (b.total_margin_usd_equiv / b.total_sale_usd_equiv) * 100
              : 0,
        }))
        .sort((a, b) => b.total_margin_usd_equiv - a.total_margin_usd_equiv)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in GET /api/reports/margins:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
