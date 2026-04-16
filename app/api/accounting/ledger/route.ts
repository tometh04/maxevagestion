import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    const { canAccessModule } = await import("@/lib/permissions")
    if (!canAccessModule(user.role as any, "accounting")) {
      return NextResponse.json({ error: "No tiene permiso para ver contabilidad" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 500)
    const offset = parseInt(searchParams.get("offset") || "0")
    const dateFrom = searchParams.get("dateFrom") || undefined
    const dateTo = searchParams.get("dateTo") || undefined
    const typeParam = searchParams.get("type") || "ALL"
    const currency = searchParams.get("currency") || undefined
    const accountId = searchParams.get("accountId") || undefined
    const operationId = searchParams.get("operationId") || undefined

    // Admin client para bypassear RLS
    const { createAdminClient } = await import("@/lib/supabase/server")
    let adminSupabase: any
    try {
      adminSupabase = await createAdminClient()
    } catch {
      adminSupabase = supabase
    }

    // Query liviana — solo campos necesarios para la vista de Caja
    let query = adminSupabase
      .from("ledger_movements")
      .select(
        `id, type, concept, currency, amount_original, amount_ars_equivalent, exchange_rate, movement_date, created_at, seller_id, operation_id, affects_balance,
         operations:operation_id (id, file_code, agency_id, destination, operation_customers(customers:customer_id(first_name, last_name))),
         users:created_by (name)`,
        { count: "exact" }
      )

    // IMPORTANTE: filtros ANTES de order/range para que funcione la paginación
    if (dateFrom) query = query.gte("movement_date", `${dateFrom}T00:00:00`)
    if (dateTo)   query = query.lte("movement_date", `${dateTo}T23:59:59`)
    if (currency && currency !== "ALL") query = query.eq("currency", currency)
    if (accountId && accountId !== "ALL") query = query.eq("account_id", accountId)
    if (operationId) query = query.eq("operation_id", operationId)
    if (typeParam === "INCOME") query = query.in("type", ["INCOME", "FX_GAIN"])
    else if (typeParam !== "ALL") query = query.not("type", "in", '("INCOME","FX_GAIN")')

    // Ordenar y paginar DESPUÉS de filtrar
    query = query.order("movement_date", { ascending: false }).range(offset, offset + limit - 1)

    const { data: movements, error, count } = await query

    if (error) {
      console.error("Error fetching ledger movements:", error)
      return NextResponse.json({ error: "Error al obtener movimientos del ledger" }, { status: 500 })
    }

    // Filtro de acceso por rol (post-filter mínimo)
    let filteredMovements = movements || []
    if (user.role === "SELLER") {
      filteredMovements = filteredMovements.filter((m: any) => m.seller_id === user.id)
    }
    // Para SUPER_ADMIN no hace falta filtrar por agencia — ve todo

    const total = count ?? 0
    return NextResponse.json({
      movements: filteredMovements,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error("Error in GET /api/accounting/ledger:", error)
    return NextResponse.json({ error: "Error al obtener movimientos del ledger" }, { status: 500 })
  }
}
