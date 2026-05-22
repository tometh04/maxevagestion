import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { logSecurityEvent } from "@/lib/security/audit"

/**
 * Endpoint forense para detectar y reparar payments huérfanos:
 * payments con `status='PAID'` pero `ledger_movement_id IS NULL`.
 *
 * Origen del bug (2026-05-05):
 *   `/api/payments/[id]/approve` y `/api/accounting/operator-payments/[id]/approve`
 *   flipeaban `status='PAID'` sin disparar mark-paid (que crea los side effects:
 *   ledger_movements + cash_movements + applyOperatorPaymentSettlement + FX +
 *   percepciones + counterparts). Resultado: payment "Pagado" en UI pero
 *   saldos sin moverse.
 *
 * GET → lista los huérfanos del tenant (acotado por RLS automático del user).
 * POST { paymentIds: string[] } → revierte esos payments a status='PENDING'
 *   para que el user pueda re-procesarlos vía mark-paid eligiendo cuenta
 *   financiera. NO toca ledger ni cash (no había nada que limpiar).
 */

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // RLS scopea por org del user. Listamos los payments PAID sin ledger.
    const { data: orphans, error } = await (supabase.from("payments") as any)
      .select(
        `
        id,
        operation_id,
        payer_type,
        direction,
        method,
        amount,
        currency,
        date_paid,
        approval_status,
        approved_at,
        created_at,
        operations:operation_id(id, file_code, destination)
      `
      )
      .eq("status", "PAID")
      // 2026-05-07: excluir imports legacy (ya no son "huérfanos" — son carga
      // histórica intencional sin ledger por diseño).
      .eq("is_legacy_import", false)
      .is("ledger_movement_id", null)
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      console.error("[payments/orphans GET] Error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Operator_payments equivalentes
    const { data: opOrphans } = await (supabase.from("operator_payments") as any)
      .select(
        `
        id,
        operation_id,
        operator_id,
        amount,
        paid_amount,
        currency,
        approval_status,
        approved_at,
        created_at,
        operations:operation_id(id, file_code, destination),
        operators:operator_id(id, name)
      `
      )
      .eq("status", "PAID")
      // 2026-05-08: excluir settlements legacy (pagos históricos sin
      // ledger por diseño — la plata salió del banco antes del go-live).
      .eq("is_legacy_settled", false)
      .is("ledger_movement_id", null)
      .order("created_at", { ascending: false })
      .limit(500)

    // P0 2026-05-10: detectar payments PAID con ledger principal pero SIN
    // counterpart movement. Origen: catch console.error en mark-paid (línea
    // ~422 de mark-paid/route.ts) silenciosamente comía el error de creación
    // del counterpart, dejando Cuentas por Cobrar/Pagar sin reducir → la
    // deuda nunca cierra aunque el payment esté marcado como PAID.
    //
    // Detección: counterpart se identifica via marker en notes:
    // `counterpart_payment_id=<payment_id>`. Buscamos payments PAID que NO
    // tengan ningún ledger_movement con ese marker para su id.
    const { data: paidPayments } = await (supabase.from("payments") as any)
      .select(
        `
        id,
        operation_id,
        payer_type,
        direction,
        method,
        amount,
        currency,
        date_paid,
        ledger_movement_id,
        created_at,
        operations:operation_id(id, file_code, destination)
      `
      )
      .eq("status", "PAID")
      .eq("is_legacy_import", false)
      .not("ledger_movement_id", "is", null)
      .not("operation_id", "is", null)
      .in("payer_type", ["CUSTOMER", "OPERATOR"])
      .order("created_at", { ascending: false })
      .limit(1000)

    const paymentIds = (paidPayments || []).map((p: any) => p.id)
    const missingCounterpart: any[] = []

    if (paymentIds.length > 0) {
      // Para cada payment, buscar si existe ledger_movement con su marker.
      // PostgREST no soporta NOT EXISTS — hacemos batch fetch y diff en JS.
      const orConditions = paymentIds
        .map((id: string) => `notes.ilike.%counterpart_payment_id=${id}%`)
        .join(",")
      const { data: counterpartRows } = await (supabase.from("ledger_movements") as any)
        .select("notes")
        .or(orConditions)
        .limit(2000)

      const foundIds = new Set<string>()
      const markerRegex = /counterpart_payment_id=([0-9a-f-]{36})/gi
      for (const row of counterpartRows || []) {
        const matches = Array.from(String(row.notes || "").matchAll(markerRegex))
        for (const m of matches) {
          if (m[1]) foundIds.add(m[1])
        }
      }

      for (const p of paidPayments || []) {
        if (!foundIds.has(p.id)) {
          missingCounterpart.push(p)
        }
      }
    }

    return NextResponse.json({
      payments: orphans || [],
      operator_payments: opOrphans || [],
      payments_missing_counterpart: missingCounterpart,
      count:
        (orphans?.length || 0) +
        (opOrphans?.length || 0) +
        missingCounterpart.length,
    })
  } catch (err: any) {
    console.error("[payments/orphans GET] Unexpected:", err)
    return NextResponse.json({ error: err.message ?? "Error" }, { status: 500 })
  }
}

interface RevertBody {
  paymentIds?: string[]
  operatorPaymentIds?: string[]
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as RevertBody
    const paymentIds = (body.paymentIds || []).filter(
      (id) => typeof id === "string" && id.length > 0
    )
    const operatorPaymentIds = (body.operatorPaymentIds || []).filter(
      (id) => typeof id === "string" && id.length > 0
    )

    if (paymentIds.length === 0 && operatorPaymentIds.length === 0) {
      return NextResponse.json(
        { error: "Faltan paymentIds u operatorPaymentIds" },
        { status: 400 }
      )
    }

    let revertedPayments = 0
    let revertedOpPayments = 0

    // Solo revertimos rows que sigan siendo huérfanas (PAID + ledger NULL).
    // Usamos `.is(...)` + `.eq(...)` como CAS para que un fix concurrente
    // no nos pise.
    if (paymentIds.length > 0) {
      const { data, error } = await (supabase.from("payments") as any)
        .update({
          status: "PENDING",
          date_paid: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", paymentIds)
        .eq("status", "PAID")
        // 2026-05-07: si un user (vía UI o curl) intenta revertir un pago
        // legacy a PENDING, no lo dejamos. Esos pagos están como PAID por
        // diseño (la plata ya entró al banco real antes del import). El CAS
        // los protege para que no muten accidentalmente.
        .eq("is_legacy_import", false)
        .is("ledger_movement_id", null)
        .select("id")

      if (error) {
        console.error("[payments/orphans POST] payments revert error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      revertedPayments = data?.length ?? 0
    }

    if (operatorPaymentIds.length > 0) {
      const { data, error } = await (supabase.from("operator_payments") as any)
        .update({
          status: "PENDING",
          updated_at: new Date().toISOString(),
        })
        .in("id", operatorPaymentIds)
        .eq("status", "PAID")
        // 2026-05-08: si un user (vía UI o curl) intenta revertir un pago
        // legacy_settled a PENDING, no lo dejamos. Esos pagos están como
        // PAID por diseño (la plata salió del banco antes del go-live).
        .eq("is_legacy_settled", false)
        .is("ledger_movement_id", null)
        .select("id")

      if (error) {
        console.error("[payments/orphans POST] op_payments revert error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      revertedOpPayments = data?.length ?? 0
    }

    logSecurityEvent({
      eventType: "PAYMENT_ORPHAN_REVERTED",
      severity: "WARN",
      actorUserId: user.id,
      actorAuthId: (user as any).auth_id,
      targetEntity: "payments",
      details: {
        revertedPayments,
        revertedOpPayments,
        paymentIds: paymentIds.slice(0, 50),
        operatorPaymentIds: operatorPaymentIds.slice(0, 50),
      },
    })

    return NextResponse.json({
      ok: true,
      revertedPayments,
      revertedOpPayments,
      message:
        "Pagos revertidos a PENDING. Ahora podés procesarlos vía 'Marcar como cobrado' / 'Registrar Pago' eligiendo cuenta financiera para que se actualicen los saldos.",
    })
  } catch (err: any) {
    console.error("[payments/orphans POST] Unexpected:", err)
    return NextResponse.json({ error: err.message ?? "Error" }, { status: 500 })
  }
}
