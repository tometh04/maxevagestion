/**
 * API Route: Pagar comisión
 * 
 * Crea un ledger_movement de tipo COMMISSION y marca la comisión como PAID
 */

import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  getOrCreateDefaultAccount,
  calculateARSEquivalent,
  validateSufficientBalance,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const { commissionId, amount, currency, datePaid, method, notes, financial_account_id, exchange_rate } = body

    if (!commissionId || !amount || !datePaid || !financial_account_id) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: commissionId, amount, datePaid, financial_account_id" },
        { status: 400 }
      )
    }

    // Obtener la comisión
    const { data: commission, error: commissionError } = await (supabase.from("commission_records") as any)
      .select(
        `
        *,
        operations:operation_id(id, agency_id, seller_id, seller_secondary_id)
      `
      )
      .eq("id", commissionId)
      .single()

    if (commissionError || !commission) {
      return NextResponse.json({ error: "Comisión no encontrada" }, { status: 404 })
    }

    // Verificar permisos
    if (user.role === "SELLER" && commission.seller_id !== user.id) {
      return NextResponse.json(
        { error: "No tienes permiso para pagar esta comisión" },
        { status: 403 }
      )
    }

    // Verificar que la comisión esté en estado PENDING
    if (commission.status !== "PENDING") {
      return NextResponse.json(
        { error: "La comisión ya está pagada" },
        { status: 400 }
      )
    }

    const operation = commission.operations

    // Validar que la cuenta financiera existe
    const { data: financialAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, is_active")
      .eq("id", financial_account_id)
      .eq("is_active", true)
      .single()

    if (accountError || !financialAccount) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada o inactiva" }, { status: 404 })
    }

    // Validar que la moneda de la cuenta coincide con la de la comisión
    if (financialAccount.currency !== currency) {
      return NextResponse.json({
        error: `La cuenta financiera debe estar en ${currency}`,
      }, { status: 400 })
    }

    const accountId = financial_account_id

    // Calcular ARS equivalent
    // Si currency = USD, exchange_rate es obligatorio (ya validado en createLedgerMovement)
    // Si currency = ARS, exchange_rate puede ser null o proporcionado para conversión
    let exchangeRate: number | null = exchange_rate ? parseFloat(exchange_rate.toString()) : null
    
    if (currency === "USD") {
      // Para USD, siempre necesitamos tipo de cambio
      if (!exchangeRate) {
        const rateDate = datePaid ? new Date(datePaid) : new Date()
        exchangeRate = await getExchangeRate(supabase, rateDate)
        
        if (!exchangeRate) {
          exchangeRate = await getLatestExchangeRate(supabase)
        }
        
        if (!exchangeRate) {
          return NextResponse.json(
            { error: "Tipo de cambio requerido para comisiones en USD" },
            { status: 400 }
          )
        }
      }
    } else if (currency === "ARS" && exchange_rate) {
      // Si es ARS y se proporcionó TC, usarlo (para casos especiales)
      exchangeRate = parseFloat(exchange_rate.toString())
    }
    
    const amountARS = calculateARSEquivalent(
      parseFloat(amount),
      currency as "ARS" | "USD",
      exchangeRate
    )

    // Validar saldo suficiente (NUNCA permitir saldo negativo)
    const amountToCheck = parseFloat(amount)
    const balanceCheck = await validateSufficientBalance(
      accountId,
      amountToCheck,
      currency as "ARS" | "USD",
      supabase
    )
    
    if (!balanceCheck.valid) {
      return NextResponse.json(
        { error: balanceCheck.error || "Saldo insuficiente en cuenta para realizar el pago" },
        { status: 400 }
      )
    }

    // Crear ledger_movement COMMISSION
    // Esto automáticamente marcará la comisión como PAID (ver lib/accounting/ledger.ts)
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: operation?.id || null,
        lead_id: null,
        type: "COMMISSION",
        concept: `Pago de comisión - ${commission.operations?.id ? `Operación ${commission.operations.id.slice(0, 8)}` : "Comisión"}`,
        currency: currency as "ARS" | "USD",
        amount_original: parseFloat(amount),
        exchange_rate: exchangeRate,
        amount_ars_equivalent: amountARS,
        method: (method || "CASH") as "CASH" | "BANK" | "MP" | "USD" | "OTHER",
        account_id: accountId,
        seller_id: commission.seller_id,
        operator_id: null,
        receipt_number: null,
        notes: notes || null,
        created_by: user.id,
      },
      supabase
    )

    return NextResponse.json({
      success: true,
      ledgerMovementId,
      message: "Comisión pagada exitosamente",
    })
  } catch (error: any) {
    console.error("Error in POST /api/commissions/pay:", error)
    return NextResponse.json(
      { error: error.message || "Error al pagar comisión" },
      { status: 500 }
    )
  }
}

