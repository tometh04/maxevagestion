/**
 * IVA SERVICE - Motor de Cálculo de IVA
 * 
 * Este servicio maneja el cálculo automático de IVA en ventas y compras.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

const IVA_RATE = 0.21 // 21% de IVA en Argentina

/**
 * Calcular IVA de una venta sobre la ganancia (margen)
 * IVA Venta = 21% de (sale_amount_total - operator_cost_total)
 * 
 * Ejemplo: Venta $2000, Costo $1900, Ganancia $100
 * IVA Venta = 21% de $100 = $21
 */
export function calculateSaleIVA(
  saleAmountTotal: number,
  operatorCostTotal: number = 0
): {
  net_amount: number
  iva_amount: number
  margin: number // Ganancia sobre la que se calcula el IVA
} {
  // Calcular ganancia (margen)
  const margin = saleAmountTotal - operatorCostTotal
  
  // IVA sobre la ganancia
  const iva_amount = margin * IVA_RATE
  const net_amount = margin - iva_amount

  return {
    net_amount: Math.round(net_amount * 100) / 100,
    iva_amount: Math.round(iva_amount * 100) / 100,
    margin: Math.round(margin * 100) / 100,
  }
}

/**
 * Calcular IVA de una compra
 * net = operator_cost_total / 1.21
 * iva = operator_cost_total - net
 */
export function calculatePurchaseIVA(operatorCostTotal: number): {
  net_amount: number
  iva_amount: number
} {
  const net_amount = operatorCostTotal / (1 + IVA_RATE)
  const iva_amount = operatorCostTotal - net_amount

  return {
    net_amount: Math.round(net_amount * 100) / 100, // Redondear a 2 decimales
    iva_amount: Math.round(iva_amount * 100) / 100,
  }
}

/**
 * Crear registro de IVA de venta
 * Calcula IVA sobre la ganancia (margen) = sale_amount_total - operator_cost_total
 */
export async function createSaleIVA(
  supabase: SupabaseClient<Database>,
  operationId: string,
  saleAmountTotal: number,
  currency: "ARS" | "USD",
  saleDate: string,
  operatorCostTotal: number = 0
): Promise<{ id: string }> {
  const { net_amount, iva_amount, margin } = calculateSaleIVA(saleAmountTotal, operatorCostTotal)

  const { data, error } = await (supabase.from("iva_sales") as any)
    .insert({
      operation_id: operationId,
      sale_amount_total: saleAmountTotal,
      net_amount,
      iva_amount,
      currency,
      sale_date: saleDate,
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
 * Crear registro de IVA de compra
 */
export async function createPurchaseIVA(
  supabase: SupabaseClient<Database>,
  operationId: string,
  operatorId: string | null,
  operatorCostTotal: number,
  currency: "ARS" | "USD",
  purchaseDate: string
): Promise<{ id: string }> {
  const { net_amount, iva_amount } = calculatePurchaseIVA(operatorCostTotal)

  const { data, error } = await (supabase.from("iva_purchases") as any)
    .insert({
      operation_id: operationId,
      operator_id: operatorId,
      operator_cost_total: operatorCostTotal,
      net_amount,
      iva_amount,
      currency,
      purchase_date: purchaseDate,
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
 * Actualizar registro de IVA de venta
 * Calcula IVA sobre la ganancia (margen)
 */
export async function updateSaleIVA(
  supabase: SupabaseClient<Database>,
  operationId: string,
  saleAmountTotal: number,
  currency: "ARS" | "USD",
  operatorCostTotal: number = 0
): Promise<void> {
  const { net_amount, iva_amount } = calculateSaleIVA(saleAmountTotal, operatorCostTotal)

  // Buscar registro existente
  const { data: existing } = await (supabase.from("iva_sales") as any)
    .select("id")
    .eq("operation_id", operationId)
    .maybeSingle()

  if (existing) {
    // Actualizar
    const { error } = await (supabase.from("iva_sales") as any)
      .update({
        sale_amount_total: saleAmountTotal,
        net_amount,
        iva_amount,
        currency,
      })
      .eq("id", existing.id)

    if (error) {
      throw new Error(`Error actualizando IVA de venta: ${error.message}`)
    }
  }
  // Si no existe, no hacemos nada (ya debería haberse creado con la operación)
}

/**
 * Actualizar registro de IVA de compra
 */
export async function updatePurchaseIVA(
  supabase: SupabaseClient<Database>,
  operationId: string,
  operatorCostTotal: number,
  currency: "ARS" | "USD"
): Promise<void> {
  const { net_amount, iva_amount } = calculatePurchaseIVA(operatorCostTotal)

  // Buscar registro existente
  const { data: existing } = await (supabase.from("iva_purchases") as any)
    .select("id")
    .eq("operation_id", operationId)
    .maybeSingle()

  if (existing) {
    // Actualizar
    const { error } = await (supabase.from("iva_purchases") as any)
      .update({
        operator_cost_total: operatorCostTotal,
        net_amount,
        iva_amount,
        currency,
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
 * Obtener IVA mensual a pagar
 * IVA a pagar = sum(iva_sales.iva_amount) - sum(iva_purchases.iva_amount)
 */
export async function getMonthlyIVAToPay(
  supabase: SupabaseClient<Database>,
  year: number,
  month: number
): Promise<{
  total_sales_iva: number
  total_purchases_iva: number
  iva_to_pay: number
}> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`
  const endDate = `${year}-${String(month).padStart(2, "0")}-31`

  // Sumar IVA de ventas del mes
  const { data: salesIVA, error: salesError } = await (supabase.from("iva_sales") as any)
    .select("iva_amount")
    .gte("sale_date", startDate)
    .lte("sale_date", endDate)

  if (salesError) {
    throw new Error(`Error obteniendo IVA de ventas: ${salesError.message}`)
  }

  const total_sales_iva = salesIVA?.reduce((sum: number, record: any) => sum + parseFloat(record.iva_amount || "0"), 0) || 0

  // Sumar IVA de compras del mes
  const { data: purchasesIVA, error: purchasesError } = await (supabase.from("iva_purchases") as any)
    .select("iva_amount")
    .gte("purchase_date", startDate)
    .lte("purchase_date", endDate)

  if (purchasesError) {
    throw new Error(`Error obteniendo IVA de compras: ${purchasesError.message}`)
  }

  const total_purchases_iva = purchasesIVA?.reduce((sum: number, record: any) => sum + parseFloat(record.iva_amount || "0"), 0) || 0

  const iva_to_pay = total_sales_iva - total_purchases_iva

  return {
    total_sales_iva: Math.round(total_sales_iva * 100) / 100,
    total_purchases_iva: Math.round(total_purchases_iva * 100) / 100,
    iva_to_pay: Math.round(iva_to_pay * 100) / 100,
  }
}

