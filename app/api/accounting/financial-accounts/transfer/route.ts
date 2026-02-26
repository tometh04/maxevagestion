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
 * - Soporta misma moneda (ARS→ARS, USD→USD) y cross-currency (ARS→USD, USD→ARS)
 * - Cross-currency requiere exchange_rate del cliente
 * - Dos movimientos: EXPENSE en origen (moneda origen), INCOME en destino (moneda destino)
 * - Validar saldo suficiente en cuenta origen
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
      exchange_rate: clientExchangeRate,
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

    const isCrossCurrency = fromAccount.currency !== toAccount.currency

    // Validar moneda del body vs cuenta origen
    if (fromAccount.currency !== currency) {
      return NextResponse.json({
        error: `La moneda debe coincidir con la cuenta origen (${fromAccount.currency})`,
      }, { status: 400 })
    }

    // Si es cross-currency, exchange_rate es obligatorio
    if (isCrossCurrency && (!clientExchangeRate || clientExchangeRate <= 0)) {
      return NextResponse.json({
        error: "El tipo de cambio es obligatorio para transferencias entre distintas monedas",
      }, { status: 400 })
    }

    // Validar saldo suficiente en cuenta origen
    const balanceCheck = await validateSufficientBalance(
      from_account_id,
      amount,
      fromAccount.currency as "ARS" | "USD",
      supabase
    )

    if (!balanceCheck.valid) {
      return NextResponse.json(
        { error: balanceCheck.error || "Saldo insuficiente en cuenta origen para realizar la transferencia" },
        { status: 400 }
      )
    }

    const method = "BANK"

    if (isCrossCurrency) {
      // --- CROSS-CURRENCY TRANSFER ---
      const tc = Number(clientExchangeRate)
      let expenseAmount: number
      let expenseCurrency: "ARS" | "USD"
      let incomeAmount: number
      let incomeCurrency: "ARS" | "USD"
      let concept: string
      let expenseARS: number
      let incomeARS: number

      if (fromAccount.currency === "ARS" && toAccount.currency === "USD") {
        // Compra de dólares: sale ARS, entra USD
        expenseAmount = amount
        expenseCurrency = "ARS"
        incomeAmount = amount / tc
        incomeCurrency = "USD"
        concept = `Compra de dólares - ${fromAccount.name} → ${toAccount.name}`
        expenseARS = amount
        incomeARS = amount // equivalente ARS = monto original en ARS
      } else {
        // Venta de dólares: sale USD, entra ARS
        expenseAmount = amount
        expenseCurrency = "USD"
        incomeAmount = amount * tc
        incomeCurrency = "ARS"
        concept = `Venta de dólares - ${fromAccount.name} → ${toAccount.name}`
        expenseARS = amount * tc
        incomeARS = amount * tc
      }

      // EXPENSE en cuenta origen
      await createLedgerMovement(
        {
          operation_id: null,
          lead_id: null,
          type: "EXPENSE",
          concept,
          currency: expenseCurrency,
          amount_original: expenseAmount,
          exchange_rate: tc,
          amount_ars_equivalent: expenseARS,
          method,
          account_id: from_account_id,
          notes: notes || `${concept} (TC: ${tc})`,
          created_by: user.id,
        },
        supabase
      )

      // INCOME en cuenta destino
      await createLedgerMovement(
        {
          operation_id: null,
          lead_id: null,
          type: "INCOME",
          concept,
          currency: incomeCurrency,
          amount_original: incomeAmount,
          exchange_rate: tc,
          amount_ars_equivalent: incomeARS,
          method,
          account_id: to_account_id,
          notes: notes || `${concept} (TC: ${tc})`,
          created_by: user.id,
        },
        supabase
      )

      const fromBalance = await getAccountBalance(from_account_id, supabase)
      const toBalance = await getAccountBalance(to_account_id, supabase)

      const fromSymbol = fromAccount.currency === "USD" ? "USD" : "$"
      const toSymbol = toAccount.currency === "USD" ? "USD" : "$"

      return NextResponse.json({
        success: true,
        message: `${concept}: ${fromSymbol} ${expenseAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })} → ${toSymbol} ${incomeAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
        fromBalance,
        toBalance,
      }, { status: 201 })

    } else {
      // --- SAME-CURRENCY TRANSFER ---
      let exchangeRate: number | null = null
      if (currency === "USD") {
        const rateDate = transfer_date ? new Date(transfer_date) : new Date()
        exchangeRate = await getExchangeRate(supabase, rateDate)
        if (!exchangeRate) {
          exchangeRate = await getLatestExchangeRate(supabase)
        }
        if (!exchangeRate) {
          exchangeRate = 1450
        }
      }

      const amountARS = currency === "ARS"
        ? amount
        : calculateARSEquivalent(amount, "USD", exchangeRate)

      const concept = `Transferencia de "${fromAccount.name}" a "${toAccount.name}"`

      await createLedgerMovement(
        {
          operation_id: null,
          lead_id: null,
          type: "EXPENSE",
          concept,
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
          concept,
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

      const fromBalance = await getAccountBalance(from_account_id, supabase)
      const toBalance = await getAccountBalance(to_account_id, supabase)

      return NextResponse.json({
        success: true,
        message: `Transferencia de ${amount} ${currency} de "${fromAccount.name}" a "${toAccount.name}" completada`,
        fromBalance,
        toBalance,
      }, { status: 201 })
    }
  } catch (e: any) {
    console.error("POST /api/accounting/financial-accounts/transfer:", e)
    return NextResponse.json({ error: e?.message || "Error al realizar transferencia" }, { status: 500 })
  }
}
