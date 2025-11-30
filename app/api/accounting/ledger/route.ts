import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getLedgerMovements } from "@/lib/accounting/ledger"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Verificar permiso de acceso a contabilidad
    const { canAccessModule } = await import("@/lib/permissions")
    const userRole = user.role as any
    if (!canAccessModule(userRole, "accounting")) {
      return NextResponse.json({ error: "No tiene permiso para ver contabilidad" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Get user agencies
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Build filters
    const filters: Parameters<typeof getLedgerMovements>[1] = {
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      type: (searchParams.get("type") as any) || "ALL",
      currency: (searchParams.get("currency") as any) || "ALL",
      accountId: searchParams.get("accountId") || "ALL",
      sellerId: searchParams.get("sellerId") || "ALL",
      operatorId: searchParams.get("operatorId") || "ALL",
      operationId: searchParams.get("operationId") || undefined,
      leadId: searchParams.get("leadId") || undefined,
    }

    // Get ledger movements
    const movements = await getLedgerMovements(supabase, filters)

    // Apply role-based filtering
    let filteredMovements = movements || []

    if (user.role === "SELLER") {
      // Sellers can only see their own movements
      filteredMovements = filteredMovements.filter((m: any) => m.seller_id === user.id)
    } else if (agencyIds.length > 0) {
      // Filter by agency if user has agencies
      // We need to join with operations to filter by agency
      const { data: operations } = await supabase
        .from("operations")
        .select("id, agency_id")
        .in("agency_id", agencyIds)

      const operationIds = (operations || []).map((op: any) => op.id)
      filteredMovements = filteredMovements.filter((m: any) => {
        if (m.operation_id) {
          return operationIds.includes(m.operation_id)
        }
        // If no operation_id, include it (could be a lead movement)
        return true
      })
    }

    return NextResponse.json({ movements: filteredMovements })
  } catch (error) {
    console.error("Error in GET /api/accounting/ledger:", error)
    return NextResponse.json({ error: "Error al obtener movimientos del ledger" }, { status: 500 })
  }
}

