import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canApprove, convertToArs } from "@/lib/payments/approval"
import { loadApprovalRules, getCurrentArsPerUsd } from "@/lib/payments/load-rules"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const admin = createAdminClient() as any

  const { data: payment } = await (supabase.from("operator_payments") as any)
    .select("*, operation:operation_id(agency_id)")
    .eq("id", id)
    .single()

  if (!payment) return NextResponse.json({ error: "Pago a operador no encontrado" }, { status: 404 })
  if ((payment as any).approval_status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "Pago no está pendiente de aprobación" }, { status: 400 })
  }

  const agencyId = (payment as any).operation?.agency_id
  const rules = await loadApprovalRules(agencyId, supabase)
  const arsPerUsd = await getCurrentArsPerUsd(supabase)
  const amountArs = convertToArs(Number((payment as any).amount), (payment as any).currency, arsPerUsd)

  if (!canApprove(amountArs, user.role, rules)) {
    return NextResponse.json({ error: "No tenés permiso para aprobar este monto" }, { status: 403 })
  }

  // Race-safe UPDATE: only if still PENDING_APPROVAL
  const { data: updated, error: updError } = await (supabase.from("operator_payments") as any)
    .update({
      approval_status: "APPROVED",
      approved_by_user_id: user.id,
      approved_at: new Date().toISOString(),
      status: "PAID",
      date_paid: new Date().toISOString().split("T")[0],
    })
    .eq("id", id)
    .eq("approval_status", "PENDING_APPROVAL")
    .select()
    .single()

  if (updError || !updated) {
    return NextResponse.json({ error: "Race condition o pago ya resuelto" }, { status: 409 })
  }

  // NOTE: Ledger creation is NOT triggered here intentionally.
  // The full ledger flow for operator payments lives in the accounting module and
  // requires financial_account_id as user input. After approval, trigger the
  // accounting settlement flow to complete the ledger entries.
  // TODO: consider auto-triggering settlement with a default account if fully automated
  // ledger creation on approval is desired.
  console.warn(`[operator-payments/approve] Payment ${id} approved but ledger NOT created yet. Trigger accounting settlement to complete.`)

  // Notify creator
  if ((payment as any).created_by_user_id) {
    await admin.from("alerts").insert({
      user_id: (payment as any).created_by_user_id,
      org_id: (payment as any).org_id,
      type: "PAYMENT_APPROVED",
      description: `Tu pago a operador ${(payment as any).amount} ${(payment as any).currency} fue aprobado`,
      date_due: new Date().toISOString().split("T")[0],
      status: "PENDING",
    }).catch((e: any) => console.warn("notify failed:", e?.message))
  }

  logSecurityEvent({
    eventType: "PAYMENT_APPROVED",
    severity: "INFO",
    actorUserId: user.id,
    targetEntity: "operator_payments",
    targetEntityId: id,
    requestPath: `/api/accounting/operator-payments/${id}/approve`,
    details: { amount: (payment as any).amount, currency: (payment as any).currency, amountArs },
  })

  return NextResponse.json({ payment: updated })
}
