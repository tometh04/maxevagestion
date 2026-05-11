import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { ACCOUNT_CODES } from "./account-codes"

type SupportedCurrency = "ARS" | "USD"
type LedgerMethod = "CASH" | "BANK" | "MP" | "USD" | "OTHER"
type CounterpartAccountCode = typeof ACCOUNT_CODES.CUENTAS_POR_COBRAR | typeof ACCOUNT_CODES.CUENTAS_POR_PAGAR

const COUNTERPART_PAYMENT_MARKER_KEY = "counterpart_payment_id"

export interface CounterpartMovementCandidate {
  id: string
  account_id: string
  notes?: string | null
  movement_date?: string | null
  created_at?: string | null
}

interface PaymentCounterpartBaseParams {
  paymentId?: string | null
  operationId?: string | null
  direction?: string | null
  payerType?: string | null
  currency?: string | null
  amount: number
  reference?: string | null
  datePaid?: string | null
}

interface CreatePaymentCounterpartParams extends PaymentCounterpartBaseParams {
  supabase: SupabaseClient<Database>
  method?: string | null
  exchangeRate?: number | null
  selectedFinancialAccountId?: string | null
  sellerId?: string | null
  operatorId?: string | null
  userId?: string | null
}

interface FindPaymentCounterpartParams extends PaymentCounterpartBaseParams {
  supabase: SupabaseClient<Database>
  selectedFinancialAccountId?: string | null
  excludeLedgerMovementId?: string | null
}

interface RemovePaymentCounterpartParams extends FindPaymentCounterpartParams {}

function normalizeCurrency(currency?: string | null): SupportedCurrency | null {
  if (currency === "ARS" || currency === "USD") {
    return currency
  }

  return null
}

function normalizeReference(reference?: string | null): string | null {
  const trimmed = reference?.trim()
  return trimmed ? trimmed : null
}

function normalizePositiveNumber(value?: number | string | null): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function sameDay(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false

  const leftDate = new Date(left)
  const rightDate = new Date(right)

  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return false
  }

  return leftDate.toISOString().slice(0, 10) === rightDate.toISOString().slice(0, 10)
}

function sortCandidatesByRecency(
  left: CounterpartMovementCandidate,
  right: CounterpartMovementCandidate
): number {
  const leftStamp = new Date(left.created_at || left.movement_date || 0).getTime()
  const rightStamp = new Date(right.created_at || right.movement_date || 0).getTime()
  return rightStamp - leftStamp
}

async function resolveCounterpartAccountId(
  supabase: SupabaseClient<Database>,
  accountCode: CounterpartAccountCode,
  currency: SupportedCurrency
): Promise<string | null> {
  const { data: chartAccount } = await (supabase.from("chart_of_accounts") as any)
    .select("id")
    .eq("account_code", accountCode)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (!chartAccount?.id) {
    return null
  }

  const { data: financialAccount } = await (supabase.from("financial_accounts") as any)
    .select("id")
    .eq("chart_account_id", chartAccount.id)
    .eq("currency", currency)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  return financialAccount?.id || null
}

export function mapPaymentMethodToLedgerMethod(method?: string | null): LedgerMethod {
  const normalized = (method || "").trim().toLowerCase()

  switch (normalized) {
    case "efectivo":
      return "CASH"
    case "transferencia":
      return "BANK"
    case "mercadopago":
    case "mercado pago":
    case "mp":
      return "MP"
    case "usd":
      return "USD"
    default:
      return "OTHER"
  }
}

/**
 * Normaliza el campo payment.method (que puede haber sido guardado como
 * vocabulario ledger CASH/BANK/MP/USD/OTHER por seeds, tests o flows
 * legacy) al vocabulario humano usado por el Select del form
 * (Transferencia/Efectivo/MercadoPago/Otro).
 *
 * Si el valor ya está en vocabulario humano, lo devuelve tal cual.
 */
export function normalizePaymentMethodForForm(method?: string | null): string {
  const raw = (method || "").trim()
  if (!raw) return "Transferencia"

  switch (raw.toUpperCase()) {
    case "BANK":
      return "Transferencia"
    case "CASH":
      return "Efectivo"
    case "MP":
      return "MercadoPago"
    case "USD":
      return "Otro"
    case "OTHER":
      return "Otro"
    default:
      return raw // ya es vocabulario humano
  }
}

export function getPaymentCounterpartAccountCode(
  direction?: string | null,
  payerType?: string | null
): CounterpartAccountCode | null {
  if (direction === "INCOME") {
    return ACCOUNT_CODES.CUENTAS_POR_COBRAR
  }

  if (payerType === "OPERATOR") {
    return ACCOUNT_CODES.CUENTAS_POR_PAGAR
  }

  return null
}

export function buildPaymentCounterpartMarker(paymentId?: string | null): string | null {
  return paymentId ? `${COUNTERPART_PAYMENT_MARKER_KEY}=${paymentId}` : null
}

export function appendPaymentCounterpartMarker(
  baseNote: string,
  paymentId?: string | null
): string {
  const marker = buildPaymentCounterpartMarker(paymentId)

  if (!marker) {
    return baseNote
  }

  return `${baseNote} [${marker}]`
}

export function selectBestCounterpartMovement(
  candidates: CounterpartMovementCandidate[],
  params: Pick<FindPaymentCounterpartParams, "paymentId" | "reference" | "datePaid">
): CounterpartMovementCandidate | null {
  if (!candidates.length) {
    return null
  }

  const marker = buildPaymentCounterpartMarker(params.paymentId)
  if (marker) {
    const tagged = candidates.filter((candidate) => candidate.notes?.includes(marker))
    if (tagged.length > 0) {
      return tagged.sort(sortCandidatesByRecency)[0]
    }
  }

  const reference = normalizeReference(params.reference)?.toLowerCase()

  return candidates
    .map((candidate) => {
      let score = 0

      if (reference && candidate.notes?.toLowerCase().includes(reference)) {
        score += 30
      }

      if (sameDay(candidate.movement_date, params.datePaid)) {
        score += 20
      }

      if (sameDay(candidate.created_at, params.datePaid)) {
        score += 10
      }

      return { candidate, score }
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return sortCandidatesByRecency(left.candidate, right.candidate)
    })[0]?.candidate || null
}

export async function findPaymentCounterpartMovement(
  params: FindPaymentCounterpartParams
): Promise<{
  accountId: string | null
  markerCandidates: CounterpartMovementCandidate[]
  matchedCandidate: CounterpartMovementCandidate | null
}> {
  const { supabase } = params
  const currency = normalizeCurrency(params.currency)
  const accountCode = getPaymentCounterpartAccountCode(params.direction, params.payerType)

  if (!currency || !accountCode || !params.operationId) {
    return {
      accountId: null,
      markerCandidates: [],
      matchedCandidate: null,
    }
  }

  const accountId = await resolveCounterpartAccountId(supabase, accountCode, currency)

  if (!accountId || accountId === params.selectedFinancialAccountId) {
    return {
      accountId,
      markerCandidates: [],
      matchedCandidate: null,
    }
  }

  const marker = buildPaymentCounterpartMarker(params.paymentId)

  if (marker) {
    const { data: markerCandidates } = await (supabase.from("ledger_movements") as any)
      .select("id, account_id, notes, movement_date, created_at")
      .eq("operation_id", params.operationId)
      .eq("account_id", accountId)
      .eq("type", "INCOME")
      .ilike("notes", `%${marker}%`)
      .order("created_at", { ascending: false })

    if (markerCandidates?.length) {
      return {
        accountId,
        markerCandidates,
        matchedCandidate: markerCandidates[0],
      }
    }
  }

  let query = (supabase.from("ledger_movements") as any)
    .select("id, account_id, notes, movement_date, created_at")
    .eq("operation_id", params.operationId)
    .eq("account_id", accountId)
    .eq("type", "INCOME")
    .eq("amount_original", params.amount)
    .eq("currency", currency)
    .order("created_at", { ascending: false })

  if (params.excludeLedgerMovementId) {
    query = query.neq("id", params.excludeLedgerMovementId)
  }

  const { data: candidates } = await query.limit(10)
  const matchedCandidate = selectBestCounterpartMovement(candidates || [], params)

  return {
    accountId,
    markerCandidates: [],
    matchedCandidate,
  }
}

export async function removePaymentCounterpartMovement(
  params: RemovePaymentCounterpartParams
): Promise<{ removedIds: string[]; accountIds: string[] }> {
  const { supabase } = params
  const result = await findPaymentCounterpartMovement(params)

  const idsToDelete = result.markerCandidates.length > 0
    ? result.markerCandidates.map((candidate) => candidate.id)
    : result.matchedCandidate
      ? [result.matchedCandidate.id]
      : []

  if (!idsToDelete.length) {
    return { removedIds: [], accountIds: [] }
  }

  const { data: removed, error } = await (supabase.from("ledger_movements") as any)
    .delete()
    .in("id", idsToDelete)
    .select("id, account_id")

  if (error) {
    throw new Error(`Error eliminando contramovimiento contable: ${error.message}`)
  }

  const { invalidateBalanceCache } = await import("./ledger")
  const accountIds: string[] = Array.from(
    new Set<string>(
      (removed || [])
        .map((movement: any) => movement.account_id)
        .filter((accountId: unknown): accountId is string => typeof accountId === "string" && accountId.length > 0)
    )
  )
  accountIds.forEach((accountId) => invalidateBalanceCache(accountId))

  return {
    removedIds: (removed || []).map((movement: any) => movement.id),
    accountIds,
  }
}

export async function createPaymentCounterpartMovement(
  params: CreatePaymentCounterpartParams
): Promise<{ id: string; accountId: string } | null> {
  const { supabase } = params
  const currency = normalizeCurrency(params.currency)
  const accountCode = getPaymentCounterpartAccountCode(params.direction, params.payerType)

  if (!currency || !accountCode || !params.operationId) {
    return null
  }

  const accountId = await resolveCounterpartAccountId(supabase, accountCode, currency)

  if (!accountId || accountId === params.selectedFinancialAccountId) {
    return null
  }

  // IDEMPOTENCY GUARD: evitar contramovimiento duplicado si esta función es
  // invocada dos veces para el mismo pago (ej: POST con status=PAID + llamada
  // posterior a mark-paid, o retries). Buscamos por marker en notes.
  const existingMarker = buildPaymentCounterpartMarker(params.paymentId)
  if (existingMarker) {
    const { data: existingCounterpart } = await (supabase.from("ledger_movements") as any)
      .select("id, account_id")
      .eq("operation_id", params.operationId)
      .eq("account_id", accountId)
      .eq("type", "INCOME")
      .ilike("notes", `%${existingMarker}%`)
      .limit(1)
      .maybeSingle()

    if (existingCounterpart?.id) {
      console.log(
        `[payment-counterparts] Counterpart ya existe para payment ${params.paymentId} (ledger_movement ${existingCounterpart.id}). Skipping duplicate.`
      )
      return { id: existingCounterpart.id, accountId: existingCounterpart.account_id }
    }
  }

  let exchangeRate = normalizePositiveNumber(params.exchangeRate)
  if (currency === "USD" && !exchangeRate) {
    const { getExchangeRateWithFallback } = await import("./exchange-rates")
    const rateResult = await getExchangeRateWithFallback(
      supabase,
      new Date(params.datePaid || new Date().toISOString()),
      `payment-counterpart-${params.paymentId || params.operationId}`
    )
    exchangeRate = rateResult.rate
  }

  const { calculateARSEquivalent, createLedgerMovement, getMainPassengerName } = await import("./ledger")
  const passengerName = await getMainPassengerName(params.operationId, supabase)
  const amountARS = calculateARSEquivalent(params.amount, currency, exchangeRate)
  const operationCode = params.operationId.slice(0, 8)
  const ledgerMethod = mapPaymentMethodToLedgerMethod(params.method)
  const reference = normalizeReference(params.reference)

  const isCustomerIncome = params.direction === "INCOME"
  const concept = isCustomerIncome
    ? passengerName
      ? `${passengerName} (${operationCode})`
      : `Cobro de cliente - Op. ${operationCode}`
    : passengerName
      ? `Pago a operador - ${passengerName} (${operationCode})`
      : `Pago a operador - Op. ${operationCode}`

  const baseNote = isCustomerIncome
    ? reference ? `Pago recibido: ${reference}` : "Pago recibido"
    : reference ? `Pago realizado: ${reference}` : "Pago realizado"

  const { id } = await createLedgerMovement(
    {
      operation_id: params.operationId,
      lead_id: null,
      type: "INCOME",
      concept,
      currency,
      amount_original: params.amount,
      exchange_rate: exchangeRate,
      amount_ars_equivalent: amountARS,
      method: ledgerMethod,
      account_id: accountId,
      seller_id: params.sellerId || null,
      operator_id: isCustomerIncome ? null : params.operatorId || null,
      receipt_number: reference || null,
      notes: appendPaymentCounterpartMarker(baseNote, params.paymentId),
      created_by: params.userId || null,
      movement_date: params.datePaid || null,
    },
    supabase
  )

  // Anotar el counterpart con debit/credit + chart_account_id INMEDIATAMENTE.
  //
  // Por qué: antes esto dependía de que mark-paid/route.ts llamara a
  // annotatePaymentAsJournalEntry después. Si esa llamada no ocurría (flujos
  // alternativos, errores intermedios, data histórica), el counterpart quedaba
  // como type=INCOME legacy y la fórmula de saldos lo SUMABA a CpC/CpP en vez
  // de restarlo — inflando la deuda acumulada (ej: CpC USD +$1.24M con ~92%
  // de movements sin anotar en prod al 2026-04-19).
  //
  // Al setear d/c acá, el counterpart queda correcto desde su creación. La
  // fórmula de partida doble (committeada hoy en fix/plan-cuentas-balance)
  // lo maneja bien: para CpC (ACTIVO, debit-natural), credit_amount resta.
  // Para CpP (PASIVO), debit_amount suma (reduciendo la deuda).
  //
  // annotatePaymentAsJournalEntry sigue ejecutándose después pero queda
  // idempotente (overwrite al mismo valor).
  try {
    const { data: counterpartChart } = await (supabase.from("chart_of_accounts") as any)
      .select("id")
      .eq("account_code", accountCode)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    if (counterpartChart?.id) {
      // INCOME direction (cobro cliente) → reducir CpC vía credit
      // EXPENSE direction (pago operador) → reducir CpP vía debit
      const annotation = isCustomerIncome
        ? { credit_amount: params.amount, debit_amount: null }
        : { debit_amount: params.amount, credit_amount: null }

      await (supabase.from("ledger_movements") as any)
        .update({ ...annotation, chart_account_id: counterpartChart.id })
        .eq("id", id)
    }
  } catch (err) {
    // No romper el flow principal si la anotación inline falla. El movement
    // ya quedó creado; annotatePaymentAsJournalEntry puede corregirlo después.
    console.error("[payment-counterparts] No se pudo anotar d/c inline:", err)
  }

  return { id, accountId }
}
