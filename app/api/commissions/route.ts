import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const month = searchParams.get("month") // YYYY-MM format
    const year = searchParams.get("year")
    const status = searchParams.get("status") // PENDING | PAID | ALL
    const operationId = searchParams.get("operationId") // Filter by operation

    // Build query
    let query = supabase
      .from("commission_records")
      .select(
        `
        *,
        operations:operation_id(
          id,
          destination,
          departure_date,
          sale_amount_total,
          operator_cost,
          margin_amount,
          currency
        ),
        sellers:seller_id(
          id,
          name
        ),
        agencies:agency_id(
          id,
          name
        )
      `,
      )
      .order("date_calculated", { ascending: false })

    // Filter by operation if provided
    if (operationId) {
      query = query.eq("operation_id", operationId)
    }

    // Filter by role
    if (user.role === "SELLER") {
      query = query.eq("seller_id", user.id)
    } else {
      // ADMIN/SUPER_ADMIN can see all, but filter by agency if needed
      const { data: userAgencies } = await supabase
        .from("user_agencies")
        .select("agency_id")
        .eq("user_id", user.id)

      const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

      if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
        query = query.in("agency_id", agencyIds)
      }
    }

    // Filter by status
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    // Filter by month/year
    if (month) {
      const startDate = `${month}-01`
      const endDate = `${month}-31`
      query = query.gte("date_calculated", startDate).lte("date_calculated", endDate)
    } else if (year) {
      const startDate = `${year}-01-01`
      const endDate = `${year}-12-31`
      query = query.gte("date_calculated", startDate).lte("date_calculated", endDate)
    }

    const { data: commissions, error } = await query

    if (error) {
      console.error("Error fetching commissions:", error)
      return NextResponse.json({ error: "Error al obtener comisiones" }, { status: 500 })
    }

    // Group by month for summary
    const monthlySummary = (commissions || []).reduce((acc: any, comm: any) => {
      const date = new Date(comm.date_calculated)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: monthKey,
          total: 0,
          pending: 0,
          paid: 0,
          count: 0,
        }
      }

      acc[monthKey].total += comm.amount || 0
      acc[monthKey].count += 1

      if (comm.status === "PENDING") {
        acc[monthKey].pending += comm.amount || 0
      } else if (comm.status === "PAID") {
        acc[monthKey].paid += comm.amount || 0
      }

      return acc
    }, {})

    return NextResponse.json({
      commissions: commissions || [],
      monthlySummary: Object.values(monthlySummary),
    })
  } catch (error) {
    console.error("Error in GET /api/commissions:", error)
    return NextResponse.json({ error: "Error al obtener comisiones" }, { status: 500 })
  }
}

