import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId") || null
    const accountId = searchParams.get("accountId") || null

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "Faltan parámetros dateFrom y dateTo" }, { status: 400 })
    }

    // Obtener cuentas financieras de efectivo y caja de ahorro
    let query = (supabase.from("financial_accounts") as any)
      .select("id, currency, initial_balance, type, chart_account_id")
      .in("type", ["CASH_ARS", "CASH_USD", "SAVINGS_ARS", "SAVINGS_USD"])
    if (accountId) {
      query = query.eq("id", accountId)
    } else if (agencyId) {
      query = query.eq("agency_id", agencyId)
    }
    const { data: accounts } = await query

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ dailyBalances: [] })
    }

    const accountIds = accounts.map((a: any) => a.id)
    const accountIdsSQL = accountIds.map((id: string) => `'${id}'`).join(",")

    // Obtener admin client para bypasear RLS
    let admin: any
    try { admin = await createAdminClient() } catch { admin = supabase }

    // QUERY 1: Sumas acumuladas ANTES del dateFrom (para el balance inicial del gráfico)
    // Resultado: { account_id, type, total_original, total_ars } por cada combinación
    const { data: priorSums } = await admin.rpc("execute_readonly_query", {
      query_text: `SELECT account_id, type, SUM(amount_original::numeric) as total_original, SUM(amount_ars_equivalent::numeric) as total_ars FROM ledger_movements WHERE account_id IN (${accountIdsSQL}) AND created_at < '${dateFrom}T00:00:00' GROUP BY account_id, type`
    })

    // QUERY 2: Movimientos agrupados por DÍA dentro del rango
    // Resultado: { account_id, mov_date, type, total_original, total_ars }
    const { data: dailySums } = await admin.rpc("execute_readonly_query", {
      query_text: `SELECT account_id, DATE(created_at)::text as mov_date, type, SUM(amount_original::numeric) as total_original, SUM(amount_ars_equivalent::numeric) as total_ars FROM ledger_movements WHERE account_id IN (${accountIdsSQL}) AND created_at >= '${dateFrom}T00:00:00' AND created_at <= '${dateTo}T23:59:59' GROUP BY account_id, DATE(created_at), type ORDER BY mov_date`
    })

    // Parsear resultados (execute_readonly_query retorna JSONB)
    const priorRows: Array<{ account_id: string; type: string; total_original: number; total_ars: number }> =
      Array.isArray(priorSums) ? priorSums : (priorSums || [])
    const dailyRows: Array<{ account_id: string; mov_date: string; type: string; total_original: number; total_ars: number }> =
      Array.isArray(dailySums) ? dailySums : (dailySums || [])

    // Construir mapa de cuentas con su moneda
    const accountMap = new Map<string, { currency: string; initialBalance: number }>()
    for (const acc of accounts) {
      accountMap.set(acc.id, {
        currency: acc.currency,
        initialBalance: parseFloat(acc.initial_balance || "0"),
      })
    }

    // Función para calcular el impacto de un tipo de movimiento en el balance
    // Misma lógica que el código original: INCOME/FX_GAIN suman, EXPENSE/FX_LOSS/COMMISSION/OPERATOR_PAYMENT restan
    const getAmountImpact = (type: string, totalOriginal: number, totalArs: number, currency: string): number => {
      const amount = currency === "ARS" ? totalArs : totalOriginal
      if (type === "INCOME" || type === "FX_GAIN") {
        return amount
      } else if (type === "EXPENSE" || type === "FX_LOSS" || type === "COMMISSION" || type === "OPERATOR_PAYMENT") {
        return -amount
      }
      return 0
    }

    // Calcular balance acumulado de cada cuenta ANTES del dateFrom
    const priorBalance = new Map<string, number>()
    for (const acc of accounts) {
      priorBalance.set(acc.id, parseFloat(acc.initial_balance || "0"))
    }
    for (const row of priorRows) {
      const acc = accountMap.get(row.account_id)
      if (!acc) continue
      const impact = getAmountImpact(row.type, Number(row.total_original), Number(row.total_ars), acc.currency)
      priorBalance.set(row.account_id, (priorBalance.get(row.account_id) || 0) + impact)
    }

    // Indexar movimientos diarios: { "2025-06-01" => { accountId => impacto } }
    const dailyImpacts = new Map<string, Map<string, number>>()
    for (const row of dailyRows) {
      const acc = accountMap.get(row.account_id)
      if (!acc) continue
      const impact = getAmountImpact(row.type, Number(row.total_original), Number(row.total_ars), acc.currency)

      if (!dailyImpacts.has(row.mov_date)) {
        dailyImpacts.set(row.mov_date, new Map())
      }
      const dayMap = dailyImpacts.get(row.mov_date)!
      dayMap.set(row.account_id, (dayMap.get(row.account_id) || 0) + impact)
    }

    // Construir array de balances diarios con balance acumulado
    const startDate = new Date(dateFrom)
    const endDate = new Date(dateTo)
    const dailyBalances: Array<{ date: string; balance: number }> = []

    // Balance running por cuenta (arranca con el prior)
    const runningBalance = new Map<string, number>(priorBalance)

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split("T")[0]

      // Aplicar impactos del día
      const dayImpacts = dailyImpacts.get(dateStr)
      if (dayImpacts) {
        dayImpacts.forEach((impact, accId) => {
          runningBalance.set(accId, (runningBalance.get(accId) || 0) + impact)
        })
      }

      // Sumar balance de todas las cuentas
      let totalBalance = 0
      accountIds.forEach((accId: string) => {
        totalBalance += runningBalance.get(accId) || 0
      })

      dailyBalances.push({ date: dateStr, balance: totalBalance })
    }

    return NextResponse.json({ dailyBalances })
  } catch (error) {
    console.error("Error in GET /api/cash/daily-balance:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
