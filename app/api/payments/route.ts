import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get("status")
    const direction = searchParams.get("direction")
    const payerType = searchParams.get("payerType")
    const agencyId = searchParams.get("agencyId")
    const currency = searchParams.get("currency")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const limit = searchParams.get("limit")

    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // First, get operation IDs based on user permissions
    let operationsQuery = supabase.from("operations").select("id")

    if (user.role === "SELLER") {
      operationsQuery = operationsQuery.eq("seller_id", user.id)
    } else if (agencyIds.length > 0) {
      operationsQuery = operationsQuery.in("agency_id", agencyIds)
    }

    const { data: allowedOperations } = await operationsQuery
    const allowedOperationIds = (allowedOperations || []).map((op: any) => op.id)

    if (allowedOperationIds.length === 0 && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ payments: [] })
    }

    let query = supabase
      .from("payments")
      .select(
        `
        *,
        operations:operation_id (
          id,
          destination,
          agency_id,
          seller_id,
          currency,
          status,
          departure_date,
          agencies:agency_id (
            id,
            name
          ),
          sellers:seller_id (
            id,
            name
          )
        )
      `,
      )
      .order("date_due", { ascending: true })

    if (user.role !== "SUPER_ADMIN") {
      query = query.in("operation_id", allowedOperationIds)
    }

    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    if (direction && direction !== "ALL") {
      query = query.eq("direction", direction)
    }

    if (payerType && payerType !== "ALL") {
      query = query.eq("payer_type", payerType)
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
        // No operations for this agency, return empty
        return NextResponse.json({ payments: [] })
      }
    }

    if (currency && currency !== "ALL") {
      query = query.eq("currency", currency)
    }

    if (dateFrom) {
      query = query.gte("date_due", dateFrom)
    }

    if (dateTo) {
      query = query.lte("date_due", dateTo)
    }

    // Add pagination with reasonable limits
    const requestedLimit = limit ? Number(limit) : 100
    const finalLimit = Math.min(requestedLimit, 200) // Máximo 200 para mejor rendimiento
    const offset = parseInt(searchParams.get("offset") || "0")
    
    query = query
      .order("date_due", { ascending: false })
      .range(offset, offset + finalLimit - 1)

    const { data: payments, error } = await query

    if (error) {
      console.error("Error fetching payments:", error)
      return NextResponse.json({ error: "Error al obtener pagos" }, { status: 500 })
    }

    return NextResponse.json({ payments: payments || [] })
  } catch (error) {
    console.error("Error in GET /api/payments:", error)
    return NextResponse.json({ error: "Error al obtener pagos" }, { status: 500 })
  }
}
