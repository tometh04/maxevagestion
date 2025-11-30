/**
 * LEDGER SERVICE - Corazón Contable del Sistema
 * 
 * Este servicio maneja todos los movimientos del ledger (libro mayor).
 * TODO movimiento financiero debe pasar por aquí.
 */

import { createServerClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type LedgerMovementType =
  | "INCOME"
  | "EXPENSE"
  | "FX_GAIN"
  | "FX_LOSS"
  | "COMMISSION"
  | "OPERATOR_PAYMENT"

export type LedgerMovementMethod = "CASH" | "BANK" | "MP" | "USD" | "OTHER"

export interface CreateLedgerMovementParams {
  operation_id?: string | null
  lead_id?: string | null
  type: LedgerMovementType
  concept: string
  currency: "ARS" | "USD"
  amount_original: number
  exchange_rate?: number | null
  amount_ars_equivalent: number
  method: LedgerMovementMethod
  account_id: string
  seller_id?: string | null
  operator_id?: string | null
  receipt_number?: string | null
  notes?: string | null
  created_by?: string | null
}

/**
 * Crear un movimiento en el ledger
 */
export async function createLedgerMovement(
  params: CreateLedgerMovementParams,
  supabase: SupabaseClient<Database>
): Promise<{ id: string }> {
  // Validar que si currency = USD, exchange_rate debe estar presente
  if (params.currency === "USD" && !params.exchange_rate) {
    throw new Error("exchange_rate es requerido cuando currency = USD")
  }

  // Validar que amount_ars_equivalent esté presente
  if (!params.amount_ars_equivalent) {
    throw new Error("amount_ars_equivalent es requerido")
  }

  const ledgerTable = supabase.from("ledger_movements") as any

  const { data, error } = await ledgerTable
    .insert({
      operation_id: params.operation_id || null,
      lead_id: params.lead_id || null,
      type: params.type,
      concept: params.concept,
      currency: params.currency,
      amount_original: params.amount_original,
      exchange_rate: params.exchange_rate || null,
      amount_ars_equivalent: params.amount_ars_equivalent,
      method: params.method,
      account_id: params.account_id,
      seller_id: params.seller_id || null,
      operator_id: params.operator_id || null,
      receipt_number: params.receipt_number || null,
      notes: params.notes || null,
      created_by: params.created_by || null,
    })
    .select("id")
    .single()

  if (error) {
    throw new Error(`Error creando ledger movement: ${error.message}`)
  }

  // Si el tipo es COMMISSION y hay operation_id, marcar comisiones como PAID automáticamente
  if (params.type === "COMMISSION" && params.operation_id) {
    try {
      const { markCommissionsAsPaidIfLedgerExists } = await import("./mark-commission-paid")
      await markCommissionsAsPaidIfLedgerExists(supabase, params.operation_id)
    } catch (error) {
      // No fallar si hay error al marcar comisiones, solo loguear
      console.error("Error marking commissions as paid:", error)
    }
  }

  return { id: data.id }
}

/**
 * Calcular el balance de una cuenta financiera
 * Balance = initial_balance + SUM(ledger_movements.amount_ars_equivalent)
 */
export async function getAccountBalance(
  accountId: string,
  supabase: SupabaseClient<Database>
): Promise<number> {
  // Obtener initial_balance
  const { data: account, error: accountError } = await (supabase
    .from("financial_accounts") as any)
    .select("initial_balance")
    .eq("id", accountId)
    .single()

  if (accountError || !account) {
    throw new Error(`Cuenta financiera no encontrada: ${accountId}`)
  }

  const initialBalance = parseFloat(account.initial_balance || "0")

  // Sumar todos los movimientos del ledger para esta cuenta
  const { data: movements, error: movementsError } = await (supabase
    .from("ledger_movements") as any)
    .select("amount_ars_equivalent")
    .eq("account_id", accountId)

  if (movementsError) {
    throw new Error(`Error obteniendo movimientos: ${movementsError.message}`)
  }

  const movementsSum =
    movements?.reduce((sum: number, m: any) => {
      // Sumar ingresos y restar gastos
      if (m.type === "INCOME" || m.type === "FX_GAIN") {
        return sum + parseFloat(m.amount_ars_equivalent || "0")
      } else if (m.type === "EXPENSE" || m.type === "FX_LOSS" || m.type === "COMMISSION" || m.type === "OPERATOR_PAYMENT") {
        return sum - parseFloat(m.amount_ars_equivalent || "0")
      }
      return sum
    }, 0) || 0

  return initialBalance + movementsSum
}

/**
 * Transferir movimientos de un lead a una operación
 * Cuando un Lead se convierte en Operation, todos los ledger_movements
 * con lead_id deben transferirse a operation_id
 */
export async function transferLeadToOperation(
  leadId: string,
  operationId: string,
  supabase: SupabaseClient<Database>
): Promise<{ transferred: number }> {
  const ledgerTable = supabase.from("ledger_movements") as any

  // Actualizar todos los movimientos con lead_id para que tengan operation_id
  const { data, error } = await ledgerTable
    .update({
      operation_id: operationId,
      lead_id: null, // Limpiar lead_id después de transferir
    })
    .eq("lead_id", leadId)
    .select("id")

  if (error) {
    throw new Error(`Error transfiriendo movimientos: ${error.message}`)
  }

  return { transferred: data?.length || 0 }
}

/**
 * Calcular ARS equivalent automáticamente
 * Si currency = ARS, amount_ars_equivalent = amount_original
 * Si currency = USD, amount_ars_equivalent = amount_original * exchange_rate
 */
export function calculateARSEquivalent(
  amount: number,
  currency: "ARS" | "USD",
  exchangeRate?: number | null
): number {
  if (currency === "ARS") {
    return amount
  }

  if (currency === "USD") {
    if (!exchangeRate) {
      throw new Error("exchange_rate es requerido para convertir USD a ARS")
    }
    return amount * exchangeRate
  }

  throw new Error(`Moneda no soportada: ${currency}`)
}

/**
 * Obtener todos los movimientos de un lead
 */
export async function getLeadMovements(
  leadId: string,
  supabase: SupabaseClient<Database>
) {
  const { data, error } = await (supabase.from("ledger_movements") as any)
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Error obteniendo movimientos del lead: ${error.message}`)
  }

  return data || []
}

/**
 * Obtener todos los movimientos de una operación
 */
export async function getOperationMovements(
  operationId: string,
  supabase: SupabaseClient<Database>
) {
  const { data, error } = await (supabase.from("ledger_movements") as any)
    .select("*")
    .eq("operation_id", operationId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Error obteniendo movimientos de la operación: ${error.message}`)
  }

  return data || []
}

/**
 * Obtener movimientos de ledger con filtros
 */
export async function getLedgerMovements(
  supabase: SupabaseClient<Database>,
  filters: {
    dateFrom?: string
    dateTo?: string
    type?: LedgerMovementType | "ALL"
    currency?: "ARS" | "USD" | "ALL"
    accountId?: string | "ALL"
    sellerId?: string | "ALL"
    operatorId?: string | "ALL"
    operationId?: string
    leadId?: string
  }
) {
  let query = (supabase.from("ledger_movements") as any)
    .select(
      `
      *,
      financial_accounts:account_id (id, name, type, currency),
      users:created_by (id, name),
      sellers:seller_id (id, name),
      operators:operator_id (id, name),
      operations:operation_id (id, destination, file_code),
      leads:lead_id (id, contact_name)
    `
    )
    .order("created_at", { ascending: false })

  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte("created_at", filters.dateTo)
  }
  if (filters.type && filters.type !== "ALL") {
    query = query.eq("type", filters.type)
  }
  if (filters.currency && filters.currency !== "ALL") {
    query = query.eq("currency", filters.currency)
  }
  if (filters.accountId && filters.accountId !== "ALL") {
    query = query.eq("account_id", filters.accountId)
  }
  if (filters.sellerId && filters.sellerId !== "ALL") {
    query = query.eq("seller_id", filters.sellerId)
  }
  if (filters.operatorId && filters.operatorId !== "ALL") {
    query = query.eq("operator_id", filters.operatorId)
  }
  if (filters.operationId) {
    query = query.eq("operation_id", filters.operationId)
  }
  if (filters.leadId) {
    query = query.eq("lead_id", filters.leadId)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching ledger movements:", error)
    throw new Error(`Error obteniendo movimientos de ledger: ${error.message}`)
  }

  return data || []
}

/**
 * Obtener o crear una cuenta financiera por defecto
 * Útil para migración y casos donde no se especifica cuenta
 */
export async function getOrCreateDefaultAccount(
  type: "CASH" | "BANK" | "MP" | "USD",
  currency: "ARS" | "USD",
  userId: string,
  supabase: SupabaseClient<Database>
): Promise<string> {
  // Buscar cuenta existente del tipo y moneda
  const { data: existing, error: existingError } = await (supabase.from("financial_accounts") as any)
    .select("id")
    .eq("type", type)
    .eq("currency", currency)
    .limit(1)
    .maybeSingle()

  if (existing && !existingError) {
    return existing.id
  }

  // Si no existe, crear una nueva
  const accountNames: Record<string, string> = {
    CASH: "Caja Principal",
    BANK: "Banco Principal",
    MP: "Mercado Pago",
    USD: "Cuenta USD",
  }

  const { data: newAccount, error } = await (supabase.from("financial_accounts") as any)
    .insert({
      name: accountNames[type] || `Cuenta ${type}`,
      type,
      currency,
      initial_balance: 0,
      created_by: userId,
    })
    .select("id")
    .single()

  if (error || !newAccount) {
    throw new Error(`Error creando cuenta por defecto: ${error?.message || "Unknown error"}`)
  }

  return newAccount.id
}

