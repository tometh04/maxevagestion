import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    const perms = await resolveUserPermissions(supabase as any, user.id, (user as any).org_id, user.role, agencyIds)
    if (!assertPermission(user.role, perms, "accounting", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver contabilidad" }, { status: 403 })
    }

    const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 500)
    const offset = parseInt(searchParams.get("offset") || "0")
    const dateFrom = searchParams.get("dateFrom") || undefined
    const dateTo = searchParams.get("dateTo") || undefined
    const dateType = (searchParams.get("dateType") || "MOVIMIENTO").toUpperCase()
    const typeParam = searchParams.get("type") || "ALL"
    const currency = searchParams.get("currency") || undefined
    const accountId = searchParams.get("accountId") || undefined
    const operationId = searchParams.get("operationId") || undefined

    // SaaS Pilar 2: RLS tenant_isolation en ledger_movements acota por org_id
    // del JWT. No necesitamos admin client — el server client respeta la
    // policy y el agency-filter post-query queda como defensa adicional.
    let query = (supabase
      .from("ledger_movements") as any)
      .select(
        `id, type, concept, currency, amount_original, amount_ars_equivalent, exchange_rate, movement_date, created_at, seller_id, operation_id, affects_balance,
         reversed_at, reverses_movement_id, reversed_by_movement_id, reversal_reason,
         operations:operation_id (id, file_code, agency_id, destination, operation_customers(customers:customer_id(first_name, last_name))),
         users:created_by (name)`,
        { count: "exact" }
      )
      // Cross-tenant fix: scopear ledger_movements por org del user.
      .eq("org_id", (user as any).org_id)

    // IMPORTANTE: filtros ANTES de order/range para que funcione la paginación
    // dateType:
    // - MOVIMIENTO (default): ledger_movements.movement_date con timezone AR
    // - OPERACION: pre-resolver operations cuya operation_date cae en [from,to]
    //   y restringir ledger_movements.operation_id IN (...). Movimientos sin
    //   operation_id (asientos manuales) quedan fuera cuando se filtra por OPERACION.
    if (dateType === "OPERACION" && (dateFrom || dateTo)) {
      let opQuery = (supabase.from("operations") as any)
        .select("id")
        .eq("org_id", (user as any).org_id)
      if (dateFrom) opQuery = opQuery.gte("operation_date", dateFrom)
      if (dateTo) opQuery = opQuery.lte("operation_date", dateTo)
      const { data: matchingOps } = await opQuery.limit(5000)
      const opIds = (matchingOps || []).map((o: any) => o.id)
      if (opIds.length === 0) {
        return NextResponse.json({
          movements: [],
          pagination: { total: 0, limit, offset, hasMore: false },
        })
      }
      query = query.in("operation_id", opIds)
    } else {
      // Filtros de fecha con offset de AR: evita perder movimientos por desfasaje UTC
      if (dateFrom) query = query.gte("movement_date", startOfDayAR(dateFrom))
      if (dateTo)   query = query.lte("movement_date", endOfDayAR(dateTo))
    }
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

    // Filtro de acceso por rol (post-filter)
    let filteredMovements = movements || []
    if (user.role === "SELLER") {
      filteredMovements = filteredMovements.filter((m: any) => m.seller_id === user.id)
    }

    // Multi-tenant: movements con operation_id deben ser de agencias accesibles por el user.
    // Movements sin operation_id (journal entries manuales, cash movements puros) se dejan
    // pasar — su aislamiento efectivo requiere org_id en financial_accounts (pending P0).
    const userAgencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (userAgencyIds.length > 0) {
      filteredMovements = filteredMovements.filter((m: any) => {
        const opAgencyId = m.operations?.agency_id
        if (!opAgencyId) return true
        return userAgencyIds.includes(opAgencyId)
      })
    }

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
