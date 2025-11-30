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
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const { commissionId, amount, currency, datePaid, method, notes } = body

    if (!commissionId || !amount || !datePaid) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: commissionId, amount, datePaid" },
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

    // Obtener cuenta financiera por defecto
    const accountType = currency === "USD" ? "USD" : "CASH"
    const accountId = await getOrCreateDefaultAccount(
      accountType,
      currency as "ARS" | "USD",
      user.id,
      supabase
    )

    // Calcular ARS equivalent
    let exchangeRate: number | null = null
    if (currency === "USD") {
      const rateDate = datePaid ? new Date(datePaid) : new Date()
      exchangeRate = await getExchangeRate(supabase, rateDate)
      
      // Si no hay tasa para esa fecha, usar la más reciente disponible
      if (!exchangeRate) {
        exchangeRate = await getLatestExchangeRate(supabase)
      }
      
      // Fallback: si aún no hay tasa, usar 1000 como último recurso
      if (!exchangeRate) {
        console.warn(`No exchange rate found for ${rateDate.toISOString()}, using fallback 1000`)
        exchangeRate = 1000
      }
    }
    
    const amountARS = calculateARSEquivalent(
      parseFloat(amount),
      currency as "ARS" | "USD",
      exchangeRate
    )

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

