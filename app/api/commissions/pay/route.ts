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
import { getExchangeRate, getLatestExchangeRate, getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import { getCommissionCurrency } from "@/lib/commissions/currency"

async function fetchBcraRate(): Promise<number | null> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const rate = data.venta || data.compra
    return rate && rate > 1 ? Number(rate) : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    // `cash_amount` (opcional) es lo que realmente sale de la cuenta, en la
    // moneda de la cuenta. Ver más abajo: solo se usa si es consistente.
    const { commissionId, amount, currency, datePaid, method, notes, financial_account_id, exchange_rate } = body

    if (!commissionId || !amount || !datePaid || !financial_account_id) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: commissionId, amount, datePaid, financial_account_id" },
        { status: 400 }
      )
    }

    // Obtener la comisión (scopeado por org)
    const { data: commission, error: commissionError } = await (supabase.from("commission_records") as any)
      .select(
        `
        *,
        operations:operation_id(id, agency_id, seller_id, seller_secondary_id)
      `
      )
      .eq("id", commissionId)
      .eq("org_id", (user as any).org_id)
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

    // Verificar que la comisión no esté completamente pagada
    if (commission.status === "PAID") {
      return NextResponse.json(
        { error: "La comisión ya está completamente pagada" },
        { status: 400 }
      )
    }

    // Comisión dada por saldada en un cierre administrativo (VIB-94): no es
    // deuda, así que pagarla sacaría plata de la caja contra nada.
    if (commission.settled_at) {
      return NextResponse.json(
        { error: "La comisión está saldada y no se puede pagar" },
        { status: 400 }
      )
    }

    const operation = commission.operations

    // Validar que la cuenta financiera existe (scopeada por org)
    const { data: financialAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, is_active")
      .eq("id", financial_account_id)
      .eq("org_id", (user as any).org_id)
      .eq("is_active", true)
      .single()

    if (accountError || !financialAccount) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada o inactiva" }, { status: 404 })
    }

    const accountId = financial_account_id
    const accountCur = financialAccount.currency as "ARS" | "USD"
    const commissionCur = currency as "ARS" | "USD"
    const applyAmount = parseFloat(amount) // en moneda de la comisión (reduce el saldo pendiente)

    // ── Ajustes negativos que se netean contra este pago (VIB-174) ──────────
    // Cuando la liquidación del operador llega más cara de lo estimado, el
    // vendedor cobró comisión sobre una ganancia que no fue y le queda una fila
    // NEGATIVA. No se puede "pagar" sola: se descuenta de lo próximo que se le
    // pague, que es exactamente lo que hace este bloque. Sale menos plata de la
    // cuenta y las dos filas quedan saldadas.
    const offsetIds: string[] = Array.isArray(body.offsetIds) ? body.offsetIds : []
    let offsets: any[] = []
    let offsetTotal = 0

    if (offsetIds.length > 0) {
      const { data: offsetRows, error: offsetError } = await (supabase.from("commission_records") as any)
        .select("id, seller_id, amount, amount_paid, status, kind, settled_at, operations:operation_id(currency, sale_currency)")
        .in("id", offsetIds)
        .eq("org_id", (user as any).org_id)

      if (offsetError) {
        return NextResponse.json({ error: "Error al leer los ajustes a descontar" }, { status: 500 })
      }

      offsets = offsetRows || []

      if (offsets.length !== offsetIds.length) {
        return NextResponse.json(
          { error: "Alguno de los ajustes a descontar no existe o no es de esta organización" },
          { status: 404 }
        )
      }

      for (const offset of offsets) {
        if (offset.kind !== "ADJUSTMENT") {
          return NextResponse.json(
            { error: "Solo se pueden descontar ajustes de liquidación, no otras comisiones" },
            { status: 400 }
          )
        }
        if (offset.seller_id !== commission.seller_id) {
          return NextResponse.json(
            { error: "El ajuste a descontar es de otro vendedor" },
            { status: 400 }
          )
        }
        if (Number(offset.amount) >= 0) {
          return NextResponse.json(
            { error: "Solo se descuentan ajustes en contra del vendedor" },
            { status: 400 }
          )
        }
        if (offset.status !== "PENDING" || Number(offset.amount_paid || 0) !== 0 || offset.settled_at) {
          return NextResponse.json(
            { error: "El ajuste a descontar ya fue liquidado" },
            { status: 409 }
          )
        }
        // ARS y USD no se suman: descontar un ajuste en pesos de una comisión en
        // dólares daría un neto que no significa nada.
        if (getCommissionCurrency({ amount: 0, operation: offset.operations }) !== commissionCur) {
          return NextResponse.json(
            { error: "El ajuste a descontar está en otra moneda que la comisión que se está pagando" },
            { status: 400 }
          )
        }

        offsetTotal += Number(offset.amount) // negativo
      }
    }

    // Lo que realmente sale de la cuenta: la comisión menos los ajustes.
    const netApplyAmount = Math.round((applyAmount + offsetTotal) * 100) / 100

    if (offsets.length > 0 && netApplyAmount <= 0) {
      return NextResponse.json(
        {
          error: `Los ajustes en contra (${Math.abs(offsetTotal).toFixed(2)}) igualan o superan la comisión a pagar (${applyAmount.toFixed(2)}). Pagá una comisión mayor o descontá menos ajustes: el saldo en contra queda pendiente para la próxima liquidación.`,
          code: "OFFSET_EXCEEDS_PAYMENT",
        },
        { status: 400 }
      )
    }

    // Determinar el movimiento de caja en la MONEDA DE LA CUENTA.
    // Permite pagar una comisión en USD desde una cuenta en ARS (o viceversa)
    // ingresando tipo de cambio, igual que en cobros/pagos de servicios.
    let exchangeRate: number | null = exchange_rate ? parseFloat(exchange_rate.toString()) : null
    let cashAmount: number // monto que sale de la cuenta, en accountCur
    let amountARS: number // equivalente en ARS para el ledger

    // Se convierte el NETO (comisión menos ajustes en contra): es la plata que
    // efectivamente sale de la cuenta.
    if (accountCur === commissionCur) {
      cashAmount = netApplyAmount
      if (commissionCur === "USD") {
        // Cuenta USD: TC solo para el equivalente ARS del ledger.
        if (!exchangeRate) {
          const rateDate = datePaid ? new Date(datePaid) : new Date()
          const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "commissions-pay")
          exchangeRate = rateResult.rate
        }
        amountARS = calculateARSEquivalent(cashAmount, "USD", exchangeRate)
      } else {
        amountARS = cashAmount // ARS == ARS
      }
    } else {
      // Pago cross-moneda → TC obligatorio.
      if (!exchangeRate || exchangeRate <= 0) {
        return NextResponse.json(
          { error: "Debe ingresar el tipo de cambio para pagar en una moneda distinta a la de la comisión" },
          { status: 400 }
        )
      }
      if (commissionCur === "USD" && accountCur === "ARS") {
        cashAmount = Math.round(netApplyAmount * exchangeRate * 100) / 100
        amountARS = cashAmount
      } else if (commissionCur === "ARS" && accountCur === "USD") {
        cashAmount = Math.round((netApplyAmount / exchangeRate) * 100) / 100
        amountARS = netApplyAmount
      } else {
        return NextResponse.json({ error: "Combinación de monedas no soportada" }, { status: 400 })
      }
    }

    // Importe exacto que sale de la cuenta. Lo manda el pago dividido, donde el
    // usuario carga la forma de pago en la moneda de la CUENTA ("le doy
    // $200.000 y el resto en dólares"): reconvertir ese número deja un desvío de
    // centavos entre lo que dice el comprobante y lo que salió de la caja.
    //
    // Se acepta solo si se corresponde con el monto y el tipo de cambio
    // informados: si no, sería una forma de sacar de la cuenta un importe que
    // no tiene nada que ver con la comisión que se está cancelando.
    if (body.cash_amount !== undefined && body.cash_amount !== null) {
      const requestedCash = parseFloat(String(body.cash_amount))

      if (!Number.isFinite(requestedCash) || requestedCash <= 0) {
        return NextResponse.json(
          { error: "El importe a debitar de la cuenta no es válido" },
          { status: 400 }
        )
      }

      const tolerance = Math.max(0.05, cashAmount * 0.01)
      if (Math.abs(requestedCash - cashAmount) > tolerance) {
        return NextResponse.json(
          {
            error:
              `El importe a debitar (${requestedCash.toFixed(2)} ${accountCur}) no se corresponde con ` +
              `la comisión a pagar y el tipo de cambio informado (${cashAmount.toFixed(2)} ${accountCur}).`,
          },
          { status: 400 }
        )
      }

      cashAmount = requestedCash
      amountARS =
        accountCur === "ARS"
          ? requestedCash
          : calculateARSEquivalent(requestedCash, "USD", exchangeRate)
    }

    // Validar saldo suficiente en la cuenta (en su propia moneda) — NUNCA saldo negativo.
    const balanceCheck = await validateSufficientBalance(
      accountId,
      cashAmount,
      accountCur,
      supabase
    )

    if (!balanceCheck.valid) {
      return NextResponse.json(
        { error: balanceCheck.error || "Saldo insuficiente en cuenta para realizar el pago" },
        { status: 400 }
      )
    }

    // Calcular amount_paid acumulado (en moneda de la comisión)
    const payAmount = applyAmount
    const previouslyPaid = parseFloat(commission.amount_paid || "0")
    const totalPaid = previouslyPaid + payAmount
    const commissionTotal = parseFloat(commission.amount)
    const isFullyPaid = totalPaid >= commissionTotal

    // Validar que no se pague más de lo que se debe
    const remaining = commissionTotal - previouslyPaid
    if (payAmount > remaining + 0.01) { // 0.01 tolerance for rounding
      return NextResponse.json(
        { error: `El monto a pagar (${payAmount}) excede el restante (${remaining.toFixed(2)})` },
        { status: 400 }
      )
    }

    // Crear ledger_movement COMMISSION
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: operation?.id || null,
        lead_id: null,
        type: "COMMISSION",
        concept: `Pago de comisión${isFullyPaid ? "" : " (parcial)"} - ${commission.operations?.id ? `Operación ${commission.operations.id.slice(0, 8)}` : "Comisión"}`,
        currency: accountCur,
        amount_original: cashAmount,
        exchange_rate: exchangeRate,
        amount_ars_equivalent: amountARS,
        method: (method || "CASH") as "CASH" | "BANK" | "MP" | "USD" | "OTHER",
        account_id: accountId,
        seller_id: commission.seller_id,
        operator_id: null,
        receipt_number: null,
        notes: notes || null,
        created_by: user.id,
        // Acota el marcado automático a la comisión que realmente se está
        // pagando. Sin esto, una operación con comisión de venta y comisiones de
        // servicios del mismo vendedor daría por saldadas todas al cobrar una.
        commission_record_id: commission.id,
      },
      supabase
    )

    // VIB-142: asiento del pago (Debe deuda con el vendedor / Haber cuenta
    // financiera). No debita 4.3.03: ese gasto ya se devengó al confirmar la
    // operación, y volver a debitarlo contaría la comisión dos veces.
    // No bloquea el pago: la plata ya se movió.
    try {
      const { createMovementJournalEntry, COUNTERPART_CODES } = await import(
        "@/lib/accounting/movement-journal"
      )
      await createMovementJournalEntry(
        {
          movementId: ledgerMovementId,
          counterpartCode: COUNTERPART_CODES.COMMISSION_PAYMENT,
          direction: "OUT",
        },
        supabase
      )
    } catch (journalError) {
      console.error("Error asentando el pago de comisión:", journalError)
    }

    // Actualizar commission_record con amount_paid y status
    const updateData: Record<string, any> = {
      amount_paid: totalPaid,
      updated_at: new Date().toISOString(),
    }
    if (isFullyPaid) {
      updateData.status = "PAID"
      updateData.date_paid = datePaid
    }

    await (supabase.from("commission_records") as any)
      .update(updateData)
      .eq("id", commissionId)
      .eq("org_id", (user as any).org_id)

    // Los ajustes descontados quedan saldados con este mismo pago: el vendedor
    // ya devolvió su parte, cobrando menos. Se marcan con CAS sobre el estado
    // que se validó arriba, para que un pago concurrente no los sadle dos veces.
    const offsetsSettled: string[] = []
    for (const offset of offsets) {
      const { data: settled } = await (supabase.from("commission_records") as any)
        .update({
          amount_paid: Number(offset.amount),
          status: "PAID",
          date_paid: datePaid,
          updated_at: new Date().toISOString(),
        })
        .eq("id", offset.id)
        .eq("org_id", (user as any).org_id)
        .eq("status", "PENDING")
        .select("id")

      if (settled && settled.length > 0) offsetsSettled.push(offset.id)
      else {
        console.error(
          `[VIB-174] El ajuste ${offset.id} cambió de estado durante el pago de la comisión ${commissionId}: se descontó de la plata pero quedó PENDING.`
        )
      }
    }

    // Registrar en audit trail
    try {
      await (supabase.rpc as any)('log_audit_action', {
        p_user_id: user.id,
        p_action: 'COMMISSION_PAID',
        p_entity_type: 'commission',
        p_entity_id: commissionId,
        p_details: { amount: payAmount, seller_id: commission.seller_id }
      })
    } catch (auditError) {
      console.warn('Error logging audit action:', auditError)
    }

    return NextResponse.json({
      success: true,
      ledgerMovementId,
      isFullyPaid,
      amountPaid: totalPaid,
      offsetsSettled,
      offsetTotal: Math.round(offsetTotal * 100) / 100,
      cashPaid: cashAmount,
      remaining: Math.max(0, commissionTotal - totalPaid),
      message: isFullyPaid ? "Comisión pagada completamente" : `Pago parcial registrado. Restante: ${(commissionTotal - totalPaid).toFixed(2)}`,
    })
  } catch (error: any) {
    console.error("Error in POST /api/commissions/pay:", error)
    return NextResponse.json(
      { error: error.message || "Error al pagar comisión" },
      { status: 500 }
    )
  }
}

