import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance, getAccountBalancesBatch, isAccountingOnlyAccount } from "@/lib/accounting/ledger"
import { canPerformAction } from "@/lib/permissions-api"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    // Parámetro opcional: excludeAccountingOnly (excluir cuentas contables CpC/CpP)
    const excludeAccountingOnly = searchParams.get("excludeAccountingOnly") === "true"

    // Get all active financial accounts with agency info
    const { data: accounts, error: accountsError } = await (supabase.from("financial_accounts") as any)
      .select(`
        *,
        agencies:agency_id(id, name),
        chart_of_accounts:chart_account_id(
          account_code
        )
      `)
      .eq("is_active", true)
      .order("agency_id", { ascending: true })
      .order("type", { ascending: true })
      .order("currency", { ascending: true })

    if (accountsError) {
      console.error("Error fetching financial accounts:", accountsError)
      return NextResponse.json({ error: "Error al obtener cuentas financieras" }, { status: 500 })
    }

    // Filtrar cuentas contables (CpC/CpP) si se solicita
    let filteredAccounts = accounts || []
    if (excludeAccountingOnly) {
      filteredAccounts = (accounts || []).filter((account: any) => {
        const accountCode = account.chart_of_accounts?.account_code
        // Excluir cuentas con account_code "1.1.03" (Cuentas por Cobrar) o "2.1.01" (Cuentas por Pagar)
        return accountCode !== "1.1.03" && accountCode !== "2.1.01"
      })
    }

    // OPTIMIZACIÓN: Calcular balances en batch (una sola query en lugar de N queries)
    const accountIds = filteredAccounts.map((acc: any) => acc.id)
    let balancesMap: Record<string, number> = {}
    
    try {
      balancesMap = await getAccountBalancesBatch(accountIds, supabase)
    } catch (error) {
      console.error("Error calculating balances in batch, falling back to individual:", error)
      // Fallback: calcular individualmente si falla el batch
      balancesMap = {}
      for (const account of filteredAccounts) {
        try {
          balancesMap[account.id] = await getAccountBalance(account.id, supabase)
        } catch (err) {
          console.error(`Error calculating balance for account ${account.id}:`, err)
          balancesMap[account.id] = account.initial_balance || 0
        }
      }
    }

    // Mapear balances a cuentas
    const accountsWithBalance = filteredAccounts.map((account: any) => ({
      ...account,
      agency_id: account.agency_id, // Asegurar que agency_id esté presente
      current_balance: balancesMap[account.id] ?? (account.initial_balance || 0),
    }))

    const res = NextResponse.json({ accounts: accountsWithBalance })
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate")
    return res
  } catch (error) {
    console.error("Error in GET /api/accounting/financial-accounts:", error)
    return NextResponse.json({ error: "Error al obtener cuentas financieras" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (!canPerformAction(user, "accounting", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear cuentas" }, { status: 403 })
    }

    const body = await request.json()
    const {
      name,
      type,
      currency,
      agency_id,
      initial_balance,
      account_number,
      bank_name,
      card_number,
      card_holder,
      card_expiry_date,
      asset_type,
      asset_description,
      asset_quantity,
      notes,
      is_active,
    } = body

    // Validar campos requeridos
    if (!name || !type || !currency || !agency_id) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Validar tipo
    const validTypes = [
      "SAVINGS_ARS",
      "SAVINGS_USD",
      "CHECKING_ARS",
      "CHECKING_USD",
      "CASH_ARS",
      "CASH_USD",
      "CREDIT_CARD",
      "ASSETS",
    ]
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Tipo de cuenta inválido" }, { status: 400 })
    }

    // Mapeo de tipos de financial_accounts a códigos del plan de cuentas
    const typeToChartCode: Record<string, string> = {
      CASH_ARS: "1.1.01", // Caja
      CASH_USD: "1.1.01", // Caja (USD también va a Caja)
      CHECKING_ARS: "1.1.02", // Bancos
      CHECKING_USD: "1.1.02", // Bancos
      CREDIT_CARD: "1.1.04", // Mercado Pago
      SAVINGS_ARS: "1.1.02", // Caja de Ahorro → Bancos
      SAVINGS_USD: "1.1.02", // Caja de Ahorro USD → Bancos
      ASSETS: "1.1.05", // Activos en Stock
    }

    // Obtener chart_account_id según el tipo de cuenta
    let chart_account_id: string | null = null
    const chartCode = typeToChartCode[type]
    if (chartCode) {
      const { data: chartAccount } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", chartCode)
        .eq("is_active", true)
        .maybeSingle()
      
      if (chartAccount) {
        chart_account_id = chartAccount.id
      } else {
        console.warn(`⚠️ No se encontró cuenta del plan con código ${chartCode} para tipo ${type}`)
      }
    }

    // Preparar datos para inserción
    const accountData: any = {
      name,
      type,
      currency,
      agency_id,
      initial_balance: Number(initial_balance) || 0,
      notes: notes || null,
      is_active: is_active !== undefined ? is_active : true,
      created_by: user.id,
      chart_account_id: chart_account_id || null, // Asignar chart_account_id automáticamente
    }

    // Campos opcionales según tipo
    if (account_number) accountData.account_number = account_number
    if (bank_name) accountData.bank_name = bank_name
    if (card_number) accountData.card_number = card_number.slice(-4) // Solo últimos 4 dígitos
    if (card_holder) accountData.card_holder = card_holder
    if (card_expiry_date) accountData.card_expiry_date = card_expiry_date
    if (asset_type) accountData.asset_type = asset_type
    if (asset_description) accountData.asset_description = asset_description
    if (asset_quantity !== undefined) accountData.asset_quantity = Number(asset_quantity) || 0

    const { data: account, error: insertError } = await (supabase.from("financial_accounts") as any)
      .insert(accountData)
      .select()
      .single()

    if (insertError) {
      console.error("Error creating financial account:", insertError)
      return NextResponse.json({ error: "Error al crear cuenta: " + insertError.message }, { status: 500 })
    }

    return NextResponse.json({ account }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/accounting/financial-accounts:", error)
    return NextResponse.json({ error: "Error al crear cuenta" }, { status: 500 })
  }
}

