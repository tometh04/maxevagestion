/**
 * Asientos de los movimientos de plata — VIB-142.
 *
 * QUÉ RESUELVE
 * ------------
 * vibook lleva la plata en dos capas: la operativa (`ledger_movements`, que es
 * la que alimenta saldos y pantallas) y la contable (`journal_entries`). Al
 * confirmar una operación ya se generan los asientos de venta, costo y comisión,
 * pero cuando la plata SE MUEVE de verdad casi nunca queda asiento: de 21 flujos
 * que crean movimientos de dinero, 18 no generan ninguno. Queda registrada la
 * venta pero no el cobro, el costo pero no el pago.
 *
 * Este helper es el punto único por donde esos flujos asientan su movimiento.
 *
 * POR QUÉ ESPEJA EN VEZ DE ANOTAR
 * -------------------------------
 * En el repo conviven dos formas de vincular un movimiento con su asiento:
 *
 *   1. ANOTAR (`annotatePaymentAsJournalEntry`): escribe `debit_amount`,
 *      `credit_amount` y `chart_account_id` SOBRE el movimiento de plata que ya
 *      existe. Lo usan los pagos de operación.
 *   2. ESPEJAR (`createSaleJournalEntry` y hermanas, y esto): crea filas NUEVAS
 *      con `account_id = null` y `affects_balance = false`, y deja el movimiento
 *      original intacto.
 *
 * Acá se espeja, y es deliberado. `getAccountBalancesBatch` (`./ledger`) calcula
 * el saldo de cada cuenta financiera sumando DOS subpoblaciones: los movimientos
 * con `debit_amount`/`credit_amount` en NULL van por la rama "legacy" (usando
 * `amount_original` / `amount_ars_equivalent` según el tipo) y los que las tienen
 * cargadas van por partida doble. Escribir esas columnas sobre un movimiento
 * existente lo hace CAMBIAR DE RAMA DE CÁLCULO, y cualquier diferencia de
 * convención movería el saldo de una cuenta real. Ese código ya arrastra la
 * cicatriz de un bug así (~$227M que desaparecían de Caja ARS).
 *
 * Espejando, el saldo no puede moverse: las líneas nuevas tienen
 * `affects_balance = false` y la query de saldos filtra por `affects_balance =
 * true`. Además respeta el invariante del módulo: un movimiento de dinero
 * siempre tiene `account_id`; una línea de asiento nunca.
 *
 * IDEMPOTENCIA
 * ------------
 * `journal_entries.source_movement_id` con índice único parcial (migración
 * 20260824000001). No alcanza con chequear antes de insertar: dos requests
 * simultáneos pasarían los dos. El índice es la garantía real, y acá se traduce
 * el error de clave duplicada en "ya estaba, no pasa nada".
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { ACCOUNT_CODES } from "./account-codes"
import { createJournalEntry, resolveAccountIds } from "./journal-entries"

/** Hacia dónde va la plata desde el punto de vista de la cuenta financiera. */
export type MovementDirection = "IN" | "OUT"

export interface CreateMovementJournalEntryParams {
  /** El `ledger_movement` que ya existe y que se va a espejar. */
  movementId: string
  /**
   * Código del plan para la contrapartida. El otro lado siempre es la cuenta
   * contable de la cuenta financiera del movimiento.
   */
  counterpartCode: string
  /** IN = entra plata a la cuenta financiera. OUT = sale. */
  direction: MovementDirection
  /** Descripción del asiento. Si no se pasa, se usa el concepto del movimiento. */
  description?: string
  /** Solo para procesos sin sesión (backfills, crons); si no, se deriva. */
  orgId?: string | null
}

/** Códigos de contrapartida por flujo, para que los callers no los inventen. */
export const COUNTERPART_CODES = {
  /** Cobro de cliente: cancela deuda del cliente. */
  CUSTOMER_COLLECTION: ACCOUNT_CODES.CUENTAS_POR_COBRAR,
  /** Pago a operador: cancela deuda con el proveedor. */
  OPERATOR_PAYMENT: ACCOUNT_CODES.CUENTAS_POR_PAGAR,
  /** Comisión pagada al vendedor. */
  COMMISSION_PAYMENT: ACCOUNT_CODES.COMISIONES_VENDEDORES,
  /**
   * Gasto de la agencia.
   *
   * VIB-142: por ahora TODOS los gastos van a 4.3.01. Las categorías de gasto
   * son texto libre por agencia ("Gastos oficina", "Marketing y sistemas") y no
   * existe mapeo a las 14 cuentas de gasto del plan. La partida doble queda
   * correcta desde el día uno; afinar la cuenta después cambia la imputación,
   * nunca los importes.
   */
  EXPENSE: ACCOUNT_CODES.GASTOS_ADMIN,
} as const

/** Postgres: violación de unique. Acá significa "ya lo asentó otro". */
const UNIQUE_VIOLATION = "23505"

/**
 * Espeja un movimiento de plata como asiento de partida doble.
 *
 * Devuelve el id del asiento, o null si el movimiento no se puede asentar (no
 * existe, no tiene cuenta financiera, importe cero, faltan cuentas del plan) o
 * si ya estaba asentado. Nunca lanza: asentar no debe romper el flujo de plata,
 * que es lo que el usuario está esperando que funcione.
 */
export async function createMovementJournalEntry(
  params: CreateMovementJournalEntryParams,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  try {
    const { data: mov } = await (supabase.from("ledger_movements") as any)
      .select(
        "id, org_id, operation_id, account_id, concept, currency, amount_original, exchange_rate, movement_date, created_by, journal_entry_id"
      )
      .eq("id", params.movementId)
      .maybeSingle()

    if (!mov) return null

    // Ya asentado por el otro mecanismo (annotatePaymentAsJournalEntry) o por
    // una corrida previa: no duplicar.
    if (mov.journal_entry_id) return null

    const amount = Number(mov.amount_original) || 0
    if (amount <= 0) return null

    // Sin cuenta financiera no hay contra qué asentar: el movimiento no
    // representa plata entrando o saliendo de ningún lado.
    if (!mov.account_id) return null

    const orgId = params.orgId ?? mov.org_id
    if (!orgId) return null

    const { data: finAccount } = await (supabase.from("financial_accounts") as any)
      .select("chart_account_id")
      .eq("id", mov.account_id)
      .maybeSingle()

    const financialChartId = finAccount?.chart_account_id ?? null
    if (!financialChartId) {
      // La cuenta financiera no está mapeada al plan. Es configuración
      // faltante, no un error del flujo: se saltea y se deja rastro.
      console.warn(
        `[movement-journal] La cuenta financiera ${mov.account_id} no tiene chart_account_id; el movimiento ${mov.id} queda sin asiento.`
      )
      return null
    }

    const accountIds = await resolveAccountIds([params.counterpartCode], supabase, orgId)
    const counterpartId = accountIds[params.counterpartCode]
    if (!counterpartId) {
      console.error(
        `[movement-journal] Cuenta ${params.counterpartCode} no encontrada en el plan de la org ${orgId}.`
      )
      return null
    }

    const entra = params.direction === "IN"
    const debitChartId = entra ? financialChartId : counterpartId
    const creditChartId = entra ? counterpartId : financialChartId

    const concepto = params.description || mov.concept || "Movimiento"
    const entryDate = String(mov.movement_date).slice(0, 10)

    const entry = await createJournalEntry(
      {
        entry_date: entryDate,
        description: concepto,
        operation_id: mov.operation_id || null,
        source: "AUTO_PAYMENT",
        currency: mov.currency,
        // El TC real del movimiento le gana a la valuación por fecha: es el que
        // la agencia efectivamente usó.
        exchange_rate: mov.exchange_rate ? Number(mov.exchange_rate) : undefined,
        org_id: orgId,
        source_movement_id: mov.id,
        created_by: mov.created_by || null,
        lines: [
          {
            chart_account_id: debitChartId,
            debit_amount: amount,
            concept: concepto,
            legacy_type: entra ? "INCOME" : "EXPENSE",
          },
          {
            chart_account_id: creditChartId,
            credit_amount: amount,
            concept: concepto,
            legacy_type: entra ? "INCOME" : "EXPENSE",
          },
        ],
      },
      supabase
    )

    return entry.id
  } catch (error: any) {
    // Carrera perdida contra otro request que asentó el mismo movimiento: el
    // índice único hizo su trabajo y no hay nada que reportar.
    if (error?.code === UNIQUE_VIOLATION || /duplicate key|23505/i.test(String(error?.message))) {
      return null
    }
    console.error("[movement-journal] Error asentando el movimiento:", error)
    return null
  }
}
