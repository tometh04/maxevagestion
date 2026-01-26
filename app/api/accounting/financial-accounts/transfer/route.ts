import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  validateSufficientBalance,
  getAccountBalance,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

/**
 * POST /api/accounting/financial-accounts/transfer
 * Transferir dinero entre dos cuentas financieras
 * 
 * Reglas:
 * - Siempre misma moneda (ARS→ARS, USD→USD)
 * - Dos movimientos: EXPENSE en origen, INCOME en destino
 * - Validar saldo suficiente en cuenta origen
 * - Montos exactamente iguales
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canPerformAction(user, "accounting", "write")) {
      return NextResponse.json({ error: "No tiene permiso para transferir entre cuentas" }, { status: 403 })
    }

    const body = await request.json()
    const {
      from_account_id,
      to_account_id,
      amount,
      currency,
      transfer_date,
      notes,
    } = body

    // Validar campos requeridos
    if (!from_account_id || !to_account_id || !amount || amount <= 0 || !currency || !transfer_date) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // No se puede transferir a la misma cuenta
    if (from_account_id === to_account_id) {
      return NextResponse.json({ error: "No se puede transferir a la misma cuenta" }, { status: 400 })
    }

    // Obtener ambas cuentas
    const { data: accounts, error: accountsError } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, is_active")
      .in("id", [from_account_id, to_account_id])

    if (accountsError || !accounts || accounts.length !== 2) {
      return NextResponse.json({ error: "Una o ambas cuentas no fueron encontradas" }, { status: 404 })
    }

    const fromAccount = accounts.find((a: any) => a.id === from_account_id)
    const toAccount = accounts.find((a: any) => a.id === to_account_id)

    if (!fromAccount || !toAccount) {
      return NextResponse.json({ error: "Cuentas no encontradas" }, { status: 404 })
    }

    // Verificar que ambas cuentas estén activas
    if (!fromAccount.is_active || !toAccount.is_active) {
      return NextResponse.json({ error: "Una o ambas cuentas están inactivas" }, { status: 400 })
    }

    // Validar que la moneda coincida con ambas cuentas
    if (fromAccount.currency !== currency || toAccount.currency !== currency) {
      return NextResponse.json({
        error: `Todas las cuentas deben estar en la misma moneda (${currency})`,
      }, { status: 400 })
    }

    // Validar saldo suficiente en cuenta origen (NUNCA permitir saldo negativo)
    const balanceCheck = await validateSufficientBalance(
      from_account_id,
      amount,
      currency as "ARS" | "USD",
      supabase
    )

    if (!balanceCheck.valid) {
      return NextResponse.json(
        { error: balanceCheck.error || "Saldo insuficiente en cuenta origen para realizar la transferencia" },
        { status: 400 }
      )
    }

    // Calcular tipo de cambio si es USD
    let exchangeRate: number | null = null
    if (currency === "USD") {
      const rateDate = transfer_date ? new Date(transfer_date) : new Date()
      exchangeRate = await getExchangeRate(supabase, rateDate)
      if (!exchangeRate) {
        exchangeRate = await getLatestExchangeRate(supabase)
      }
      if (!exchangeRate) {
        exchangeRate = 1000 // Fallback
      }
    }

    const amountARS = currency === "ARS"
      ? amount
      : calculateARSEquivalent(amount, "USD", exchangeRate)

    const method = "BANK"
    const concept = `Transferencia de "${fromAccount.name}" a "${toAccount.name}"`

    // Crear dos movimientos: EXPENSE en origen, INCOME en destino
    await createLedgerMovement(
      {
        operation_id: null,
        lead_id: null,
        type: "EXPENSE",
        concept: `${concept}`,
        currency: currency as "ARS" | "USD",
        amount_original: amount,
        exchange_rate: currency === "USD" ? exchangeRate : null,
        amount_ars_equivalent: amountARS,
        method,
        account_id: from_account_id,
        notes: notes || `Transferencia a cuenta ${toAccount.name}`,
        created_by: user.id,
      },
      supabase
    )

    await createLedgerMovement(
      {
        operation_id: null,
        lead_id: null,
        type: "INCOME",
        concept: `${concept}`,
        currency: currency as "ARS" | "USD",
        amount_original: amount,
        exchange_rate: currency === "USD" ? exchangeRate : null,
        amount_ars_equivalent: amountARS,
        method,
        account_id: to_account_id,
        notes: notes || `Transferencia desde cuenta ${fromAccount.name}`,
        created_by: user.id,
      },
      supabase
    )

    // Verificar balances después de la transferencia
    const fromBalance = await getAccountBalance(from_account_id, supabase)
    const toBalance = await getAccountBalance(to_account_id, supabase)

    console.log(`✅ Transferencia completada:`, {
      from: fromAccount.name,
      to: toAccount.name,
      amount,
      currency,
      fromBalance,
      toBalance,
    })

    return NextResponse.json({
      success: true,
      message: `Transferencia de ${amount} ${currency} de "${fromAccount.name}" a "${toAccount.name}" completada`,
      fromBalance,
      toBalance,
    }, { status: 201 })
  } catch (e: any) {
    console.error("POST /api/accounting/financial-accounts/transfer:", e)
    return NextResponse.json({ error: e?.message || "Error al realizar transferencia" }, { status: 500 })
  }
}
