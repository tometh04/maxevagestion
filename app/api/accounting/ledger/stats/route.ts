import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * GET /api/accounting/ledger/stats
 * Devuelve {income, expenses} para una cuenta en un rango de fechas.
 * Query liviana: sin JOINs, sin paginación — solo 2 columnas.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const { canAccessModule } = await import("@/lib/permissions")
    if (!canAccessModule(user.role as any, "accounting")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const accountId = searchParams.get("accountId")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")

    const { createAdminClient } = await import("@/lib/supabase/server")
    let admin: any
    try { admin = await createAdminClient() } catch { admin = supabase }

    let q = admin
      .from("ledger_movements")
      .select("type, amount_original")

    if (accountId && accountId !== "ALL") q = q.eq("account_id", accountId)
    if (dateFrom) q = q.gte("movement_date", `${dateFrom}T00:00:00`)
    if (dateTo)   q = q.lte("movement_date", `${dateTo}T23:59:59`)

    const { data, error } = await q

    if (error) {
      console.error("Error fetching ledger stats:", error)
      return NextResponse.json({ error: "Error al calcular stats" }, { status: 500 })
    }

    const rows: Array<{ type: string; amount_original: number }> = data || []
    const income = rows
      .filter(r => r.type === "INCOME" || r.type === "FX_GAIN")
      .reduce((sum, r) => sum + (r.amount_original || 0), 0)
    const expenses = rows
      .filter(r => r.type !== "INCOME" && r.type !== "FX_GAIN")
      .reduce((sum, r) => sum + (r.amount_original || 0), 0)

    return NextResponse.json({ income, expenses })
  } catch (error) {
    console.error("Error in GET /api/accounting/ledger/stats:", error)
    return NextResponse.json({ error: "Error" }, { status: 500 })
  }
}
