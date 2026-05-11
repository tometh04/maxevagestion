# Runbook — VICO Travel Group go-live

> **Cuándo correr esto**: cuando VICO esté listo para arrancar a usar Vibook en paralelo a Callbell. Asume que las dos migrations (`20260508000001_advanced_crm_mode.sql` y `20260508000002_org_integrations.sql`) ya están aplicadas en prod (✅ done) y que el código de `feature/vico-callbell` está deployed a Railway.

## Pre-requisitos

- [ ] Branch `feature/vico-callbell` mergeada a `main` y deployed en Railway (`app.vibook.ai`).
- [ ] VICO completó signup en Vibook → tenés su `org_id`.
- [ ] Enzo (referente VICO) generó:
  - [ ] **API token Callbell** (Configuración → API → "Generate token") → guardalo en password manager
  - [ ] **Webhook secret Callbell** (lo usa Callbell para firmar los webhooks salientes a Vibook)
- [ ] `WEBHOOK_SECRET_ENCRYPTION_KEY` configurada en Railway env vars (32 bytes hex). Generar con `openssl rand -hex 32`. Una vez seteada, NO rotarla sin re-encriptar todas las filas existentes de `org_integrations`.

---

## Paso 1 — Generar tokens y filas en `org_integrations`

En Supabase prod (proyecto `pmqvplyyxiobkllapgjp`), SQL Editor:

```sql
-- ⚠️ Reemplazá:
--   <VICO_ORG_ID>           = UUID de la org de VICO en Vibook
--   <ENCRYPTED_MANYCHAT_SECRET>   = encrypted output de encryptSecret('<hmac-secret-elegido>')
--   <ENCRYPTED_CALLBELL_HMAC_SECRET> = encrypted output del webhook secret que da Callbell
--   <ENCRYPTED_CALLBELL_API_TOKEN>   = encrypted output del API token de Callbell

-- Los tokens (URL path) son UUIDs random — generar con: openssl rand -hex 16
-- Anotalos antes de pegarlos en ManyChat / Callbell dashboard.

INSERT INTO org_integrations
  (org_id, integration, webhook_token, webhook_secret, is_active, config)
VALUES
  ('<VICO_ORG_ID>', 'manychat',
    '<MANYCHAT_URL_TOKEN>', '<ENCRYPTED_MANYCHAT_SECRET>', true,
    '{"notes": "ManyChat bot de VICO Travel Group"}'::jsonb),
  ('<VICO_ORG_ID>', 'callbell-in',
    '<CALLBELL_URL_TOKEN>', '<ENCRYPTED_CALLBELL_HMAC_SECRET>', true,
    '{"notes": "Webhook outbound desde Callbell"}'::jsonb),
  ('<VICO_ORG_ID>', 'callbell-out',
    'unused', '<ENCRYPTED_CALLBELL_API_TOKEN>', true,
    '{"notes": "API token para cron de reconcile"}'::jsonb);

-- Verificación
SELECT integration, is_active, LEFT(webhook_token, 8) || '...' AS token_preview
FROM org_integrations WHERE org_id = '<VICO_ORG_ID>';
```

### Cómo generar los `<ENCRYPTED_*>` valores

Desde local con `WEBHOOK_SECRET_ENCRYPTION_KEY` cargada:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsx -e "
require('dotenv').config({ path: '.env.local' });
const { encryptSecret } = require('./lib/integrations/secrets.ts');
console.log('MANYCHAT_SECRET:', encryptSecret('TU-HMAC-SECRET-ELEGIDO-PARA-MANYCHAT'));
console.log('CALLBELL_HMAC_SECRET:', encryptSecret('SECRET-QUE-TE-DIO-CALLBELL'));
console.log('CALLBELL_API_TOKEN:', encryptSecret('API-TOKEN-DE-CALLBELL-DE-VICO'));
"
```

Pegar cada uno en el SQL respectivo, **nunca** committearlos.

---

## Paso 2 — Correr el seed

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
VICO_ORG_ID='<UUID-DE-VICO>' npx tsx scripts/seed-vico.ts
```

Output esperado:

```
📋 Verificando que la org <UUID> exista...
   Org: "VICO Travel Group" (crm_mode actual: legacy)
🌱 Aplicando seed (idempotente)...
📊 Verificando counts...
   {
     "categories": 4,
     "tags": 60,
     "funnels": 7,
     "crm_mode": "advanced",
     "org_name": "VICO Travel Group"
   }
✅ VICO seed complete. crm_mode='advanced'. Tags y funnels listos.
```

Si algún count no coincide, parar y revisar antes de seguir.

---

## Paso 3 — Mapear UUIDs Callbell ↔ Vibook

Cuando VICO ya tenga sus tags/funnels en Callbell con los mismos labels que el preset, asociamos los UUIDs para que el sync funcione. Para esto Tomi corre:

```bash
# (Script a armar cuando se confirme la API de Callbell.
# Por ahora se puede hacer manual: para cada tag/funnel en lead_tags / lead_funnels,
# UPDATE callbell_tag_uuid = '<uuid-callbell>' WHERE label = 'CANCUN' AND ...
# La API client tiene listTags() y listFunnels() pero el endpoint exacto
# debe verificarse contra https://dev.callbell.eu/ — TODO marker en api-client.ts)
```

**Si todavía no hay UUIDs mapeados**: los webhooks van a funcionar para crear leads (no necesita el mapeo), pero el sync entrante de funnel_changed / tag_added desde Callbell NO va a aplicar cambios. Mapeá los UUIDs antes de prender el sync.

---

## Paso 4 — Configurar el bot ManyChat de VICO

En ManyChat dashboard (Flow Builder del bot de VICO), al final del flow de calificación:

**Webhook 1 — A Vibook**
- URL: `https://app.vibook.ai/api/integrations/manychat/<MANYCHAT_URL_TOKEN>/webhook` (el token del Paso 1)
- Method: POST
- Headers:
  - `Content-Type: application/json`
  - `X-Vibook-Signature: <HMAC-SHA256(body, manychat_secret) en hex>` — usar HMAC nativo de ManyChat con el secret que elegiste

Body (JSON, mapeado a custom fields del bot):
```json
{
  "name": "{{user_first_name}} {{user_last_name}}",
  "phone": "{{phone_number}}",
  "email": "{{email}}",
  "destination_text": "{{destino}}",
  "travel_month": "{{mes_viaje}}",
  "campaign_source": "{{utm_source}}",
  "manychat_user_id": "{{user_id}}",
  "notes": "Pasajeros: {{pasajeros}}, Presupuesto: {{presupuesto}}, Salida: {{ciudad_salida}}, Fechas: {{fechas_tentativas}}"
}
```

**Webhook 2 — A Callbell**
- Mismo flow, segundo external request en paralelo.
- URL: Callbell `/contacts` o `/messages` endpoint según docs reales de Callbell.
- Auth: Bearer con el API token de Callbell de VICO.
- Body: contacto con tags + funnel inicial.

⚠️ Confirmar contra `https://dev.callbell.eu/` los endpoints exactos antes de configurar.

---

## Paso 5 — Configurar webhook outbound en Callbell

En Callbell dashboard (Configuración → Webhooks → New webhook):

- URL: `https://app.vibook.ai/api/integrations/callbell-in/<CALLBELL_URL_TOKEN>/webhook` (el token del Paso 1)
- Eventos a suscribir:
  - `funnel_changed` (cambio de etapa)
  - `tag_added`
  - `tag_removed`
  - `agent_assigned`
  - `message_created` (opcional, para mostrar último mensaje en card)
- Signing secret: el que ya pasaron a Vibook en el Paso 1 (encriptado en `org_integrations.webhook_secret`).

---

## Paso 6 — Crear Railway Cron Service

En Railway dashboard del proyecto Vibook:

1. New Service → Cron Service
2. Name: `vibook-callbell-reconcile`
3. Schedule: `*/30 * * * *` (cada 30 min)
4. Command:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://app.vibook.ai/api/cron/callbell-reconcile
   ```
5. Env vars: hereda `CRON_SECRET` del environment compartido del proyecto.
6. Activar.

Verificación post-deploy: revisar logs del cron service en la primera corrida (~30 min después de activarlo). Esperado:
```json
{"success": true, "duration_ms": 1234, "orgs_processed": 1, "events_applied": 0}
```

(0 eventos esperado al principio. Cuando empiecen a haber leads moviéndose en Callbell, va a haber events_applied > 0.)

---

## Paso 7 — QA con 5 leads reales

Manda 5 mensajes de prueba al WhatsApp de VICO desde números distintos. Para cada uno:

1. Verificar que el lead aparece en Vibook → `/sales/crm-manychat` (debería ver el kanban advanced con tags).
2. Verificar que el contacto aparece en Callbell → con tags + funnel inicial.
3. En Callbell, mover el lead a "COTIZANDO".
4. Confirmar que dentro de 30 segundos (webhook) Vibook actualiza la columna en su kanban.
5. Si no aparece en 30s, esperar al cron (max 30 min) o verificar `webhook_event_log`:
   ```sql
   SELECT processed_at, event_type, result, error_detail
   FROM webhook_event_log
   WHERE org_id = '<VICO_ORG_ID>' AND integration = 'callbell-in'
   ORDER BY processed_at DESC LIMIT 20;
   ```

---

## Paso 8 — Verificar que Lozada sigue idéntico

1. Login como Maxi en `app.vibook.ai`.
2. Ir a `/sales/crm-manychat` → debería verse exactamente igual que antes del rollout (kanban legacy con list_name).
3. Mandar un evento de prueba al webhook de Trello viejo (no se toca) — verificar que crea lead.
4. Correr los tests de no-regresión:
   ```bash
   cd /Users/tomiisanchezz/Desktop/Repos/erplozada
   npm test -- __tests__/isolation/advanced-mode-tenant-isolation.test.ts
   ```
   Esperado: 9 pass.

---

## Rollback (si algo sale mal)

### Si querés desactivar VICO sin tirar abajo nada:

```sql
UPDATE org_integrations SET is_active = false WHERE org_id = '<VICO_ORG_ID>';
UPDATE organizations SET crm_mode = 'legacy' WHERE id = '<VICO_ORG_ID>';
```

VICO vuelve a la UI legacy (que no van a usar porque siguen con Callbell). Vibook deja de aceptar webhooks de su token. Cero impacto sobre Lozada.

### Si querés tirar abajo el feature completo:

```sql
DROP TABLE org_integrations CASCADE;
DROP TABLE webhook_event_log CASCADE;
ALTER TABLE leads DROP COLUMN funnel_id;
DROP TABLE lead_tag_assignments CASCADE;
DROP TABLE lead_tags CASCADE;
DROP TABLE lead_tag_categories CASCADE;
DROP TABLE lead_funnels CASCADE;
ALTER TABLE organizations DROP COLUMN crm_mode;
ALTER TABLE organizations DROP COLUMN last_callbell_sync_at;
```

Después revertir el deploy de Railway al commit anterior a `feature/vico-callbell`. Tiempo total: ~5 min. Lozada queda como antes.

---

## Contactos / Referencias

- Referente técnico VICO: Enzo Maineri (`e.maineri@vicotravelgroup.com`)
- Spec técnico: `docs/superpowers/specs/2026-04-20-callbell-crm-integration-design.md`
- Doc maestro: `VICO_CALLBELL_INTEGRATION.md`
- Plan de implementación: `docs/superpowers/plans/2026-05-04-vico-callbell-integration.md`
- Cuestionario respondido (PDF): `~/Downloads/Cuestionario Vico Travel.pdf`
- Instructivo interno VICO Callbell (PDF): `~/Downloads/INSTRUCTIVO USO DE CALLBELL Vico.pdf`
