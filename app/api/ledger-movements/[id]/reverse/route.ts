// app/api/ledger-movements/[id]/reverse/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canReverse, buildLedgerReversalPayload } from "@/lib/accounting/reversal"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role)) {
    return NextResponse.json({ error: "Sin permiso para reversar" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const reason = (body.reason || "").trim()
  if (!reason) return NextResponse.json({ error: "Motivo requerido" }, { status: 400 })

  const { data: original } = await (supabase.from("ledger_movements") as any)
    .select("*")
    .eq("id", id)
    .single()

  if (!original) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })

  const check = canReverse(original)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  // v1: solo INCOME/EXPENSE. FX_GAIN/FX_LOSS/COMMISSION/OPERATOR_PAYMENT requieren handling especial.
  if (!["INCOME", "EXPENSE"].includes(original.type)) {
    return NextResponse.json(
      { error: `Tipo ${original.type} no soporta reversión automática en v1` },
      { status: 400 },
    )
  }

  const today = new Date().toISOString().split("T")[0]
  const reversalPayload = buildLedgerReversalPayload(original, reason, id, today)

  const { data: reversal, error: insertError } = await (supabase.from("ledger_movements") as any)
    .insert(reversalPayload)
    .select()
    .single()

  if (insertError || !reversal) {
    return NextResponse.json({ error: insertError?.message || "Error creando reversal" }, { status: 500 })
  }

  const { error: updError } = await (supabase.from("ledger_movements") as any)
    .update({
      reversed_at: new Date().toISOString(),
      reversed_by_movement_id: reversal.id,
      reversal_reason: reason,
    })
    .eq("id", id)
    .is("reversed_at", null)

  if (updError) {
    console.warn("[ledger-movement reverse] update original failed:", updError.message)
  }

  logSecurityEvent({
    eventType: "LEDGER_MOVEMENT_REVERSED",
    severity: "INFO",
    actorUserId: user.id,
    targetEntity: "ledger_movements",
    targetEntityId: id,
    requestPath: `/api/ledger-movements/${id}/reverse`,
    details: { reason, amount: original.amount_original, currency: original.currency, reversal_id: reversal.id },
  })

  return NextResponse.json({ original_id: id, reversal })
}
