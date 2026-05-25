/**
 * Notificaciones automáticas de billing a Slack.
 *
 * Usa Incoming Webhook de Slack (no requiere bot token).
 * Env var: SLACK_BILLING_WEBHOOK_URL
 *
 * Setup:
 *  1. Ir a https://api.slack.com/apps → Create New App → From scratch
 *  2. Incoming Webhooks → Activate → Add New Webhook to Workspace
 *  3. Elegir canal #payments-vibook
 *  4. Copiar Webhook URL → agregar como SLACK_BILLING_WEBHOOK_URL en Railway
 */

const WEBHOOK_URL = process.env.SLACK_BILLING_WEBHOOK_URL

interface BillingSlackPayload {
  event:
    | "PAYMENT_REJECTED"
    | "TRIAL_EXPIRED"
    | "SUBSCRIPTION_CANCELLED"
    | "RECONCILED"
    | "CRON_HEALTH"
    | "BILLING_ALERT"
  orgName: string
  orgId?: string
  details: string
  amount?: string
  severity?: "info" | "warning" | "error"
}

const EMOJI: Record<string, string> = {
  PAYMENT_REJECTED: "🔴",
  TRIAL_EXPIRED: "⏰",
  SUBSCRIPTION_CANCELLED: "❌",
  RECONCILED: "🔄",
  CRON_HEALTH: "🏥",
  BILLING_ALERT: "⚠️",
}

/**
 * Envía notificación de billing a #payments-vibook via Slack webhook.
 * Fire-and-forget: nunca lanza, siempre loggea errores.
 */
export async function notifyBillingSlack(payload: BillingSlackPayload): Promise<void> {
  if (!WEBHOOK_URL) {
    // Sin URL configurada → skip silencioso (no romper el flow principal)
    return
  }

  const emoji = EMOJI[payload.event] || "📋"
  const severity = payload.severity || "info"

  const text = [
    `${emoji} *${payload.event}* — ${payload.orgName}`,
    payload.amount ? `Monto: ${payload.amount}` : null,
    payload.details,
    payload.orgId ? `_org: ${payload.orgId}_` : null,
  ]
    .filter(Boolean)
    .join("\n")

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        // Unfurl links off para no hacer spam visual
        unfurl_links: false,
        unfurl_media: false,
      }),
    })

    if (!res.ok) {
      console.error(`[slack-notify] HTTP ${res.status}:`, await res.text().catch(() => ""))
    }
  } catch (err: any) {
    console.error("[slack-notify] fetch failed:", err?.message || err)
  }
}
