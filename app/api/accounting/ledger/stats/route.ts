import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * GET /api/accounting/ledger/stats
 *
 * Modo individual: ?accountId=xxx → { income, expenses }
 * Modo batch:      ?accountIds=id1,id2,id3 → { stats: { id1: {income, expenses}, id2: ... } }
 * Sin filtro:      (sin accountId ni accountIds) → stats de TODOS los movimientos agrupados por account_id
 *
 * Query liviana: solo 3 columnas (type, amount_original, account_id), sin JOINs.
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
    const accountIds = searchParams.get("accountIds") // Comma-separated para batch
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")

    const { createAdminClient } = await import("@/lib/supabase/server")
    let admin: any
    try { admin = await createAdminClient() } catch { admin = supabase }

    // Batch mode: muchas cuentas en UNA query
    if (accountIds) {
      const ids = accountIds.split(",").filter(Boolean)

      let q = admin
        .from("ledger_movements")
        .select("type, amount_original, account_id")

      if (ids.length > 0) {
        q = q.in("account_id", ids)
      }
      if (dateFrom) q = q.gte("movement_date", `${dateFrom}T00:00:00`)
      if (dateTo) q = q.lte("movement_date", `${dateTo}T23:59:59`)

      const { data, error } = await q

      if (error) {
        console.error("Error fetching batch ledger stats:", error)
        return NextResponse.json({ error: "Error al calcular stats batch" }, { status: 500 })
      }

      const rows: Array<{ type: string; amount_original: number; account_id: string }> = data || []

      // Agrupar por account_id
      const stats: Record<string, { income: number; expenses: number }> = {}
      for (const id of ids) {
        stats[id] = { income: 0, expenses: 0 }
      }
      for (const r of rows) {
        if (!stats[r.account_id]) stats[r.account_id] = { income: 0, expenses: 0 }
        if (r.type === "INCOME" || r.type === "FX_GAIN") {
          stats[r.account_id].income += r.amount_original || 0
        } else {
          stats[r.account_id].expenses += r.amount_original || 0
        }
      }

      return NextResponse.json({ stats })
    }

    // Modo individual (backward compatible)
    let q = admin
      .from("ledger_movements")
      .select("type, amount_original")

    if (accountId && accountId !== "ALL") q = q.eq("account_id", accountId)
    if (dateFrom) q = q.gte("movement_date", `${dateFrom}T00:00:00`)
    if (dateTo) q = q.lte("movement_date", `${dateTo}T23:59:59`)

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
