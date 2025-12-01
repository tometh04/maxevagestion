import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// Forzar ruta dinámica (usa cookies para autenticación)
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId")

    // Get user agencies
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    let query = supabase
      .from("operations")
      .select(
        `
        sale_amount_total,
        margin_amount,
        seller_id,
        sellers:seller_id(
          id,
          name
        )
      `,
      )

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

    const { data: operations, error } = await query

    if (error) {
      console.error("Error fetching sellers data:", error)
      return NextResponse.json({ error: "Error al obtener datos de vendedores" }, { status: 500 })
    }

    // Group by seller
    const sellerStats = (operations || []).reduce((acc: any, op: any) => {
      const sellerId = op.seller_id
      const sellerName = op.sellers?.name || "Sin nombre"

      if (!acc[sellerId]) {
        acc[sellerId] = {
          sellerId,
          sellerName,
          totalSales: 0,
          totalMargin: 0,
          operationsCount: 0,
        }
      }

      acc[sellerId].totalSales += op.sale_amount_total || 0
      acc[sellerId].totalMargin += op.margin_amount || 0
      acc[sellerId].operationsCount += 1

      return acc
    }, {})

    const sellers = Object.values(sellerStats).map((seller: any) => ({
      ...seller,
      avgMarginPercent: seller.totalSales > 0 ? (seller.totalMargin / seller.totalSales) * 100 : 0,
    }))

    // Sort by total sales descending
    sellers.sort((a: any, b: any) => b.totalSales - a.totalSales)

    return NextResponse.json({ sellers })
  } catch (error) {
    console.error("Error in GET /api/analytics/sellers:", error)
    return NextResponse.json({ error: "Error al obtener datos de vendedores" }, { status: 500 })
  }
}

