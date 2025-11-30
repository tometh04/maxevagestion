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
    const agencyId = searchParams.get("agencyId")
    const sellerId = searchParams.get("sellerId")

    // Get user agencies
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    let query = supabase.from("operations").select("sale_amount_total, margin_amount, operator_cost, currency, created_at")

    // Apply role-based filtering
    if (user.role === "SELLER") {
      query = query.eq("seller_id", user.id)
    } else if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
      query = query.in("agency_id", agencyIds)
    }

    // Apply filters
    if (dateFrom) {
      query = query.gte("created_at", dateFrom)
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo)
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
      return NextResponse.json({ error: "Error al obtener datos de ventas" }, { status: 500 })
    }

    const totalSales = (operations || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0)
    const totalMargin = (operations || []).reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0)
    const totalCost = (operations || []).reduce((sum: number, op: any) => sum + (op.operator_cost || 0), 0)
    const operationsCount = (operations || []).length
    const avgMarginPercent = operationsCount > 0 ? (totalMargin / totalSales) * 100 : 0

    return NextResponse.json({
      totalSales,
      totalMargin,
      totalCost,
      operationsCount,
      avgMarginPercent,
    })
  } catch (error) {
    console.error("Error in GET /api/analytics/sales:", error)
    return NextResponse.json({ error: "Error al obtener datos de ventas" }, { status: 500 })
  }
}

