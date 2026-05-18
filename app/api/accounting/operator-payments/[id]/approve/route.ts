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

  // Cross-tenant fix (2026-05-18): scopear el fetch del pago por org.
  if (!(user as any).org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const { data: payment } = await (supabase.from("operator_payments") as any)
    .select("*, operation:operation_id(agency_id)")
    .eq("id", id)
    .eq("org_id", (user as any).org_id)
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

  // Race-safe UPDATE: only if still PENDING_APPROVAL.
  // Bug Yamil 2026-05-05: NO seteamos status="PAID" acá. Los side effects
  // (ledger_movements, cash_movements, balance del operador, asiento) viven
  // en el flow de "Registrar Pago" → POST /api/payments + applyOperatorPaymentSettlement
  // que requiere financial_account_id (input del user). Al aprobar dejamos
  // el operator_payment en status="PENDING" + approval_status="APPROVED" para
  // que el admin termine el flow eligiendo cuenta financiera.
  // El bug previo: aprobar marcaba PAID directo, esto bloqueaba el flow real
  // y el sistema quedaba inconsistente: deuda PAID, pero saldos sin moverse.
  const { data: updated, error: updError } = await (supabase.from("operator_payments") as any)
    .update({
      approval_status: "APPROVED",
      approved_by_user_id: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", (user as any).org_id)
    .eq("approval_status", "PENDING_APPROVAL")
    .select()
    .single()

  if (updError || !updated) {
    return NextResponse.json({ error: "Race condition o pago ya resuelto" }, { status: 409 })
  }

  // Notify creator — el pago a operador está aprobado pero la deuda todavía
  // PENDING. Hay que ejecutar "Registrar Pago" eligiendo cuenta financiera
  // para que se descuente saldo y se cree el asiento.
  if ((payment as any).created_by_user_id) {
    await admin.from("alerts").insert({
      user_id: (payment as any).created_by_user_id,
      org_id: (payment as any).org_id,
      type: "PAYMENT_APPROVED",
      description: `Tu pago a operador ${(payment as any).amount} ${(payment as any).currency} fue aprobado. Ahora ejecutá "Registrar Pago" en el detalle de la operación eligiendo la cuenta financiera para que se actualicen los saldos.`,
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
