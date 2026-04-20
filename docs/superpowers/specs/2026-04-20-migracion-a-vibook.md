# Migración MAXEVA → Vibook

**Fecha**: 2026-04-20
**Estado**: Planificación (no ejecutar todavía)
**Decisión pendiente**: arrancamos cuando Tomi dé OK. Riesgos ya aceptados, secuencia ya definida.

---

## Objetivo

Migrar el ERP de `www.maxevagestion.com` a `app.vibook.ai` y la landing de `landing.vibook.ai` a `vibook.ai` (apex). El dominio `maxevagestion.com` queda redirigiendo 301 mínimo 6 meses y después se retira.

## TL;DR de la estrategia

- **Redirect 301 SÍ salva** el tráfico de usuarios (browsers, bookmarks, emails históricos con links).
- **Redirect 301 NO salva** los webhooks externos (Trello, MP, Manychat) — esos hay que updatear en origen.
- Por eso la migración es en **3 fases paralelas**, sin downtime: setup nuevo en paralelo → actualizar integraciones con tiempo → flip + redirect.

---

## Fase 1 — Setup paralelo (1 día, cero riesgo)

Todo sin tocar lo actual, el ERP sigue en `maxevagestion.com`.

### DNS (Cloudflare)
- `vibook.ai` (apex) → A record `76.76.21.21` (Vercel) o CNAME a cname.vercel-dns.com.
- `app.vibook.ai` → CNAME cname.vercel-dns.com.
- `www.vibook.ai` → redirect a apex.
- Mantener CF proxy activo (naranja) en SSL mode **Full (Strict)**.

### Resend (crítico para no mandar emails a spam)
Antes de cambiar el sender de emails, preparar DNS:
- DKIM: records CNAME que te da Resend al agregar el dominio.
- SPF: TXT `v=spf1 include:_spf.resend.com ~all`.
- DMARC: TXT `v=DMARC1; p=none; rua=mailto:postmaster@vibook.ai`.
- Después: agregar dominio `vibook.ai` en Resend dashboard y verificar.

### Vercel
- Proyecto ERP: Settings → Domains → Add `app.vibook.ai`.
- Proyecto landing: Settings → Domains → Add `vibook.ai` y `www.vibook.ai`.
- Esperar SSL (minutos).
- **No cambiar primary domain todavía**.

Al terminar Fase 1: los 2 dominios sirven contenido en paralelo, nada roto.

---

## Fase 2 — Actualizar integraciones externas (2-3 días)

### 2a. Supabase Auth (crítico)
**Dashboard → Authentication → URL Configuration**:
- Site URL: `https://www.maxevagestion.com` → `https://app.vibook.ai`.
- Redirect URLs allowlist: agregar `https://app.vibook.ai/**` y `https://*.vercel.app/**`.

Sin esto: password reset, signup verification, magic links rotos.

### 2b. MercadoPago (crítico)
**Dashboard MP → Tus integraciones → Webhooks**:
- Update URL a `https://app.vibook.ai/api/webhooks/mercadopago`.
- **Preapprovals existentes** siguen apuntando al URL viejo (MP lo guardó al crear la suscripción). Por eso el dominio viejo tiene que quedar activo con redirect mínimo 6 meses.

### 2c. Trello (crítico para prod de Lozada)
Re-registrar webhooks con la URL nueva para cada board/agencia. Scripts existen:
- `scripts/register-trello-webhook-production.ts`
- `scripts/fix-trello-webhook.ts`
- `scripts/fix-trello-webhook-madero.ts`
- `scripts/register-webhook-rosario.ts`

Pasarles `https://app.vibook.ai` como arg.

Sin esto: leads de ads dejan de llegar al CRM.

### 2d. Manychat (si aplica al tenant)
Dashboard Manychat → Automation → Integration → Webhook URL → actualizar.

### 2e. Vercel env vars
En Production, Preview, Development:
- `NEXT_PUBLIC_APP_URL=https://app.vibook.ai`
- `RESEND_FROM_EMAIL=noreply@vibook.ai`
- `VAPID_EMAIL=mailto:hola@vibook.ai`

### 2f. Código: limpiar hardcodes `maxevagestion.com`

| Archivo | Qué es |
|---------|--------|
| `app/paywall/page.tsx:79` | mailto `hola@maxevagestion.com` → `hola@vibook.ai` |
| `lib/email/email-service.ts:92` | Resend from → env var |
| `lib/push.ts:12` | VAPID email → env var |
| `app/api/emilia/chat/route.ts:131-132` | User-Agent + Origin headers → env var |
| `app/api/billing/checkout/route.ts:45` | backUrl fallback (ya lee env, solo cambiar fallback) |
| `scripts/setup-madero-complete.ts:152` | Trello webhook URL → env var |
| `scripts/trello-restore-integration.ts:26` | idem |
| `scripts/register-webhook-rosario.ts:21` | idem |
| `scripts/fix-trello-webhook.ts:110` | idem |
| `scripts/fix-trello-webhook-madero.ts:111` | idem |
| `scripts/trello-health-check.ts:225` | idem |
| `docs/TECHNICAL_DOCUMENTATION.md` | URL en docs (cosmético) |
| `docs/trello/ESTADO_ACTUAL.md` | URLs en docs (cosmético) |

Patrón recomendado: `process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"`.

### 2g. Emilia/Vibook API
`app/api/emilia/chat/route.ts` manda `User-Agent` + `Origin` con el dominio. Si la API whitelistea por Origin, pueden bloquear. **Coordinar con el equipo de Emilia** antes del switch (o confirmar que no whitelistean).

### 2h. Smoke test antes de flippear
Desde `app.vibook.ai` (todavía no primary):
- Login, signup, AFIP setup, MP checkout end-to-end, Trello (crear card de prueba y ver que llegue el webhook), email de password reset.

---

## Fase 3 — Flip + redirect (1 día)

1. Vercel proyecto ERP: Settings → Domains → set `app.vibook.ai` como Primary.
2. Agregar redirect 301 de `maxevagestion.com/*` → `app.vibook.ai/*`. En `vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "(www\\.)?maxevagestion\\.com" }],
      "destination": "https://app.vibook.ai/$1",
      "permanent": true
    }
  ]
}
```

3. Avisar por email a los usuarios activos (Maxi, LOLO): "ahora entramos por app.vibook.ai, el viejo redirige automático".

---

## Fase 4 — Cleanup (a los 6 meses)

- Verificar analytics: tráfico a `maxevagestion.com` debe ser <1%.
- Droppear `maxevagestion.com` del proyecto Vercel.
- Cloudflare: apagar DNS del dominio viejo o dejarlo apuntando a página genérica "Nos mudamos a vibook.ai".

---

## Tabla de riesgos

| # | Riesgo | Severidad | Mitigación |
|---|--------|-----------|------------|
| 1 | Trello webhooks mueren → ads Lozada sin leads | 🔴 ALTO | Re-registrar webhooks en Fase 2 antes de flippear |
| 2 | Supabase Site URL mismatch → auth emails rotos | 🔴 ALTO | Update en Fase 2, tarda 30 segundos |
| 3 | MP webhooks de subs existentes al viejo URL | 🟠 MEDIO | Mantener dominio viejo activo 6 meses con redirect |
| 4 | Resend DKIM/SPF roto → emails a spam | 🟠 MEDIO | DNS configurado en Fase 1 antes de switchear |
| 5 | Emilia API bloquea por Origin | 🟠 MEDIO | Coordinar con Emilia antes del switch |
| 6 | Sesiones invalidadas (cookie domain change) | 🟢 BAJO | Todos re-logean una vez |
| 7 | Links históricos a clientes finales | 🟢 BAJO | Redirect 301 los salva (GET requests) |
| 8 | SEO loss en maxevagestion.com | 🟢 BAJO | ERP privado, sin tráfico SEO relevante |

---

## Requisitos para arrancar

Confirmar:
- [ ] Tomi tiene control del dominio `vibook.ai` en Cloudflare.
- [ ] Cuenta Resend accesible, podemos agregar dominio.
- [ ] Nombre exacto del proyecto Vercel que hostea el ERP hoy.
- [ ] Acceso a Supabase dashboard del proyecto `pmqvplyyxiobkllapgjp`.
- [ ] Acceso al MercadoPago dashboard (la cuenta que creó las preapprovals).
- [ ] Acceso a Trello (API key + token de cada board).
- [ ] (Opcional) acceso al Manychat si alguna agencia lo usa.

---

## Downtime esperado

**Cero**. La clave es que las 3 fases corren sin tocar el dominio viejo hasta el momento del flip, y el flip mismo no requiere que nadie esté mirando porque ambos dominios sirven lo mismo durante la transición.
