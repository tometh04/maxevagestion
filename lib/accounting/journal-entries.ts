/**
 * JOURNAL ENTRIES SERVICE - Asientos Contables
 *
 * Maneja la creación de asientos contables (journal entries) con partida doble.
 * Cada asiento tiene N líneas donde SUM(Debe) === SUM(Haber).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { isDebitNaturalAccount, ACCOUNT_CODES } from "./account-codes"

// SaaS Pilar 2c (2026-04-20): eliminado el helper getAdminClient interno.
// Cada función usa el `supabase` que recibe; si es un server client, RLS
// tenant_isolation acota por org del user. Ver lib/accounting/ledger.ts
// para contexto completo.

export type JournalEntrySource =
  | "MANUAL"
  | "AUTO_PAYMENT"
  | "AUTO_CONFIRMATION"
  | "AUTO_COMMISSION"
  | "AUTO_FX"

/** Los ajustes que genera el cierre mensual. Espeja el CHECK de la columna. */
export type JournalCloseKind =
  | "ANTICIPO_CLIENTE"
  | "ANTICIPO_PROVEEDOR"
  | "VENTA_SIN_FACTURAR"
  | "FACTURA_A_RECIBIR"
  | "REVALUACION"
  // El asiento de apertura va con `close_period` en NULL: no pertenece a un mes,
  // es el punto desde el que arrancan todos.
  | "APERTURA"
  // Los dos del cierre de ejercicio, también con `close_period` en NULL.
  // REFUNDICION cancela las cuentas de resultado contra 3.1.04;
  // TRASLADO_RESULTADO lleva ese saldo a 3.1.03.
  | "REFUNDICION"
  | "TRASLADO_RESULTADO"

export interface JournalEntryLine {
  /** ID de la cuenta del plan de cuentas */
  chart_account_id: string
  /** ID de la cuenta financiera (puede ser null para cuentas sin financial_account vinculado) */
  financial_account_id?: string | null
  /**
   * Si esta línea debe impactar el saldo de la cuenta financiera.
   * Default `false`: una línea de asiento es contabilidad, no movimiento de
   * dinero. Solo tiene sentido en `true` si la línea representa además el
   * movimiento real de una caja o banco (VIB-134/B0).
   */
  affects_balance?: boolean
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

export type JournalEntryKind = "SALE" | "COST" | "COMMISSION"

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
  /**
   * Organización dueña del asiento.
   *
   * Normalmente NO hace falta: el trigger `auto_set_org_id_from_auth` lo
   * resuelve desde la sesión. Pero con service role no hay `auth.uid()`, así
   * que el trigger lo deja en NULL y —como el service role no pasa por RLS— el
   * asiento se insertaría igual, huérfano de tenant. Los procesos sin sesión
   * (backfills, crons) TIENEN que pasarlo.
   */
  org_id?: string | null
  /**
   * Clase del asiento automático de una operación. Es la CLAVE DE IDEMPOTENCIA
   * (VIB-134/B3): la base tiene un índice único parcial sobre
   * (operation_id, entry_kind), así que una operación no puede tener dos
   * asientos de la misma clase ni aunque dos requests corran a la vez.
   *
   * Va en NULL para los asientos de pago, que son varios por operación.
   */
  entry_kind?: JournalEntryKind | null
  /**
   * Movimiento de plata que originó el asiento (VIB-142). Clave de idempotencia
   * para los asientos que nacen de un cobro, un pago o un gasto: la base tiene
   * un índice único parcial sobre esta columna.
   */
  source_movement_id?: string | null
  /**
   * Agencia del asiento (VIB-143). Una organización puede tener varias
   * sucursales operando por separado. No parte los libros: es un filtro del
   * reporte, que sigue siendo consolidado por defecto.
   */
  agency_id?: string | null
  /**
   * Período de cierre (AAAA-MM) y tipo de ajuste, para los asientos que genera
   * el cierre mensual (VIB-141). Juntos son la clave de idempotencia: la base
   * tiene un índice único sobre (org, agencia, período, tipo, operación), así
   * que recalcular un mes no puede duplicar sus ajustes.
   *
   * Van en NULL en todo asiento que nazca de un hecho puntual.
   */
  close_period?: string | null
  close_kind?: JournalCloseKind | null

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
  const { lines, entry_date, description, source, currency = "ARS", exchange_rate, created_by, operation_id, notes, org_id, entry_kind, source_movement_id, agency_id, close_period, close_kind } = params

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

  // SaaS Pilar 2c: usar el client que recibe — RLS tenant_isolation acota por org.
  const adminClient = supabase

  // VIB-134/B0: tipo de cambio de las líneas en USD.
  //
  // `createLedgerMovement` rechaza cualquier movimiento USD sin `exchange_rate`
  // (es su primera validación). Los asientos automáticos de venta, costo y
  // comisión nunca lo pasaban, así que en toda operación en USD el asiento
  // moría en su PRIMERA línea, el rollback borraba el journal_entry recién
  // creado y el caller se tragaba el error: cero asientos y cero rastro. Como
  // la mayoría de las operaciones se venden en dólares, en la práctica el
  // motor solo podía asentar operaciones en pesos.
  //
  // Se resuelve acá y no en cada función para que valga también para los
  // asientos manuales y para cualquier caller futuro. La fuente es
  // `exchange_rates` vía `getExchangeRateWithFallback`, que es la que valúa
  // (ver docs/finance/TIPO-DE-CAMBIO-FUENTES.md) y nunca devuelve null.
  //
  // Es aditivo: el único caso que cambia es el que hoy lanza excepción. Los
  // callers que ya mandan `exchange_rate` (los asientos de pago) siguen usando
  // el suyo, que es el TC real del movimiento y le gana a la valuación.
  let entryExchangeRate = exchange_rate ?? null
  if (currency === "USD" && !entryExchangeRate) {
    const { getExchangeRateWithFallback } = await import("./exchange-rates")
    const resolved = await getExchangeRateWithFallback(
      adminClient,
      entry_date,
      `journal-entry:${source}`
    )
    entryExchangeRate = resolved.rate
  }

  // VIB-134/B1-B2: el camino normal es una sola transacción en la base.
  //
  // Abajo sigue el camino viejo (N+1 escrituras sueltas con rollback manual en
  // JS) porque el cliente de Supabase no tiene transacciones: si falla la
  // tercera línea de un asiento de cuatro, lo anterior ya está escrito, y el
  // rollback que lo compensa también puede fallar. Ahí queda un asiento
  // DESBALANCEADO, que es peor que ninguno: descuadra el mayor en silencio.
  //
  // El fallback existe SOLO para la ventana de deploy —si el código sale antes
  // que la migración, la función todavía no existe y PostgREST responde
  // PGRST202—. Una vez aplicada en todos los ambientes se puede borrar junto
  // con el bloque de abajo.
  const rpcResult = await (adminClient.rpc as any)("create_journal_entry_atomic", {
    p_entry_date: entry_date,
    p_description: description,
    p_source: source,
    p_currency: currency,
    p_lines: lines,
    p_total_amount: balance.totalDebit,
    p_exchange_rate: entryExchangeRate,
    p_operation_id: operation_id || null,
    p_org_id: org_id ?? null,
    p_entry_kind: entry_kind ?? null,
    p_source_movement_id: source_movement_id ?? null,
    p_agency_id: agency_id ?? null,
    p_close_period: close_period ?? null,
    p_close_kind: close_kind ?? null,
    p_created_by: created_by || null,
    p_notes: notes || null,
  })

  if (!rpcResult.error) {
    const r = rpcResult.data as any
    return {
      id: r.id,
      entry_number: r.entry_number,
      entry_date: r.entry_date,
      description: r.description,
      source: r.source as JournalEntrySource,
      total_amount: r.total_amount,
      currency: r.currency,
      movement_ids: r.movement_ids ?? [],
    }
  }

  // La función no existe todavía: seguimos por el camino viejo. Cualquier otro
  // error SÍ se propaga — no queremos tapar un fallo real con el fallback.
  if (rpcResult.error.code !== "PGRST202") {
    throw new Error(`Error creando asiento contable: ${rpcResult.error.message}`)
  }
  console.warn(
    "[createJournalEntry] create_journal_entry_atomic no está disponible; usando el camino no atómico. Aplicar la migración 20260825000001."
  )

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
      // null deja actuar al trigger (comportamiento de siempre para requests
      // con sesión); con valor, gana el explícito.
      org_id: org_id ?? null,
      entry_kind: entry_kind ?? null,
      source_movement_id: source_movement_id ?? null,
      agency_id: agency_id ?? null,
      close_period: close_period ?? null,
      close_kind: close_kind ?? null,
    })
    .select("id, entry_number, entry_date, description, source, total_amount, currency")
    .single()

  if (jeError || !journalEntry) {
    throw new Error(`Error creando asiento contable: ${jeError?.message || "Unknown"}`)
  }

  // 2. Crear los ledger_movements para cada línea
  // ATOMICIDAD: Supabase JS client no soporta transacciones nativas. Si alguna
  // línea falla, hacemos rollback manual borrando los movements creados + el
  // journal_entry para no dejar asientos desbalanceados.
  // TODO: migrar a RPC SQL create_journal_entry_atomic() para atomicidad real.
  const { createLedgerMovement } = await import("./ledger")
  const movementIds: string[] = []

  try {
    for (const line of lines) {
      const isDebit = (line.debit_amount || 0) > 0
      const amount = isDebit ? line.debit_amount! : line.credit_amount!

      // Determinar tipo legacy basado en la línea
      // Si no se especifica, inferir del debit/credit
      const legacyType = line.legacy_type || (isDebit ? "EXPENSE" : "INCOME")
      const legacyMethod = line.legacy_method || "OTHER"

      // Calcular ARS equivalent
      const amountARS = currency === "USD" && entryExchangeRate
        ? amount * entryExchangeRate
        : amount

      // account_id: SOLO si el caller lo pasó explícitamente.
      //
      // VIB-134/B0: antes se buscaba una financial_account vinculada al plan de
      // cuentas y, si no la había, se lanzaba excepción. Eso hacía imposible
      // asentar contra cuentas que por naturaleza NO tienen caja detrás —
      // "Ventas de Viajes" (4.1.01) es una cuenta de resultado, no un banco—,
      // y por eso el motor nunca generó un asiento de venta, costo ni comisión:
      // el asiento entero moría en su segunda línea y el caller se tragaba el
      // error. En Lozada, 49 de 75 cuentas del plan están en esa situación.
      //
      // `ledger_movements.account_id` es NULLABLE: la exigencia era del código,
      // no del esquema. Es una condición heredada de cuando esta tabla era solo
      // el registro de caja, y quedó cuando se la reusó como línea de asiento.
      //
      // Tampoco se vincula automáticamente por chart_account_id: cuentas como
      // "Cuentas por Cobrar" SÍ tienen financial_account, y colgarles las
      // líneas del asiento les alteraría el SALDO (varias pantallas suman
      // ledger_movements por account_id). Una línea de asiento es contabilidad,
      // no un movimiento de dinero.
      const accountId = line.financial_account_id ?? null

      const { id: movId } = await createLedgerMovement(
        {
          org_id: org_id ?? null,
          operation_id: line.operation_id || operation_id || null,
          lead_id: null,
          type: legacyType,
          concept: line.concept || description,
          currency,
          amount_original: amount,
          exchange_rate: entryExchangeRate,
          amount_ars_equivalent: amountARS,
          method: legacyMethod,
          account_id: accountId,
          seller_id: line.seller_id || null,
          operator_id: line.operator_id || null,
          receipt_number: line.receipt_number || null,
          notes: line.notes || null,
          created_by: created_by || null,
          movement_date: entry_date,
          // VIB-134/B0: una línea de asiento es contabilidad, no un movimiento
          // de dinero. `affects_balance = false` la deja fuera del cálculo de
          // saldos de cuentas financieras (getAccountBalancesBatch filtra por
          // esta bandera) y de los reportes que la respetan. La contrapartida
          // en efectivo de un cobro ya existe como su propio movimiento; el
          // asiento no debe volver a moverla.
          affects_balance: line.affects_balance ?? false,
        },
        supabase
      )

      // Actualizar el movimiento con los campos de partida doble
      // (createLedgerMovement no conoce estos campos aún)
      const { error: updateError } = await (adminClient.from("ledger_movements") as any)
        .update({
          journal_entry_id: journalEntry.id,
          debit_amount: isDebit ? amount : null,
          credit_amount: isDebit ? null : amount,
          chart_account_id: line.chart_account_id || null,
        })
        .eq("id", movId)

      if (updateError) {
        throw new Error(`Error actualizando partida doble en movement ${movId}: ${updateError.message}`)
      }

      movementIds.push(movId)
    }
  } catch (loopError) {
    // ROLLBACK MANUAL: borrar movements parcialmente creados + journal_entry
    console.error(
      `[createJournalEntry] Error durante loop de líneas. Rolling back journal_entry ${journalEntry.id} y ${movementIds.length} movements.`,
      loopError
    )
    try {
      if (movementIds.length > 0) {
        await (adminClient.from("ledger_movements") as any)
          .delete()
          .in("id", movementIds)
      }
      // También borrar cualquier movement residual por journal_entry_id (defensa extra)
      await (adminClient.from("ledger_movements") as any)
        .delete()
        .eq("journal_entry_id", journalEntry.id)
      await (adminClient.from("journal_entries") as any)
        .delete()
        .eq("id", journalEntry.id)
    } catch (rollbackError) {
      console.error(
        `[createJournalEntry] ROLLBACK FAILED para journal_entry ${journalEntry.id}. Data inconsistente - revisar manualmente.`,
        rollbackError
      )
    }
    throw loopError instanceof Error ? loopError : new Error(String(loopError))
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
  // SaaS Pilar 2c: usar el client que recibe — RLS tenant_isolation acota por org.
  const adminClient = supabase

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
    dateType?: string
    source?: JournalEntrySource | "ALL"
    operationId?: string
    search?: string
    limit?: number
    offset?: number
  } = {}
) {
  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0
  const dateType = (filters.dateType || "ASIENTO").toUpperCase()

  // SaaS Pilar 2c: usar el client que recibe — RLS tenant_isolation acota por org.
  const adminClient = supabase

  // dateType=OPERACION: pre-resolver op_ids cuya operation_date ∈ [from,to]
  // y restringir journal_entries.operation_id IN (...). Asientos sin operación
  // (manuales) quedan fuera cuando se filtra por OPERACION.
  let opIdsRestriction: string[] | null = null
  if (dateType === "OPERACION" && (filters.dateFrom || filters.dateTo)) {
    let opQuery = (adminClient.from("operations") as any).select("id")
    if (filters.dateFrom) opQuery = opQuery.gte("operation_date", filters.dateFrom)
    if (filters.dateTo) opQuery = opQuery.lte("operation_date", filters.dateTo)
    const { data: matchingOps } = await opQuery.limit(5000)
    const ids = (matchingOps || []).map((o: any) => o.id as string)
    opIdsRestriction = ids
    if (ids.length === 0) {
      return { entries: [], total: 0, limit, offset, hasMore: false }
    }
  }

  let query = (adminClient.from("journal_entries") as any)
    .select("*, users:created_by(id, name)", { count: "exact" })
    .order("entry_date", { ascending: false })
    .order("entry_number", { ascending: false })
    .range(offset, offset + limit - 1)

  if (dateType === "OPERACION" && opIdsRestriction) {
    query = query.in("operation_id", opIdsRestriction)
  } else {
    // ASIENTO (default): filtrar por entry_date
    if (filters.dateFrom) {
      query = query.gte("entry_date", filters.dateFrom)
    }
    if (filters.dateTo) {
      query = query.lte("entry_date", filters.dateTo)
    }
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
    // SaaS Pilar 2c: usar el client que recibe — RLS tenant_isolation acota por org.
  const adminClient = supabase

    // Buscar chart_account_id de la cuenta financiera
    const { data: finAccount } = await (adminClient.from("financial_accounts") as any)
      .select("chart_account_id")
      .eq("id", params.financialAccountId)
      .maybeSingle()

    const financialChartAccountId = finAccount?.chart_account_id || null

    // VIB-145: el plan de cuentas es por organización, así que estas búsquedas
    // por código tienen que acotarse. Sin el filtro, con los mismos códigos en
    // varias orgs, `maybeSingle()` fallaría por múltiples filas (o cruzaría
    // tenants si el caller usara un admin client).
    const chartOrgId = await resolveChartOrgId(adminClient, {
      operationId: params.operation_id,
      movementId: params.mainMovementId,
    })
    const scopedChart = () => {
      const q = (adminClient.from("chart_of_accounts") as any).select("id")
      return chartOrgId ? q.eq("org_id", chartOrgId) : q
    }

    // Buscar chart_account_id para la cuenta contraparte
    let counterpartChartAccountId: string | null = null
    if (params.counterpartMovementId) {
      const counterpartCode = params.direction === "INCOME"
        ? ACCOUNT_CODES.CUENTAS_POR_COBRAR
        : ACCOUNT_CODES.CUENTAS_POR_PAGAR
      const { data: cpChart } = await scopedChart()
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
    const { data: resultadoChart } = await scopedChart()
      .eq("account_code", resultadoCode)
      .maybeSingle()

    // Leer el monto original del movimiento principal para usar como Debe/Haber
    // IMPORTANTE: Usar amount_original (moneda original), NO amount_ars_equivalent
    // para que el asiento refleje el monto en la moneda correcta
    const { data: mainMovement } = await (adminClient.from("ledger_movements") as any)
      .select("amount_original")
      .eq("id", params.mainMovementId)
      .single()

    const entryAmount = mainMovement
      ? parseFloat(mainMovement.amount_original || params.amount)
      : params.amount

    // Un asiento necesita sus DOS lados.
    //
    // Si falta la contrapartida —porque el movimiento no existe o porque su
    // cuenta del plan no se resuelve— antes se grababa igual y quedaba un
    // asiento de UNA sola línea, encima marcado `is_balanced: true`, que es
    // mentira. Medio asiento descuadra el mayor y nadie se entera: hay 928 así
    // en producción, del 7/5 al 20/8, casi todos de las agencias que no tenían
    // plan de cuentas hasta que se sembró.
    //
    // Ahora no se crea nada y el movimiento de plata queda sin anotar, que es
    // exactamente el estado en el que quedaría si esta función no hubiera
    // corrido. NO cambia ningún saldo: verificado sobre los 928 existentes, su
    // debit/credit es idéntico a `amount_original` (y en pesos también a
    // `amount_ars_equivalent`), así que la rama legacy de
    // getAccountBalancesBatch calcula exactamente el mismo número que la de
    // partida doble.
    //
    // El pago en sí no se toca: la plata ya se movió y el asiento es una capa
    // paralela.
    if (!financialChartAccountId || !params.counterpartMovementId || !counterpartChartAccountId) {
      const faltante = !financialChartAccountId
        ? "la cuenta financiera no está vinculada al plan de cuentas"
        : !params.counterpartMovementId
          ? "el movimiento de contrapartida no existe"
          : "la cuenta de contrapartida no está en el plan de la organización"

      console.error(
        `[annotatePaymentAsJournalEntry] Sin asiento para el movimiento ${params.mainMovementId}: ${faltante}.`
      )

      // Regla del módulo: una falla contable no se silencia. El pago siguió su
      // curso, pero queda una revisión manual pendiente.
      try {
        await (adminClient.from("alerts") as any).insert({
          org_id: chartOrgId,
          operation_id: params.operation_id || null,
          type: "SYSTEM",
          description: `Pago sin asiento contable: ${faltante}. Movimiento ${params.mainMovementId}. Revisar manualmente.`,
          date_due: new Date().toISOString(),
          status: "PENDING",
        })
      } catch {
        // La alerta es best-effort: no puede romper el pago.
      }

      return null
    }

    // Crear el journal_entry
    const { data: journalEntry, error: jeError } = await (adminClient.from("journal_entries") as any)
      .insert({
        entry_date: params.date,
        description: params.description,
        operation_id: params.operation_id || null,
        source: "AUTO_PAYMENT",
        is_balanced: true,
        total_amount: entryAmount,
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
          debit_amount: entryAmount,
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
            credit_amount: entryAmount,
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
          credit_amount: entryAmount,
          chart_account_id: financialChartAccountId,
        })
        .eq("id", params.mainMovementId)

      // Counterpart (CpP): se reduce la deuda con operador → Debe
      if (params.counterpartMovementId && counterpartChartAccountId) {
        await (adminClient.from("ledger_movements") as any)
          .update({
            journal_entry_id: journalEntry.id,
            debit_amount: entryAmount,
            credit_amount: null,
            chart_account_id: counterpartChartAccountId,
          })
          .eq("id", params.counterpartMovementId)
      }
    }

    // Anotar percepciones si las hay
    if (params.perceptionMovementIds && params.perceptionMovementIds.length > 0) {
      const { data: percChart } = await scopedChart()
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

// ============================================================
// AUTO-JOURNAL ENTRIES — Asientos automáticos por operación
// ============================================================

/**
 * Resolver códigos de cuenta a IDs (batch)
 */
export async function resolveAccountIds(
  codes: string[],
  adminClient: any,
  orgId: string | null
): Promise<Record<string, string>> {
  let query = (adminClient.from("chart_of_accounts") as any)
    .select("id, account_code")
    .in("account_code", codes)
    .eq("is_active", true)

  // VIB-145: el plan de cuentas es por organización. Antes esta query no
  // filtraba por org y se apoyaba solo en RLS; con un plan por org los mismos
  // códigos existen en todas, así que sin el filtro la resolución es ambigua
  // (y con un admin client, directamente cruzaría tenants).
  if (orgId) query = query.eq("org_id", orgId)

  const { data } = await query

  const map: Record<string, string> = {}
  for (const row of (data || [])) {
    map[row.account_code] = row.id
  }
  return map
}

/**
 * Resolver la organización cuyo plan de cuentas hay que usar (VIB-145).
 *
 * Los asientos automáticos reciben objetos armados por el caller, que no
 * siempre traen `org_id`. Se toma del objeto si está; si no, se deriva de la
 * operación o del movimiento, que sí lo tienen en la base.
 */
async function resolveChartOrgId(
  adminClient: any,
  source: { orgId?: string | null; operationId?: string | null; movementId?: string | null }
): Promise<string | null> {
  if (source.orgId) return source.orgId

  if (source.operationId) {
    const { data } = await (adminClient.from("operations") as any)
      .select("org_id")
      .eq("id", source.operationId)
      .maybeSingle()
    if (data?.org_id) return data.org_id
  }

  if (source.movementId) {
    const { data } = await (adminClient.from("ledger_movements") as any)
      .select("org_id")
      .eq("id", source.movementId)
      .maybeSingle()
    if (data?.org_id) return data.org_id
  }

  return null
}

/**
 * Mapear product_type de operation_operators al código de cuenta de costo
 */
function getCostAccountCode(productType?: string | null): string {
  switch (productType) {
    case "HOTEL": return ACCOUNT_CODES.COSTO_HOTELERIA
    case "FLIGHT": return ACCOUNT_CODES.COSTO_AEREOS
    case "TRANSFER": return ACCOUNT_CODES.COSTO_TRANSFERS
    case "CRUISE":
    case "PACKAGE":
    case "MIXED":
    default: return ACCOUNT_CODES.COSTO_OPERADORES
  }
}

/**
 * Verificar si ya existen asientos automáticos para una operación con un source dado
 */
/**
 * ¿La operación ya tiene su asiento de esta clase?
 *
 * VIB-134/B3: antes el asiento de costo se buscaba por `ILIKE 'Costo%'` sobre la
 * descripción, porque venta y costo comparten `source = 'AUTO_CONFIRMATION'` y
 * el origen no los distingue. Eso fallaba en las dos direcciones: un asiento
 * manual que empezara con "Costo" bloqueaba al automático para siempre, y
 * cambiar la redacción lo duplicaba. Ahora la clase es una columna, y la base
 * la hace cumplir con un índice único parcial.
 */
async function hasExistingJournalEntryOfKind(
  operationId: string,
  kind: JournalEntryKind,
  adminClient: any
): Promise<boolean> {
  const { data } = await (adminClient.from("journal_entries") as any)
    .select("id")
    .eq("operation_id", operationId)
    .eq("entry_kind", kind)
    .limit(1)
    .maybeSingle()
  return !!data
}

/**
 * ASIENTO 1 — Venta
 *
 * Al confirmar una operación:
 *   Debe: Cuentas por Cobrar (1.1.03) → sale_amount_total
 *   Haber: Ventas de Viajes (4.1.01) → sale_amount_total
 *
 * Registra el activo (derecho de cobro) y el ingreso por la venta.
 */
export async function createSaleJournalEntry(
  operation: {
    id: string
    sale_amount_total: number
    sale_currency?: string
    currency?: string
    destination?: string
    file_code?: string
    operation_date?: string
    created_at?: string
  },
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  try {
    // SaaS Pilar 2c: usar el client que recibe — RLS tenant_isolation acota por org.
  const adminClient = supabase
    const saleAmount = Number(operation.sale_amount_total) || 0
    if (saleAmount <= 0) return null

    // Idempotencia: no crear si ya existe
    if (await hasExistingJournalEntryOfKind(operation.id, "SALE", adminClient)) {
      return null
    }

    const currency = (operation.sale_currency || operation.currency || "USD") as "ARS" | "USD"
    const chartOrgId = await resolveChartOrgId(adminClient, {
      orgId: (operation as any).org_id,
      operationId: operation.id,
    })
    const codes = [ACCOUNT_CODES.CUENTAS_POR_COBRAR, ACCOUNT_CODES.VENTAS]
    const accountIds = await resolveAccountIds(codes, adminClient, chartOrgId)

    const cpcId = accountIds[ACCOUNT_CODES.CUENTAS_POR_COBRAR]
    const ventasId = accountIds[ACCOUNT_CODES.VENTAS]

    if (!cpcId || !ventasId) {
      console.error("Asiento Venta: cuentas contables no encontradas (1.1.03, 4.1.01)")
      return null
    }

    const opCode = operation.file_code || operation.id.slice(0, 8)
    const dest = operation.destination || ""
    const entryDate = operation.operation_date || operation.created_at?.split("T")[0] || new Date().toISOString().split("T")[0]

    const entry = await createJournalEntry({
      entry_date: entryDate,
      description: `Venta ${opCode}${dest ? ` — ${dest}` : ""}`,
      operation_id: operation.id,
      source: "AUTO_CONFIRMATION",
      currency,
      org_id: chartOrgId,
      entry_kind: "SALE" as const,
      exchange_rate: (operation as any).exchange_rate ?? undefined,
      agency_id: (operation as any).agency_id ?? null,
      lines: [
        {
          chart_account_id: cpcId,
          debit_amount: saleAmount,
          concept: `Ds x Ventas — ${opCode}`,
          legacy_type: "INCOME",
        },
        {
          chart_account_id: ventasId,
          credit_amount: saleAmount,
          concept: `Ventas — ${opCode}`,
          legacy_type: "INCOME",
        },
      ],
    }, supabase)

    return entry.id
  } catch (error) {
    console.error("Error creando asiento de venta:", error)
    return null
  }
}

/**
 * ASIENTO 2 — Costo de Venta
 *
 * Al confirmar una operación:
 *   Debe: Costo de Venta (4.2.XX según product_type) → costo total
 *   Haber: Cuentas por Pagar (2.1.01) → una línea por operador
 *
 * Registra la obligación de pago con cada operador.
 */
export async function createCostJournalEntry(
  operation: {
    id: string
    operator_cost?: number
    sale_currency?: string
    currency?: string
    file_code?: string
    operation_date?: string
    created_at?: string
  },
  operators: Array<{
    operator_id: string
    cost: number
    cost_currency?: string
    product_type?: string | null
    operators?: { id: string; name: string } | null
  }>,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  try {
    // SaaS Pilar 2c: usar el client que recibe — RLS tenant_isolation acota por org.
  const adminClient = supabase

    // Si no hay operadores con costo, intentar con operator_cost general
    let effectiveOperators = operators.filter(op => Number(op.cost) > 0)

    if (effectiveOperators.length === 0) {
      const generalCost = Number(operation.operator_cost) || 0
      if (generalCost <= 0) return null
      // Sin detalle de operadores, crear un asiento genérico
      effectiveOperators = [{ operator_id: "", cost: generalCost, product_type: null, operators: null }]
    }

    if (await hasExistingJournalEntryOfKind(operation.id, "COST", adminClient)) {
      return null
    }

    const currency = (operation.sale_currency || operation.currency || "USD") as "ARS" | "USD"
    const opCode = operation.file_code || operation.id.slice(0, 8)
    const entryDate = operation.operation_date || operation.created_at?.split("T")[0] || new Date().toISOString().split("T")[0]

    // Resolver todos los códigos de cuenta que necesitamos
    const chartOrgId = await resolveChartOrgId(adminClient, {
      orgId: (operation as any).org_id,
      operationId: operation.id,
    })
    const costCodes = Array.from(new Set(effectiveOperators.map(op => getCostAccountCode(op.product_type))))
    const allCodes = [...costCodes, ACCOUNT_CODES.CUENTAS_POR_PAGAR]
    const accountIds = await resolveAccountIds(allCodes, adminClient, chartOrgId)

    // VIB-144/I2: un operador puede tener su propia cuenta de costo. Si no la
    // tiene —que es el caso de todos hasta que alguien la configure— se sigue
    // derivando del tipo de producto, exactamente como antes.
    //
    // El override se valida contra el plan de la MISMA organización: una cuenta
    // de otra org no se usa, se ignora y se cae al default. Sin eso, un dato mal
    // cargado imputaría el costo al plan de otra agencia.
    const operatorIds = Array.from(
      new Set(effectiveOperators.map((op) => op.operator_id).filter(Boolean))
    )
    const overridePorOperador = new Map<string, string>()
    if (operatorIds.length > 0) {
      const { data: opsConCuenta } = await (adminClient.from("operators") as any)
        .select("id, cost_chart_account_id, chart_of_accounts:cost_chart_account_id(id, org_id)")
        .in("id", operatorIds)
        .not("cost_chart_account_id", "is", null)

      for (const o of (opsConCuenta ?? []) as any[]) {
        const cuenta = o.chart_of_accounts
        if (cuenta?.id && (!chartOrgId || cuenta.org_id === chartOrgId)) {
          overridePorOperador.set(o.id, cuenta.id)
        }
      }
    }

    /** Cuenta contable donde cae el costo de esta pata. */
    const cuentaDeCosto = (op: any): string | null =>
      overridePorOperador.get(op.operator_id) ?? accountIds[getCostAccountCode(op.product_type)] ?? null

    const cppId = accountIds[ACCOUNT_CODES.CUENTAS_POR_PAGAR]
    if (!cppId) {
      console.error("Asiento Costo: cuenta 2.1.01 no encontrada")
      return null
    }

    // Construir líneas: una de Debe por cada tipo de costo, una de Haber por operador
    const totalCost = effectiveOperators.reduce((sum, op) => sum + Number(op.cost), 0)

    // Agrupar por cuenta contable resuelta (override del operador o default por
    // tipo de producto). Se agrupa por ID y no por código porque el override es
    // una cuenta concreta, no un código canónico.
    const costByAccount: Record<string, number> = {}
    for (const op of effectiveOperators) {
      const chartId = cuentaDeCosto(op)
      if (!chartId) continue
      costByAccount[chartId] = (costByAccount[chartId] || 0) + Number(op.cost)
    }

    const lines: JournalEntryLine[] = []

    // Líneas de Debe (costos agrupados por cuenta)
    for (const [chartId, amount] of Object.entries(costByAccount)) {
      lines.push({
        chart_account_id: chartId,
        debit_amount: Math.round(amount * 100) / 100,
        concept: `Costo de venta — ${opCode}`,
        legacy_type: "EXPENSE",
      })
    }

    // Líneas de Haber (una por operador)
    for (const op of effectiveOperators) {
      const operatorName = op.operators?.name || "Operador"
      lines.push({
        chart_account_id: cppId,
        credit_amount: Math.round(Number(op.cost) * 100) / 100,
        concept: `${operatorName} a pagar — ${opCode}`,
        operator_id: op.operator_id || null,
        legacy_type: "EXPENSE",
      })
    }

    if (lines.length < 2) return null

    const entry = await createJournalEntry({
      entry_date: entryDate,
      description: `Costo ${opCode}`,
      operation_id: operation.id,
      source: "AUTO_CONFIRMATION",
      currency,
      org_id: chartOrgId,
      entry_kind: "COST" as const,
      exchange_rate: (operation as any).exchange_rate ?? undefined,
      agency_id: (operation as any).agency_id ?? null,
      lines,
    }, supabase)

    return entry.id
  } catch (error) {
    console.error("Error creando asiento de costo:", error)
    return null
  }
}

/**
 * ASIENTO 4 — Comisiones
 *
 * Al calcular comisiones de una operación:
 *   Debe: Comisiones x Ventas (4.3.03) → monto total comisión
 *   Haber: Cuentas por Pagar (2.1.01) → una línea por vendedor
 *
 * "Com x Ventas" es una cuenta de ajuste de ingresos (sube por el Debe).
 * El contrapunto es la obligación de pago con los vendedores.
 */
export async function createCommissionJournalEntry(
  operation: {
    id: string
    seller_id?: string
    seller_secondary_id?: string
    file_code?: string
    sale_currency?: string
    currency?: string
    operation_date?: string
    created_at?: string
  },
  commissionData: {
    totalCommission: number
    primaryCommission: number
    secondaryCommission: number | null
  },
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  try {
    // SaaS Pilar 2c: usar el client que recibe — RLS tenant_isolation acota por org.
  const adminClient = supabase
    if (commissionData.totalCommission <= 0) return null

    // Idempotencia
    if (await hasExistingJournalEntryOfKind(operation.id, "COMMISSION", adminClient)) {
      return null
    }

    const currency = (operation.sale_currency || operation.currency || "USD") as "ARS" | "USD"
    const opCode = operation.file_code || operation.id.slice(0, 8)
    const entryDate = operation.operation_date || operation.created_at?.split("T")[0] || new Date().toISOString().split("T")[0]

    const chartOrgId = await resolveChartOrgId(adminClient, {
      orgId: (operation as any).org_id,
      operationId: operation.id,
    })
    const codes = [ACCOUNT_CODES.COMISIONES_VENDEDORES, ACCOUNT_CODES.CUENTAS_POR_PAGAR]
    const accountIds = await resolveAccountIds(codes, adminClient, chartOrgId)

    const comVentasId = accountIds[ACCOUNT_CODES.COMISIONES_VENDEDORES]
    const cppId = accountIds[ACCOUNT_CODES.CUENTAS_POR_PAGAR]

    if (!comVentasId || !cppId) {
      console.error("Asiento Comisiones: cuentas 4.3.03 o 2.1.01 no encontradas")
      return null
    }

    // Obtener nombres de vendedores
    const sellerIds = [operation.seller_id, operation.seller_secondary_id].filter(Boolean)
    const { data: sellers } = await (adminClient.from("users") as any)
      .select("id, name")
      .in("id", sellerIds)

    const sellerNames: Record<string, string> = {}
    for (const s of (sellers || [])) {
      sellerNames[s.id] = s.name
    }

    const lines: JournalEntryLine[] = [
      // Debe: Comisiones x Ventas (gasto)
      {
        chart_account_id: comVentasId,
        debit_amount: Math.round(commissionData.totalCommission * 100) / 100,
        concept: `Com. x Ventas — ${opCode}`,
        legacy_type: "COMMISSION",
      },
    ]

    // Haber: una línea por vendedor
    if (commissionData.primaryCommission > 0 && operation.seller_id) {
      const name = sellerNames[operation.seller_id] || "Vendedor"
      lines.push({
        chart_account_id: cppId,
        credit_amount: Math.round(commissionData.primaryCommission * 100) / 100,
        concept: `Com. ${name} a pagar — ${opCode}`,
        seller_id: operation.seller_id,
        legacy_type: "COMMISSION",
      })
    }

    if (commissionData.secondaryCommission && commissionData.secondaryCommission > 0 && operation.seller_secondary_id) {
      const name = sellerNames[operation.seller_secondary_id] || "Vendedor"
      lines.push({
        chart_account_id: cppId,
        credit_amount: Math.round(commissionData.secondaryCommission * 100) / 100,
        concept: `Com. ${name} a pagar — ${opCode}`,
        seller_id: operation.seller_secondary_id,
        legacy_type: "COMMISSION",
      })
    }

    if (lines.length < 2) return null

    const entry = await createJournalEntry({
      entry_date: entryDate,
      description: `Comisiones ${opCode}`,
      operation_id: operation.id,
      source: "AUTO_COMMISSION",
      currency,
      org_id: chartOrgId,
      entry_kind: "COMMISSION" as const,
      exchange_rate: (operation as any).exchange_rate ?? undefined,
      agency_id: (operation as any).agency_id ?? null,
      lines,
    }, supabase)

    return entry.id
  } catch (error) {
    console.error("Error creando asiento de comisiones:", error)
    return null
  }
}
