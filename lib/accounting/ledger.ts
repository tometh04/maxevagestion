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

/**
 * SaaS Pilar 2c (2026-04-20): este módulo YA NO obtiene un admin client
 * internamente. Cada función recibe `supabase` y lo usa tal cual.
 *
 * - Si el caller pasa un server client (JWT del user), RLS tenant_isolation
 *   aplica y la operación queda acotada a la org del user — correcto.
 * - Si el caller pasa un admin client legítimo (cron, webhook, auth/register),
 *   RLS no aplica y la operación es global — el caller es responsable de
 *   inyectar `org_id` al insertar.
 *
 * Combinado con migration 141 (`execute_readonly_query` SECURITY INVOKER),
 * la RPC también respeta RLS cuando el caller es authenticated.
 */

/**
 * Obtener el nombre del pasajero principal de una operación
 */
export async function getMainPassengerName(
  operationId: string | null | undefined,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  if (!operationId) return null

  try {
    const { data: mainCustomer } = await (supabase.from("operation_customers") as any)
      .select(`
        customers:customer_id (first_name, last_name)
      `)
      .eq("operation_id", operationId)
      .eq("role", "MAIN")
      .single()

    if (mainCustomer?.customers) {
      const c = mainCustomer.customers as any
      const firstName = c.first_name || ""
      const lastName = c.last_name || ""
      const fullName = `${firstName} ${lastName}`.trim()
      return fullName || null
    }

    return null
  } catch (error) {
    console.error("Error obteniendo nombre del pasajero principal:", error)
    return null
  }
}

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
  Array.from(balanceCache.entries()).forEach(([key, entry]) => {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      balanceCache.delete(key)
    }
  })
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
  /**
   * Cuenta financiera del movimiento. Puede ser null: las líneas de asiento
   * contable no tienen caja detrás (VIB-134/B0). La columna es nullable en la
   * base; el tipo lo reflejaba mal.
   */
  account_id: string | null
  seller_id?: string | null
  operator_id?: string | null
  receipt_number?: string | null
  notes?: string | null
  created_by?: string | null
  affects_balance?: boolean
  /**
   * true = este movimiento es una de las dos patas de una transferencia entre
   * cuentas propias de la agencia, incluida la compra/venta de dólares
   * (VIB-149). Mueve el saldo de la cuenta pero no es ingreso ni gasto, así que
   * los reportes de resultado lo dejan afuera.
   */
  is_internal_transfer?: boolean
  /** Categoría del gasto (recurring_payment_categories). Sólo aplica a gastos
   *  recurrentes/variables; alimenta el resumen por categoría. */
  category_id?: string | null
  /**
   * Gasto fijo que originó el movimiento (VIB-179). Es lo que permite borrar el
   * pago y devolver la recurrencia al período borrado: sin este vínculo, lo
   * único que une el movimiento con su gasto fijo es el texto del concepto.
   */
  recurring_payment_id?: string | null
  /** Fecha efectiva del movimiento (puede ser retroactiva). Si no se provee, usa NOW(). */
  movement_date?: string | Date | null
  /**
   * SaaS tenant id. Si no se provee, se deriva de (en orden):
   *   1. operation_id → operations.org_id
   *   2. lead_id → leads.org_id
   *   3. created_by → users.org_id
   * Sin poder resolver ninguno, el insert falla (la RLS policy
   * `org_id IN user_org_ids()` rechaza NULL).
   */
  org_id?: string | null
  /**
   * Comisión que este movimiento salda. NO se persiste en `ledger_movements`:
   * sirve únicamente para acotar el marcado automático a esa fila, ahora que una
   * operación puede tener varias comisiones del mismo vendedor (la de la venta
   * base y una por cada servicio, cada una con su propio mes). Sin esto, pagar
   * una marcaría pagadas las otras.
   */
  commission_record_id?: string | null
  /**
   * false = este movimiento es un pago PARCIAL y NO salda la comisión.
   *
   * El marcado automático de abajo da por pagada la fila apenas ve un
   * movimiento de plata, sin mirar cuánto se pagó. Con pagos parciales eso
   * hacía desaparecer el saldo: pagar 447 de una comisión de 547,34 la dejaba
   * PAID y los 100,34 restantes no volvían a aparecer en "Por Pagar" (caso real
   * de septiembre 2026, 12 comisiones y USD 187,56 en total).
   *
   * Quien paga sabe si cubre el total, así que lo informa. Default true, que es
   * el comportamiento histórico para los flujos que registran el pago de una
   * comisión sin llevar el acumulado (por ejemplo desde Caja).
   */
  commission_fully_paid?: boolean
}

/**
 * Deriva el org_id del contexto del movimiento cuando el caller no lo pasa.
 * Se usa dentro de createLedgerMovement y en variantes internas (operator
 * payments, commissions, FX) que insertan directo en ledger_movements.
 */
async function resolveOrgIdForLedger(
  params: CreateLedgerMovementParams,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  if (params.org_id) return params.org_id

  if (params.operation_id) {
    const { data } = await (supabase.from("operations") as any)
      .select("org_id")
      .eq("id", params.operation_id)
      .maybeSingle()
    const id = (data as any)?.org_id as string | null | undefined
    if (id) return id
  }

  if (params.lead_id) {
    const { data } = await (supabase.from("leads") as any)
      .select("org_id")
      .eq("id", params.lead_id)
      .maybeSingle()
    const id = (data as any)?.org_id as string | null | undefined
    if (id) return id
  }

  if (params.created_by) {
    const { data } = await (supabase.from("users") as any)
      .select("org_id")
      .eq("id", params.created_by)
      .maybeSingle()
    const id = (data as any)?.org_id as string | null | undefined
    if (id) return id
  }

  return null
}

/**
 * Crear un movimiento en el ledger.
 *
 * El caller debe pasar el cliente apropiado:
 * - Server client (JWT user): RLS tenant_isolation aplica; el INSERT debe
 *   incluir `org_id` si el caller lo conoce (por ejemplo `user.org_id`),
 *   aunque RLS lo rechazará sin él.
 * - Admin client (cron/webhook/auth): RLS no aplica. El caller es
 *   responsable de que `org_id` vaya seteado en los params si corresponde.
 */
export async function createLedgerMovement(
  params: CreateLedgerMovementParams,
  supabase: SupabaseClient<Database>
): Promise<{ id: string }> {
  // Validar que si currency = USD, exchange_rate debe estar presente
  if (params.currency === "USD" && !params.exchange_rate) {
    throw new Error("exchange_rate es requerido cuando currency = USD")
  }

  // Validar que amount_ars_equivalent esté presente y sea un número válido
  if (params.amount_ars_equivalent === null || params.amount_ars_equivalent === undefined || isNaN(params.amount_ars_equivalent)) {
    throw new Error(`amount_ars_equivalent inválido: ${params.amount_ars_equivalent}`)
  }

  // SaaS tenant: resolver org_id si el caller no lo pasó. Sin él, la RLS
  // policy (`org_id IN user_org_ids()`) rechaza el INSERT con 42501.
  const orgId = await resolveOrgIdForLedger(params, supabase)
  if (!orgId) {
    throw new Error(
      "createLedgerMovement: no se pudo resolver org_id (faltan params.org_id, operation_id, lead_id o created_by válidos)"
    )
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
      affects_balance: params.affects_balance ?? true,
      is_internal_transfer: params.is_internal_transfer ?? false,
      category_id: params.category_id || null,
      recurring_payment_id: params.recurring_payment_id || null,
      org_id: orgId,
      // Fecha efectiva del movimiento: puede ser retroactiva (ej. 13/02).
      // Si no se provee, usa la fecha actual como fallback.
      movement_date: params.movement_date
        ? new Date(params.movement_date).toISOString()
        : new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error) {
    console.error("❌ Error insertando ledger_movement:", {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      params: {
        type: params.type,
        currency: params.currency,
        amount_original: params.amount_original,
        account_id: params.account_id,
      }
    })
    throw new Error(`Error creando ledger movement: ${error.message} (code: ${error.code})`)
  }

  // Invalidar caché de balance para esta cuenta
  // Sin cuenta financiera (línea de asiento contable) no hay saldo que invalidar.
  if (params.account_id) invalidateBalanceCache(params.account_id)

  // Si el tipo es COMMISSION y hay operation_id, marcar comisiones como PAID automáticamente.
  //
  // Solo si el movimiento MOVIÓ PLATA (tiene cuenta financiera). Desde
  // VIB-134/B0 los asientos contables también generan líneas type=COMMISSION
  // —con seller_id y todo— pero son un DEVENGAMIENTO, no un pago: se crean al
  // confirmar la operación. Sin este guard, confirmar una operación marcaría
  // las comisiones del vendedor como pagadas sin que nadie las haya pagado.
  //
  // Una línea de asiento no tiene account_id (ver createJournalEntry); un pago
  // real de comisión siempre lo tiene.
  //
  // Y solo si el pago SALDA la comisión: un pago parcial mueve plata igual, pero
  // darlo por saldado hace desaparecer el resto de la deuda con el vendedor.
  const movioPlata = Boolean(params.account_id)
  const saldaLaComision = params.commission_fully_paid !== false
  if (params.type === "COMMISSION" && params.operation_id && movioPlata && saldaLaComision) {
    try {
      const { markCommissionsAsPaidIfLedgerExists } = await import("./mark-commission-paid")
      await markCommissionsAsPaidIfLedgerExists(supabase, params.operation_id, {
        commissionRecordId: params.commission_record_id ?? null,
      })
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
  // Delega en getAccountBalancesBatch, que calcula el saldo por AGREGACIÓN SQL
  // (RPC execute_readonly_query, SUM sobre TODOS los movimientos) en vez de
  // traerlos a memoria.
  //
  // Por qué se consolidó: el path anterior hacía
  //   .from("ledger_movements").select(...).eq("account_id").eq("affects_balance")
  // SIN límite, y PostgREST corta en 1000 filas por request. En cuentas de alto
  // volumen (>1000 movimientos) el saldo salía calculado sobre un subconjunto
  // truncado → INCORRECTO (ej. una Caja USD con 1728 movs daba ~2x su saldo real).
  // Además mantener dos implementaciones del mismo cálculo las hacía divergir.
  // Una sola fuente de verdad = mismo número que muestra el listado de cuentas.
  const balances = await getAccountBalancesBatch([accountId], supabase)
  if (!(accountId in balances)) {
    throw new Error(`Cuenta financiera no encontrada: ${accountId}`)
  }
  return balances[accountId]
}

/**
 * Calcular balances de múltiples cuentas en una sola query (BATCH)
 * Mucho más eficiente que llamar getAccountBalance() múltiples veces
 * 
 * OPTIMIZACIÓN: Una sola query con GROUP BY en lugar de N queries
 */
export async function getAccountBalancesBatch(
  accountIds: string[],
  supabase: SupabaseClient<Database>,
  /**
   * Saldo AL CIERRE de esta fecha ('YYYY-MM-DD'), en vez del saldo de hoy.
   *
   * Lo necesita el asiento de apertura (VIB-141): una agencia que arranca
   * contabilidad el 1° de septiembre tiene que registrar cuánta plata tenía el
   * 31 de agosto, y si el asiento se genera el 5 el saldo de hoy ya incluye
   * cuatro días de movimientos que no corresponden.
   *
   * Omitirlo deja el comportamiento intacto: saldo actual, con caché.
   */
  hastaFecha?: string | null
): Promise<Record<string, number>> {
  if (accountIds.length === 0) {
    return {}
  }

  // Obtener todas las cuentas (query separada para chart_of_accounts — el JOIN falla silenciosamente)
  const { data: accounts, error: accountsError } = await (supabase
    .from("financial_accounts") as any)
    .select("id, initial_balance, currency, chart_account_id")
    .in("id", accountIds)

  if (accountsError || !accounts) {
    throw new Error(`Error obteniendo cuentas: ${accountsError?.message || "Unknown error"}`)
  }

  // Query separada batch para categorías y subcategorías del plan de cuentas
  const chartAccountIds = Array.from(new Set(
    accounts.map((a: any) => a.chart_account_id).filter(Boolean)
  )) as string[]
  const chartCategoryMap = new Map<string, string>()
  const chartSubcategoryMap = new Map<string, string>()
  if (chartAccountIds.length > 0) {
    const { data: chartAccounts } = await (supabase
      .from("chart_of_accounts") as any)
      .select("id, category, subcategory")
      .in("id", chartAccountIds)
    if (chartAccounts) {
      for (const ca of chartAccounts) {
        chartCategoryMap.set(ca.id, ca.category)
        if (ca.subcategory) chartSubcategoryMap.set(ca.id, ca.subcategory)
      }
    }
  }

  // Verificar caché primero
  const result: Record<string, number> = {}
  const accountsToCalculate: typeof accounts = []
  const now = Date.now()

  // El caché guarda saldos de HOY. Con corte de fecha hay que recalcular
  // siempre: devolver el saldo actual como si fuera el del 31 de agosto sería
  // un error silencioso y del peor tipo, porque el número parece razonable.
  const usaCache = !hastaFecha

  for (const account of accounts) {
    const cacheKey = account.id
    const cached = usaCache ? balanceCache.get(cacheKey) : undefined

    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      result[account.id] = cached.balance
    } else {
      accountsToCalculate.push(account)
    }
  }

  if (accountsToCalculate.length === 0) {
    return result
  }

  // Obtener sumas agrupadas por account_id y type usando SQL aggregation
  // En vez de traer TODOS los movimientos individuales, traemos máximo N_cuentas × 6 filas
  const accountIdsToCalculate = accountsToCalculate.map((a: { id: string }) => a.id)

  const accountIdsSQL = accountIdsToCalculate.map((id: string) => `'${id}'`).join(",")

  // Se valida el formato antes de interpolar: la fecha entra a un SQL armado
  // como texto y no puede venir de un input sin verificar.
  if (hastaFecha && !/^\d{4}-\d{2}-\d{2}$/.test(hastaFecha)) {
    throw new Error(`Fecha de corte inválida: ${hastaFecha}`)
  }
  // `movement_date` es timestamptz: se corta por "menor al día siguiente" para
  // incluir el día entero y no solo su medianoche.
  const filtroFecha = hastaFecha
    ? ` AND movement_date < (DATE '${hastaFecha}' + INTERVAL '1 day')`
    : ""
  // IMPORTANTE: la agrupación separa movements "legacy" (sin debit/credit seteados) de
  // los de partida doble. Antes se usaba has_debit_credit a nivel de (account_id, type)
  // y eso descartaba los legacy cuando cualquier movement del mismo tipo tenía d/c,
  // desapareciendo plata del balance (~$227M en Caja ARS era el síntoma visible).
  // Ahora las dos subpoblaciones se suman por separado y se combinan aditivamente.
  //
  // Post-mig 141: execute_readonly_query es SECURITY INVOKER, así que respeta RLS
  // del caller — cada org ve solo sus rows. Con esto los balances son per-tenant.
  const { data: aggregatedData, error: aggError } = await (supabase as any).rpc("execute_readonly_query", {
    query_text: `SELECT account_id, type,
      SUM(CASE WHEN debit_amount IS NULL AND credit_amount IS NULL THEN amount_original::numeric ELSE 0 END) AS legacy_original,
      SUM(CASE WHEN debit_amount IS NULL AND credit_amount IS NULL THEN amount_ars_equivalent::numeric ELSE 0 END) AS legacy_ars,
      SUM(COALESCE(debit_amount, 0)::numeric) AS total_debit,
      SUM(COALESCE(credit_amount, 0)::numeric) AS total_credit
      FROM ledger_movements
      WHERE account_id IN (${accountIdsSQL}) AND affects_balance = true${filtroFecha}
      GROUP BY account_id, type`
  })

  if (aggError) {
    throw new Error(`Error obteniendo sumas de movimientos: ${aggError.message}`)
  }

  // Parsear resultados agrupados
  const sumRows: Array<{ account_id: string; type: string; legacy_original: number; legacy_ars: number; total_debit: number; total_credit: number }> =
    Array.isArray(aggregatedData) ? aggregatedData : (aggregatedData || [])

  // Indexar sumas por account_id → type → { legacy_original, legacy_ars, total_debit, total_credit }
  const sumsByAccount = new Map<string, Map<string, { legacy_original: number; legacy_ars: number; total_debit: number; total_credit: number }>>()
  for (const row of sumRows) {
    if (!sumsByAccount.has(row.account_id)) {
      sumsByAccount.set(row.account_id, new Map())
    }
    sumsByAccount.get(row.account_id)!.set(row.type, {
      legacy_original: Number(row.legacy_original || 0),
      legacy_ars: Number(row.legacy_ars || 0),
      total_debit: Number(row.total_debit || 0),
      total_credit: Number(row.total_credit || 0),
    })
  }

  // Calcular balance para cada cuenta usando las sumas agrupadas.
  // DUAL ADITIVO: aplicamos partida doble a los movements con d/c Y legacy a los que no tienen.
  // Ambas subpoblaciones se suman — antes eran excluyentes, lo que descartaba plata cuando
  // coexistían ambos estilos en el mismo (account_id, type).
  const { isDebitNaturalAccount } = await import("./account-codes")

  for (const account of accountsToCalculate) {
    const initialBalance = parseFloat(account.initial_balance || "0")
    const accountCurrency = account.currency as "ARS" | "USD"
    const category = account.chart_account_id
      ? chartCategoryMap.get(account.chart_account_id) || "ACTIVO"
      : "ACTIVO"
    const subcategory = account.chart_account_id
      ? chartSubcategoryMap.get(account.chart_account_id) || null
      : null
    const isDebitNatural = isDebitNaturalAccount(category, subcategory)
    const typeSums = sumsByAccount.get(account.id) || new Map()

    let movementsSum = 0
    typeSums.forEach((sums, type) => {
      // (A) Partida doble — movements que tienen debit_amount o credit_amount seteados.
      // Si ambos son 0 el delta es 0 (no afecta).
      if (isDebitNatural) {
        movementsSum += sums.total_debit - sums.total_credit
      } else {
        movementsSum += sums.total_credit - sums.total_debit
      }

      // (B) Legacy — movements con ambos debit_amount y credit_amount NULL.
      // amount_original para USD, amount_ars_equivalent para ARS (convención existente).
      const legacyAmount = accountCurrency === "USD" ? sums.legacy_original : sums.legacy_ars
      if (legacyAmount !== 0) {
        if (category === "PASIVO") {
          if (type === "EXPENSE" || type === "OPERATOR_PAYMENT" || type === "FX_LOSS") {
            movementsSum += legacyAmount
          } else if (type === "INCOME" || type === "FX_GAIN") {
            movementsSum -= legacyAmount
          }
        } else {
          if (type === "INCOME" || type === "FX_GAIN") {
            movementsSum += legacyAmount
          } else if (type === "EXPENSE" || type === "FX_LOSS" || type === "COMMISSION" || type === "OPERATOR_PAYMENT") {
            movementsSum -= legacyAmount
          }
        }
      }
    })

    const finalBalance = initialBalance + movementsSum
    result[account.id] = finalBalance

    // Guardar en caché — solo el saldo de hoy. Cachear un saldo con corte de
    // fecha envenenaría al resto de la app: las pantallas pedirían el saldo
    // actual y recibirían el del 31 de agosto.
    if (!usaCache) continue
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
      operations:operation_id (id, destination, file_code, agency_id),
      leads:lead_id (id, contact_name)
    `,
      { count: "exact" } // Incluir count para paginación
    )
    .order("movement_date", { ascending: false })
    .range(offset, offset + limit - 1) // Paginación

  if (filters.dateFrom) {
    // Filtrar por movement_date (fecha efectiva del movimiento, puede ser retroactiva)
    query = query.gte("movement_date", `${filters.dateFrom}T00:00:00`)
  }
  if (filters.dateTo) {
    // Incluir todo el día hasta las 23:59:59
    query = query.lte("movement_date", `${filters.dateTo}T23:59:59`)
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
    .select("chart_account_id")
    .eq("id", accountId)
    .single()

  if (error || !account || !account.chart_account_id) {
    return false
  }

  // Query separada para chart_of_accounts (el JOIN de Supabase falla silenciosamente)
  const { data: chartAccount } = await (supabase.from("chart_of_accounts") as any)
    .select("account_code")
    .eq("id", account.chart_account_id)
    .maybeSingle()

  const accountCode = chartAccount?.account_code
  // Cuentas por Cobrar / Cuentas por Pagar — no deben aparecer en selectores de pago
  const { ACCOUNT_CODES } = await import("./account-codes")
  return accountCode === ACCOUNT_CODES.CUENTAS_POR_COBRAR || accountCode === ACCOUNT_CODES.CUENTAS_POR_PAGAR
}

/**
 * Validar que una cuenta tiene saldo suficiente para un egreso.
 *
 * Por defecto NO se permite saldo negativo (guardrail anti-error de carga).
 * Si la cuenta tiene `credit_limit > 0` (giro en descubierto / línea de crédito
 * configurada), se permite que el saldo baje hasta `-credit_limit`. El límite
 * está expresado en la moneda de la cuenta, igual que `amount`.
 */
export async function validateSufficientBalance(
  accountId: string,
  amount: number,
  currency: "ARS" | "USD",
  supabase: SupabaseClient<Database>
): Promise<{ valid: boolean; currentBalance: number; error?: string }> {
  const balance = await getAccountBalance(accountId, supabase)

  // Determinar qué monto usar según la moneda de la cuenta.
  // Usamos select("*") a propósito: si la migración 130 (credit_limit) todavía
  // no corrió en este entorno, pedir la columna explícita haría fallar la query
  // y romper TODO pago ("Cuenta no encontrada"). Con "*" simplemente no viene la
  // columna y credit_limit cae a 0 (comportamiento legacy). Resiliente al
  // desfase deploy-vs-migración.
  const { data: account } = await (supabase.from("financial_accounts") as any)
    .select("*")
    .eq("id", accountId)
    .single()

  if (!account) {
    return { valid: false, currentBalance: 0, error: "Cuenta no encontrada" }
  }

  // Si la cuenta es USD y el monto es en ARS, necesitamos convertir
  // Pero por ahora asumimos que amount ya está en la moneda correcta de la cuenta
  // (validado en el endpoint antes de llamar esta función)

  // Línea de crédito: el saldo puede caer hasta -credit_limit. Con credit_limit=0
  // (default, o columna ausente) esto equivale al comportamiento legacy "nunca negativo".
  const creditLimit = Math.max(0, Number(account.credit_limit) || 0)
  const minAllowedBalance = -creditLimit

  if (balance - amount < minAllowedBalance - 1e-6) {
    const available = balance + creditLimit
    const creditNote = creditLimit > 0
      ? ` (saldo ${balance.toFixed(2)} + línea de crédito ${creditLimit.toFixed(2)})`
      : ""
    return {
      valid: false,
      currentBalance: balance,
      error: `Saldo insuficiente en cuenta. Disponible: ${available.toFixed(2)} ${account.currency}${creditNote}, requerido: ${amount.toFixed(2)} ${account.currency}`,
    }
  }

  return { valid: true, currentBalance: balance }
}

