import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getCachedDashboardKPIs } from "@/lib/cache"

// Forzar ruta dinámica (usa cookies para autenticación)
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId")

    // Crear clave de caché basada en parámetros
    const cacheKey = `sellers-${user.id}-${dateFrom || 'all'}-${dateTo || 'all'}-${agencyId || 'all'}`

    const result = await getCachedDashboardKPIs(async () => {
      const supabase = await createServerClient()

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
            name,
            phone
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
        throw new Error("Error al obtener datos de vendedores")
      }

      // Group by seller
      const sellerStats = (operations || []).reduce((acc: any, op: any) => {
        const sellerId = op.seller_id
        // Usar nombre, si no hay usar teléfono, si no hay usar "Vendedor"
        const sellerName = op.sellers?.name || op.sellers?.phone || "Vendedor"

        if (!acc[sellerId]) {
          acc[sellerId] = {
            sellerId,
            sellerName,
            phone: op.sellers?.phone || null,
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
        id: seller.sellerId,
        name: seller.sellerName,
        phone: seller.phone,
        totalSales: seller.totalSales,
        margin: seller.totalMargin,
        operationsCount: seller.operationsCount,
        avgMarginPercent: seller.totalSales > 0 ? (seller.totalMargin / seller.totalSales) * 100 : 0,
      }))

      // Sort by total sales descending
      sellers.sort((a: any, b: any) => b.totalSales - a.totalSales)

      return { sellers }
    }, cacheKey)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error in GET /api/analytics/sellers:", error)
    return NextResponse.json({ error: error.message || "Error al obtener datos de vendedores" }, { status: 500 })
  }
}

