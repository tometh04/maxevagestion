import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"

/**
 * GET /api/accounting/ledger/stats
 *
 * Modo individual: ?accountId=xxx → { income, expenses }
 * Modo batch:      ?accountIds=id1,id2,id3 → { stats: { id1: {income, expenses}, id2: ... } }
 *
 * OPTIMIZADO: Usa SQL aggregation (SUM + GROUP BY) en vez de traer todas las filas.
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

    // Construir filtro de cuentas
    let accountFilter = ""
    let ids: string[] = []

    if (accountIds) {
      ids = accountIds.split(",").filter(Boolean)
      if (ids.length > 0) {
        accountFilter = `AND account_id IN (${ids.map(id => `'${id}'`).join(",")})`
      }
    } else if (accountId && accountId !== "ALL") {
      accountFilter = `AND account_id = '${accountId}'`
      ids = [accountId]
    }

    // Construir filtro de fechas con offset AR (fix bug "movimientos fuera de rango")
    let dateFilter = ""
    if (dateFrom) dateFilter += ` AND movement_date >= '${startOfDayAR(dateFrom)}'`
    if (dateTo) dateFilter += ` AND movement_date <= '${endOfDayAR(dateTo)}'`

    // SQL con aggregation — devuelve máximo N_cuentas × 2 filas en vez de miles.
    // Fix bug monedas (2026-04-20): sumamos SOLO rows con currency = currency
    // de la cuenta. Sin este filtro, rows con currency mismatch (p.ej.
    // OPERATOR_PAYMENT en USD asignado a una cuenta "Costo de Operadores" en
    // ARS) contaminan el total.
    const sqlQuery = `SELECT lm.account_id, SUM(CASE WHEN lm.type IN ('INCOME','FX_GAIN') THEN lm.amount_original::numeric ELSE 0 END) as income, SUM(CASE WHEN lm.type NOT IN ('INCOME','FX_GAIN') THEN lm.amount_original::numeric ELSE 0 END) as expenses FROM ledger_movements lm INNER JOIN financial_accounts fa ON fa.id = lm.account_id WHERE lm.affects_balance = true AND lm.currency = fa.currency ${accountFilter.replace(/account_id/g, 'lm.account_id')} ${dateFilter.replace(/movement_date/g, 'lm.movement_date')} GROUP BY lm.account_id`

    const { data: aggData, error: aggError } = await admin.rpc("execute_readonly_query", {
      query_text: sqlQuery
    })

    if (aggError) {
      console.error("Error fetching aggregated stats:", aggError)
      return NextResponse.json({ error: "Error al calcular stats" }, { status: 500 })
    }

    const rows: Array<{ account_id: string; income: number; expenses: number }> =
      Array.isArray(aggData) ? aggData : (aggData || [])

    // Batch mode: retornar por account_id
    if (accountIds) {
      const stats: Record<string, { income: number; expenses: number }> = {}
      for (const id of ids) {
        stats[id] = { income: 0, expenses: 0 }
      }
      for (const r of rows) {
        stats[r.account_id] = {
          income: Number(r.income) || 0,
          expenses: Number(r.expenses) || 0,
        }
      }
      return NextResponse.json({ stats })
    }

    // Modo individual: sumar todo
    let totalIncome = 0
    let totalExpenses = 0
    for (const r of rows) {
      totalIncome += Number(r.income) || 0
      totalExpenses += Number(r.expenses) || 0
    }

    return NextResponse.json({ income: totalIncome, expenses: totalExpenses })
  } catch (error) {
    console.error("Error in GET /api/accounting/ledger/stats:", error)
    return NextResponse.json({ error: "Error" }, { status: 500 })
  }
}
