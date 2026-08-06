import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

/**
 * Registra un pago cobrado por fuera de Mercado Pago (transferencia, factura A)
 * y mueve el vencimiento de la suscripción.
 *
 * Lo usan tanto el formulario libre de "Pagos manuales" como la acción rápida
 * "Registrar pago del mes" (que precalcula el período con
 * `lib/billing/period-extension`).
 *
 * Invariantes:
 *  - El vencimiento NUNCA retrocede. Registrar un pago viejo de forma retroactiva
 *    deja el histórico pero no le corta el acceso a una org que ya está paga
 *    más adelante.
 *  - SUSPENDED / CANCELLED no se reactivan solos: si el admin suspendió por
 *    razones ajenas al pago, tiene que desuspender explícitamente.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: orgId } = await params
  const body = await request.json().catch(() => ({}))
  const {
    paid_at,
    covers_from,
    covers_to,
    payment_method,
    receipt_ref,
    // Timestamp exacto del nuevo vencimiento. Opcional: si no viene, se usa
    // covers_to a medianoche. Lo manda la acción rápida para preservar la hora
    // del corte y que no se adelante unas horas en cada renovación.
    period_ends_at,
  } = body

  const amountArs = Number(body.amount_ars)
  if (!Number.isFinite(amountArs) || amountArs <= 0) {
    return NextResponse.json({ error: "amount_ars debe ser un número > 0" }, { status: 400 })
  }
  if (!paid_at || !covers_from || !covers_to) {
    return NextResponse.json(
      { error: "paid_at, covers_from y covers_to son requeridos" },
      { status: 400 }
    )
  }
  const paidAtTime = new Date(paid_at).getTime()
  const coversFromTime = new Date(covers_from).getTime()
  const coversToTime = new Date(covers_to).getTime()
  if (Number.isNaN(paidAtTime) || Number.isNaN(coversFromTime) || Number.isNaN(coversToTime)) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 })
  }
  if (coversToTime < coversFromTime) {
    return NextResponse.json({ error: "covers_to debe ser >= covers_from" }, { status: 400 })
  }

  // Vencimiento propuesto: el timestamp explícito si vino, si no covers_to.
  let proposedEndsAt: string
  if (period_ends_at) {
    const t = new Date(period_ends_at).getTime()
    if (Number.isNaN(t)) {
      return NextResponse.json({ error: "period_ends_at inválido" }, { status: 400 })
    }
    proposedEndsAt = new Date(t).toISOString()
  } else {
    proposedEndsAt = new Date(coversToTime).toISOString()
  }

  const admin = createAdminClient() as any

  // Cargar estado actual antes de escribir: necesitamos el vencimiento vigente
  // (para no retrocederlo) y el status (para no reactivar suspensiones).
  const { data: orgCurr } = await admin
    .from("organizations")
    .select("id, subscription_status, current_period_ends_at")
    .eq("id", orgId)
    .maybeSingle()
  if (!orgCurr) {
    return NextResponse.json({ error: "Org no existe" }, { status: 404 })
  }

  const { data: payment, error } = await admin
    .from("manual_payments")
    .insert({
      org_id: orgId,
      amount_ars: amountArs,
      paid_at,
      covers_from,
      covers_to,
      payment_method: payment_method ?? null,
      receipt_ref: receipt_ref ?? null,
      registered_by: user.id,
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const previousEndsAt = orgCurr.current_period_ends_at as string | null
  const previousEndsAtTime = previousEndsAt ? new Date(previousEndsAt).getTime() : null
  const extendsPeriod =
    previousEndsAtTime == null ||
    Number.isNaN(previousEndsAtTime) ||
    new Date(proposedEndsAt).getTime() > previousEndsAtTime
  const newEndsAt = extendsPeriod ? proposedEndsAt : (previousEndsAt as string)

  const currentStatus = orgCurr.subscription_status as string | null
  const skipStatusChange = currentStatus === "SUSPENDED" || currentStatus === "CANCELLED"

  const orgUpdatePatch: Record<string, unknown> = {}
  if (extendsPeriod) orgUpdatePatch.current_period_ends_at = newEndsAt
  if (!skipStatusChange) orgUpdatePatch.subscription_status = "ACTIVE"

  if (Object.keys(orgUpdatePatch).length > 0) {
    const { error: orgErr } = await admin
      .from("organizations")
      .update(orgUpdatePatch)
      .eq("id", orgId)
    // El pago ya quedó registrado; si la org no se pudo actualizar el
    // vencimiento queda inconsistente con el histórico → hay que enterarse.
    if (orgErr) {
      console.error("manual-payment: org update failed:", orgErr)
      logSecurityEvent({
        eventType: "MANUAL_PAYMENT_ORG_UPDATE_FAILED",
        severity: "CRITICAL",
        actorUserId: user.id,
        actorAuthId: (user as any).auth_id,
        targetOrgId: orgId,
        targetEntity: "organizations",
        targetEntityId: orgId,
        details: { payment_id: payment.id, patch: orgUpdatePatch, error: orgErr.message },
      })
      return NextResponse.json(
        {
          error:
            "El pago quedó registrado pero no se pudo actualizar el vencimiento de la org. Revisar manualmente.",
          payment,
        },
        { status: 500 }
      )
    }
  }

  logSecurityEvent({
    eventType: "MANUAL_PAYMENT_REGISTERED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "manual_payments",
    targetEntityId: payment.id,
    details: {
      payment,
      period_before: previousEndsAt,
      period_after: newEndsAt,
      period_extended: extendsPeriod,
      status_before: currentStatus,
      status_after: skipStatusChange ? currentStatus : "ACTIVE",
    },
  })

  revalidatePath(`/admin/orgs/${orgId}`)

  return NextResponse.json({
    ok: true,
    payment,
    current_period_ends_at: newEndsAt,
    period_extended: extendsPeriod,
    status_preserved: skipStatusChange ? currentStatus : null,
  })
}
