import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const sellerId = searchParams.get("sellerId")
    const agencyId = searchParams.get("agencyId")
    const groupBy = searchParams.get("groupBy") || "day" // day, week, month

    // Base query
    let query = (supabase
      .from("operations") as any)
      .select(`
        id,
        destination,
        operation_date,
        departure_date,
        sale_amount_total,
        operator_cost,
        margin_amount,
        margin_percentage,
        currency,
        status,
        seller_id,
        agency_id,
        sellers:seller_id(id, name),
        agencies:agency_id(id, name)
      `)
      .not("status", "eq", "CANCELLED")

    // Filtros de fecha
    if (dateFrom) {
      query = query.gte("operation_date", dateFrom)
    }
    if (dateTo) {
      query = query.lte("operation_date", dateTo)
    }

    // Filtro de vendedor (si no es SELLER, puede ver todos)
    if (sellerId && sellerId !== "ALL") {
      query = query.eq("seller_id", sellerId)
    } else if (user.role === "SELLER") {
      query = query.eq("seller_id", user.id)
    }

    // Filtro de agencia
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }

    const { data: operations, error } = await query.order("operation_date", { ascending: true }) as { data: any[] | null, error: any }

    if (error) {
      console.error("Error fetching sales report:", error)
      return NextResponse.json({ error: "Error al obtener reporte" }, { status: 500 })
    }

    // Calcular totales
    const totals = {
      count: operations?.length || 0,
      sale_total_ars: 0,
      sale_total_usd: 0,
      cost_total_ars: 0,
      cost_total_usd: 0,
      margin_total_ars: 0,
      margin_total_usd: 0,
    }

    for (const op of operations || []) {
      if (op.currency === "ARS") {
        totals.sale_total_ars += Number(op.sale_amount_total) || 0
        totals.cost_total_ars += Number(op.operator_cost) || 0
        totals.margin_total_ars += Number(op.margin_amount) || 0
      } else {
        totals.sale_total_usd += Number(op.sale_amount_total) || 0
        totals.cost_total_usd += Number(op.operator_cost) || 0
        totals.margin_total_usd += Number(op.margin_amount) || 0
      }
    }

    // Agrupar por período
    const grouped: Record<string, any> = {}
    
    for (const op of operations || []) {
      const date = new Date((op.operation_date || op.departure_date) + "T12:00:00")
      let key = ""
      
      if (groupBy === "day") {
        key = date.toISOString().split("T")[0]
      } else if (groupBy === "week") {
        // Obtener el lunes de la semana
        const d = new Date(date)
        const day = d.getDay()
        const diff = d.getDate() - day + (day === 0 ? -6 : 1)
        d.setDate(diff)
        key = d.toISOString().split("T")[0]
      } else if (groupBy === "month") {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      }

      if (!grouped[key]) {
        grouped[key] = {
          period: key,
          count: 0,
          sale_ars: 0,
          sale_usd: 0,
          margin_ars: 0,
          margin_usd: 0,
        }
      }

      grouped[key].count++
      if (op.currency === "ARS") {
        grouped[key].sale_ars += Number(op.sale_amount_total) || 0
        grouped[key].margin_ars += Number(op.margin_amount) || 0
      } else {
        grouped[key].sale_usd += Number(op.sale_amount_total) || 0
        grouped[key].margin_usd += Number(op.margin_amount) || 0
      }
    }

    const byPeriod = Object.values(grouped).sort((a: any, b: any) => 
      a.period.localeCompare(b.period)
    )

    // Agrupar por vendedor
    const bySeller: Record<string, any> = {}
    
    for (const op of operations || []) {
      const sellerId = op.seller_id || "unknown"
      const sellerName = (op.sellers as any)?.name || "Sin asignar"
      
      if (!bySeller[sellerId]) {
        bySeller[sellerId] = {
          seller_id: sellerId,
          seller_name: sellerName,
          count: 0,
          sale_ars: 0,
          sale_usd: 0,
          margin_ars: 0,
          margin_usd: 0,
        }
      }

      bySeller[sellerId].count++
      if (op.currency === "ARS") {
        bySeller[sellerId].sale_ars += Number(op.sale_amount_total) || 0
        bySeller[sellerId].margin_ars += Number(op.margin_amount) || 0
      } else {
        bySeller[sellerId].sale_usd += Number(op.sale_amount_total) || 0
        bySeller[sellerId].margin_usd += Number(op.margin_amount) || 0
      }
    }

    const sellerData = Object.values(bySeller).sort((a: any, b: any) => 
      (b.sale_usd + b.sale_ars) - (a.sale_usd + a.sale_ars)
    )

    return NextResponse.json({
      operations: operations || [],
      totals,
      byPeriod,
      bySeller: sellerData,
    })
  } catch (error) {
    console.error("Error in GET /api/reports/sales:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

