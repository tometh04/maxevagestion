---
paths:
  - "app/api/integrations/**"
  - "app/api/webhooks/**"
  - "app/api/cron/**"
  - "app/api/billing/mp-webhook/**"
  - "lib/integrations/**"
  - "lib/cron/**"
  - "lib/manychat/**"
  - "lib/whatsapp/**"
  - "lib/wha-control/**"
---

# Claude Rule: Integrations, Webhooks, And Crons

Use this rule for server-to-server integrations, public tokens, webhooks,
Railway cron endpoints, WhatsApp/Callbell/Manychat/Chatsell/Eve, and Mercado
Pago webhook handling.

## Modern Integration Pattern

- Resolve the tenant from server-side configuration: URL token,
  `org_integrations`, external reference, or signed payload. Never trust
  `org_id` from the body.
- Validate HMAC or equivalent secret when the integration supports it.
- Record inbound events and make processing idempotent.
- Use `createAdminClient()` only when there is no authenticated user and the org
  was resolved safely. Add allowlist justification when introducing a new use.
- Write every resulting row with the resolved `org_id`.
- Logs must help debugging without exposing tokens, secrets, bearer headers, or
  raw credentials.

## Legacy Routes

- `/api/webhooks/manychat` is legacy. Prefer
  `/api/integrations/manychat/[token]/webhook` for new work.
- Do not copy old static API-key patterns into new integrations.
- Trello is residual/legacy unless the user explicitly asks to work on Trello.

## Cron Rules

- All `/api/cron/*` endpoints must use `checkCronAuth(request, name)`.
- Crons are cross-tenant by design, but each insert/update must still preserve
  explicit `org_id` scope.
- Cron reruns must be safe: idempotent, bounded, and diagnosable.

## Testing Guidance

- Cover token lookup, invalid signature/token, duplicate event, tenant scope,
  and happy path.
- For webhook changes, prefer route-level tests or domain handler tests with raw
  body/HMAC fixtures.
