import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction, isOwnDataOnlyResolved } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

/**
 * Cambiar el estado de una comisión de referido (VIB-62) y ajustar su
 * porcentaje puntual (VIB-86).
 *
 * PAGAR YA NO SE HACE ACÁ (VIB-86). Marcar PAID desde este endpoint sólo movía
 * un flag: la plata nunca salía de ninguna cuenta y el saldo de caja quedaba
 * inflado. El pago vive en `POST /api/referral-settlements`, que agrupa las
 * comisiones de un referidor, genera el movimiento de caja y deja comprobante.
 *
 * Acá quedan las transiciones que NO mueven plata: anular una comisión y
 * volver a pendiente una que se había anulado.
 *
 * Requiere permiso de ESCRITURA de comisiones y no estar limitado a "lo propio".
 */

const VALID_STATUSES = ["PENDING", "PAID", "CANCELLED"] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()

    if (!(user as any)?.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const canManage =
      canPerformAction(user, "commissions", "write", matrix ?? undefined) &&
      !isOwnDataOnlyResolved(user, "commissions", matrix ?? undefined)

    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const nextStatus = body.status
    const ajustaPorcentaje = body.percentage !== undefined

    if (!ajustaPorcentaje && !VALID_STATUSES.includes(nextStatus)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
    }

    // Verificar estado actual y tenant antes de transicionar (no confiar en RLS).
    const { data: current, error: fetchError } = await (supabase.from("referral_commissions") as any)
      .select("id, amount, status, amount_paid, base_amount, percentage, settlement_id")
      .eq("id", id)
      .eq("org_id", (user as any).org_id)
      .maybeSingle()

    if (fetchError) {
      console.error("Error leyendo referral_commission:", fetchError)
      return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
    if (!current) {
      return NextResponse.json({ error: "Comisión no encontrada" }, { status: 404 })
    }

    // Ajuste puntual del porcentaje de ESTA venta (VIB-86). El referidor sigue
    // marcándose en el cliente y generando comisión en todas sus ventas; esto
    // permite pactar algo distinto en una venta concreta sin que el próximo
    // recálculo de la operación lo pise.
    if (ajustaPorcentaje) {
      // Gate propio: administrar referidos, no comisiones de vendedores.
      if (!canPerformAction(user, "referrals", "write", matrix ?? undefined)) {
        return NextResponse.json(
          { error: "No tiene permiso para modificar la comisión del referidor" },
          { status: 403 }
        )
      }

      // Una comisión ya liquidada no se reescribe: cambiaría el monto de algo
      // que ya se pagó. Primero hay que revertirla a pendiente.
      if (current.status !== "PENDING") {
        return NextResponse.json(
          { error: "La comisión ya fue liquidada. Revertila a pendiente antes de modificarla." },
          { status: 409 }
        )
      }

      const pct = Number(body.percentage)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json(
          { error: "El porcentaje debe estar entre 0 y 100" },
          { status: 400 }
        )
      }

      const base = Number(current.base_amount) || 0
      const nowIso = new Date().toISOString()

      const { data: updated, error: pctError } = await (supabase.from("referral_commissions") as any)
        .update({
          percentage: pct,
          amount: Math.round(((base * pct) / 100) * 100) / 100,
          percentage_mode: "MANUAL",
          updated_at: nowIso,
        })
        .eq("id", id)
        .eq("org_id", (user as any).org_id)
        // CAS: no pisar si alguien la liquidó entre la lectura y la escritura.
        .eq("status", "PENDING")
        .select()
        .single()

      if (pctError || !updated) {
        console.error("Error ajustando el porcentaje de referral_commission:", pctError)
        return NextResponse.json({ error: "Error al actualizar la comisión" }, { status: 400 })
      }

      return NextResponse.json({ success: true, commission: updated })
    }

    // VIB-86: pagar exige mover plata de una cuenta. Marcarla PAID acá dejaba la
    // comisión saldada sin egreso registrado, y la caja mostrando plata que ya
    // no estaba.
    if (nextStatus === "PAID") {
      return NextResponse.json(
        {
          error:
            "Para pagarle al referidor usá 'Liquidar' en la pantalla de Referidos: el pago tiene que salir de una cuenta.",
        },
        { status: 400 }
      )
    }

    // Una comisión incluida en una liquidación se toca revirtiendo la
    // liquidación, que además contra-asienta la salida de caja.
    if (current.settlement_id) {
      return NextResponse.json(
        {
          error:
            "Esta comisión forma parte de una liquidación. Revertí la liquidación para poder cambiarla.",
        },
        { status: 409 }
      )
    }

    // Idempotencia: si ya está en el estado pedido, no hacemos nada.
    if (current.status === nextStatus) {
      return NextResponse.json({ success: true, commission: current, unchanged: true })
    }

    const nowIso = new Date().toISOString()
    const update: any = { status: nextStatus, updated_at: nowIso }

    if (nextStatus === "PENDING") {
      // Revertir a pendiente: limpiar liquidación.
      update.date_paid = null
      update.amount_paid = 0
    } else if (nextStatus === "CANCELLED") {
      update.amount_paid = 0
    }

    const { data: updated, error: updateError } = await (supabase.from("referral_commissions") as any)
      .update(update)
      .eq("id", id)
      .eq("org_id", (user as any).org_id)
      .select()
      .single()

    if (updateError || !updated) {
      console.error("Error actualizando referral_commission:", updateError)
      return NextResponse.json({ error: "Error al actualizar la comisión" }, { status: 400 })
    }

    return NextResponse.json({ success: true, commission: updated })
  } catch (error) {
    console.error("Error in PATCH /api/referral-commissions/[id]:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
