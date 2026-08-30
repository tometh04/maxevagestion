import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { fetchPreapproval, searchAuthorizedPayments } from "@/lib/billing/mercadopago"
import { parseRejectionReason } from "@/lib/billing/rejection-reason"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id: orgId } = await params
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("mp_preapproval_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  let preapproval: any = null
  // Intentos de cobro del preapproval. `summarized` del preapproval solo dice
  // cuánto se cobró; para saber por qué se cayó un cobro y si MP lo va a
  // reintentar hay que mirar los authorized_payments uno por uno.
  let chargeAttempts: any[] | { error: string } = []
  if (org.mp_preapproval_id) {
    try {
      preapproval = await fetchPreapproval(org.mp_preapproval_id)
    } catch (err: any) {
      preapproval = { error: err.message }
    }
    try {
      const attempts = await searchAuthorizedPayments(org.mp_preapproval_id, 30)
      chargeAttempts = attempts.map((ap: any) => {
        const detail = ap?.payment?.status_detail ?? null
        const reason = parseRejectionReason(detail)
        return {
          id: ap.id,
          // status del authorized_payment: scheduled / processed / recycling / cancelled.
          // "recycling" = MP lo está reintentando.
          status: ap.status,
          date_created: ap.date_created,
          debit_date: ap.debit_date,
          transaction_amount: ap.transaction_amount,
          retry_attempt: ap.retry_attempt ?? null,
          next_retry_date: ap.next_retry_date ?? null,
          payment_id: ap?.payment?.id ?? null,
          payment_status: ap?.payment?.status ?? null,
          status_detail: detail,
          reason_label: reason?.label ?? null,
          reason_retryable: reason?.retryable ?? null,
          reason_action: reason?.action ?? null,
        }
      })
    } catch (err: any) {
      chargeAttempts = { error: err.message }
    }
  }

  const { data: events } = await admin
    .from("billing_events")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5)

  return NextResponse.json({
    preapproval,
    charge_attempts: chargeAttempts,
    recent_events: events ?? [],
  })
}
