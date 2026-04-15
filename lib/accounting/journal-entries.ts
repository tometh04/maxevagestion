/**
 * JOURNAL ENTRIES SERVICE - Asientos Contables
 *
 * Maneja la creación de asientos contables (journal entries) con partida doble.
 * Cada asiento tiene N líneas donde SUM(Debe) === SUM(Haber).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { isDebitNaturalAccount, ACCOUNT_CODES } from "./account-codes"

/**
 * Helper: obtiene admin client para bypass de RLS
 */
async function getAdminClient(fallback: any): Promise<any> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server")
    return createAdminClient()
  } catch {
    return fallback
  }
}

export type JournalEntrySource =
  | "MANUAL"
  | "AUTO_PAYMENT"
  | "AUTO_CONFIRMATION"
  | "AUTO_COMMISSION"
  | "AUTO_FX"

export interface JournalEntryLine {
  /** ID de la cuenta del plan de cuentas */
  chart_account_id: string
  /** ID de la cuenta financiera (puede ser null para cuentas sin financial_account vinculado) */
  financial_account_id?: string | null
  /** Monto en Debe */
  debit_amount?: number | null
  /** Monto en Haber */
  credit_amount?: number | null
  /** Concepto de la línea (opcional, hereda del asiento si no se especifica) */
  concept?: string | null
  /** Tipo legacy del movimiento (para backward compat) */
  legacy_type?: "INCOME" | "EXPENSE" | "FX_GAIN" | "FX_LOSS" | "COMMISSION" | "OPERATOR_PAYMENT"
  /** Método de pago legacy */
  legacy_method?: "CASH" | "BANK" | "MP" | "USD" | "OTHER"
  /** ID de operación (opcional por línea, hereda del asiento) */
  operation_id?: string | null
  /** ID del vendedor */
  seller_id?: string | null
  /** ID del operador */
  operator_id?: string | null
  /** Número de recibo */
  receipt_number?: string | null
  /** Notas adicionales */
  notes?: string | null
}

export interface CreateJournalEntryParams {
  /** Fecha del asiento */
  entry_date: string
  /** Descripción del asiento */
  description: string
  /** Líneas del asiento (mínimo 2) */
  lines: JournalEntryLine[]
  /** Operación relacionada */
  operation_id?: string | null
  /** Origen del asiento */
  source: JournalEntrySource
  /** Moneda */
  currency?: "ARS" | "USD"
  /** Exchange rate (para USD) */
  exchange_rate?: number | null
  /** Usuario que crea */
  created_by?: string | null
  /** Notas del asiento */
  notes?: string | null
}

export interface JournalEntry {
  id: string
  entry_number: number
  entry_date: string
  description: string
  source: JournalEntrySource
  total_amount: number
  currency: string
  movement_ids: string[]
}

/**
 * Validar que un asiento está balanceado (Debe === Haber)
 */
export function validateJournalBalance(lines: JournalEntryLine[]): {
  valid: boolean
  totalDebit: number
  totalCredit: number
  difference: number
} {
  const totalDebit = lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0)
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0)
  const difference = Math.abs(totalDebit - totalCredit)

  return {
    valid: difference < 0.01, // Tolerancia de centavo por redondeo
    totalDebit,
    totalCredit,
    difference,
  }
}

/**
 * Crear un asiento contable completo con sus líneas
 *
 * 1. Valida que Debe === Haber
 * 2. Crea el journal_entry
 * 3. Crea N ledger_movements con debit/credit + journal_entry_id
 * 4. Mantiene campos legacy (type, amount) para backward compat
 */
export async function createJournalEntry(
  params: CreateJournalEntryParams,
  supabase: SupabaseClient<Database>
): Promise<JournalEntry> {
  const { lines, entry_date, description, source, currency = "ARS", exchange_rate, created_by, operation_id, notes } = params

  // Validar mínimo 2 líneas
  if (lines.length < 2) {
    throw new Error("Un asiento contable requiere al menos 2 líneas")
  }

  // Validar balance
  const balance = validateJournalBalance(lines)
  if (!balance.valid) {
    throw new Error(
      `Asiento desbalanceado: Debe ${balance.totalDebit.toFixed(2)} ≠ Haber ${balance.totalCredit.toFixed(2)} (diferencia: ${balance.difference.toFixed(2)})`
    )
  }

  // Validar que cada línea tiene Debe XOR Haber (no ambos, no ninguno)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const hasDebit = (line.debit_amount || 0) > 0
    const hasCredit = (line.credit_amount || 0) > 0
    if (!hasDebit && !hasCredit) {
      throw new Error(`Línea ${i + 1}: debe tener Debe o Haber`)
    }
    if (hasDebit && hasCredit) {
      throw new Error(`Línea ${i + 1}: no puede tener Debe y Haber simultáneamente`)
    }
  }

  const adminClient = await getAdminClient(supabase)

  // 1. Crear el journal_entry
  const { data: journalEntry, error: jeError } = await (adminClient.from("journal_entries") as any)
    .insert({
      entry_date,
      description,
      operation_id: operation_id || null,
      source,
      is_balanced: true,
      total_amount: balance.totalDebit,
      currency,
      notes: notes || null,
      created_by: created_by || null,
    })
    .select("id, entry_number, entry_date, description, source, total_amount, currency")
    .single()

  if (jeError || !journalEntry) {
    throw new Error(`Error creando asiento contable: ${jeError?.message || "Unknown"}`)
  }

  // 2. Crear los ledger_movements para cada línea
  const { createLedgerMovement, invalidateBalanceCache } = await import("./ledger")
  const movementIds: string[] = []

  for (const line of lines) {
    const isDebit = (line.debit_amount || 0) > 0
    const amount = isDebit ? line.debit_amount! : line.credit_amount!

    // Determinar tipo legacy basado en la línea
    // Si no se especifica, inferir del debit/credit
    const legacyType = line.legacy_type || (isDebit ? "EXPENSE" : "INCOME")
    const legacyMethod = line.legacy_method || "OTHER"

    // Calcular ARS equivalent
    const amountARS = currency === "USD" && exchange_rate
      ? amount * exchange_rate
      : amount

    // account_id: usar financial_account_id si existe, sino buscar por chart_account_id
    let accountId = line.financial_account_id
    if (!accountId && line.chart_account_id) {
      // Buscar financial_account vinculado a esta chart_account
      const { data: fa } = await (adminClient.from("financial_accounts") as any)
        .select("id")
        .eq("chart_account_id", line.chart_account_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle()
      accountId = fa?.id || null
    }

    if (!accountId) {
      throw new Error(
        `No se encontró cuenta financiera para chart_account_id: ${line.chart_account_id}. ` +
        `Asegúrate de que la cuenta contable tenga una cuenta financiera vinculada.`
      )
    }

    const { id: movId } = await createLedgerMovement(
      {
        operation_id: line.operation_id || operation_id || null,
        lead_id: null,
        type: legacyType,
        concept: line.concept || description,
        currency,
        amount_original: amount,
        exchange_rate: exchange_rate || null,
        amount_ars_equivalent: amountARS,
        method: legacyMethod,
        account_id: accountId,
        seller_id: line.seller_id || null,
        operator_id: line.operator_id || null,
        receipt_number: line.receipt_number || null,
        notes: line.notes || null,
        created_by: created_by || null,
        movement_date: entry_date,
      },
      supabase
    )

    // Actualizar el movimiento con los campos de partida doble
    // (createLedgerMovement no conoce estos campos aún)
    await (adminClient.from("ledger_movements") as any)
      .update({
        journal_entry_id: journalEntry.id,
        debit_amount: isDebit ? amount : null,
        credit_amount: isDebit ? null : amount,
        chart_account_id: line.chart_account_id || null,
      })
      .eq("id", movId)

    movementIds.push(movId)
  }

  return {
    id: journalEntry.id,
    entry_number: journalEntry.entry_number,
    entry_date: journalEntry.entry_date,
    description: journalEntry.description,
    source: journalEntry.source as JournalEntrySource,
    total_amount: journalEntry.total_amount,
    currency: journalEntry.currency,
    movement_ids: movementIds,
  }
}

/**
 * Obtener un asiento con sus líneas expandidas
 */
export async function getJournalEntryWithLines(
  journalEntryId: string,
  supabase: SupabaseClient<Database>
) {
  const adminClient = await getAdminClient(supabase)

  const { data: entry, error: entryError } = await (adminClient.from("journal_entries") as any)
    .select("*")
    .eq("id", journalEntryId)
    .single()

  if (entryError || !entry) {
    throw new Error(`Asiento no encontrado: ${journalEntryId}`)
  }

  const { data: lines, error: linesError } = await (adminClient.from("ledger_movements") as any)
    .select(`
      id,
      type,
      concept,
      currency,
      amount_original,
      amount_ars_equivalent,
      debit_amount,
      credit_amount,
      chart_account_id,
      account_id,
      notes,
      seller_id,
      operator_id
    `)
    .eq("journal_entry_id", journalEntryId)
    .order("created_at", { ascending: true })

  if (linesError) {
    throw new Error(`Error obteniendo líneas del asiento: ${linesError.message}`)
  }

  return {
    ...entry,
    lines: lines || [],
  }
}

/**
 * Listar asientos contables con filtros
 */
export async function listJournalEntries(
  supabase: SupabaseClient<Database>,
  filters: {
    dateFrom?: string
    dateTo?: string
    source?: JournalEntrySource | "ALL"
    operationId?: string
    search?: string
    limit?: number
    offset?: number
  } = {}
) {
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0

  const adminClient = await getAdminClient(supabase)

  let query = (adminClient.from("journal_entries") as any)
    .select("*, users:created_by(id, name)", { count: "exact" })
    .order("entry_date", { ascending: false })
    .order("entry_number", { ascending: false })
    .range(offset, offset + limit - 1)

  if (filters.dateFrom) {
    query = query.gte("entry_date", filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte("entry_date", filters.dateTo)
  }
  if (filters.source && filters.source !== "ALL") {
    query = query.eq("source", filters.source)
  }
  if (filters.operationId) {
    query = query.eq("operation_id", filters.operationId)
  }
  if (filters.search) {
    query = query.ilike("description", `%${filters.search}%`)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Error listando asientos: ${error.message}`)
  }

  return {
    entries: data || [],
    total: count || 0,
    limit,
    offset,
    hasMore: count ? offset + limit < count : false,
  }
}

// ============================================================
// AUTO-JOURNAL ENTRIES — Anotación post-hoc de pagos existentes
// ============================================================

interface AnnotatePaymentParams {
  /** ID del ledger_movement principal (cobro o pago) */
  mainMovementId: string
  /** ID del ledger_movement del counterpart (CpC o CpP) — puede ser null */
  counterpartMovementId?: string | null
  /** IDs de los ledger_movements de percepciones */
  perceptionMovementIds?: string[]
  /** Descripción del asiento */
  description: string
  /** Fecha del pago */
  date: string
  /** Monto total del pago */
  amount: number
  /** Moneda */
  currency: "ARS" | "USD"
  /** Operación relacionada */
  operation_id?: string | null
  /** Tipo: cobro de cliente o pago a operador */
  direction: "INCOME" | "EXPENSE"
  /** ID de la cuenta financiera donde se recibe/paga */
  financialAccountId: string
  /** Usuario que crea */
  created_by?: string | null
}

/**
 * Anotar movimientos de pago existentes como asiento contable
 *
 * Crea un journal_entry y actualiza los ledger_movements existentes
 * con journal_entry_id, debit_amount, credit_amount y chart_account_id.
 *
 * Esta función se llama DESPUÉS de que los movimientos ya fueron creados
 * por el flujo de pagos existente. Es un enfoque post-hoc que mantiene
 * backward-compatibility total.
 */
export async function annotatePaymentAsJournalEntry(
  params: AnnotatePaymentParams,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  try {
    const adminClient = await getAdminClient(supabase)

    // Buscar chart_account_id de la cuenta financiera
    const { data: finAccount } = await (adminClient.from("financial_accounts") as any)
      .select("chart_account_id")
      .eq("id", params.financialAccountId)
      .maybeSingle()

    const financialChartAccountId = finAccount?.chart_account_id || null

    // Buscar chart_account_id para la cuenta contraparte
    let counterpartChartAccountId: string | null = null
    if (params.counterpartMovementId) {
      const counterpartCode = params.direction === "INCOME"
        ? ACCOUNT_CODES.CUENTAS_POR_COBRAR
        : ACCOUNT_CODES.CUENTAS_POR_PAGAR
      const { data: cpChart } = await (adminClient.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", counterpartCode)
        .maybeSingle()
      counterpartChartAccountId = cpChart?.id || null
    }

    // Determinar la cuenta de resultado (Ventas o Costos)
    let resultadoCode: string
    if (params.direction === "INCOME") {
      resultadoCode = ACCOUNT_CODES.VENTAS // 4.1.01
    } else {
      resultadoCode = ACCOUNT_CODES.COSTO_OPERADORES // 4.2.01
    }
    const { data: resultadoChart } = await (adminClient.from("chart_of_accounts") as any)
      .select("id")
      .eq("account_code", resultadoCode)
      .maybeSingle()

    // Crear el journal_entry
    const { data: journalEntry, error: jeError } = await (adminClient.from("journal_entries") as any)
      .insert({
        entry_date: params.date,
        description: params.description,
        operation_id: params.operation_id || null,
        source: "AUTO_PAYMENT",
        is_balanced: true,
        total_amount: params.amount,
        currency: params.currency,
        created_by: params.created_by || null,
      })
      .select("id, entry_number")
      .single()

    if (jeError || !journalEntry) {
      console.error("Error creando journal entry para pago:", jeError)
      return null
    }

    // Anotar el movimiento principal
    // Cobro (INCOME): Debe en cuenta financiera (Activo), Haber en counterpart
    // Pago (EXPENSE): Debe en counterpart (Pasivo), Haber en cuenta financiera
    if (params.direction === "INCOME") {
      // Movimiento principal: la cuenta financiera recibe dinero → Debe
      await (adminClient.from("ledger_movements") as any)
        .update({
          journal_entry_id: journalEntry.id,
          debit_amount: params.amount,
          credit_amount: null,
          chart_account_id: financialChartAccountId,
        })
        .eq("id", params.mainMovementId)

      // Counterpart (CpC): se reduce la cuenta por cobrar → Haber
      if (params.counterpartMovementId && counterpartChartAccountId) {
        await (adminClient.from("ledger_movements") as any)
          .update({
            journal_entry_id: journalEntry.id,
            debit_amount: null,
            credit_amount: params.amount,
            chart_account_id: counterpartChartAccountId,
          })
          .eq("id", params.counterpartMovementId)
      }
    } else {
      // Pago a operador: la cuenta financiera pierde dinero → Haber
      await (adminClient.from("ledger_movements") as any)
        .update({
          journal_entry_id: journalEntry.id,
          debit_amount: null,
          credit_amount: params.amount,
          chart_account_id: financialChartAccountId,
        })
        .eq("id", params.mainMovementId)

      // Counterpart (CpP): se reduce la deuda con operador → Debe
      if (params.counterpartMovementId && counterpartChartAccountId) {
        await (adminClient.from("ledger_movements") as any)
          .update({
            journal_entry_id: journalEntry.id,
            debit_amount: params.amount,
            credit_amount: null,
            chart_account_id: counterpartChartAccountId,
          })
          .eq("id", params.counterpartMovementId)
      }
    }

    // Anotar percepciones si las hay
    if (params.perceptionMovementIds && params.perceptionMovementIds.length > 0) {
      const { data: percChart } = await (adminClient.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", ACCOUNT_CODES.PERCEPCIONES_AFIP)
        .maybeSingle()

      // Las percepciones se crearon en pares (INCOME en cuenta financiera + EXPENSE en CpAFIP)
      // Anotamos cada par con el journal_entry_id
      for (const percMovId of params.perceptionMovementIds) {
        // Obtener el movimiento para saber si es INCOME o EXPENSE
        const { data: percMov } = await (adminClient.from("ledger_movements") as any)
          .select("type, amount_original, account_id")
          .eq("id", percMovId)
          .maybeSingle()

        if (percMov) {
          const percAmount = parseFloat(percMov.amount_original)
          const isIncomeOnFinancial = percMov.type === "INCOME"

          await (adminClient.from("ledger_movements") as any)
            .update({
              journal_entry_id: journalEntry.id,
              debit_amount: isIncomeOnFinancial ? percAmount : null,
              credit_amount: isIncomeOnFinancial ? null : percAmount,
              chart_account_id: isIncomeOnFinancial
                ? financialChartAccountId
                : (percChart?.id || null),
            })
            .eq("id", percMovId)
        }
      }
    }

    return journalEntry.id
  } catch (error) {
    console.error("Error anotando pago como asiento contable:", error)
    return null // No romper el flujo principal
  }
}
