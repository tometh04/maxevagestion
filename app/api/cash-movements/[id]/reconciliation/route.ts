// app/api/cash-movements/[id]/reconciliation/route.ts
//
// Conciliación bancaria (VIB-137): marca en qué situación está un movimiento de
// caja respecto del extracto del banco. Es puramente informativo — NO toca
// montos, saldos ni el ledger; solo el estado de conciliación del movimiento.
import { NextResponse } from "next/server"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

const VALID_STATUSES = ["PENDING", "UNIDENTIFIED", "RECONCILED"] as const
type ReconciliationStatus = (typeof VALID_STATUSES)[number]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { user, supabase, matrix } = await getRequestPermissions()

  // Mismo gate que reversar: conciliar es una acción de caja.
  if (!canPerformAction(user, "cash", "write", matrix ?? undefined)) {
    return NextResponse.json({ error: "Sin permiso para conciliar movimientos" }, { status: 403 })
  }

  if (!(user as any).org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const rawStatus = body.status

  // null es válido y significa "volver a sin marcar".
  const status: ReconciliationStatus | null =
    rawStatus === null || rawStatus === undefined || rawStatus === ""
      ? null
      : VALID_STATUSES.includes(rawStatus)
        ? rawStatus
        : undefined as never

  if (status === undefined) {
    return NextResponse.json(
      { error: `Estado inválido. Valores permitidos: ${VALID_STATUSES.join(", ")} o null.` },
      { status: 400 },
    )
  }

  // Scope explícito por org: no alcanza con RLS (ver AGENTS.md).
  const { data: movement } = await (supabase.from("cash_movements") as any)
    .select("id, reversed_at")
    .eq("id", id)
    .eq("org_id", (user as any).org_id)
    .single()

  if (!movement) {
    return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })
  }

  // Un movimiento reversado no se concilia: su contrapartida es el reverso.
  if (movement.reversed_at) {
    return NextResponse.json(
      { error: "No se puede conciliar un movimiento reversado" },
      { status: 400 },
    )
  }

  const isReconciled = status === "RECONCILED"

  const { data: updated, error } = await (supabase.from("cash_movements") as any)
    .update({
      reconciliation_status: status,
      reconciled_at: isReconciled ? new Date().toISOString() : null,
      reconciled_by: isReconciled ? user.id : null,
    })
    .eq("id", id)
    .eq("org_id", (user as any).org_id)
    .select("id, reconciliation_status, reconciled_at")
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message || "Error actualizando la conciliación" },
      { status: 500 },
    )
  }

  return NextResponse.json({ movement: updated })
}
