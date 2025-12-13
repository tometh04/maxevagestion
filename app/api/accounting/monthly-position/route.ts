import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance } from "@/lib/accounting/ledger"

/**
 * GET /api/accounting/monthly-position
 * Obtiene la posición contable mensual (Balance Sheet) agrupada por rubros del plan de cuentas
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString())
    const agencyId = searchParams.get("agencyId") || "ALL"

    // Validar mes y año
    if (month < 1 || month > 12) {
      return NextResponse.json({ error: "Mes inválido" }, { status: 400 })
    }

    // Calcular fecha de corte (último día del mes)
    const lastDay = new Date(year, month, 0).getDate()
    const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

    // Obtener todas las cuentas del plan de cuentas activas
    const { data: chartAccounts, error: chartError } = await (supabase.from("chart_of_accounts") as any)
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("display_order", { ascending: true })

    if (chartError) {
      console.error("Error fetching chart of accounts:", chartError)
      return NextResponse.json({ error: "Error al obtener plan de cuentas" }, { status: 500 })
    }

    // Obtener todas las cuentas financieras relacionadas con el plan de cuentas
    let financialAccountsQuery = supabase
      .from("financial_accounts")
      .select(`
        *,
        chart_of_accounts:chart_account_id(
          id,
          account_code,
          account_name,
          category,
          subcategory,
          account_type
        )
      `)
      .eq("is_active", true)

    if (agencyId !== "ALL") {
      financialAccountsQuery = financialAccountsQuery.eq("agency_id", agencyId)
    }

    const { data: financialAccounts, error: faError } = await financialAccountsQuery

    if (faError) {
      console.error("Error fetching financial accounts:", faError)
      return NextResponse.json({ error: "Error al obtener cuentas financieras" }, { status: 500 })
    }

    // Obtener movimientos del ledger hasta la fecha de corte
    let ledgerQuery = supabase
      .from("ledger_movements")
      .select(`
        *,
        financial_accounts:account_id(
          id,
          chart_account_id,
          chart_of_accounts:chart_account_id(
            category,
            account_type
          )
        )
      `)
      .lte("created_at", `${dateTo}T23:59:59`)

    if (agencyId !== "ALL") {
      // Filtrar por agencia a través de las cuentas financieras
      const accountIds = (financialAccounts || [])
        .filter((fa: any) => fa.agency_id === agencyId)
        .map((fa: any) => fa.id)
      
      if (accountIds.length > 0) {
        ledgerQuery = ledgerQuery.in("account_id", accountIds)
      } else {
        // Si no hay cuentas, retornar estructura vacía
        return NextResponse.json({
          year,
          month,
          dateTo,
          activo: { corriente: 0, no_corriente: 0, total: 0 },
          pasivo: { corriente: 0, no_corriente: 0, total: 0 },
          patrimonio_neto: { total: 0 },
          resultado: { ingresos: 0, costos: 0, gastos: 0, total: 0 },
          accounts: []
        })
      }
    }

    const { data: movements, error: movementsError } = await ledgerQuery

    if (movementsError) {
      console.error("Error fetching ledger movements:", movementsError)
      return NextResponse.json({ error: "Error al obtener movimientos contables" }, { status: 500 })
    }

    // Calcular balances por categoría
    const balances: Record<string, number> = {}

    // Calcular balances de cuentas financieras
    const financialAccountsArray = (financialAccounts || []) as any[]
    for (const account of financialAccountsArray) {
      try {
        const balance = await getAccountBalance(account.id, supabase)
        const chartAccount = account.chart_of_accounts
        if (chartAccount) {
          const key = `${chartAccount.category}_${chartAccount.subcategory || "NONE"}`
          balances[key] = (balances[key] || 0) + balance
        }
      } catch (error) {
        console.error(`Error calculating balance for account ${account.id}:`, error)
      }
    }

    // Calcular resultados del mes (solo movimientos del mes)
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

    const { data: monthMovements } = await supabase
      .from("ledger_movements")
      .select(`
        *,
        financial_accounts:account_id(
          chart_of_accounts:chart_account_id(
            category,
            subcategory,
            account_type
          )
        )
      `)
      .gte("created_at", `${monthStart}T00:00:00`)
      .lte("created_at", `${monthEnd}T23:59:59`)

    let ingresos = 0
    let costos = 0
    let gastos = 0

    for (const movement of monthMovements || []) {
      const chartAccount = (movement.financial_accounts as any)?.chart_of_accounts
      if (chartAccount?.category === "RESULTADO") {
        const amount = parseFloat(movement.amount_ars_equivalent || "0")
        if (chartAccount.subcategory === "INGRESOS" && movement.type === "INCOME") {
          ingresos += amount
        } else if (chartAccount.subcategory === "COSTOS" && movement.type === "EXPENSE") {
          costos += amount
        } else if (chartAccount.subcategory === "GASTOS" && movement.type === "EXPENSE") {
          gastos += amount
        }
      }
    }

    // Estructurar respuesta
    const activo_corriente = balances["ACTIVO_CORRIENTE"] || 0
    const activo_no_corriente = balances["ACTIVO_NO_CORRIENTE"] || 0
    const pasivo_corriente = balances["PASIVO_CORRIENTE"] || 0
    const pasivo_no_corriente = balances["PASIVO_NO_CORRIENTE"] || 0
    const patrimonio_neto = balances["PATRIMONIO_NETO_NONE"] || 0

    const resultado_mes = ingresos - costos - gastos

    return NextResponse.json({
      year,
      month,
      dateTo,
      activo: {
        corriente: Math.round(activo_corriente * 100) / 100,
        no_corriente: Math.round(activo_no_corriente * 100) / 100,
        total: Math.round((activo_corriente + activo_no_corriente) * 100) / 100,
      },
      pasivo: {
        corriente: Math.round(pasivo_corriente * 100) / 100,
        no_corriente: Math.round(pasivo_no_corriente * 100) / 100,
        total: Math.round((pasivo_corriente + pasivo_no_corriente) * 100) / 100,
      },
      patrimonio_neto: {
        total: Math.round(patrimonio_neto * 100) / 100,
      },
      resultado: {
        ingresos: Math.round(ingresos * 100) / 100,
        costos: Math.round(costos * 100) / 100,
        gastos: Math.round(gastos * 100) / 100,
        total: Math.round(resultado_mes * 100) / 100,
      },
      accounts: chartAccounts || [],
    })
  } catch (error: any) {
    console.error("Error in GET /api/accounting/monthly-position:", error)
    return NextResponse.json({ error: error.message || "Error al obtener posición contable" }, { status: 500 })
  }
}

