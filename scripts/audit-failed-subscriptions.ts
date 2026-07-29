/**
 * Read-only: audita suscripciones MP con cobros fallidos / "mes gratis" / en riesgo.
 * NO escribe nada. Cross-tenant (service role).
 * Run: npx tsx scripts/audit-failed-subscriptions.ts
 *
 * Detecta, para cada org con mp_preapproval_id:
 *   - CICLO IMPAGO: MP dice authorized pero el último cobro exitoso no cubre el
 *     ciclo vigente (mismo criterio que el corte proactivo del reconcile).
 *   - FECHA ESTIRADA: current_period_ends_at más allá del paid-through real (el bug
 *     del "mes gratis" ya aplicado).
 *   - RECHAZOS: PAYMENT_REJECTED recientes en billing_events.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
import { fetchPreapproval } from "@/lib/billing/mercadopago"
import {
  isCurrentCycleUnpaid,
  computePaidThrough,
  CYCLE_SKEW_DAYS,
  type MPPreapproval,
} from "@/lib/billing/state-machine"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DAY = 86400_000
const SKEW = CYCLE_SKEW_DAYS * DAY

;(async () => {
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, subscription_status, current_period_ends_at, mp_preapproval_id, billing_email")
    .not("mp_preapproval_id", "is", null)

  const now = Date.now()
  const rows: any[] = []

  for (const org of orgs ?? []) {
    let pa: MPPreapproval | null = null
    try {
      pa = (await fetchPreapproval(org.mp_preapproval_id)) as MPPreapproval
    } catch (err: any) {
      rows.push({ org, severity: 1, flags: [`fetch_error: ${err?.message}`] })
      continue
    }

    const flags: string[] = []
    let severity = 0

    const unpaid = isCurrentCycleUnpaid(pa, now, SKEW)
    const paidThrough = computePaidThrough(pa)
    const lastCharged = (pa as any).summarized?.last_charged_date ?? null

    if (unpaid) {
      severity = Math.max(severity, 3)
      flags.push("CICLO_IMPAGO")
    }
    if (
      org.subscription_status === "ACTIVE" &&
      paidThrough &&
      org.current_period_ends_at &&
      new Date(org.current_period_ends_at).getTime() > paidThrough.getTime() + SKEW
    ) {
      severity = Math.max(severity, 3)
      flags.push("FECHA_ESTIRADA(mes_gratis)")
    }

    // Rechazos recientes (últimos 45 días).
    const { data: rejects } = await admin
      .from("billing_events")
      .select("created_at")
      .eq("org_id", org.id)
      .eq("event_type", "PAYMENT_REJECTED")
      .gte("created_at", new Date(now - 45 * DAY).toISOString())
      .order("created_at", { ascending: false })
    if (rejects && rejects.length > 0) {
      severity = Math.max(severity, 2)
      flags.push(`RECHAZOS(${rejects.length}, últ ${rejects[0].created_at?.slice(0, 10)})`)
    }

    if (flags.length > 0) {
      rows.push({
        org, severity, flags,
        mpStatus: pa.status,
        lastCharged,
        nextPayment: (pa as any).next_payment_date ?? null,
        paidThrough: paidThrough?.toISOString() ?? null,
      })
    }
  }

  rows.sort((a, b) => b.severity - a.severity)

  console.log(`\n=== Suscripciones con problemas de cobro: ${rows.length} ===\n`)
  for (const r of rows) {
    console.log(`• [sev ${r.severity}] ${r.org.name}  (${r.org.subscription_status})`)
    console.log(`    flags: ${r.flags.join(", ")}`)
    console.log(`    email: ${r.org.billing_email ?? "—"}`)
    console.log(`    MP: status=${r.mpStatus ?? "—"}  last_charged=${r.lastCharged ?? "—"}  next_payment=${r.nextPayment ?? "—"}`)
    console.log(`    DB current_period_ends_at=${r.org.current_period_ends_at ?? "—"}  paid_through_real=${r.paidThrough ?? "—"}`)
    console.log(`    id: ${r.org.id}`)
    console.log("")
  }
  if (rows.length === 0) console.log("✅ Ninguna org con cobros fallidos detectados.")
})()
