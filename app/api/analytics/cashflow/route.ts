import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// Forzar ruta dinámica (usa cookies para autenticación)
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId")

      const supabase = await createServerClient()

      // Get user agencies
      const { data: userAgencies } = await supabase
        .from("user_agencies")
        .select("agency_id")
        .eq("user_id", user.id)

      const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

      let query = supabase
        .from("cash_movements")
        .select(
          `
          type,
          amount,
          currency,
          movement_date,
          operation_id,
          operations:operation_id(
            agency_id
          )
        `,
        )
        .order("movement_date", { ascending: true })

      // Apply role-based filtering
      if (user.role === "SELLER") {
        query = query.eq("user_id", user.id)
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

      // Apply date filters first
      if (dateFrom) {
        query = query.gte("movement_date", `${dateFrom}T00:00:00.000Z`)
      }

      if (dateTo) {
        query = query.lte("movement_date", `${dateTo}T23:59:59.999Z`)
      }

      // Apply agency filter if specified
      if (agencyId && agencyId !== "ALL") {
        // Filter by agency through operations
        const { data: agencyOperations } = await supabase
          .from("operations")
          .select("id")
          .eq("agency_id", agencyId)

        const agencyOperationIds = (agencyOperations || []).map((op: any) => op.id)

        if (agencyOperationIds.length > 0) {
          // Only show movements with operations from this agency
          query = query.in("operation_id", agencyOperationIds)
        } else {
          // No operations for this agency, return empty
        return NextResponse.json({ cashflow: [] })
        }
      } else if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN" && user.role !== "SELLER") {
        // Filter by user's agencies through operations
        const { data: agencyOperations } = await supabase
          .from("operations")
          .select("id")
          .in("agency_id", agencyIds)

        const agencyOperationIds = (agencyOperations || []).map((op: any) => op.id)

        if (agencyOperationIds.length > 0) {
          // Include movements with these operation_ids
          query = query.in("operation_id", agencyOperationIds)
        } else {
          // No operations for user's agencies, return empty
        return NextResponse.json({ cashflow: [] })
        }
      }

      const { data: movements, error } = await query

      if (error) {
        console.error("Error fetching cashflow data:", error)
        throw new Error("Error al obtener datos de flujo de caja")
      }

      // If no movements found, return empty array
      if (!movements || movements.length === 0) {
        console.log("No cash movements found for filters:", { dateFrom, dateTo, agencyId, userRole: user.role })
      return NextResponse.json({ cashflow: [] })
      }

      // Group by date
      const cashflowByDate = (movements || []).reduce((acc: any, movement: any) => {
        // Handle both timestamp and date string formats
        let dateStr: string
        if (movement.movement_date instanceof Date) {
          dateStr = movement.movement_date.toISOString().split("T")[0]
        } else if (typeof movement.movement_date === "string") {
          // If it's a timestamp, extract date part
          dateStr = movement.movement_date.split("T")[0]
        } else {
          console.warn("Invalid movement_date format:", movement.movement_date)
          return acc
        }

        if (!acc[dateStr]) {
          acc[dateStr] = {
            date: dateStr,
            income: 0,
            expense: 0,
            net: 0,
          }
        }

        const amount = parseFloat(movement.amount) || 0
        if (movement.type === "INCOME") {
          acc[dateStr].income += amount
        } else if (movement.type === "EXPENSE") {
          acc[dateStr].expense += amount
        }

        acc[dateStr].net = acc[dateStr].income - acc[dateStr].expense

        return acc
      }, {})

      const cashflow = Object.values(cashflowByDate).sort((a: any, b: any) =>
        a.date.localeCompare(b.date),
      )

    return NextResponse.json({ cashflow })
  } catch (error: any) {
    console.error("Error in GET /api/analytics/cashflow:", error)
    return NextResponse.json({ error: error.message || "Error al obtener datos de flujo de caja" }, { status: 500 })
  }
}

