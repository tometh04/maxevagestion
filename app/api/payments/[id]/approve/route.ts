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
  try {
    const { id } = await params
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): scopear el fetch del pago por org.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const supabase = await createServerClient()
    // adminDb justificado: alerts insert con bypass RLS (created_by_user_id puede
    // pertenecer a otro user del mismo org).
    const admin = createAdminClient() as any

    const { data: payment } = await (supabase.from("payments") as any)
      .select("*, operation:operation_id(agency_id)")
      .eq("id", id)
      .eq("org_id", userOrgId)
      .single()

    if (!payment) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
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

    const { data: updated, error: updError } = await (supabase.from("payments") as any)
      .update({
        approval_status: "APPROVED",
        approved_by_user_id: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", userOrgId)
      .eq("approval_status", "PENDING_APPROVAL")
      .select()
      .single()

    if (updError || !updated) {
      return NextResponse.json({ error: "Race condition o pago ya resuelto" }, { status: 409 })
    }

    if ((payment as any).created_by_user_id) {
      await admin.from("alerts").insert({
        user_id: (payment as any).created_by_user_id,
        org_id: (payment as any).org_id,
        type: "PAYMENT_APPROVED",
        description: `Tu pago ${(payment as any).amount} ${(payment as any).currency} fue aprobado. Andá al detalle de la operación y marcalo como cobrado eligiendo la cuenta financiera.`,
        date_due: new Date().toISOString().split("T")[0],
        status: "PENDING",
      }).catch((e: any) => console.warn("notify failed:", e?.message))
    }

    logSecurityEvent({
      eventType: "PAYMENT_APPROVED",
      severity: "INFO",
      actorUserId: user.id,
      targetEntity: "payments",
      targetEntityId: id,
      requestPath: `/api/payments/${id}/approve`,
      details: { amount: (payment as any).amount, currency: (payment as any).currency, amountArs },
    })

    return NextResponse.json({ payment: updated })
  } catch (error: any) {
    console.error("[approve] unhandled error:", error)
    return NextResponse.json({ error: error?.message || "Error interno al aprobar el pago" }, { status: 500 })
  }
}
