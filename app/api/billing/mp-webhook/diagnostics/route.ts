import { createHmac, randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { verifyWebhookSignature } from "@/lib/billing/mercadopago"

type Check = {
  name: string
  ok: boolean
  details?: string
}

function mask(value: string | undefined): string {
  if (!value) return "missing"
  if (value.length <= 8) return "set"
  return `set(len=${value.length}, suffix=${value.slice(-6)})`
}

export async function GET() {
  // En dev permitimos abrir el diagnóstico sin login para test local rápido.
  if (process.env.NODE_ENV === "production") {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const okAdmin = await isPlatformAdmin(supabase, user.id)
    if (!okAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const checks: Check[] = []

  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN
  const appUrlRaw = (process.env.NEXT_PUBLIC_APP_URL || "").trim()

  checks.push({
    name: "env.webhook_secret_present",
    ok: !!webhookSecret,
    details: webhookSecret ? `secret ${mask(webhookSecret)}` : "MERCADOPAGO_WEBHOOK_SECRET missing",
  })

  checks.push({
    name: "env.access_token_present",
    ok: !!accessToken,
    details: accessToken ? `token ${mask(accessToken)}` : "MERCADOPAGO_ACCESS_TOKEN missing",
  })

  let appUrlValid = false
  let webhookUrl = ""
  try {
    const normalized = /^https?:\/\//i.test(appUrlRaw) ? appUrlRaw : `https://${appUrlRaw}`
    const parsed = new URL(normalized)
    webhookUrl = `${parsed.origin}/api/billing/mp-webhook`
    appUrlValid = parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    appUrlValid = false
  }

  checks.push({
    name: "env.app_url_valid",
    ok: appUrlValid,
    details: appUrlValid ? `webhook candidate: ${webhookUrl}` : "NEXT_PUBLIC_APP_URL invalid",
  })

  // Dry-run de firma: usa la misma función productiva verifyWebhookSignature
  // con una firma sintética para asegurar que el proceso local está correcto.
  if (webhookSecret) {
    const dataId = randomUUID().replace(/-/g, "")
    const requestId = randomUUID()
    const ts = `${Math.floor(Date.now() / 1000)}`
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const hmac = createHmac("sha256", webhookSecret).update(manifest).digest("hex")

    const valid = verifyWebhookSignature({
      xSignature: `ts=${ts},v1=${hmac}`,
      xRequestId: requestId,
      dataId,
    })

    const invalid = verifyWebhookSignature({
      xSignature: `ts=${ts},v1=${hmac.slice(0, -1)}0`,
      xRequestId: requestId,
      dataId,
    })

    checks.push({
      name: "signature.dry_run_valid_signature",
      ok: valid,
      details: valid ? "verifyWebhookSignature accepted valid synthetic signature" : "valid signature rejected",
    })
    checks.push({
      name: "signature.dry_run_invalid_signature",
      ok: !invalid,
      details: !invalid ? "verifyWebhookSignature rejected tampered signature" : "tampered signature accepted",
    })
  } else {
    checks.push({
      name: "signature.dry_run_valid_signature",
      ok: false,
      details: "skipped: missing webhook secret",
    })
    checks.push({
      name: "signature.dry_run_invalid_signature",
      ok: false,
      details: "skipped: missing webhook secret",
    })
  }

  const admin = createAdminClient() as any
  const { data: invalidSigEvents, error: invalidErr } = await admin
    .from("security_audit_log")
    .select("created_at")
    .eq("event_type", "mp_webhook_invalid_signature")
    .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .limit(200)

  checks.push({
    name: "audit.invalid_signature_last_24h",
    ok: !invalidErr,
    details: invalidErr
      ? `query failed: ${invalidErr.message}`
      : `count=${invalidSigEvents?.length ?? 0}`,
  })

  const allOk = checks.every((c) => c.ok)

  return NextResponse.json({
    ok: allOk,
    mode: process.env.NODE_ENV,
    dry_run: true,
    expected_webhook_url: webhookUrl || null,
    notes: [
      "This endpoint performs diagnostics only and does not mutate billing state.",
      "To fully validate production impact, configure MercadoPago webhook URL+secret and run a real payment.",
    ],
    checks,
  })
}
