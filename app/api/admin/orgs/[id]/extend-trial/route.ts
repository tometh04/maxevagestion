import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { updatePreapproval, fetchPreapproval } from "@/lib/billing/mercadopago"

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
  const days = Number(body.days)
  if (!Number.isInteger(days) || days <= 0 || days > 365) {
    return NextResponse.json({ error: "days debe ser entero entre 1 y 365" }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, trial_ends_at, mp_preapproval_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  const base = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : Date.now()
  const newTrialEnds = new Date(base + days * 24 * 60 * 60 * 1000).toISOString()

  await admin
    .from("organizations")
    .update({ trial_ends_at: newTrialEnds })
    .eq("id", orgId)

  // Si hay preapproval MP con start_date futuro, alinearlo.
  if (org.mp_preapproval_id) {
    try {
      const mp = await fetchPreapproval(org.mp_preapproval_id)
      const mpStart = mp?.auto_recurring?.start_date
      if (mpStart && new Date(mpStart).getTime() > Date.now()) {
        await updatePreapproval(org.mp_preapproval_id, { start_date: newTrialEnds })
      }
    } catch (err) {
      console.warn("fetchPreapproval en extend-trial falló (continuando):", err)
    }
  }

  logSecurityEvent({
    eventType: "TRIAL_EXTENDED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: { days, before: org.trial_ends_at, after: newTrialEnds },
  })

  return NextResponse.json({ ok: true, trial_ends_at: newTrialEnds })
}
