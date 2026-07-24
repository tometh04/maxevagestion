import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { canPerformAction, isOwnDataOnlyResolved } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

/**
 * Cambiar el estado de una comisión de referido (VIB-62): marcar PAGADO /
 * PENDIENTE / ANULADO. NO genera movimientos de caja ni asientos contables (por
 * decisión de diseño: es un registro/seguimiento). Solo deja constancia del
 * estado, la fecha y el monto liquidado, para saber qué se le debe a cada
 * referidor.
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

    if (!VALID_STATUSES.includes(nextStatus)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
    }

    // Verificar estado actual y tenant antes de transicionar (no confiar en RLS).
    const { data: current, error: fetchError } = await (supabase.from("referral_commissions") as any)
      .select("id, amount, status, amount_paid")
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

    // Idempotencia: si ya está en el estado pedido, no hacemos nada.
    if (current.status === nextStatus) {
      return NextResponse.json({ success: true, commission: current, unchanged: true })
    }

    const nowIso = new Date().toISOString()
    const update: any = { status: nextStatus, updated_at: nowIso }

    if (nextStatus === "PAID") {
      update.date_paid = nowIso
      // Monto liquidado: por defecto el total; permite override parcial validado.
      let paid = Number(current.amount) || 0
      if (body.amount_paid != null && body.amount_paid !== "") {
        const p = Number(body.amount_paid)
        if (!Number.isFinite(p) || p < 0) {
          return NextResponse.json({ error: "Monto liquidado inválido" }, { status: 400 })
        }
        paid = Math.round(p * 100) / 100
      }
      update.amount_paid = paid
    } else if (nextStatus === "PENDING") {
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
