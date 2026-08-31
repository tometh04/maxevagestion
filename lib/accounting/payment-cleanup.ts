/**
 * Residuos que deja el borrado de un pago.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * Borrar un pago limpiaba `payments`, `ledger_movements`, `cash_movements` y
 * comisiones, pero dejaba colgados otros dos rastros. Los dos aparecieron en
 * producción y ninguno rompía nada de forma visible:
 *
 *   - **Percepciones** (`tax_withholdings`): quedaban vivas apuntando con
 *     `source_id` a un pago que ya no existe. Entran a la posición impositiva
 *     del período sin un cobro detrás. Peor: `tax_withholdings.operation_id` es
 *     la ÚNICA de las 33 foreign keys hacia `operations` que es NO ACTION, así
 *     que una percepción huérfana **impide borrar la operación** con un error
 *     que no dice el motivo. Reportado por Lozada.
 *   - **Cabeceras de asiento** (`journal_entries`): se borraban las líneas y
 *     quedaba el comprobante numerado, con `total_amount` cargado y cero
 *     líneas. Había 159 en producción.
 *
 * POR QUÉ VIVE ACÁ Y NO EN LA RUTA
 * --------------------------------
 * Un pago se borra desde dos lugares —el DELETE de `/api/payments` y el DELETE
 * de operación, que los borra en cascada manual— y los dos tienen que limpiar
 * lo mismo. Duplicar el criterio en dos rutas es la forma más segura de que
 * dentro de tres meses una limpie y la otra no.
 */

export interface PaymentCleanupResult {
  /** Percepciones eliminadas. */
  withholdings: number
  /** Líneas del mayor (percepciones y FX) que quedaron sin ningún pago vivo. */
  ledgerSinPago: number
  /** Cabeceras de asiento eliminadas por haber quedado sin líneas. */
  emptyJournalEntries: number
  /** Errores no bloqueantes, para loguear sin cortar el borrado. */
  errors: string[]
}

/**
 * Decide si una cabecera de asiento debe borrarse.
 *
 * Sólo si NO le quedó ninguna línea. Las líneas de un pago se eliminan en tres
 * lugares distintos —el movimiento principal, el impuesto Ley 25413 y la
 * contrapartida CxC/CxP—, así que cualquiera de ellos puede dejar la cabecera
 * vacía; pero un asiento de otro pago que todavía tenga las suyas no se toca.
 *
 * Un asiento sin líneas no es un asiento: es un número de comprobante emitido
 * que no respalda nada.
 */
export function debeBorrarseElAsiento(lineasRestantes: number): boolean {
  return lineasRestantes === 0
}

/**
 * Borra las percepciones que practicó un pago.
 *
 * No corta el flujo si falla: el pago tiene que poder eliminarse igual. El
 * error se devuelve para loguearlo.
 */
export async function limpiarPercepcionesDePago(
  supabase: any,
  params: { paymentId: string; orgId: string }
): Promise<{ deleted: number; error: string | null }> {
  const { data, error } = await (supabase.from("tax_withholdings") as any)
    .delete()
    .eq("source_type", "PAYMENT")
    .eq("source_id", params.paymentId)
    .eq("org_id", params.orgId)
    .select("id")

  if (error) return { deleted: 0, error: String(error.message ?? error) }
  return { deleted: (data ?? []).length, error: null }
}

/**
 * Borra las cabeceras de asiento de una operación que quedaron sin líneas.
 *
 * Se buscan por operación en vez de rastrear cada `ledger_movement` borrado
 * porque las líneas se eliminan en varios lugares y el rastreo se desincroniza
 * apenas alguien agrega uno nuevo. El filtro "sin líneas" es lo que lo hace
 * seguro sin necesidad de saber quién borró qué.
 */
export async function limpiarAsientosVaciosDeOperacion(
  supabase: any,
  params: { operationId: string; orgId: string }
): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = []

  const { data: entries, error: readError } = await (supabase.from("journal_entries") as any)
    .select("id")
    .eq("operation_id", params.operationId)
    .eq("org_id", params.orgId)

  if (readError) return { deleted: 0, errors: [String(readError.message ?? readError)] }

  let deleted = 0
  for (const entry of (entries ?? []) as Array<{ id: string }>) {
    const { count, error: countError } = await (supabase.from("ledger_movements") as any)
      .select("id", { count: "exact", head: true })
      .eq("journal_entry_id", entry.id)

    if (countError) {
      errors.push(String(countError.message ?? countError))
      continue
    }
    if (!debeBorrarseElAsiento(count ?? 0)) continue

    const { error: deleteError } = await (supabase.from("journal_entries") as any)
      .delete()
      .eq("id", entry.id)
      .eq("org_id", params.orgId)

    if (deleteError) errors.push(String(deleteError.message ?? deleteError))
    else deleted++
  }

  return { deleted, errors }
}

/**
 * Movimientos del mayor que quedan de un pago y NO se identifican por pago.
 *
 * Son dos familias:
 *   - Las **percepciones** (`concept LIKE 'Percepción%'`): un par de
 *     `ledger_movements` con `affects_balance = true` que mueven saldo real.
 *   - La **diferencia de cambio** (`FX_GAIN`/`FX_LOSS`): no mueven saldo, pero
 *     entran al Libro Diario y a los Estados Contables.
 *
 * Ninguna de las dos guarda a qué pago pertenece: el único vínculo es
 * `operation_id`. Por eso sólo se limpian cuando la operación **se quedó sin
 * ningún pago cobrado**; si todavía queda otro, no se toca nada, porque no hay
 * forma de saber cuál de los movimientos era de cuál pago y borrar el ajeno
 * sería peor que dejar el propio.
 */
export async function limpiarMovimientosSinPagoVivo(
  supabase: any,
  params: { operationId: string; orgId: string }
): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = []

  const { count: pagosVivos, error: countError } = await (supabase.from("payments") as any)
    .select("id", { count: "exact", head: true })
    .eq("operation_id", params.operationId)
    .eq("status", "PAID")

  if (countError) return { deleted: 0, errors: [String(countError.message ?? countError)] }
  // Queda algún cobro vivo: los movimientos pueden ser suyos. No se tocan.
  if ((pagosVivos ?? 0) > 0) return { deleted: 0, errors: [] }

  let deleted = 0

  const { data: percepciones, error: percError } = await (supabase.from("ledger_movements") as any)
    .delete()
    .eq("operation_id", params.operationId)
    .eq("org_id", params.orgId)
    .ilike("concept", "%percepci%")
    .select("id")

  if (percError) errors.push(String(percError.message ?? percError))
  else deleted += (percepciones ?? []).length

  const { data: fx, error: fxError } = await (supabase.from("ledger_movements") as any)
    .delete()
    .eq("operation_id", params.operationId)
    .eq("org_id", params.orgId)
    .in("type", ["FX_GAIN", "FX_LOSS"])
    .select("id")

  if (fxError) errors.push(String(fxError.message ?? fxError))
  else deleted += (fx ?? []).length

  return { deleted, errors }
}

/**
 * Limpieza completa de los residuos de un pago.
 *
 * `operationId` es opcional: un pago suelto no tiene operación y entonces no
 * hay asientos ni movimientos de operación que revisar.
 *
 * El orden importa: primero se sacan las líneas del mayor, después se barren
 * las cabeceras de asiento que hayan quedado sin ninguna. Al revés, un asiento
 * con sólo las patas de una percepción sobreviviría desbalanceado.
 */
export async function limpiarResiduosDePago(
  supabase: any,
  params: { paymentId: string; operationId?: string | null; orgId: string }
): Promise<PaymentCleanupResult> {
  const errors: string[] = []

  const percepciones = await limpiarPercepcionesDePago(supabase, {
    paymentId: params.paymentId,
    orgId: params.orgId,
  })
  if (percepciones.error) errors.push(percepciones.error)

  let ledgerSinPago = 0
  let emptyJournalEntries = 0
  if (params.operationId) {
    const mayor = await limpiarMovimientosSinPagoVivo(supabase, {
      operationId: params.operationId,
      orgId: params.orgId,
    })
    ledgerSinPago = mayor.deleted
    errors.push(...mayor.errors)

    const asientos = await limpiarAsientosVaciosDeOperacion(supabase, {
      operationId: params.operationId,
      orgId: params.orgId,
    })
    emptyJournalEntries = asientos.deleted
    errors.push(...asientos.errors)
  }

  return {
    withholdings: percepciones.deleted,
    ledgerSinPago,
    emptyJournalEntries,
    errors,
  }
}
