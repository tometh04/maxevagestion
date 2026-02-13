/**
 * FX SERVICE - Cálculo de Ganancias y Pérdidas por Tipo de Cambio
 * 
 * Este servicio maneja el cálculo automático de FX_GAIN y FX_LOSS
 * cuando hay diferencias entre monedas en ventas y pagos.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { createLedgerMovement } from "./ledger"
import { getOrCreateDefaultAccount } from "./ledger"
import { getExchangeRate, getLatestExchangeRate } from "./exchange-rates"

/**
 * Calcular y registrar FX_GAIN o FX_LOSS
 * 
 * Se genera FX_GAIN cuando:
 * - Una venta fue en USD y se pagó en ARS, y el ARS pagado < ARS equivalente registrado en la venta
 * 
 * Se genera FX_LOSS cuando:
 * - Una venta fue en USD y se pagó en ARS, y el ARS pagado > ARS equivalente registrado en la venta
 * - O viceversa (venta en ARS, pago en USD)
 */
export async function calculateAndRecordFX(
  supabase: SupabaseClient<Database>,
  operationId: string,
  saleCurrency: "ARS" | "USD",
  saleAmount: number,
  saleExchangeRate: number | null,
  paymentCurrency: "ARS" | "USD",
  paymentAmount: number,
  paymentExchangeRate: number | null,
  userId: string
): Promise<{ fxType: "FX_GAIN" | "FX_LOSS" | null; fxAmount: number }> {
  // Si ambas monedas son iguales, no hay FX
  if (saleCurrency === paymentCurrency) {
    return { fxType: null, fxAmount: 0 }
  }

  // Calcular ARS equivalentes
  const saleArsEquivalent = saleCurrency === "ARS" 
    ? saleAmount 
    : saleAmount * (saleExchangeRate || 1)

  const paymentArsEquivalent = paymentCurrency === "ARS"
    ? paymentAmount
    : paymentAmount * (paymentExchangeRate || 1)

  // Calcular diferencia
  const difference = saleArsEquivalent - paymentArsEquivalent

  // Si la diferencia es muy pequeña (< 1 ARS), ignorar
  if (Math.abs(difference) < 1) {
    return { fxType: null, fxAmount: 0 }
  }

  const fxType: "FX_GAIN" | "FX_LOSS" = difference > 0 ? "FX_GAIN" : "FX_LOSS"
  const fxAmount = Math.abs(difference)

  // Obtener cuenta por defecto para FX
  const defaultAccountId = await getOrCreateDefaultAccount("CASH", "ARS", userId, supabase)

  // Crear ledger movement para FX
  await createLedgerMovement(
    {
      operation_id: operationId,
      type: fxType,
      concept: `Diferencia de cambio: ${saleCurrency} → ${paymentCurrency}`,
      currency: "ARS",
      amount_original: fxAmount,
      exchange_rate: null,
      amount_ars_equivalent: fxAmount,
      method: "OTHER",
      account_id: defaultAccountId,
      seller_id: null,
      operator_id: null,
      receipt_number: null,
      notes: `Venta: ${saleAmount} ${saleCurrency} (ARS: ${saleArsEquivalent.toFixed(2)}), Pago: ${paymentAmount} ${paymentCurrency} (ARS: ${paymentArsEquivalent.toFixed(2)})`,
      created_by: userId,
    },
    supabase
  )

  return { fxType, fxAmount }
}

/**
 * Obtener el exchange rate usado en la operación desde los ledger movements
 */
async function getOperationExchangeRate(
  supabase: SupabaseClient<Database>,
  operationId: string,
  currency: "ARS" | "USD"
): Promise<number | null> {
  if (currency === "ARS") {
    return null // No hay conversión necesaria
  }

  // Buscar el primer ledger movement de INCOME para esta operación que tenga exchange_rate
  const { data: movements } = await (supabase.from("ledger_movements") as any)
    .select("exchange_rate, created_at")
    .eq("operation_id", operationId)
    .eq("type", "INCOME")
    .not("exchange_rate", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (movements && movements.exchange_rate) {
    return parseFloat(movements.exchange_rate)
  }

  // Si no hay en ledger, buscar en la fecha de creación de la operación
  const { data: operation } = await (supabase.from("operations") as any)
    .select("created_at, departure_date")
    .eq("id", operationId)
    .single()

  if (operation) {
    const dateToUse = operation.departure_date || operation.created_at
    return await getExchangeRate(supabase, dateToUse)
  }

  return null
}

/**
 * Detectar y registrar FX automáticamente cuando se marca un pago como pagado
 * y hay diferencia de moneda con la operación
 * 
 * Compara los pagos acumulados vs la venta total para calcular FX correctamente
 */
export async function autoCalculateFXForPayment(
  supabase: SupabaseClient<Database>,
  operationId: string,
  paymentCurrency: "ARS" | "USD",
  paymentAmount: number,
  paymentExchangeRate: number | null,
  userId: string
): Promise<{ fxType: "FX_GAIN" | "FX_LOSS" | null; fxAmount: number }> {
  // Obtener información de la operación
  const { data: operation, error } = await (supabase.from("operations") as any)
    .select("sale_amount_total, sale_currency, created_at, departure_date")
    .eq("id", operationId)
    .single()

  if (error || !operation) {
    console.error("Error fetching operation for FX calculation:", error)
    return { fxType: null, fxAmount: 0 }
  }

  // Si no hay venta o moneda, no calcular FX
  if (!operation.sale_currency || !operation.sale_amount_total) {
    return { fxType: null, fxAmount: 0 }
  }

  // Si las monedas son iguales, no hay FX
  if (operation.sale_currency === paymentCurrency) {
    return { fxType: null, fxAmount: 0 }
  }

  // Obtener exchange rate de la operación
  const saleExchangeRate = await getOperationExchangeRate(
    supabase,
    operationId,
    operation.sale_currency
  )

  // Obtener todos los pagos acumulados para esta operación en la misma moneda del pago actual
  const { data: allPayments } = await (supabase.from("payments") as any)
    .select("amount, currency, date_paid")
    .eq("operation_id", operationId)
    .eq("status", "PAID")
    .eq("direction", "INCOME")
    .eq("payer_type", "CUSTOMER")

  // Calcular total pagado en la moneda del pago
  const totalPaidInPaymentCurrency = (allPayments || [])
    .filter((p: any) => p.currency === paymentCurrency)
    .reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0)

  // Calcular ARS equivalentes
  const saleArsEquivalent = operation.sale_currency === "ARS"
    ? operation.sale_amount_total
    : operation.sale_amount_total * (saleExchangeRate || 1450) // Fallback TC aproximado si no hay rate

  // Para el pago, usar el exchange rate proporcionado o buscar uno
  let effectivePaymentRate = paymentExchangeRate
  if (!effectivePaymentRate && paymentCurrency === "USD") {
    const latestPayment = (allPayments || []).find((p: any) => p.currency === paymentCurrency && p.date_paid)
    if (latestPayment) {
      effectivePaymentRate = await getExchangeRate(supabase, latestPayment.date_paid)
    }
    if (!effectivePaymentRate) {
      effectivePaymentRate = await getLatestExchangeRate(supabase) || 1450
    }
  }

  const totalPaidArsEquivalent = paymentCurrency === "ARS"
    ? totalPaidInPaymentCurrency
    : totalPaidInPaymentCurrency * (effectivePaymentRate || 1450)

  // Calcular diferencia
  const difference = saleArsEquivalent - totalPaidArsEquivalent

  // Si la diferencia es muy pequeña (< 1 ARS), ignorar
  if (Math.abs(difference) < 1) {
    return { fxType: null, fxAmount: 0 }
  }

  // Verificar si ya existe un FX movement para esta operación (evitar duplicados)
  const { data: existingFX } = await (supabase.from("ledger_movements") as any)
    .select("id")
    .eq("operation_id", operationId)
    .in("type", ["FX_GAIN", "FX_LOSS"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Si ya existe un FX reciente (últimos 5 minutos), no crear otro
  if (existingFX) {
    const { data: fxMovement } = await (supabase.from("ledger_movements") as any)
      .select("created_at")
      .eq("id", existingFX.id)
      .single()
    
    if (fxMovement) {
      const fxDate = new Date(fxMovement.created_at)
      const now = new Date()
      const diffMinutes = (now.getTime() - fxDate.getTime()) / (1000 * 60)
      
      if (diffMinutes < 5) {
        console.log("FX movement ya existe recientemente, no crear duplicado")
        return { fxType: null, fxAmount: 0 }
      }
    }
  }

  const fxType: "FX_GAIN" | "FX_LOSS" = difference > 0 ? "FX_GAIN" : "FX_LOSS"
  const fxAmount = Math.abs(difference)

  // Obtener cuenta por defecto para FX
  const defaultAccountId = await getOrCreateDefaultAccount("CASH", "ARS", userId, supabase)

  // Crear ledger movement para FX
  await createLedgerMovement(
    {
      operation_id: operationId,
      type: fxType,
      concept: `Diferencia de cambio: Venta ${operation.sale_amount_total} ${operation.sale_currency} vs Pagos ${totalPaidInPaymentCurrency.toFixed(2)} ${paymentCurrency}`,
      currency: "ARS",
      amount_original: fxAmount,
      exchange_rate: null,
      amount_ars_equivalent: fxAmount,
      method: "OTHER",
      account_id: defaultAccountId,
      seller_id: null,
      operator_id: null,
      receipt_number: null,
      notes: `Venta: ${operation.sale_amount_total} ${operation.sale_currency} (ARS: ${saleArsEquivalent.toFixed(2)}), Pagos acumulados: ${totalPaidInPaymentCurrency.toFixed(2)} ${paymentCurrency} (ARS: ${totalPaidArsEquivalent.toFixed(2)})`,
      created_by: userId,
    },
    supabase
  )

  return { fxType, fxAmount }
}

