import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const sellerId = searchParams.get("sellerId")
    const agencyId = searchParams.get("agencyId")
    const viewType = searchParams.get("viewType") || "seller" // seller, operator, product, detail

    // Base query
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

    const { data: operations, error } = await query.order("operation_date", { ascending: false }) as { data: any[] | null, error: any }

    if (error) {
      console.error("Error fetching margins report:", error)
      return NextResponse.json({ error: "Error al obtener reporte" }, { status: 500 })
    }

    // Obtener tasa de cambio más reciente como fallback
    const latestExchangeRate = await getLatestExchangeRate(supabase) || 1000

    // Calcular totales - TODO en USD (según requisito: todo el sistema en USD)
    const totals: any = {
      count: operations?.length || 0,
      total_sale_usd: 0,
      total_sale_ars: 0,
      total_cost_usd: 0,
      total_cost_ars: 0,
      total_margin_usd: 0,
      total_margin_ars: 0,
      currency: "USD", // Siempre USD según requisito
      total_sale: 0, // Total general en USD (ARS convertido + USD original)
      total_cost: 0, // Total general en USD
      total_margin: 0, // Total general en USD
      total_sale_other: 0, // Para compatibilidad (ARS sin convertir)
      total_margin_other: 0, // Para compatibilidad
      avg_margin_percent: 0,
    }

    for (const op of operations || []) {
      const saleCurrency = op.sale_currency || op.currency || "USD"
      const sale = Number(op.sale_amount_total) || 0
      const cost = Number(op.operator_cost) || 0
      const margin = Number(op.margin_amount) || 0

      // Obtener tasa de cambio histórica
      const operationDate = op.departure_date || op.operation_date || op.created_at
      let exchangeRate = await getExchangeRate(supabase, operationDate ? new Date(operationDate) : new Date())
      if (!exchangeRate) {
        exchangeRate = latestExchangeRate
      }

      // Convertir a USD
      let saleUsd = sale
      let costUsd = cost
      let marginUsd = margin

      if (saleCurrency === "ARS") {
        totals.total_sale_ars += sale
        totals.total_cost_ars += cost
        totals.total_margin_ars += margin
        
        // Convertir ARS a USD: dividir por exchange_rate
        saleUsd = sale / exchangeRate
        costUsd = cost / exchangeRate
        marginUsd = margin / exchangeRate
      } else {
        totals.total_sale_usd += sale
        totals.total_cost_usd += cost
        totals.total_margin_usd += margin
        // Ya está en USD, no necesita conversión
      }

      // Sumar al total general (siempre en USD)
      totals.total_sale += saleUsd
      totals.total_cost += costUsd
      totals.total_margin += marginUsd
    }

    // Para compatibilidad con frontend que puede usar total_sale_other
    totals.total_sale_other = totals.total_sale_ars
    totals.total_margin_other = totals.total_margin_ars

    totals.avg_margin_percent = totals.total_sale > 0 ? (totals.total_margin / totals.total_sale) * 100 : 0

    let result: any = { totals, operations: operations || [] }

    // Agrupar por vendedor
    if (viewType === "seller" || viewType === "all") {
      const bySeller: Record<string, any> = {}
      
      for (const op of operations || []) {
        const sellerId = op.seller_id || "unknown"
        const sellerName = (op.sellers as any)?.name || "Sin asignar"
        
        if (!bySeller[sellerId]) {
          bySeller[sellerId] = {
            seller_id: sellerId,
            seller_name: sellerName,
            count: 0,
            total_sale_usd: 0,
            total_sale_ars: 0,
            total_cost_usd: 0,
            total_cost_ars: 0,
            total_margin_usd: 0,
            total_margin_ars: 0,
            margins: [],
          }
        }

        bySeller[sellerId].count++
        const sale = Number(op.sale_amount_total) || 0
        const cost = Number(op.operator_cost) || 0
        const margin = Number(op.margin_amount) || 0

        if (op.currency === "ARS") {
          bySeller[sellerId].total_sale_ars += sale
          bySeller[sellerId].total_cost_ars += cost
          bySeller[sellerId].total_margin_ars += margin
        } else {
          bySeller[sellerId].total_sale_usd += sale
          bySeller[sellerId].total_cost_usd += cost
          bySeller[sellerId].total_margin_usd += margin
        }
        bySeller[sellerId].margins.push(Number(op.margin_percentage) || 0)
      }

      const sellerData = Object.values(bySeller).map((s: any) => {
        const currency = s.total_sale_ars > s.total_sale_usd ? "ARS" : "USD"
        const total_sale = currency === "ARS" ? s.total_sale_ars : s.total_sale_usd
        const total_cost = currency === "ARS" ? s.total_cost_ars : s.total_cost_usd
        const total_margin = currency === "ARS" ? s.total_margin_ars : s.total_margin_usd
        const avg_margin_percent = total_sale > 0 ? (total_margin / total_sale) * 100 : 0

        return {
          ...s,
          currency,
          total_sale,
          total_cost,
          total_margin,
          avg_margin_percent,
        }
      }).sort((a: any, b: any) => b.total_margin - a.total_margin)

      result.bySeller = sellerData
    }

    // Agrupar por operador
    if (viewType === "operator" || viewType === "all") {
      const byOperator: Record<string, any> = {}
      
      for (const op of operations || []) {
        const operatorId = op.operator_id || "unknown"
        const operatorName = (op.operators as any)?.name || "Sin operador"
        
        if (!byOperator[operatorId]) {
          byOperator[operatorId] = {
            operator_id: operatorId,
            operator_name: operatorName,
            count: 0,
            total_cost_usd: 0,
            total_cost_ars: 0,
            total_margin_usd: 0,
            total_margin_ars: 0,
            margins: [],
          }
        }

        byOperator[operatorId].count++
        const cost = Number(op.operator_cost) || 0
        const margin = Number(op.margin_amount) || 0

        if (op.currency === "ARS") {
          byOperator[operatorId].total_cost_ars += cost
          byOperator[operatorId].total_margin_ars += margin
        } else {
          byOperator[operatorId].total_cost_usd += cost
          byOperator[operatorId].total_margin_usd += margin
        }
        byOperator[operatorId].margins.push(Number(op.margin_percentage) || 0)
      }

      const operatorData = Object.values(byOperator).map((o: any) => {
        const currency = o.total_cost_ars > o.total_cost_usd ? "ARS" : "USD"
        const total_cost = currency === "ARS" ? o.total_cost_ars : o.total_cost_usd
        const total_margin = currency === "ARS" ? o.total_margin_ars : o.total_margin_usd
        const avg_margin_percent = total_cost > 0 ? (total_margin / total_cost) * 100 : 0

        return {
          ...o,
          currency,
          total_cost,
          total_margin,
          avg_margin_percent,
        }
      }).sort((a: any, b: any) => b.total_margin - a.total_margin)

      result.byOperator = operatorData
    }

    // Agrupar por tipo de producto
    if (viewType === "product" || viewType === "all") {
      const byProduct: Record<string, any> = {}
      
      for (const op of operations || []) {
        const productType = op.product_type || "Sin clasificar"
        
        if (!byProduct[productType]) {
          byProduct[productType] = {
            product_type: productType,
            count: 0,
            total_sale_usd: 0,
            total_sale_ars: 0,
            total_margin_usd: 0,
            total_margin_ars: 0,
            margins: [],
          }
        }

        byProduct[productType].count++
        const sale = Number(op.sale_amount_total) || 0
        const margin = Number(op.margin_amount) || 0

        if (op.currency === "ARS") {
          byProduct[productType].total_sale_ars += sale
          byProduct[productType].total_margin_ars += margin
        } else {
          byProduct[productType].total_sale_usd += sale
          byProduct[productType].total_margin_usd += margin
        }
        byProduct[productType].margins.push(Number(op.margin_percentage) || 0)
      }

      const productData = Object.values(byProduct).map((p: any) => {
        const currency = p.total_sale_ars > p.total_sale_usd ? "ARS" : "USD"
        const total_sale = currency === "ARS" ? p.total_sale_ars : p.total_sale_usd
        const total_margin = currency === "ARS" ? p.total_margin_ars : p.total_margin_usd
        const avg_margin_percent = total_sale > 0 ? (total_margin / total_sale) * 100 : 0

        return {
          ...p,
          currency,
          total_sale,
          total_margin,
          avg_margin_percent,
        }
      }).sort((a: any, b: any) => b.total_margin - a.total_margin)

      result.byProduct = productData
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in GET /api/reports/margins:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

