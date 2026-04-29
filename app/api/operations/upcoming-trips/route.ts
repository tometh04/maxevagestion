import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

/**
 * GET /api/operations/upcoming-trips
 *
 * Endpoint lightweight para el card "Próximas Salidas" del dashboard.
 *
 * Diferencia clave vs /api/operations:
 *   - Selecciona SOLO los 6-7 campos que la card consume
 *     (id, file_code, destination, departure_date, return_date, adults,
 *     children, infants, status, seller name).
 *   - Sin nested joins a operators, agencies, leads, customers,
 *     operation_customers, operation_operators (todo lo que la card
 *     no muestra).
 *   - Resultado: payload ~10x más chico, ~5x más rápido.
 *
 * El endpoint /api/operations queda intacto — la página /operations
 * sigue funcionando con todos los joins.
 *
 * Multi-tenant safe:
 *   - Usa cliente de servidor con RLS (scopea automáticamente por org).
 *   - Filtro role-based explícito (defense-in-depth).
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const status = searchParams.get("status") // típicamente 'CONFIRMED'
    const agencyId = searchParams.get("agencyId")
    const sellerId = searchParams.get("sellerId")
    const limitParam = parseInt(searchParams.get("limit") || "50", 10)
    const limit = Math.min(Math.max(limitParam, 1), 100)

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Projection mínima — solo lo que UpcomingTripsCard renderiza.
    let query = supabase
      .from("operations")
      .select(
        `
        id, file_code, destination, departure_date, return_date,
        adults, children, infants, status, agency_id, seller_id,
        sellers:seller_id(name)
      `
      )
      .order("departure_date", { ascending: true })
      .limit(limit)

    // Multi-tenant: scope por org del user (defense-in-depth encima de RLS)
    if ((user as any).org_id) {
      query = query.eq("org_id", (user as any).org_id)
    }

    // Role-based filter (mismo patrón que /api/operations)
    if (user.role === "SELLER") {
      query = query.eq("seller_id", user.id)
    } else if (
      agencyIds.length > 0 &&
      user.role !== "SUPER_ADMIN" &&
      (user.role as string) !== "ORG_OWNER"
    ) {
      query = query.in("agency_id", agencyIds)
    }

    // Filtros opcionales del query string
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }
    if (dateFrom) {
      query = query.gte("departure_date", dateFrom)
    }
    if (dateTo) {
      query = query.lte("departure_date", dateTo)
    }
    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }
    if (sellerId && sellerId !== "ALL") {
      query = query.eq("seller_id", sellerId)
    }

    const t0 = Date.now()
    const { data: operations, error } = await query

    if (error) {
      console.error("[upcoming-trips] error:", error.message)
      return NextResponse.json(
        { error: "Error al obtener próximas salidas" },
        { status: 500 }
      )
    }

    console.log(
      `[upcoming-trips] ok in ${Date.now() - t0}ms → ${operations?.length || 0} rows`
    )

    return NextResponse.json(
      { operations: operations || [] },
      {
        headers: {
          "Cache-Control":
            "private, max-age=30, stale-while-revalidate=60",
        },
      }
    )
  } catch (error: any) {
    console.error("[upcoming-trips] Error:", error)
    return NextResponse.json(
      { error: error?.message || "Error al obtener próximas salidas" },
      { status: 500 }
    )
  }
}
