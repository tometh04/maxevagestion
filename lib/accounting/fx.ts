/**
 * Tipo de cambio de reconocimiento de una operación.
 *
 * QUÉ HABÍA ACÁ ANTES, Y POR QUÉ SE FUE
 * ------------------------------------
 * Este módulo tenía dos funciones que calculaban la diferencia de cambio del
 * cobro y la registraban como un MOVIMIENTO DE PLATA contra una caja en pesos.
 * Las dos se retiraron (VIB-141 / D1 y D2), por tres motivos que se refuerzan
 * entre sí:
 *
 *   1. **Registraban plata que nadie movió.** Una ganancia por diferencia de
 *      cambio es nocional: no entró un peso a ninguna caja. Como el movimiento
 *      afectaba el saldo, habría inflado la Caja ARS con dinero inexistente.
 *
 *   2. **El cálculo era acumulativo.** Comparaban la venta TOTAL contra los
 *      pagos acumulados, así que con un cobro parcial la "diferencia" era el
 *      saldo impago, y lo registraban como pérdida de cambio. Con cobros
 *      sucesivos, además, cada uno volvía a registrar la diferencia entera.
 *
 *   3. **No eran idempotentes.** El dedupe era una ventana de cinco minutos:
 *      dejaba pasar un duplicado a los seis y bloqueaba uno legítimo a los
 *      cuatro.
 *
 * Retirarlas fue de riesgo cero: en producción no existía **ni un solo**
 * movimiento de diferencia de cambio, en ninguna agencia. La función corría en
 * cada cobro y siempre cortaba antes de escribir. En los hechos era una bomba
 * desactivada por accidente.
 *
 * QUÉ LAS REEMPLAZA
 * -----------------
 * `registrarDiferenciaPorCobro` en `fx-journal.ts`, que calcula la diferencia
 * POR COBRO —comparando lo que entró contra el valor en libros de la porción de
 * deuda que cancela—, la registra como asiento balanceado contra `4.1.05` /
 * `4.3.13`, y usa el movimiento del cobro como clave de idempotencia real.
 *
 * Lo único que sobrevive acá es el helper que resuelve a qué cotización se
 * reconoció la deuda, que es un dato de la operación y no del cálculo.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { getExchangeRate } from "./exchange-rates"

/**
 * La cotización a la que se reconoció la deuda de una operación.
 *
 * Se busca en el primer movimiento de ingreso que tenga tipo de cambio, porque
 * es el que refleja con qué valor se registró la venta. Si no hay ninguno, se
 * cae a la cotización de la fecha de la operación.
 *
 * Devuelve `null` para una deuda en pesos: no hay conversión que hacer, y
 * devolver un 1 haría creer que sí.
 */
export async function getOperationExchangeRate(
  supabase: SupabaseClient<Database>,
  operationId: string,
  currency: "ARS" | "USD"
): Promise<number | null> {
  if (currency === "ARS") return null

  const { data: movements } = await (supabase.from("ledger_movements") as any)
    .select("exchange_rate, created_at")
    .eq("operation_id", operationId)
    .eq("type", "INCOME")
    .not("exchange_rate", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (movements?.exchange_rate) {
    return parseFloat(movements.exchange_rate)
  }

  const { data: operation } = await (supabase.from("operations") as any)
    .select("created_at, departure_date")
    .eq("id", operationId)
    .single()

  if (operation) {
    const dateToUse = operation.departure_date || operation.created_at
    return await getExchangeRate(supabase, dateToUse)
  }

  return null
}
