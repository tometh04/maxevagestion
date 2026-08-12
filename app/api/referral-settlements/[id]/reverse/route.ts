import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction } from "@/lib/permissions-api"
import { logSecurityEvent } from "@/lib/security/audit"

export const dynamic = "force-dynamic"

/**
 * Revertir una liquidación al referidor (VIB-86).
 *
 * Devuelve las comisiones a su estado anterior y **contra-asienta** la salida de
 * caja: se inserta un movimiento INCOME que devuelve la plata a la cuenta y se
 * marca el original como reversado. No se borra nada.
 *
 * Por qué contra-movimiento y no borrar: el rastro tiene que quedar. Es el mismo
 * patrón de `/api/ledger-movements/[id]/reverse` y `/api/cash-movements/[id]/reverse`.
 * (El revert de comisión al vendedor, `/api/commissions/revert`, sí borra el
 * movimiento — es más viejo y pierde la trazabilidad; no lo replicamos.)
 *
 * `/api/ledger-movements/[id]/reverse` rechaza explícitamente los movimientos
 * COMMISSION ("no soporta reversión automática en v1"), por eso la liquidación
 * trae su propia reversión en vez de delegar ahí.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { user, supabase, matrix } = await getRequestPermissions()
    const orgId = (user as any)?.org_id as string | undefined

    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    // Mismo gate que liquidar: ver al referidor + mover plata de una cuenta.
    const puede =
      canPerformAction(user, "referrals", "read", matrix ?? undefined) &&
      canPerformAction(user, "cash", "write", matrix ?? undefined)
    if (!puede) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
    if (!reason) {
      return NextResponse.json({ error: "Indicá el motivo de la reversión" }, { status: 400 })
    }

    const { data: settlement } = await (supabase.from("referral_settlements") as any)
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()

    if (!settlement) {
      return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 })
    }
    if (settlement.status !== "PAID") {
      return NextResponse.json(
        { error: "Esta liquidación ya fue revertida" },
        { status: 400 }
      )
    }

    // ── 1. Contra-asiento de la salida de caja.
    let reversalMovementId: string | null = null
    if (settlement.ledger_movement_id) {
      const { data: original } = await (supabase.from("ledger_movements") as any)
        .select("*")
        .eq("id", settlement.ledger_movement_id)
        .eq("org_id", orgId)
        .maybeSingle()

      if (original) {
        if (original.reversed_at) {
          return NextResponse.json(
            { error: "El movimiento de caja de esta liquidación ya fue reversado" },
            { status: 400 }
          )
        }

        // COMMISSION descuenta saldo, así que el contra-movimiento es INCOME.
        // Se arma explícito en vez de usar buildLedgerReversalPayload porque
        // oppositeMovementType() sólo contempla INCOME/EXPENSE.
        const { data: reversal, error: reversalError } = await (supabase
          .from("ledger_movements") as any)
          .insert({
            type: "INCOME",
            concept: "Contra-movimiento",
            notes: `Reversión de liquidación de referido ${settlement.id}: ${reason}`,
            currency: original.currency,
            amount_original: original.amount_original,
            amount_ars_equivalent: original.amount_ars_equivalent,
            exchange_rate: original.exchange_rate ?? null,
            method: original.method,
            account_id: original.account_id,
            operation_id: null,
            lead_id: null,
            seller_id: null,
            operator_id: null,
            org_id: orgId,
            created_by: user.id,
            reverses_movement_id: original.id,
          })
          .select("id")
          .single()

        if (reversalError || !reversal) {
          console.error("Error creando contra-movimiento de liquidación:", reversalError)
          return NextResponse.json(
            { error: "No se pudo revertir la salida de caja. No se cambió nada." },
            { status: 500 }
          )
        }

        reversalMovementId = reversal.id

        const { error: markError } = await (supabase.from("ledger_movements") as any)
          .update({
            reversed_at: new Date().toISOString(),
            reversed_by_movement_id: reversal.id,
            reversal_reason: reason,
          })
          .eq("id", original.id)
          .eq("org_id", orgId)
          .is("reversed_at", null)

        if (markError) {
          console.warn("[referral settlement reverse] no se pudo marcar el original:", markError.message)
        }
      } else {
        console.warn(
          "[referral settlement reverse] la liquidación apunta a un movimiento inexistente:",
          settlement.ledger_movement_id
        )
      }
    }

    // ── 2. Las comisiones vuelven a su estado previo.
    //
    // Una regularización sólo agregó la salida de caja que faltaba: esas
    // comisiones ya estaban pagadas antes, así que vuelven a PAID y no a
    // PENDING (si no, "des-pagaríamos" algo que el referidor ya cobró).
    const vuelveA = settlement.is_regularization ? "PAID" : "PENDING"
    const comisionesUpdate: Record<string, any> = {
      settlement_id: null,
      status: vuelveA,
      date_paid: vuelveA === "PAID" ? settlement.paid_at : null,
      updated_at: new Date().toISOString(),
    }
    // Al volver a PENDING no queda nada liquidado; al volver a PAID el monto
    // pagado sigue siendo el que ya tenía.
    if (vuelveA === "PENDING") comisionesUpdate.amount_paid = 0

    const { error: comError } = await (supabase.from("referral_commissions") as any)
      .update(comisionesUpdate)
      .eq("settlement_id", settlement.id)
      .eq("org_id", orgId)

    if (comError) {
      console.error("Error devolviendo comisiones a su estado previo:", comError)
      return NextResponse.json(
        {
          error:
            "Se revirtió el movimiento de caja pero las comisiones quedaron imputadas. Revisá la liquidación antes de reintentar.",
        },
        { status: 500 }
      )
    }

    // ── 3. La liquidación queda como REVERTED (no se borra: es el rastro).
    const { data: updated, error: updateError } = await (supabase
      .from("referral_settlements") as any)
      .update({
        status: "REVERTED",
        reverted_at: new Date().toISOString(),
        reverted_by: user.id,
        reversal_ledger_movement_id: reversalMovementId,
        reversal_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settlement.id)
      .eq("org_id", orgId)
      .eq("status", "PAID")
      .select()
      .single()

    if (updateError || !updated) {
      console.error("Error marcando la liquidación como revertida:", updateError)
      return NextResponse.json({ error: "Error al revertir la liquidación" }, { status: 500 })
    }

    logSecurityEvent({
      eventType: "REFERRAL_SETTLEMENT_REVERSED",
      severity: "INFO",
      actorUserId: user.id,
      targetEntity: "referral_settlements",
      targetEntityId: settlement.id,
      requestPath: `/api/referral-settlements/${settlement.id}/reverse`,
      details: {
        reason,
        amount: settlement.amount,
        currency: settlement.currency,
        cash_amount: settlement.cash_amount,
        reversal_movement_id: reversalMovementId,
        commissions_back_to: vuelveA,
      },
    })

    return NextResponse.json({ success: true, settlement: updated })
  } catch (error) {
    console.error("Error in POST /api/referral-settlements/[id]/reverse:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
