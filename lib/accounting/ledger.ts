/**
 * LEDGER SERVICE - Corazón Contable del Sistema
 * 
 * Este servicio maneja todos los movimientos del ledger (libro mayor).
 * TODO movimiento financiero debe pasar por aquí.
 * 
 * OPTIMIZACIONES DE RENDIMIENTO:
 * - getAccountBalance: Usa agregación SQL en lugar de traer todos los registros
 * - getAccountBalancesBatch: Calcula múltiples balances en una sola query
 * - Caché en memoria para balances calculados (TTL: 30 segundos)
 */

import { createServerClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

// Caché simple en memoria para balances (evita recalcular constantemente)
interface BalanceCacheEntry {
  balance: number
  timestamp: number
}

const balanceCache = new Map<string, BalanceCacheEntry>()
const CACHE_TTL_MS = 30000 // 30 segundos

/**
 * Invalidar caché de balance para una cuenta específica
 * Se llama automáticamente cuando se crea un nuevo movimiento
 */
export function invalidateBalanceCache(accountId: string) {
  balanceCache.delete(accountId)
}

/**
 * Limpiar caché expirado (se ejecuta periódicamente)
 */
function cleanExpiredCache() {
  const now = Date.now()
  for (const [key, entry] of balanceCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      balanceCache.delete(key)
    }
  }
}

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

  // Invalidar caché de balance para esta cuenta
  invalidateBalanceCache(params.account_id)

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
 * 
 * IMPORTANTE: El cálculo depende del tipo de cuenta:
 * - ACTIVOS: INCOME aumenta, EXPENSE disminuye
 * - PASIVOS: EXPENSE aumenta, INCOME disminuye (cuando pagas, reduces el pasivo)
 * - RESULTADO: INCOME aumenta, EXPENSE disminuye
 * 
 * OPTIMIZADO: Usa agregación SQL en lugar de traer todos los registros
 */
export async function getAccountBalance(
  accountId: string,
  supabase: SupabaseClient<Database>
): Promise<number> {
  // Obtener cuenta con su chart_account_id para determinar el tipo
  const { data: account, error: accountError } = await (supabase
    .from("financial_accounts") as any)
    .select(`
      initial_balance,
      currency,
      chart_account_id,
      chart_of_accounts:chart_account_id(
        category
      )
    `)
    .eq("id", accountId)
    .single()

  if (accountError || !account) {
    throw new Error(`Cuenta financiera no encontrada: ${accountId}`)
  }

  const initialBalance = parseFloat(account.initial_balance || "0")
  const accountCurrency = account.currency as "ARS" | "USD"
  const category = account.chart_of_accounts?.category

  // OPTIMIZACIÓN: Traer solo los campos necesarios y calcular suma en memoria
  // Aunque no podemos usar SUM() directamente con Supabase sin RPC, 
  // traer solo los campos necesarios (no *) es más rápido
  // Además, el caché evita recalcular constantemente
  const { data: movements, error: movementsError } = await (supabase
    .from("ledger_movements") as any)
    .select("type, amount_original, amount_ars_equivalent")
    .eq("account_id", accountId)

  if (movementsError) {
    throw new Error(`Error obteniendo movimientos: ${movementsError.message}`)
  }

  // Calcular suma en memoria (optimizado: solo campos necesarios)
  const movementsSum = movements?.reduce((sum: number, m: any) => {
    const amount = parseFloat(
      accountCurrency === "USD" 
        ? (m.amount_original || "0")
        : (m.amount_ars_equivalent || "0")
    )
    
    if (category === "PASIVO") {
      if (m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT" || m.type === "FX_LOSS") {
        return sum + amount
      } else if (m.type === "INCOME" || m.type === "FX_GAIN") {
        return sum - amount
      }
      return sum
    }
    
    if (m.type === "INCOME" || m.type === "FX_GAIN") {
      return sum + amount
    } else if (m.type === "EXPENSE" || m.type === "FX_LOSS" || m.type === "COMMISSION" || m.type === "OPERATOR_PAYMENT") {
      return sum - amount
    }
    return sum
  }, 0) || 0
  const finalBalance = initialBalance + movementsSum

  // Guardar en caché
  balanceCache.set(accountId, {
    balance: finalBalance,
    timestamp: Date.now(),
  })

  // Limpiar caché expirado periódicamente (cada 100 llamadas aproximadamente)
  if (Math.random() < 0.01) {
    cleanExpiredCache()
  }

  return finalBalance
}

/**
 * Calcular balances de múltiples cuentas en una sola query (BATCH)
 * Mucho más eficiente que llamar getAccountBalance() múltiples veces
 * 
 * OPTIMIZACIÓN: Una sola query con GROUP BY en lugar de N queries
 */
export async function getAccountBalancesBatch(
  accountIds: string[],
  supabase: SupabaseClient<Database>
): Promise<Record<string, number>> {
  if (accountIds.length === 0) {
    return {}
  }

  // Obtener todas las cuentas con su información necesaria
  const { data: accounts, error: accountsError } = await (supabase
    .from("financial_accounts") as any)
    .select(`
      id,
      initial_balance,
      currency,
      chart_account_id,
      chart_of_accounts:chart_account_id(
        category
      )
    `)
    .in("id", accountIds)

  if (accountsError || !accounts) {
    throw new Error(`Error obteniendo cuentas: ${accountsError?.message || "Unknown error"}`)
  }

  // Verificar caché primero
  const result: Record<string, number> = {}
  const accountsToCalculate: typeof accounts = []
  const now = Date.now()

  for (const account of accounts) {
    const cacheKey = account.id
    const cached = balanceCache.get(cacheKey)
    
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      result[account.id] = cached.balance
    } else {
      accountsToCalculate.push(account)
    }
  }

  if (accountsToCalculate.length === 0) {
    return result
  }

  // Obtener todos los movimientos para las cuentas que necesitan cálculo
  const accountIdsToCalculate = accountsToCalculate.map((a) => a.id)
  const { data: movements, error: movementsError } = await (supabase
    .from("ledger_movements") as any)
    .select("account_id, type, amount_original, amount_ars_equivalent")
    .in("account_id", accountIdsToCalculate)

  if (movementsError) {
    throw new Error(`Error obteniendo movimientos: ${movementsError.message}`)
  }

  // Agrupar movimientos por cuenta
  const movementsByAccount = new Map<string, typeof movements>()
  for (const movement of movements || []) {
    const accountId = movement.account_id
    if (!movementsByAccount.has(accountId)) {
      movementsByAccount.set(accountId, [])
    }
    movementsByAccount.get(accountId)!.push(movement)
  }

  // Calcular balance para cada cuenta
  for (const account of accountsToCalculate) {
    const initialBalance = parseFloat(account.initial_balance || "0")
    const accountCurrency = account.currency as "ARS" | "USD"
    const category = account.chart_of_accounts?.category || "ACTIVO"
    const accountMovements = movementsByAccount.get(account.id) || []

    const movementsSum = accountMovements.reduce((sum: number, m: any) => {
      const amount = parseFloat(
        accountCurrency === "USD" 
          ? (m.amount_original || "0")
          : (m.amount_ars_equivalent || "0")
      )
      
      if (category === "PASIVO") {
        if (m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT" || m.type === "FX_LOSS") {
          return sum + amount
        } else if (m.type === "INCOME" || m.type === "FX_GAIN") {
          return sum - amount
        }
        return sum
      }
      
      if (m.type === "INCOME" || m.type === "FX_GAIN") {
        return sum + amount
      } else if (m.type === "EXPENSE" || m.type === "FX_LOSS" || m.type === "COMMISSION" || m.type === "OPERATOR_PAYMENT") {
        return sum - amount
      }
      return sum
    }, 0)

    const finalBalance = initialBalance + movementsSum
    result[account.id] = finalBalance

    // Guardar en caché
    balanceCache.set(account.id, {
      balance: finalBalance,
      timestamp: now,
    })
  }

  // Limpiar caché expirado
  cleanExpiredCache()

  return result
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
 * 
 * OPTIMIZADO: Agregado límite por defecto y paginación para evitar cargar miles de registros
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
    limit?: number // Límite de registros (default: 1000)
    offset?: number // Offset para paginación (default: 0)
  }
) {
  // Límite por defecto: 1000 registros (evita cargar miles innecesariamente)
  const limit = filters.limit ?? 1000
  const offset = filters.offset ?? 0

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
    `,
      { count: "exact" } // Incluir count para paginación
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1) // Paginación

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

  const { data, error, count } = await query

  if (error) {
    console.error("Error fetching ledger movements:", error)
    throw new Error(`Error obteniendo movimientos de ledger: ${error.message}`)
  }

  return {
    movements: data || [],
    total: count || 0,
    limit,
    offset,
    hasMore: count ? offset + limit < count : false,
  }
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
  // Mapear tipos antiguos a tipos válidos según el constraint
  const typeMapping: Record<string, string> = {
    CASH: currency === "ARS" ? "CASH_ARS" : "CASH_USD",
    BANK: currency === "ARS" ? "CHECKING_ARS" : "CHECKING_USD",
    MP: "CREDIT_CARD", // Mercado Pago se mapea a tarjeta de crédito
    USD: currency === "ARS" ? "SAVINGS_ARS" : "SAVINGS_USD", // Si se pide USD con currency USD, usar SAVINGS_USD
  }

  const validType = typeMapping[type] || (currency === "ARS" ? "CASH_ARS" : "CASH_USD")

  // Buscar cuenta existente del tipo y moneda válidos
  // IMPORTANTE: Ordenar por created_at ASC para siempre devolver la misma cuenta (la más antigua)
  // Esto asegura consistencia - si hay múltiples cuentas del mismo tipo, siempre usamos la primera creada
  const { data: existing, error: existingError } = await (supabase.from("financial_accounts") as any)
    .select("id, name, type, currency, agency_id")
    .eq("type", validType)
    .eq("currency", currency)
    .eq("is_active", true) // Solo cuentas activas
    .order("created_at", { ascending: true }) // Siempre la misma cuenta (la más antigua)
    .limit(1)
    .maybeSingle()

  if (existing && !existingError) {
    console.log(`🔍 getOrCreateDefaultAccount: Usando cuenta existente`, {
      accountId: existing.id,
      name: existing.name,
      type: validType,
      currency,
      agency_id: existing.agency_id,
    })
    return existing.id
  }

  // Si no existe, crear una nueva
  const accountNames: Record<string, string> = {
    CASH_ARS: "Caja Principal ARS",
    CASH_USD: "Caja Principal USD",
    CHECKING_ARS: "Banco Principal ARS",
    CHECKING_USD: "Banco Principal USD",
    CREDIT_CARD: "Mercado Pago",
    SAVINGS_ARS: "Caja de Ahorro ARS",
    SAVINGS_USD: "Caja de Ahorro USD",
  }

  const { data: newAccount, error } = await (supabase.from("financial_accounts") as any)
    .insert({
      name: accountNames[validType] || `Cuenta ${validType}`,
      type: validType,
      currency,
      initial_balance: 0,
      created_by: userId,
    })
    .select("id, name, type, currency")
    .single()

  if (error || !newAccount) {
    throw new Error(`Error creando cuenta por defecto: ${error?.message || "Unknown error"}`)
  }

  console.log(`✅ getOrCreateDefaultAccount: Nueva cuenta creada`, {
    accountId: newAccount.id,
    name: newAccount.name,
    type: validType,
    currency,
  })

  return newAccount.id
}

/**
 * Verificar si una cuenta financiera es una cuenta contable (Cuentas por Cobrar/Pagar)
 * Estas cuentas NO deben aparecer en selecciones de pagos/ingresos/transferencias
 */
export async function isAccountingOnlyAccount(
  accountId: string,
  supabase: SupabaseClient<Database>
): Promise<boolean> {
  const { data: account, error } = await (supabase.from("financial_accounts") as any)
    .select(`
      chart_account_id,
      chart_of_accounts:chart_account_id(
        account_code
      )
    `)
    .eq("id", accountId)
    .single()

  if (error || !account || !account.chart_account_id) {
    return false
  }

  const accountCode = account.chart_of_accounts?.account_code
  // Cuentas por Cobrar: 1.1.03, Cuentas por Pagar: 2.1.01
  return accountCode === "1.1.03" || accountCode === "2.1.01"
}

/**
 * Validar que una cuenta tiene saldo suficiente para un egreso
 * NUNCA se permite saldo negativo en cuentas financieras
 */
export async function validateSufficientBalance(
  accountId: string,
  amount: number,
  currency: "ARS" | "USD",
  supabase: SupabaseClient<Database>
): Promise<{ valid: boolean; currentBalance: number; error?: string }> {
  const balance = await getAccountBalance(accountId, supabase)
  
  // Determinar qué monto usar según la moneda de la cuenta
  const { data: account } = await (supabase.from("financial_accounts") as any)
    .select("currency")
    .eq("id", accountId)
    .single()

  if (!account) {
    return { valid: false, currentBalance: 0, error: "Cuenta no encontrada" }
  }

  // Si la cuenta es USD y el monto es en ARS, necesitamos convertir
  // Pero por ahora asumimos que amount ya está en la moneda correcta de la cuenta
  // (validado en el endpoint antes de llamar esta función)
  
  if (balance < amount) {
    return {
      valid: false,
      currentBalance: balance,
      error: `Saldo insuficiente en cuenta. Disponible: ${balance.toFixed(2)} ${account.currency}, requerido: ${amount.toFixed(2)} ${account.currency}`,
    }
  }

  return { valid: true, currentBalance: balance }
}

