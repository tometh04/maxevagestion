/**
 * Borrar el pago de un gasto fijo (VIB-179).
 *
 * ## Por qué existe
 *
 * Un gasto VARIABLE se borra desde la pantalla desde julio. Uno FIJO no tenía
 * cómo, así que cada vez que alguien pagaba uno con la fecha o el importe
 * equivocados había que pedirlo por WhatsApp y borrarlo a mano en la base.
 * Pasó el 2026-09-02 con cuatro gastos de Lozada.
 *
 * ## Qué borra
 *
 * El pago de un gasto fijo deja tres cosas: el movimiento de dinero (el que
 * mueve el saldo de la caja), su asiento contable —cabecera más dos líneas— y
 * la marca en la recurrencia de que ese período ya se pagó. Las tres se
 * deshacen acá.
 *
 * La cabecera del asiento se borra explícitamente: borrar sólo las líneas deja
 * un `journal_entries` huérfano, que es la clase de residuo que ya nos dejó 159
 * cabeceras colgadas al borrar pagos.
 *
 * ## Qué NO borra
 *
 * La definición del gasto fijo. Se borra un pago, no la recurrencia: el mes que
 * viene tiene que volver a vencer. Y `next_due_date` vuelve al período borrado,
 * porque si quedara adelantado el gasto se saltearía un mes sin que nadie lo
 * note — que es peor que el problema original.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"
import { invalidateBalanceCache } from "@/lib/accounting/ledger"
import {
  calculatePreviousDueDate,
  type RecurringPaymentFrequency,
} from "@/lib/accounting/recurring-payments"

const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()
    const orgId = (user as any).org_id

    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // Mismo gate que el borrado de un gasto variable: quien puede cargar plata
    // en la caja puede corregirla.
    const puedeBorrar =
      canPerformAction(user, "accounting", "write", matrix ?? undefined) ||
      canPerformAction(user, "cash", "write", matrix ?? undefined)

    if (!puedeBorrar) {
      return NextResponse.json({ error: "No tiene permiso para eliminar gastos" }, { status: 403 })
    }

    const { id } = await params

    let reason: string | undefined
    try {
      const raw = await request.json()
      reason = bodySchema.parse(raw).reason
    } catch {
      // El motivo es opcional: el borrado de un gasto variable tampoco lo pide.
    }

    // Lectura con el cliente del usuario: si el movimiento es de otra org, RLS
    // lo esconde y devolvemos 404 en vez de confirmar que existe.
    const { data: movement, error: readError } = await (supabase.from("ledger_movements") as any)
      .select(
        "id, concept, type, account_id, journal_entry_id, org_id, recurring_payment_id, amount_original, currency, movement_day",
      )
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (readError) {
      console.error("[VIB-179] Error leyendo el gasto fijo:", readError)
      return NextResponse.json({ error: "Error al leer el gasto" }, { status: 500 })
    }
    if (!movement) {
      return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 })
    }

    // Que sea efectivamente el pago de un gasto fijo y no otra cosa del mayor.
    // `account_id` no nulo distingue el movimiento de dinero de las líneas de
    // su propio asiento, que comparten concepto.
    const esGastoFijo =
      movement.type === "EXPENSE" &&
      movement.account_id != null &&
      typeof movement.concept === "string" &&
      movement.concept.startsWith("Gasto recurrente:")

    if (!esGastoFijo) {
      return NextResponse.json(
        { error: "Ese movimiento no es el pago de un gasto fijo" },
        { status: 400 },
      )
    }

    // adminDb: borrar el asiento y sus líneas cruza tablas con triggers
    // contables, igual que el borrado de un gasto variable. Todo lo que se
    // borra está acotado por el `org_id` que ya se validó arriba.
    const adminDb = createAdminClient() as any

    // ── El asiento, cabecera incluida ────────────────────────────────────────
    //
    // El asiento NO se encuentra por `ledger_movements.journal_entry_id`: en el
    // movimiento de plata esa columna queda en NULL. `createMovementJournalEntry`
    // espeja el movimiento en un asiento aparte y el vínculo vive del otro lado,
    // en `journal_entries.source_movement_id`. Buscarlo por la columna del
    // movimiento parecía razonable y no habría borrado nada: el asiento y sus
    // dos líneas quedaban colgados en el mayor.
    const { data: entries, error: entriesError } = await adminDb
      .from("journal_entries")
      .select("id")
      .eq("source_movement_id", movement.id)
      .eq("org_id", orgId)

    if (entriesError) {
      console.error("[VIB-179] No se pudo leer el asiento del gasto:", entriesError)
      return NextResponse.json(
        { error: "No se pudo leer el asiento contable del gasto. No se borró nada." },
        { status: 500 },
      )
    }

    const entryIds: string[] = (entries || []).map((e: any) => e.id)
    if (movement.journal_entry_id && !entryIds.includes(movement.journal_entry_id)) {
      entryIds.push(movement.journal_entry_id)
    }

    if (entryIds.length > 0) {
      // Las líneas primero: son `ledger_movements` con `journal_entry_id`, y la
      // FK hacia la cabecera impediría borrarla con las líneas todavía en pie.
      await adminDb
        .from("ledger_movements")
        .delete()
        .in("journal_entry_id", entryIds)
        .eq("org_id", orgId)

      const { error: entryError } = await adminDb
        .from("journal_entries")
        .delete()
        .in("id", entryIds)
        .eq("org_id", orgId)

      if (entryError) {
        // No se sigue: dejar el movimiento borrado y el asiento en pie es
        // exactamente el descuadre que esto viene a evitar.
        console.error("[VIB-179] No se pudo borrar el asiento del gasto:", entryError)
        return NextResponse.json(
          { error: "No se pudo borrar el asiento contable del gasto. No se borró nada." },
          { status: 500 },
        )
      }
    }

    // ── El movimiento ────────────────────────────────────────────────────────
    const { error: deleteError } = await adminDb
      .from("ledger_movements")
      .delete()
      .eq("id", movement.id)
      .eq("org_id", orgId)

    if (deleteError) {
      console.error("[VIB-179] Error borrando el gasto fijo:", deleteError)
      return NextResponse.json({ error: "Error al eliminar el gasto" }, { status: 500 })
    }

    if (movement.account_id) {
      await invalidateBalanceCache(movement.account_id)
    }

    // ── La recurrencia vuelve a deber el período ─────────────────────────────
    let recurrenciaActualizada: { id: string; next_due_date: string } | null = null

    if (movement.recurring_payment_id) {
      const { data: recurrence } = await (supabase.from("recurring_payments") as any)
        .select("id, frequency, next_due_date")
        .eq("id", movement.recurring_payment_id)
        .eq("org_id", orgId)
        .maybeSingle()

      if (recurrence?.next_due_date && recurrence?.frequency) {
        const previo = calculatePreviousDueDate(
          recurrence.next_due_date,
          recurrence.frequency as RecurringPaymentFrequency,
        )

        // La última generación pasa a ser el pago anterior que siga vivo, si
        // queda alguno. Dejar la fecha del pago borrado diría "última
        // generación: 01/09" de algo que ya no existe.
        const { data: anterior } = await (supabase.from("ledger_movements") as any)
          .select("movement_day")
          .eq("recurring_payment_id", movement.recurring_payment_id)
          .eq("org_id", orgId)
          .not("account_id", "is", null)
          .order("movement_day", { ascending: false })
          .limit(1)
          .maybeSingle()

        await adminDb
          .from("recurring_payments")
          .update({
            next_due_date: previo,
            last_generated_date: anterior?.movement_day ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", recurrence.id)
          .eq("org_id", orgId)

        recurrenciaActualizada = { id: recurrence.id, next_due_date: previo }
      }
    }

    try {
      await (supabase.rpc as any)("log_audit_action", {
        p_user_id: user.id,
        p_action: "DELETE",
        p_entity_type: "recurring_expense_payment",
        p_entity_id: movement.id,
        p_details: {
          concept: movement.concept,
          amount: movement.amount_original,
          currency: movement.currency,
          movement_day: movement.movement_day,
          reason: reason ?? null,
        },
      })
    } catch (auditError) {
      console.warn("[VIB-179] No se pudo registrar la auditoría del borrado:", auditError)
    }

    return NextResponse.json({
      success: true,
      deleted_id: movement.id,
      recurrence: recurrenciaActualizada,
    })
  } catch (error: any) {
    console.error("[VIB-179] Error inesperado al borrar el gasto fijo:", error)
    return NextResponse.json(
      { error: error?.message || "Error al eliminar el gasto" },
      { status: 500 },
    )
  }
}
