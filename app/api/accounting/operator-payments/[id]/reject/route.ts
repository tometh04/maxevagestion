import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const body = await request.json().catch(() => ({}))
  const reason = (body.reason || "").trim()
  if (!reason) return NextResponse.json({ error: "Motivo requerido" }, { status: 400 })

  const { data: payment } = await (supabase.from("operator_payments") as any)
    .select("*")
    .eq("id", id)
    .single()

  if (!payment) return NextResponse.json({ error: "Pago a operador no encontrado" }, { status: 404 })
  if ((payment as any).approval_status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "No está pendiente" }, { status: 400 })
  }

  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "Solo ADMIN/SUPER_ADMIN puede rechazar" }, { status: 403 })
  }

  const { data: updated } = await (supabase.from("operator_payments") as any)
    .update({
      approval_status: "REJECTED",
      approved_by_user_id: user.id,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", id)
    .eq("approval_status", "PENDING_APPROVAL")
    .select()
    .single()

  if (!updated) return NextResponse.json({ error: "Race condition" }, { status: 409 })

  logSecurityEvent({
    eventType: "PAYMENT_REJECTED",
    severity: "INFO",
    actorUserId: user.id,
    targetEntity: "operator_payments",
    targetEntityId: id,
    requestPath: `/api/accounting/operator-payments/${id}/reject`,
    details: { reason, amount: (payment as any).amount, currency: (payment as any).currency },
  })

  return NextResponse.json({ payment: updated })
}
