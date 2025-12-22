import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance } from "@/lib/accounting/ledger"

// Forzar ruta dinámica
export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/pending-balances
 * Obtiene los balances reales de "Cuentas por Cobrar" y "Cuentas por Pagar"
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    console.log("[PendingBalances] Iniciando cálculo de balances...")

    // Obtener cuenta "Cuentas por Cobrar" (account_code: 1.1.03)
    const { data: accountsReceivableChart, error: chartReceivableError } = await (supabase.from("chart_of_accounts") as any)
      .select("id, account_code, account_name")
      .eq("account_code", "1.1.03")
      .eq("is_active", true)
      .maybeSingle()

    if (chartReceivableError) {
      console.error("[PendingBalances] Error obteniendo chart account 1.1.03:", chartReceivableError)
    }

    let accountsReceivableBalance = 0
    if (accountsReceivableChart) {
      console.log(`[PendingBalances] Chart account encontrado: ${accountsReceivableChart.account_name} (${accountsReceivableChart.account_code})`)
      
      let accountsReceivableAccounts = await (supabase.from("financial_accounts") as any)
        .select("id, name, currency")
        .eq("chart_account_id", accountsReceivableChart.id)
        .eq("is_active", true)

      let { data: accountsReceivableData, error: accountsReceivableError } = await accountsReceivableAccounts

      if (accountsReceivableError) {
        console.error("[PendingBalances] Error obteniendo financial accounts para Cuentas por Cobrar:", accountsReceivableError)
      }

      // Si no existen cuentas financieras, crear una por defecto
      if (!accountsReceivableData || accountsReceivableData.length === 0) {
        console.log("[PendingBalances] No se encontraron cuentas financieras para Cuentas por Cobrar, creando una...")
        const { data: newAccount, error: createError } = await (supabase.from("financial_accounts") as any)
          .insert({
            name: "Cuentas por Cobrar",
            type: "ASSETS",
            currency: "ARS",
            chart_account_id: accountsReceivableChart.id,
            initial_balance: 0,
            is_active: true,
            created_by: user.id,
          })
          .select("id, name, currency")
          .single()

        if (createError) {
          console.error("[PendingBalances] Error creando cuenta financiera Cuentas por Cobrar:", createError)
        } else {
          console.log(`[PendingBalances] Cuenta financiera creada: ${newAccount.name} (${newAccount.id})`)
          accountsReceivableData = [newAccount]
        }
      }

      if (accountsReceivableData && accountsReceivableData.length > 0) {
        console.log(`[PendingBalances] Procesando ${accountsReceivableData.length} cuentas financieras de Cuentas por Cobrar`)
        for (const account of accountsReceivableData) {
          try {
            const balance = await getAccountBalance(account.id, supabase)
            console.log(`[PendingBalances] Cuenta ${account.name} (${account.currency}): balance=${balance}`)
            accountsReceivableBalance += balance
          } catch (error) {
            console.error(`[PendingBalances] Error calculating balance for account ${account.id}:`, error)
          }
        }
      }
    } else {
      console.warn("[PendingBalances] No se encontró chart account 1.1.03 (Cuentas por Cobrar)")
    }

    // Obtener cuenta "Cuentas por Pagar" (account_code: 2.1.01)
    const { data: accountsPayableChart, error: chartPayableError } = await (supabase.from("chart_of_accounts") as any)
      .select("id, account_code, account_name")
      .eq("account_code", "2.1.01")
      .eq("is_active", true)
      .maybeSingle()

    if (chartPayableError) {
      console.error("[PendingBalances] Error obteniendo chart account 2.1.01:", chartPayableError)
    }

    let accountsPayableBalance = 0
    if (accountsPayableChart) {
      console.log(`[PendingBalances] Chart account encontrado: ${accountsPayableChart.account_name} (${accountsPayableChart.account_code})`)
      
      let accountsPayableAccounts = await (supabase.from("financial_accounts") as any)
        .select("id, name, currency")
        .eq("chart_account_id", accountsPayableChart.id)
        .eq("is_active", true)

      let { data: accountsPayableData, error: accountsPayableError } = await accountsPayableAccounts

      if (accountsPayableError) {
        console.error("[PendingBalances] Error obteniendo financial accounts para Cuentas por Pagar:", accountsPayableError)
      }

      // Si no existen cuentas financieras, crear una por defecto
      if (!accountsPayableData || accountsPayableData.length === 0) {
        console.log("[PendingBalances] No se encontraron cuentas financieras para Cuentas por Pagar, creando una...")
        const { data: newAccount, error: createError } = await (supabase.from("financial_accounts") as any)
          .insert({
            name: "Cuentas por Pagar",
            type: "ASSETS", // Usar ASSETS como tipo válido - el chart_account_id determina si es activo/pasivo
            currency: "ARS",
            chart_account_id: accountsPayableChart.id,
            initial_balance: 0,
            is_active: true,
            created_by: user.id,
          })
          .select("id, name, currency")
          .single()

        if (createError) {
          console.error("[PendingBalances] Error creando cuenta financiera Cuentas por Pagar:", createError)
        } else {
          console.log(`[PendingBalances] Cuenta financiera creada: ${newAccount.name} (${newAccount.id})`)
          accountsPayableData = [newAccount]
        }
      }

      if (accountsPayableData && accountsPayableData.length > 0) {
        console.log(`[PendingBalances] Procesando ${accountsPayableData.length} cuentas financieras de Cuentas por Pagar`)
        for (const account of accountsPayableData) {
          try {
            const balance = await getAccountBalance(account.id, supabase)
            console.log(`[PendingBalances] Cuenta ${account.name} (${account.currency}): balance=${balance}`)
            accountsPayableBalance += balance
          } catch (error) {
            console.error(`[PendingBalances] Error calculating balance for account ${account.id}:`, error)
          }
        }
      }
    } else {
      console.warn("[PendingBalances] No se encontró chart account 2.1.01 (Cuentas por Pagar)")
    }

    console.log(`[PendingBalances] Balance final - Cuentas por Cobrar: ${accountsReceivableBalance}, Cuentas por Pagar: ${accountsPayableBalance}`)

    // Para ACTIVOS (Cuentas por Cobrar): el balance positivo significa que nos deben
    // Para PASIVOS (Cuentas por Pagar): el balance positivo significa que debemos
    // Si el balance es negativo, significa que se pagó más de lo debido (no es un pendiente)
    return NextResponse.json({
      accountsReceivable: Math.max(0, accountsReceivableBalance), // Solo valores positivos (lo que nos deben)
      accountsPayable: Math.max(0, accountsPayableBalance), // Solo valores positivos (lo que debemos)
      debug: {
        accountsReceivableRaw: accountsReceivableBalance,
        accountsPayableRaw: accountsPayableBalance,
        chartAccountsFound: {
          receivable: !!accountsReceivableChart,
          payable: !!accountsPayableChart,
        },
      },
    })
  } catch (error: any) {
    console.error("[PendingBalances] Error in GET /api/analytics/pending-balances:", error)
    return NextResponse.json({ 
      accountsReceivable: 0,
      accountsPayable: 0,
      error: error.message 
    }, { status: 500 })
  }
}

