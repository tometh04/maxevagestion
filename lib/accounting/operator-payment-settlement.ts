import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type AppSupabaseClient = SupabaseClient<Database>

export type OpenOperatorPaymentStatus = "PENDING" | "OVERDUE"

export interface OperatorPaymentRecord {
  id: string
  operation_id: string | null
  operator_id: string
  amount: number | string
  paid_amount: number | string | null
  due_date: string | null
  status: "PENDING" | "PAID" | "OVERDUE"
  ledger_movement_id: string | null
  created_at?: string | null
}

const MONEY_EPSILON = 0.005

/**
 * Se lanza cuando un operador tiene varias deudas (patas) pendientes en la misma
 * operación y el monto del pago NO coincide exactamente con ninguna, por lo que
 * no se puede imputar automáticamente sin adivinar. En vez de caer a FIFO (que
 * imputaba el pago a la pata equivocada), el flujo de registro corta y le pide al
 * usuario que elija a qué deuda corresponde. `candidates` son las patas pendientes.
 */
export class AmbiguousOperatorPaymentError extends Error {
  readonly code = "AMBIGUOUS_OPERATOR_PAYMENT" as const
  readonly candidates: OperatorPaymentRecord[]
  constructor(candidates: OperatorPaymentRecord[]) {
    super(
      "Este operador tiene varias deudas pendientes en la operación y el monto no coincide exactamente con ninguna. Elegí a qué deuda corresponde el pago."
    )
    this.name = "AmbiguousOperatorPaymentError"
    this.candidates = candidates
  }
}

function toMoney(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeDate(date: Date): Date {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function parseDateOnly(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number)
    return new Date(year, month - 1, day)
  }

  return new Date(value)
}

export function getOpenOperatorPaymentStatus(
  dueDate: string | null | undefined,
  today = new Date()
): OpenOperatorPaymentStatus {
  if (!dueDate) {
    return "PENDING"
  }

  const due = normalizeDate(parseDateOnly(dueDate))
  const current = normalizeDate(today)

  return due < current ? "OVERDUE" : "PENDING"
}

export function hasPendingBalance(operatorPayment: Pick<OperatorPaymentRecord, "amount" | "paid_amount">): boolean {
  return toMoney(operatorPayment.paid_amount) + MONEY_EPSILON < toMoney(operatorPayment.amount)
}

export function getEffectiveOperatorPaymentStatus(
  operatorPayment: Pick<OperatorPaymentRecord, "amount" | "paid_amount" | "due_date">
): OperatorPaymentRecord["status"] {
  return hasPendingBalance(operatorPayment)
    ? getOpenOperatorPaymentStatus(operatorPayment.due_date)
    : "PAID"
}

export function buildOperatorPaymentUpdate(
  operatorPayment: Pick<OperatorPaymentRecord, "amount" | "paid_amount" | "due_date">,
  paymentDelta: number,
  ledgerMovementId: string | null
) {
  const currentPaid = toMoney(operatorPayment.paid_amount)
  const totalAmount = toMoney(operatorPayment.amount)
  // Tope en [0, totalAmount]: evita que un pago cree sobrepago (paid_amount > amount)
  // o saldo negativo (paid_amount < 0 por reverso mayor al pagado).
  const rawNextPaid = currentPaid + paymentDelta
  const nextPaidAmount = roundMoney(Math.min(totalAmount, Math.max(0, rawNextPaid)))
  const fullyPaid = nextPaidAmount + MONEY_EPSILON >= totalAmount

  return {
    paid_amount: nextPaidAmount,
    status: fullyPaid ? "PAID" as const : getOpenOperatorPaymentStatus(operatorPayment.due_date),
    ledger_movement_id: fullyPaid ? ledgerMovementId : null,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Desambigua entre varias patas pendientes del MISMO operador usando el monto
 * del pago.
 *
 * Caso real (OP b62d751c, 2026-06): un operador (FTA TOUR OPERADOR) aparecía en
 * 2 patas de la misma operación — Hotel 332,64 y Vuelo 399,44. Al registrar un
 * pago de 399,44 sin operator_payment_id explícito, el matching tomaba la pata
 * MÁS VIEJA (FIFO) → la del hotel, topeaba el pago a 332,64 y descartaba el
 * excedente, dejando el vuelo como pendiente fantasma.
 *
 * Estrategia conservadora: solo desvía del orden FIFO si existe UNA ÚNICA pata
 * cuyo saldo pendiente coincide EXACTAMENTE (± epsilon) con el monto del pago.
 * Si no hay match, o hay más de uno (ambiguo), devuelve null y el caller mantiene
 * el comportamiento FIFO previo. Así no cambia ningún flujo existente salvo el
 * que justamente estaba mal.
 */
export function pickExactPendingMatch<
  T extends { amount: number | string; paid_amount: number | string | null }
>(candidates: T[], amount: number | string | null | undefined): T | null {
  if (amount == null) return null
  const target = Number(amount)
  if (!Number.isFinite(target) || target <= 0) return null

  const matches = candidates.filter(
    (c) => Math.abs(toMoney(c.amount) - toMoney(c.paid_amount) - target) <= MONEY_EPSILON
  )

  return matches.length === 1 ? matches[0] : null
}

export async function findMatchingOperatorPayment(
  supabase: AppSupabaseClient,
  params: {
    operationId: string
    operatorId?: string | null
    operatorPaymentId?: string | null
    /**
     * Monto del pago. Cuando se conoce y hay varias patas pendientes del mismo
     * operador, se usa para elegir la pata exacta en vez del orden FIFO ciego.
     */
    amount?: number | string | null
    /**
     * Si es true y hay varias patas pendientes del mismo operador sin match
     * exacto por monto, lanza AmbiguousOperatorPaymentError en vez de caer a FIFO.
     * Se usa en el registro de pagos para pedirle al usuario que elija la deuda.
     */
    rejectAmbiguous?: boolean
  }
): Promise<OperatorPaymentRecord | null> {
  const baseSelect = "id, operation_id, operator_id, amount, paid_amount, due_date, status, ledger_movement_id, created_at"

  if (params.operatorPaymentId) {
    const { data, error } = await (supabase.from("operator_payments") as any)
      .select(baseSelect)
      .eq("id", params.operatorPaymentId)
      .maybeSingle()

    if (error) {
      throw new Error(`Error obteniendo deuda de operador: ${error.message}`)
    }

    const operatorPayment = data as OperatorPaymentRecord | null

    if (operatorPayment) {
      if (operatorPayment.operation_id !== params.operationId) {
        throw new Error("La deuda seleccionada no pertenece a la operación")
      }

      if (params.operatorId && operatorPayment.operator_id !== params.operatorId) {
        throw new Error("La deuda seleccionada no corresponde al operador elegido")
      }

      if (hasPendingBalance(operatorPayment)) {
        return operatorPayment
      }
      // La deuda explícita ya está saldada → NO cortar acá: caemos a la búsqueda
      // por operador (abajo) para imputar contra otra deuda pendiente real.
    }

    // Bug fix 2026-07-24 (Lozada VG / AMICHI, op 68f9b7aa): si el cliente manda un
    // operator_payment_id que ya no resuelve a una deuda pendiente —porque quedó
    // viejo (un delete+insert al editar la operación lo reemplazó) o ya se saldó—
    // NO devolvemos null. Devolver null hacía que el route creara una deuda
    // DUPLICADA con el costo completo (doblaba el "Pendiente a Operador"). En vez
    // de eso, caemos a la búsqueda por operación/operador para imputar contra la
    // deuda pendiente real. Si el caller NO pasó operatorId, no hay a qué caer con
    // seguridad y mantenemos el null previo.
    if (!params.operatorId) {
      return null
    }
    // fall through a la búsqueda general por operationId + operatorId
  }

  let query = (supabase.from("operator_payments") as any)
    .select(baseSelect)
    .eq("operation_id", params.operationId)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true })

  if (params.operatorId) {
    query = query.eq("operator_id", params.operatorId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Error obteniendo deuda de operador: ${error.message}`)
  }

  const candidates = ((data as OperatorPaymentRecord[] | null) || []).filter(hasPendingBalance)

  if (!params.operatorId && candidates.length !== 1) {
    return null
  }

  // Varias patas pendientes del mismo operador: preferir la que matchea el monto
  // exacto del pago antes de caer al FIFO (ver pickExactPendingMatch).
  if (candidates.length > 1) {
    const exact = pickExactPendingMatch(candidates, params.amount)
    if (exact) {
      return exact
    }
    // Sin match exacto: NO adivinar por FIFO (imputaba a la pata equivocada).
    // Si el caller lo pide, cortar para que el usuario elija la deuda.
    if (params.rejectAmbiguous) {
      throw new AmbiguousOperatorPaymentError(candidates)
    }
  }

  return candidates[0] || null
}

export async function applyOperatorPaymentSettlement(
  supabase: AppSupabaseClient,
  operatorPaymentId: string,
  paymentAmount: number,
  ledgerMovementId: string | null
) {
  const { data, error } = await (supabase.from("operator_payments") as any)
    .select("id, amount, paid_amount, due_date")
    .eq("id", operatorPaymentId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || "No se encontró la deuda del operador")
  }

  const updateData = buildOperatorPaymentUpdate(data as OperatorPaymentRecord, paymentAmount, ledgerMovementId)

  const { error: updateError } = await (supabase.from("operator_payments") as any)
    .update(updateData)
    .eq("id", operatorPaymentId)

  if (updateError) {
    throw new Error(`Error actualizando deuda de operador: ${updateError.message}`)
  }

  return updateData
}

export async function revertOperatorPaymentSettlement(
  supabase: AppSupabaseClient,
  params: {
    operatorPaymentId: string
    paymentAmount: number
    currentPaymentId?: string | null
    removedLedgerMovementId?: string | null
  }
) {
  const { data, error } = await (supabase.from("operator_payments") as any)
    .select("id, amount, paid_amount, due_date, ledger_movement_id")
    .eq("id", params.operatorPaymentId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || "No se encontró la deuda del operador")
  }

  const draftUpdate = buildOperatorPaymentUpdate(
    data as OperatorPaymentRecord,
    -Math.abs(params.paymentAmount),
    null
  )

  let ledgerMovementId: string | null = draftUpdate.ledger_movement_id

  if (draftUpdate.status === "PAID") {
    if (
      params.removedLedgerMovementId &&
      (data as OperatorPaymentRecord).ledger_movement_id === params.removedLedgerMovementId
    ) {
      let replacementQuery = (supabase.from("payments") as any)
        .select("id, ledger_movement_id")
        .eq("operator_payment_id", params.operatorPaymentId)
        .eq("status", "PAID")
        .not("ledger_movement_id", "is", null)
        .order("date_paid", { ascending: false })
        .order("created_at", { ascending: false })

      if (params.currentPaymentId) {
        replacementQuery = replacementQuery.neq("id", params.currentPaymentId)
      }

      const { data: replacement } = await replacementQuery.limit(1).maybeSingle()
      ledgerMovementId = replacement?.ledger_movement_id || null
    } else {
      ledgerMovementId = (data as OperatorPaymentRecord).ledger_movement_id
    }
  }

  const finalUpdate = {
    ...draftUpdate,
    ledger_movement_id: ledgerMovementId,
  }

  const { error: updateError } = await (supabase.from("operator_payments") as any)
    .update(finalUpdate)
    .eq("id", params.operatorPaymentId)

  if (updateError) {
    throw new Error(`Error revirtiendo deuda de operador: ${updateError.message}`)
  }

  // Si la deuda quedó sin nada pagado, volver a alinear el monto con el costo
  // real del operador. Ver resyncFullyRevertedOperatorPayment: es el hueco por
  // el que VICO terminó con pendientes que no coincidían con la liquidación.
  if (toMoney(finalUpdate.paid_amount) === 0) {
    await resyncFullyRevertedOperatorPayment(supabase, params.operatorPaymentId)
  }

  return finalUpdate
}

/**
 * Realinea el monto de una deuda al operador con el costo cargado, cuando la
 * deuda quedó completamente revertida (sin un peso pagado).
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * Al editar una operación, si la deuda ya estaba liquidada el sistema NO
 * reescribe su monto: es una regla deliberada, no se toca la historia de algo
 * que se pagó. Pero cuando después se revierte ese pago, la justificación
 * desaparece y no había nada que volviera a sincronizar. El monto quedaba
 * congelado en el valor viejo.
 *
 * Caso real (VICO, 29/07): deuda de 1296 pagada en mayo, costo corregido a
 * 1126,32 en julio —el monto se conserva, correcto—, y al borrar el pago para
 * rehacerlo quedó un pendiente de 1296 contra un costo de 1126,32. Editar la
 * operación tampoco lo arreglaba, porque los operadores no habían cambiado.
 *
 * ── Por qué es conservador ─────────────────────────────────────────────────
 *
 * Solo actúa cuando la correspondencia entre deuda y costo es inequívoca: una
 * sola deuda y una sola línea de costo para ese operador en esa operación, y la
 * deuda sin vínculo a un servicio. Un operador con varias patas (dos tramos,
 * dos hoteles) o una deuda nacida de un servicio no se toca: ahí no se puede
 * saber a qué línea corresponde sin adivinar, y adivinar mueve plata.
 */
export async function resyncFullyRevertedOperatorPayment(
  supabase: AppSupabaseClient,
  operatorPaymentId: string
): Promise<{ resynced: boolean; from?: number; to?: number; reason?: string }> {
  const { data: debt } = await (supabase.from("operator_payments") as any)
    .select("id, operation_id, operator_id, amount, paid_amount, currency")
    .eq("id", operatorPaymentId)
    .maybeSingle()

  if (!debt || !debt.operation_id || !debt.operator_id) {
    return { resynced: false, reason: "sin operación u operador asociado" }
  }
  if (toMoney(debt.paid_amount) !== 0) {
    return { resynced: false, reason: "todavía tiene pagos aplicados" }
  }

  // Una deuda creada por un servicio no se corresponde con operation_operators.
  const { data: serviceLink, error: serviceError } = await (supabase.from("operation_services") as any)
    .select("id")
    .eq("operator_payment_id", operatorPaymentId)
    .limit(1)

  if (serviceError) {
    return { resynced: false, reason: "no se pudo verificar el vínculo con servicios" }
  }
  if ((serviceLink || []).length > 0) {
    return { resynced: false, reason: "la deuda proviene de un servicio" }
  }

  const [{ data: siblings }, { data: costRows }] = await Promise.all([
    (supabase.from("operator_payments") as any)
      .select("id")
      .eq("operation_id", debt.operation_id)
      .eq("operator_id", debt.operator_id),
    (supabase.from("operation_operators") as any)
      .select("cost, cost_currency")
      .eq("operation_id", debt.operation_id)
      .eq("operator_id", debt.operator_id),
  ])

  if ((siblings || []).length !== 1 || (costRows || []).length !== 1) {
    return {
      resynced: false,
      reason: "el operador tiene más de una pata en la operación; requiere revisión manual",
    }
  }

  const costRow = (costRows as any[])[0]

  // Monedas distintas: no hay realineación posible sin un tipo de cambio, y
  // pisar el monto sería catastrófico. Caso real en Lozada: una deuda de
  // 220.000 ARS contra un costo cargado de 145 USD — copiar el número habría
  // dejado la deuda en 145 pesos.
  const debtCurrency = (debt.currency || "").toUpperCase()
  const costCurrency = (costRow.cost_currency || "").toUpperCase()
  if (debtCurrency && costCurrency && debtCurrency !== costCurrency) {
    return {
      resynced: false,
      reason: `la deuda está en ${debtCurrency} y el costo en ${costCurrency}; requiere revisión manual`,
    }
  }

  const target = roundMoney(toMoney(costRow.cost))
  const current = roundMoney(toMoney(debt.amount))

  if (target <= 0) {
    return { resynced: false, reason: "el costo cargado es cero" }
  }
  if (Math.abs(current - target) < MONEY_EPSILON) {
    return { resynced: false, reason: "ya estaba alineada" }
  }

  const { error: updateError } = await (supabase.from("operator_payments") as any)
    .update({ amount: target, updated_at: new Date().toISOString() })
    .eq("id", operatorPaymentId)
    // CAS: si entre la lectura y la escritura alguien imputó un pago, no pisar.
    .eq("paid_amount", 0)

  if (updateError) {
    console.error(
      "[OperatorPayments] No se pudo realinear la deuda tras revertir el pago:",
      updateError.message
    )
    return { resynced: false, reason: updateError.message }
  }

  return { resynced: true, from: current, to: target }
}
