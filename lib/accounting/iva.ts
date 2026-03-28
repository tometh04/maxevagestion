/**
 * IVA SERVICE - Motor de Cálculo de IVA
 *
 * Este servicio maneja el cálculo automático de IVA en ventas y compras.
 *
 * Alícuotas soportadas según normativa argentina:
 * - 21%: Intermediación outgoing (RG 3166, IVA sobre margen)
 * - 10.5%: Paquetes turísticos nacionales
 * - 0% (Exento): Turismo receptivo/incoming (exportación de servicios)
 *
 * Tipos de servicio turístico:
 * - INTERMEDIACION: Intermediación outgoing → 21% sobre margen (default)
 * - PAQUETE_NACIONAL: Paquete nacional → 10.5% sobre margen
 * - TURISMO_RECEPTIVO: Turismo receptivo/incoming → Exento de IVA
 * - EXENTO: Operaciones exentas genéricas → 0%
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

// Alícuotas de IVA por tipo de servicio turístico
export type IVAServiceType = "INTERMEDIACION" | "PAQUETE_NACIONAL" | "TURISMO_RECEPTIVO" | "EXENTO"

export const IVA_RATES: Record<IVAServiceType, number> = {
  INTERMEDIACION: 0.21,      // 21% - Intermediación outgoing (RG 3166)
  PAQUETE_NACIONAL: 0.105,   // 10.5% - Paquetes turísticos nacionales
  TURISMO_RECEPTIVO: 0,      // 0% - Exportación de servicios (exento)
  EXENTO: 0,                 // 0% - Operaciones exentas genéricas
}

export const IVA_RATE_LABELS: Record<IVAServiceType, string> = {
  INTERMEDIACION: "21% - Intermediación Outgoing (RG 3166)",
  PAQUETE_NACIONAL: "10.5% - Paquete Nacional",
  TURISMO_RECEPTIVO: "0% - Turismo Receptivo (Exento)",
  EXENTO: "0% - Exento",
}

// Default para retrocompatibilidad
const DEFAULT_IVA_RATE = 0.21
const DEFAULT_SERVICE_TYPE: IVAServiceType = "INTERMEDIACION"

/**
 * Obtener la alícuota de IVA según el tipo de servicio
 */
export function getIVARate(serviceType?: IVAServiceType | null): number {
  if (!serviceType || !IVA_RATES[serviceType]) return DEFAULT_IVA_RATE
  return IVA_RATES[serviceType]
}

/**
 * Calcular IVA de una venta sobre la ganancia (margen)
 *
 * Según RG 3166 para intermediación outgoing:
 *   Base imponible = margen (venta - costo operador)
 *   IVA Débito Fiscal = base imponible × alícuota
 *
 * Para turismo receptivo: exento, no genera débito fiscal
 * Para paquetes nacionales: 10.5% sobre margen
 */
export function calculateSaleIVA(
  saleAmountTotal: number,
  operatorCostTotal: number = 0,
  serviceType?: IVAServiceType | null
): {
  net_amount: number
  iva_amount: number
  margin: number
  iva_rate: number
  service_type: IVAServiceType
  is_exempt: boolean
} {
  const effectiveServiceType = serviceType || DEFAULT_SERVICE_TYPE
  const rate = getIVARate(effectiveServiceType)
  const isExempt = rate === 0

  // Calcular ganancia (margen) = base imponible
  const margin = saleAmountTotal - operatorCostTotal

  // Débito fiscal = margen × alícuota
  const iva_amount = isExempt ? 0 : margin * rate
  const net_amount = margin - iva_amount

  return {
    net_amount: Math.round(net_amount * 100) / 100,
    iva_amount: Math.round(iva_amount * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    iva_rate: rate,
    service_type: effectiveServiceType,
    is_exempt: isExempt,
  }
}

/**
 * Calcular IVA de una compra (Crédito Fiscal)
 *
 * Crédito fiscal = IVA incluido en la factura del operador
 * net = operator_cost_total / (1 + alícuota)
 * iva = operator_cost_total - net
 */
export function calculatePurchaseIVA(
  operatorCostTotal: number,
  purchaseIVARate?: number | null
): {
  net_amount: number
  iva_amount: number
  iva_rate: number
} {
  const rate = purchaseIVARate ?? DEFAULT_IVA_RATE

  if (rate === 0) {
    return {
      net_amount: Math.round(operatorCostTotal * 100) / 100,
      iva_amount: 0,
      iva_rate: 0,
    }
  }

  const net_amount = operatorCostTotal / (1 + rate)
  const iva_amount = operatorCostTotal - net_amount

  return {
    net_amount: Math.round(net_amount * 100) / 100,
    iva_amount: Math.round(iva_amount * 100) / 100,
    iva_rate: rate,
  }
}

/**
 * Crear registro de IVA de venta (Débito Fiscal)
 * Calcula IVA sobre la ganancia (margen) = sale_amount_total - operator_cost_total
 * Soporta múltiples alícuotas según tipo de servicio turístico
 */
export async function createSaleIVA(
  supabase: SupabaseClient<Database>,
  operationId: string,
  saleAmountTotal: number,
  currency: "ARS" | "USD",
  saleDate: string,
  operatorCostTotal: number = 0,
  serviceType?: IVAServiceType | null
): Promise<{ id: string }> {
  const { net_amount, iva_amount, iva_rate, service_type, is_exempt } =
    calculateSaleIVA(saleAmountTotal, operatorCostTotal, serviceType)

  const { data, error } = await (supabase.from("iva_sales") as any)
    .insert({
      operation_id: operationId,
      sale_amount_total: saleAmountTotal,
      net_amount,
      iva_amount,
      currency,
      sale_date: saleDate,
      iva_rate: iva_rate,
      service_type: service_type,
      is_exempt: is_exempt,
    })
    .select("id")
    .single()

  if (error) {
    console.error("Error creating sale IVA:", error)
    throw new Error(`Error creando IVA de venta: ${error.message}`)
  }

  return { id: data.id }
}

/**
 * Crear registro de IVA de compra (Crédito Fiscal)
 */
export async function createPurchaseIVA(
  supabase: SupabaseClient<Database>,
  operationId: string,
  operatorId: string | null,
  operatorCostTotal: number,
  currency: "ARS" | "USD",
  purchaseDate: string,
  purchaseIVARate?: number | null
): Promise<{ id: string }> {
  const { net_amount, iva_amount, iva_rate } = calculatePurchaseIVA(operatorCostTotal, purchaseIVARate)

  const { data, error } = await (supabase.from("iva_purchases") as any)
    .insert({
      operation_id: operationId,
      operator_id: operatorId,
      operator_cost_total: operatorCostTotal,
      net_amount,
      iva_amount,
      currency,
      purchase_date: purchaseDate,
      iva_rate: iva_rate,
    })
    .select("id")
    .single()

  if (error) {
    console.error("Error creating purchase IVA:", error)
    throw new Error(`Error creando IVA de compra: ${error.message}`)
  }

  return { id: data.id }
}

/**
 * Actualizar registro de IVA de venta (Débito Fiscal)
 */
export async function updateSaleIVA(
  supabase: SupabaseClient<Database>,
  operationId: string,
  saleAmountTotal: number,
  currency: "ARS" | "USD",
  operatorCostTotal: number = 0,
  serviceType?: IVAServiceType | null
): Promise<void> {
  const { net_amount, iva_amount, iva_rate, service_type, is_exempt } =
    calculateSaleIVA(saleAmountTotal, operatorCostTotal, serviceType)

  const { data: existing } = await (supabase.from("iva_sales") as any)
    .select("id")
    .eq("operation_id", operationId)
    .maybeSingle()

  if (existing) {
    const { error } = await (supabase.from("iva_sales") as any)
      .update({
        sale_amount_total: saleAmountTotal,
        net_amount,
        iva_amount,
        currency,
        iva_rate,
        service_type,
        is_exempt,
      })
      .eq("id", existing.id)

    if (error) {
      throw new Error(`Error actualizando IVA de venta: ${error.message}`)
    }
  }
}

/**
 * Actualizar registro de IVA de compra (Crédito Fiscal)
 */
export async function updatePurchaseIVA(
  supabase: SupabaseClient<Database>,
  operationId: string,
  operatorCostTotal: number,
  currency: "ARS" | "USD",
  purchaseIVARate?: number | null
): Promise<void> {
  const { net_amount, iva_amount, iva_rate } = calculatePurchaseIVA(operatorCostTotal, purchaseIVARate)

  const { data: existing } = await (supabase.from("iva_purchases") as any)
    .select("id")
    .eq("operation_id", operationId)
    .maybeSingle()

  if (existing) {
    const { error } = await (supabase.from("iva_purchases") as any)
      .update({
        operator_cost_total: operatorCostTotal,
        net_amount,
        iva_amount,
        currency,
        iva_rate,
      })
      .eq("id", existing.id)

    if (error) {
      throw new Error(`Error actualizando IVA de compra: ${error.message}`)
    }
  }
}

/**
 * Eliminar registro de IVA de venta
 */
export async function deleteSaleIVA(
  supabase: SupabaseClient<Database>,
  operationId: string
): Promise<void> {
  const { error } = await (supabase.from("iva_sales") as any)
    .delete()
    .eq("operation_id", operationId)

  if (error) {
    throw new Error(`Error eliminando IVA de venta: ${error.message}`)
  }
}

/**
 * Eliminar registro de IVA de compra
 */
export async function deletePurchaseIVA(
  supabase: SupabaseClient<Database>,
  operationId: string
): Promise<void> {
  const { error } = await (supabase.from("iva_purchases") as any)
    .delete()
    .eq("operation_id", operationId)

  if (error) {
    throw new Error(`Error eliminando IVA de compra: ${error.message}`)
  }
}

/**
 * Obtener posición IVA mensual con separación Débito/Crédito Fiscal
 *
 * Posición IVA = Débito Fiscal - Crédito Fiscal - Percepciones IVA sufridas
 *
 * Débito Fiscal: IVA sobre ventas (por alícuota)
 * Crédito Fiscal: IVA sobre compras (facturas de operadores)
 * Percepciones: IVA percibido por bancos/terceros (a favor)
 */
export async function getMonthlyIVAToPay(
  supabase: SupabaseClient<Database>,
  year: number,
  month: number
): Promise<{
  total_sales_iva: number
  total_purchases_iva: number
  iva_to_pay: number
  debito_fiscal: number
  credito_fiscal: number
  debito_by_rate: Record<string, { rate: number; base: number; iva: number; count: number }>
  credito_by_rate: Record<string, { rate: number; base: number; iva: number; count: number }>
  exempt_count: number
  exempt_base: number
}> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`
  const endDate = `${year}-${String(month).padStart(2, "0")}-31`

  // Obtener ventas con detalle de alícuota
  const { data: salesIVA, error: salesError } = await (supabase.from("iva_sales") as any)
    .select("iva_amount, net_amount, sale_amount_total, iva_rate, service_type, is_exempt")
    .gte("sale_date", startDate)
    .lte("sale_date", endDate)

  if (salesError) {
    throw new Error(`Error obteniendo IVA de ventas: ${salesError.message}`)
  }

  // Agrupar débito fiscal por alícuota
  const debitoByRate: Record<string, { rate: number; base: number; iva: number; count: number }> = {}
  let exemptCount = 0
  let exemptBase = 0

  for (const record of (salesIVA || [])) {
    const rate = parseFloat(record.iva_rate || "0.21")
    const iva = parseFloat(record.iva_amount || "0")
    const base = parseFloat(record.net_amount || "0")
    const isExempt = record.is_exempt === true

    if (isExempt || rate === 0) {
      exemptCount++
      exemptBase += parseFloat(record.sale_amount_total || "0")
      continue
    }

    const rateKey = `${(rate * 100).toFixed(1)}%`
    if (!debitoByRate[rateKey]) {
      debitoByRate[rateKey] = { rate, base: 0, iva: 0, count: 0 }
    }
    debitoByRate[rateKey].base += base
    debitoByRate[rateKey].iva += iva
    debitoByRate[rateKey].count++
  }

  const total_sales_iva = (salesIVA || []).reduce(
    (sum: number, r: any) => sum + parseFloat(r.iva_amount || "0"), 0
  )

  // Obtener compras con detalle de alícuota
  const { data: purchasesIVA, error: purchasesError } = await (supabase.from("iva_purchases") as any)
    .select("iva_amount, net_amount, operator_cost_total, iva_rate")
    .gte("purchase_date", startDate)
    .lte("purchase_date", endDate)

  if (purchasesError) {
    throw new Error(`Error obteniendo IVA de compras: ${purchasesError.message}`)
  }

  // Agrupar crédito fiscal por alícuota
  const creditoByRate: Record<string, { rate: number; base: number; iva: number; count: number }> = {}

  for (const record of (purchasesIVA || [])) {
    const rate = parseFloat(record.iva_rate || "0.21")
    const iva = parseFloat(record.iva_amount || "0")
    const base = parseFloat(record.net_amount || "0")

    if (rate === 0) continue

    const rateKey = `${(rate * 100).toFixed(1)}%`
    if (!creditoByRate[rateKey]) {
      creditoByRate[rateKey] = { rate, base: 0, iva: 0, count: 0 }
    }
    creditoByRate[rateKey].base += base
    creditoByRate[rateKey].iva += iva
    creditoByRate[rateKey].count++
  }

  const total_purchases_iva = (purchasesIVA || []).reduce(
    (sum: number, r: any) => sum + parseFloat(r.iva_amount || "0"), 0
  )

  const debito_fiscal = total_sales_iva
  const credito_fiscal = total_purchases_iva
  const iva_to_pay = debito_fiscal - credito_fiscal

  return {
    total_sales_iva: Math.round(total_sales_iva * 100) / 100,
    total_purchases_iva: Math.round(total_purchases_iva * 100) / 100,
    iva_to_pay: Math.round(iva_to_pay * 100) / 100,
    debito_fiscal: Math.round(debito_fiscal * 100) / 100,
    credito_fiscal: Math.round(credito_fiscal * 100) / 100,
    debito_by_rate: debitoByRate,
    credito_by_rate: creditoByRate,
    exempt_count: exemptCount,
    exempt_base: Math.round(exemptBase * 100) / 100,
  }
}

