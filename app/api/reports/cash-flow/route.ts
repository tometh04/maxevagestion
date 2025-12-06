import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance } from "@/lib/accounting/ledger"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    // Solo SUPER_ADMIN, ADMIN y CONTABLE pueden ver flujo de caja
    if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const currency = searchParams.get("currency") || "ALL"

    // Obtener movimientos de caja
    let query = (supabase
      .from("cash_movements") as any)
      .select("*")
      .order("movement_date", { ascending: true })

    if (dateFrom) {
      query = query.gte("movement_date", dateFrom)
    }
    if (dateTo) {
      query = query.lte("movement_date", dateTo + "T23:59:59")
    }
    if (currency !== "ALL") {
      query = query.eq("currency", currency)
    }

    const { data: movements, error } = await query as { data: any[] | null, error: any }

    if (error) {
      console.error("Error fetching cash flow:", error)
      return NextResponse.json({ error: "Error al obtener flujo de caja" }, { status: 500 })
    }

    // Calcular totales
    const totals = {
      income_ars: 0,
      expense_ars: 0,
      net_ars: 0,
      income_usd: 0,
      expense_usd: 0,
      net_usd: 0,
    }

    // Agrupar por categoría
    const byCategory: Record<string, any> = {}

    // Agrupar por día
    const byDay: Record<string, any> = {}

    for (const mov of movements || []) {
      const amount = Number(mov.amount) || 0
      const isIncome = mov.type === "INCOME"
      const curr = mov.currency || "ARS"

      // Totales
      if (curr === "ARS") {
        if (isIncome) {
          totals.income_ars += amount
        } else {
          totals.expense_ars += amount
        }
      } else {
        if (isIncome) {
          totals.income_usd += amount
        } else {
          totals.expense_usd += amount
        }
      }

      // Por categoría
      const cat = mov.category || "OTRO"
      if (!byCategory[cat]) {
        byCategory[cat] = {
          category: cat,
          income_ars: 0,
          expense_ars: 0,
          income_usd: 0,
          expense_usd: 0,
        }
      }
      if (curr === "ARS") {
        if (isIncome) {
          byCategory[cat].income_ars += amount
        } else {
          byCategory[cat].expense_ars += amount
        }
      } else {
        if (isIncome) {
          byCategory[cat].income_usd += amount
        } else {
          byCategory[cat].expense_usd += amount
        }
      }

      // Por día
      const day = mov.movement_date?.split("T")[0] || "unknown"
      if (!byDay[day]) {
        byDay[day] = {
          date: day,
          income_ars: 0,
          expense_ars: 0,
          income_usd: 0,
          expense_usd: 0,
        }
      }
      if (curr === "ARS") {
        if (isIncome) {
          byDay[day].income_ars += amount
        } else {
          byDay[day].expense_ars += amount
        }
      } else {
        if (isIncome) {
          byDay[day].income_usd += amount
        } else {
          byDay[day].expense_usd += amount
        }
      }
    }

    totals.net_ars = totals.income_ars - totals.expense_ars
    totals.net_usd = totals.income_usd - totals.expense_usd

    // Convertir a arrays ordenados
    const categoryData = Object.values(byCategory).sort((a: any, b: any) => 
      (b.income_ars + b.income_usd - b.expense_ars - b.expense_usd) - 
      (a.income_ars + a.income_usd - a.expense_ars - a.expense_usd)
    )

    const dailyData = Object.values(byDay).sort((a: any, b: any) => 
      a.date.localeCompare(b.date)
    )

    // Calcular balance acumulado
    let balanceArs = 0
    let balanceUsd = 0
    const dailyWithBalance = dailyData.map((d: any) => {
      balanceArs += d.income_ars - d.expense_ars
      balanceUsd += d.income_usd - d.expense_usd
      return {
        ...d,
        balance_ars: balanceArs,
        balance_usd: balanceUsd,
      }
    })

    // Obtener balances actuales de todas las cuentas financieras
    const { data: accounts } = await (supabase.from("financial_accounts") as any)
      .select(`
        id,
        name,
        type,
        currency,
        initial_balance,
        agency_id,
        agencies:agency_id(id, name)
      `)
      .eq("is_active", true)
      .order("agency_id", { ascending: true })
      .order("type", { ascending: true })

    const accountsWithBalance = await Promise.all(
      (accounts || []).map(async (account: any) => {
        try {
          const balance = await getAccountBalance(account.id, supabase)
          return {
            ...account,
            current_balance: balance,
          }
        } catch (error) {
          console.error(`Error calculating balance for account ${account.id}:`, error)
          return {
            ...account,
            current_balance: account.initial_balance || 0,
          }
        }
      })
    )

    // Calcular totales por moneda y agencia
    const balanceSummary: any = {
      total_ars: 0,
      total_usd: 0,
      by_agency: {} as Record<string, { ars: number; usd: number; accounts: any[]; agency_name?: string }>,
    }

    for (const account of accountsWithBalance) {
      const agencyId = account.agency_id || "sin-agencia"
      const agencyName = account.agencies?.name || "Sin agencia"
      
      if (!balanceSummary.by_agency[agencyId]) {
        balanceSummary.by_agency[agencyId] = {
          ars: 0,
          usd: 0,
          accounts: [],
          agency_name: agencyName,
        }
      }

      if (account.currency === "ARS") {
        balanceSummary.total_ars += account.current_balance
        balanceSummary.by_agency[agencyId].ars += account.current_balance
      } else {
        balanceSummary.total_usd += account.current_balance
        balanceSummary.by_agency[agencyId].usd += account.current_balance
      }

      balanceSummary.by_agency[agencyId].accounts.push(account)
    }

    return NextResponse.json({
      totals,
      byCategory: categoryData,
      byDay: dailyWithBalance,
      movementsCount: movements?.length || 0,
      accountBalances: {
        summary: balanceSummary,
        accounts: accountsWithBalance,
      },
    })
  } catch (error) {
    console.error("Error in GET /api/reports/cash-flow:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

