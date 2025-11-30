import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const type = searchParams.get("type")
    const status = searchParams.get("status")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId")

    // Build query
    let query = supabase
      .from("alerts")
      .select(
        `
        *,
        operations:operation_id(
          id,
          destination,
          agency_id,
          seller_id,
          departure_date,
          agencies:agency_id(
            id,
            name
          )
        ),
        customers:customer_id(
          id,
          first_name,
          last_name
        )
      `,
      )
      .order("date_due", { ascending: true })

    // Filter by role
    if (user.role === "SELLER") {
      query = query.eq("user_id", user.id)
    } else {
      // For ADMIN/SUPER_ADMIN, filter by agency if needed
      const { data: userAgencies } = await supabase
        .from("user_agencies")
        .select("agency_id")
        .eq("user_id", user.id)

      const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

      if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
        // Filter alerts by operations in user's agencies
        const { data: operations } = await supabase
          .from("operations")
          .select("id")
          .in("agency_id", agencyIds)

        const operationIds = (operations || []).map((op: any) => op.id)

        if (operationIds.length > 0) {
          query = query.in("operation_id", operationIds)
        } else {
          return NextResponse.json({ alerts: [] })
        }
      }
    }

    // Apply filters
    if (type && type !== "ALL") {
      query = query.eq("type", type)
    }

    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    if (dateFrom) {
      query = query.gte("date_due", dateFrom)
    }

    if (dateTo) {
      query = query.lte("date_due", dateTo)
    }

    if (agencyId && agencyId !== "ALL") {
      // Filter by agency through operations
      const { data: agencyOperations } = await supabase
        .from("operations")
        .select("id")
        .eq("agency_id", agencyId)

      const agencyOperationIds = (agencyOperations || []).map((op: any) => op.id)

      if (agencyOperationIds.length > 0) {
        query = query.in("operation_id", agencyOperationIds)
      } else {
        return NextResponse.json({ alerts: [] })
      }
    }

    const { data: alerts, error } = await query

    if (error) {
      console.error("Error fetching alerts:", error)
      return NextResponse.json({ error: "Error al obtener alertas" }, { status: 500 })
    }

    return NextResponse.json({ alerts: alerts || [] })
  } catch (error) {
    console.error("Error in GET /api/alerts:", error)
    return NextResponse.json({ error: "Error al obtener alertas" }, { status: 500 })
  }
}

