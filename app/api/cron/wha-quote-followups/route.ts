import { NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { runQuoteFollowupsWorker } from "@/lib/wha-control/quote-followups-worker"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Cron: seguimientos automáticos post-cotización de WHA Control.
 * Railway Cron Service cada 10 minutos.
 *
 * adminDb justificado: cron cross-tenant sin sesión; el worker solo actualiza
 * filas wa_quote_followups ya existentes (org_id preservado) y lee tablas wa_*.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request, "wha-quote-followups")
  if (!auth.authorized) {
    return NextResponse.json(
      { error: "Unauthorized", reason: auth.reason },
      { status: 401 }
    )
  }

  const supabase = createAdminClient() as any

  try {
    const counters = await runQuoteFollowupsWorker(supabase)
    console.log("[cron wha-quote-followups]", JSON.stringify(counters))
    return NextResponse.json({ ok: true, ...counters })
  } catch (err: any) {
    console.error("[cron wha-quote-followups] error:", err)
    return NextResponse.json(
      { ok: false, error: err?.message ?? "error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
