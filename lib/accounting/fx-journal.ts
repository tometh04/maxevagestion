/**
 * Registro contable de la diferencia de cambio — VIB-141 (D1/D3).
 *
 * El cálculo vive en `./fx-difference`, que es lógica pura y testeada. Acá está
 * el registro: convertir esa diferencia en un asiento balanceado.
 *
 * POR QUÉ ASIENTO Y NO UN MOVIMIENTO SUELTO
 * -----------------------------------------
 * La implementación anterior registraba la diferencia como un movimiento contra
 * Caja en pesos, con `account_id` seteado: eso HABRÍA MOVIDO el saldo de una
 * caja real por un hecho que no mueve plata. Una diferencia de cambio no saca
 * ni pone un peso en la caja: cambia el valor contable de lo que ya está ahí.
 *
 * Nunca llegó a correr —hay cero movimientos de FX en producción— así que
 * reemplazarlo no cambia ningún número que alguien esté viendo hoy.
 *
 * Las líneas van con `account_id` nulo y `affects_balance` false, como todas las
 * de asiento: no entran en saldos, ni en Caja, ni en Ganancias, ni en la
 * posición mensual. Solo se ven en el Mayor y en los Estados Contables.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { ACCOUNT_CODES } from "./account-codes"
import { createJournalEntry, resolveAccountIds } from "./journal-entries"
import {
  calcularDiferenciaPorCobro,
  calcularRevaluacion,
  CUENTAS_DIFERENCIA,
  type Diferencia,
  type Moneda,
} from "./fx-difference"

/**
 * Arma las dos líneas del asiento de diferencia de cambio.
 *
 * La contrapartida es la cuenta cuyo valor contable se está corrigiendo: la
 * cuenta por cobrar en el caso de un cobro, la cuenta de plata en el caso de una
 * revaluación.
 *
 * Una ganancia AUMENTA el valor de esa cuenta (Debe) contra el resultado
 * positivo (Haber). Una pérdida, al revés.
 */
function lineasDeDiferencia(
  diferencia: Diferencia,
  cuentaCorregidaId: string,
  cuentaResultadoId: string,
  concepto: string
) {
  const esGanancia = diferencia.tipo === "FX_GAIN"
  return [
    {
      chart_account_id: esGanancia ? cuentaCorregidaId : cuentaResultadoId,
      debit_amount: diferencia.monto,
      concept: concepto,
      legacy_type: (esGanancia ? "FX_GAIN" : "FX_LOSS") as "FX_GAIN" | "FX_LOSS",
    },
    {
      chart_account_id: esGanancia ? cuentaResultadoId : cuentaCorregidaId,
      credit_amount: diferencia.monto,
      concept: concepto,
      legacy_type: (esGanancia ? "FX_GAIN" : "FX_LOSS") as "FX_GAIN" | "FX_LOSS",
    },
  ]
}

export interface RegistrarCobroParams {
  /** Movimiento de plata del cobro, que es también la clave de idempotencia. */
  movementId: string
  orgId: string
  agencyId?: string | null
  operationId?: string | null
  fecha: string
  montoCobrado: number
  monedaCobro: Moneda
  cotizacionCobro: number
  monedaDeuda: Moneda
  cotizacionReconocimiento: number
  monedaFuncional: Moneda
  descripcion?: string
}

/**
 * Asienta la diferencia de cambio de un cobro.
 *
 * Devuelve el id del asiento, o null si no hay diferencia que registrar (que es
 * el caso más común). Nunca lanza: el cobro ya ocurrió y el asiento es una capa
 * paralela.
 *
 * La idempotencia la da `source_movement_id`, con su índice único: dos intentos
 * sobre el mismo cobro no pueden crear dos asientos. Reemplaza al dedupe por
 * ventana de 5 minutos que tenía el FX viejo, que dejaba pasar un duplicado a
 * los 6 minutos y bloqueaba uno legítimo a los 4.
 */
export async function registrarDiferenciaPorCobro(
  p: RegistrarCobroParams,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  try {
    const diferencia = calcularDiferenciaPorCobro(p)
    if (!diferencia.tipo || diferencia.monto <= 0) return null

    const codigoResultado = CUENTAS_DIFERENCIA[diferencia.tipo]
    const cuentas = await resolveAccountIds(
      [ACCOUNT_CODES.CUENTAS_POR_COBRAR, codigoResultado],
      supabase,
      p.orgId
    )
    const cxcId = cuentas[ACCOUNT_CODES.CUENTAS_POR_COBRAR]
    const resultadoId = cuentas[codigoResultado]
    if (!cxcId || !resultadoId) {
      console.error(
        `[fx-journal] Faltan cuentas del plan (${ACCOUNT_CODES.CUENTAS_POR_COBRAR} o ${codigoResultado}) en la org ${p.orgId}.`
      )
      return null
    }

    const concepto =
      p.descripcion ??
      `Diferencia de cambio por cobro${p.operationId ? ` — ${p.operationId.slice(0, 8)}` : ""}`

    const entry = await createJournalEntry(
      {
        entry_date: p.fecha,
        description: concepto,
        operation_id: p.operationId ?? null,
        source: "AUTO_PAYMENT",
        currency: p.monedaFuncional,
        org_id: p.orgId,
        agency_id: p.agencyId ?? null,
        source_movement_id: p.movementId,
        lines: lineasDeDiferencia(diferencia, cxcId, resultadoId, concepto),
      },
      supabase
    )

    return entry.id
  } catch (error: any) {
    // Carrera perdida contra otro request: el índice único hizo su trabajo.
    if (error?.code === "23505" || /duplicate key|23505/i.test(String(error?.message))) {
      return null
    }
    console.error("[fx-journal] Error asentando la diferencia por cobro:", error)
    return null
  }
}

export interface RegistrarRevaluacionParams {
  orgId: string
  agencyId?: string | null
  /** Fecha de cierre del período. */
  fecha: string
  /** Cuenta del plan cuyo saldo se revalúa (la de la cuenta financiera). */
  chartAccountId: string
  saldo: number
  monedaSaldo: Moneda
  monedaFuncional: Moneda
  cotizacionAnterior: number
  cotizacionCierre: number
  descripcion?: string
  /**
   * Clave de idempotencia. Una revaluación no nace de un movimiento, así que se
   * usa el id de la cuenta financiera: una revaluación por cuenta y por cierre.
   */
  claveMovimiento?: string | null
}

/**
 * Asienta la revaluación de un saldo en otra moneda al cierre del período.
 *
 * Es el caso de una agencia que lleva sus libros en dólares y tiene pesos en la
 * caja: esos pesos valen distinto al cierre, y esa diferencia es resultado del
 * período aunque no haya habido ningún movimiento.
 *
 * IMPORTANTE: no toca el saldo real de la cuenta. Los pesos que hay en la caja
 * siguen siendo los mismos; lo que cambia es su valor expresado en la moneda de
 * los libros.
 */
export async function registrarRevaluacion(
  p: RegistrarRevaluacionParams,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  try {
    const diferencia = calcularRevaluacion(p)
    if (!diferencia.tipo || diferencia.monto <= 0) return null

    const codigoResultado = CUENTAS_DIFERENCIA[diferencia.tipo]
    const cuentas = await resolveAccountIds([codigoResultado], supabase, p.orgId)
    const resultadoId = cuentas[codigoResultado]
    if (!resultadoId) {
      console.error(`[fx-journal] Falta la cuenta ${codigoResultado} en la org ${p.orgId}.`)
      return null
    }

    const concepto = p.descripcion ?? `Revaluación de saldos al ${p.fecha}`

    const entry = await createJournalEntry(
      {
        entry_date: p.fecha,
        description: concepto,
        source: "MANUAL",
        currency: p.monedaFuncional,
        org_id: p.orgId,
        agency_id: p.agencyId ?? null,
        source_movement_id: p.claveMovimiento ?? null,
        lines: lineasDeDiferencia(diferencia, p.chartAccountId, resultadoId, concepto),
      },
      supabase
    )

    return entry.id
  } catch (error: any) {
    if (error?.code === "23505" || /duplicate key|23505/i.test(String(error?.message))) {
      return null
    }
    console.error("[fx-journal] Error asentando la revaluación:", error)
    return null
  }
}
