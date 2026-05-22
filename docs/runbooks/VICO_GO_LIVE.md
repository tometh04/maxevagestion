# Runbook — VICO Travel Group go-live (llave en mano, Tomi hace todo)

> **Contexto**: VICO contrató Vibook. Le vendimos un producto **llave en mano**: nosotros armamos toda la integración (bot ManyChat + Callbell ↔ Vibook). VICO solamente recibe credenciales del primer user en Vibook y empieza a usarlo. No tocan SQL, ni Railway, ni env vars, ni Supabase, ni nada técnico.
>
> **Lo que ellos ya hicieron** (cerrado en el cuestionario):
> - Pasaron el API token de Callbell de VICO.
> - Pasaron los 8 emails de su equipo.
> - Designaron a Enzo como referente técnico (solo para coordinación, no toca infra).
> - Van a darnos acceso de admin a Meta Business cuando lo pidamos.

## Pre-requisitos antes de arrancar este runbook

- [ ] Branch `feature/vico-callbell` mergeada a `main` y deployed en Railway (`app.vibook.ai`).
- [ ] Las 2 migrations ya aplicadas en prod (✅ ya está hecho).
- [ ] `WEBHOOK_SECRET_ENCRYPTION_KEY` configurada en Railway env vars (32 bytes hex). Generar con `openssl rand -hex 32`. Una vez seteada, NO rotarla sin re-encriptar las filas existentes de `org_integrations`.
- [ ] El **API token de Callbell** de VICO guardado en tu password manager (ya lo tenés del cuestionario).
- [ ] Estás logueado en Callbell de VICO como admin (te invitaron).

---

## Paso 1 — Crear la organización VICO + el primer user (vos en SQL)

VICO no se va a hacer signup. Vos creás la org directamente con SQL, después creás el user owner y le pasás la password generada.

En Supabase prod (`pmqvplyyxiobkllapgjp`), SQL Editor:

```sql
-- ⚠️ Reemplazá <RANDOM_SLUG> con algo como 'vico-travel' si está libre.

-- 1. Crear la org
INSERT INTO organizations (name, slug, plan, subscription_status, max_users, max_agencies)
VALUES ('VICO Travel Group', 'vico-travel', 'PRO', 'ACTIVE', 10, 1)
RETURNING id;
-- 👉 Anotá el id que devuelve. Es <VICO_ORG_ID> para los pasos siguientes.

-- 2. Crear la primera agencia (las vendedoras laburan asignadas a una agency)
INSERT INTO agencies (org_id, name, city, timezone)
VALUES ('<VICO_ORG_ID>', 'VICO Travel Group', 'Buenos Aires', 'America/Argentina/Buenos_Aires')
RETURNING id;
-- 👉 Anotá el id. Es <VICO_AGENCY_ID>.

-- 3. Crear el user owner (Enzo, el referente técnico)
-- IMPORTANTE: la password aquí va a ser temporal. Enzo la cambia en el primer login.
-- Generá una password fuerte con `openssl rand -base64 16` y guardala para pasársela.
```

**Para el user owner**, no insertes directo en `auth.users` (Supabase Auth lo maneja con su propia API). Usá la admin API:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsx -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // 1. Crear auth user con password temporal
  const tempPassword = 'CAMBIAR_ESTO_' + Math.random().toString(36).slice(2, 10);
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: 'e.maineri@vicotravelgroup.com',
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: 'Enzo Maineri' }
  });
  if (authErr) { console.error(authErr); return; }

  console.log('AUTH USER ID:', authUser.user.id);
  console.log('TEMP PASSWORD (pasársela a Enzo):', tempPassword);

  // 2. Crear fila en public.users vinculada
  const { data: appUser, error: appErr } = await admin
    .from('users')
    .insert({
      auth_id: authUser.user.id,
      email: 'e.maineri@vicotravelgroup.com',
      name: 'Enzo Maineri',
      role: 'ORG_OWNER',
      org_id: '<VICO_ORG_ID>',
      is_active: true
    })
    .select('id')
    .single();
  if (appErr) { console.error(appErr); return; }

  console.log('APP USER ID:', appUser.id);
  console.log('LOGIN URL: https://app.vibook.ai/login');
  console.log('LOGIN EMAIL: e.maineri@vicotravelgroup.com');
  console.log('LOGIN PASSWORD: ' + tempPassword);
})();
"
```

Guardá la temp password en tu password manager y pasásela a Enzo por canal seguro (WhatsApp directo, no por mail con copia). El sistema le va a obligar a cambiarla en el primer login (o agregar la lógica si todavía no está — chequear).

**Resto de los users** (las otras 9 personas del cuestionario): lo mismo, pero con `role` distinto:

| Email | Nombre | Role |
|---|---|---|
| ae.ibarra@vicotravelgroup.com | Aldana Estefania Ibarra | SELLER |
| d.araujo@vicotravelgroup.com | Daniela Araujo | SELLER |
| e.laporte@vicotravelgroup.com | Emilia Laporte | SELLER |
| l.marchiori.vtg@gmail.com | Luz Marchiori | SELLER |
| J.ahumada.vtg@gmail.com | Julieta Ahumada | SELLER |
| a.sanchez.vtg@gmail.com | Aldana Sanchez | SELLER |
| f.gudino@vicotravelgroup.com | Florencia Gudiño | SELLER (posventa, mismo role por ahora) |
| m.cassano@vicotravelgroup.com | Manuela Cassano | CONTABLE |
| a.lagos@vicotravelgroup.com | Andres Lagos | ADMIN |

Generá password única por user, guardalas en tu password manager con nota "VICO - <nombre> - temp pwd", y pasásela individualmente. Cada uno cambia la suya en el primer login.

Asociá cada user a la agency con:
```sql
INSERT INTO user_agencies (user_id, agency_id)
SELECT u.id, '<VICO_AGENCY_ID>'
FROM users u
WHERE u.org_id = '<VICO_ORG_ID>';
```

---

## Paso 2 — Activar advanced CRM mode + seed (vos)

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
VICO_ORG_ID='<VICO_ORG_ID>' npx tsx scripts/seed-vico.ts
```

Output esperado:
```
📋 Verificando que la org <UUID> exista...
   Org: "VICO Travel Group" (crm_mode actual: legacy)
🌱 Aplicando seed (idempotente)...
📊 Verificando counts...
   { "categories": 4, "tags": 60, "funnels": 7, "crm_mode": "advanced", "org_name": "VICO Travel Group" }
✅ VICO seed complete. crm_mode='advanced'. Tags y funnels listos.
```

Después de esto, cuando los users de VICO entren a `app.vibook.ai/sales/crm-manychat` van a ver **el kanban estilo Callbell** con sus tags y funnels. Vacío al principio, se va a llenar cuando empiece a entrar mensajes.

---

## Paso 3 — Configurar `org_integrations` con tokens (vos en SQL)

VICO ya pasó el API token de Callbell. Vos encriptás los secrets y los pegás:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsx -e "
require('dotenv').config({ path: '.env.local' });
const { encryptSecret } = require('./lib/integrations/secrets.ts');
const crypto = require('crypto');

// Secrets que VOS elegís (no VICO):
const manychatHmacSecret = crypto.randomBytes(32).toString('hex');  // para HMAC del bot
const callbellHmacSecret = crypto.randomBytes(32).toString('hex');  // para HMAC del webhook entrante

// El API token de Callbell ya lo tenés del cuestionario:
const callbellApiToken = 'PEGA-AQUI-EL-API-TOKEN-DE-CALLBELL-DE-VICO';

// Tokens públicos que van en la URL de los webhooks (no son secretos, son IDs):
const manychatUrlToken = crypto.randomBytes(16).toString('hex');
const callbellUrlToken = crypto.randomBytes(16).toString('hex');

console.log('=== Tokens públicos (van en URLs) ===');
console.log('MANYCHAT_URL_TOKEN:', manychatUrlToken);
console.log('CALLBELL_URL_TOKEN:', callbellUrlToken);
console.log('');
console.log('=== HMAC secrets en plaintext (anotalos para configurar bot + Callbell) ===');
console.log('MANYCHAT_HMAC_SECRET:', manychatHmacSecret);
console.log('CALLBELL_HMAC_SECRET:', callbellHmacSecret);
console.log('');
console.log('=== Encrypted values (pegar en SQL) ===');
console.log('ENCRYPTED_MANYCHAT_SECRET:', encryptSecret(manychatHmacSecret));
console.log('ENCRYPTED_CALLBELL_HMAC_SECRET:', encryptSecret(callbellHmacSecret));
console.log('ENCRYPTED_CALLBELL_API_TOKEN:', encryptSecret(callbellApiToken));
"
```

Después en SQL Editor:

```sql
INSERT INTO org_integrations
  (org_id, integration, webhook_token, webhook_secret, is_active, config)
VALUES
  ('<VICO_ORG_ID>', 'manychat',
    '<MANYCHAT_URL_TOKEN>', '<ENCRYPTED_MANYCHAT_SECRET>', true, '{}'::jsonb),
  ('<VICO_ORG_ID>', 'callbell-in',
    '<CALLBELL_URL_TOKEN>', '<ENCRYPTED_CALLBELL_HMAC_SECRET>', true, '{}'::jsonb),
  ('<VICO_ORG_ID>', 'callbell-out',
    'unused', '<ENCRYPTED_CALLBELL_API_TOKEN>', true, '{}'::jsonb);
```

---

## Paso 4 — Armar el bot ManyChat (vos)

VICO no tiene cuenta ManyChat (confirmado en cuestionario). Lo creás vos:

1. Crear cuenta ManyChat (la podés poner a nombre de Vibook Services o a tu nombre y compartirla con VICO admin después).
2. Conectar la cuenta de WhatsApp Business de VICO. Para esto, pedirle a Enzo que te dé acceso de admin temporal a la **Meta Business** de VICO (ya está confirmado en el cuestionario que lo van a hacer cuando avises).
3. Armar el flow del bot replicando el primer mensaje que VICO usa hoy:
   ```
   Hola, soy el asistente virtual de Vico Travel Group 😊
   Estoy acá para ayudarte.

   Para que la conversación sea más eficiente, por favor comunicate solo por texto, evitando audios o imágenes.
   ¿En qué puedo ayudarte hoy?

   1️⃣ Quiero viajar ✈️
   2️⃣ Ya tengo mi viaje con VICO y quiero hacer una consulta 📋
   3️⃣ Estoy en viaje y tengo un problema ⚠️
   4️⃣ Quiero info del Mundial 🏆
   5️⃣ Quiero info del paquete F1 🏎️🏁
   ```
4. Solo en opciones 1, 4, 5 → preguntas de calificación (ver `VICO_CALLBELL_INTEGRATION.md` sección 5.2 para el set MVP).
5. Al final del flow, dos external requests en paralelo:

   **Webhook 1 — A Vibook**
   - URL: `https://app.vibook.ai/api/integrations/manychat/<MANYCHAT_URL_TOKEN>/webhook`
   - Method: POST
   - Headers:
     - `Content-Type: application/json`
     - `X-Vibook-Signature`: ManyChat tiene un step "HMAC Sign" en webhooks pagos; si tu plan no lo soporta, usá un proxy intermedio. Alternativa: empezar sin HMAC en MVP y agregar después (TODO en código — verificar si el endpoint acepta una cabecera de auth alternativa o desactivar la validación temporalmente).
   - Body (JSON con custom fields del bot):
     ```json
     {
       "name": "{{user_full_name}}",
       "phone": "{{phone_number}}",
       "email": "{{email}}",
       "destination_text": "{{destino}}",
       "travel_month": "{{mes_viaje}}",
       "campaign_source": "{{utm_source}}",
       "manychat_user_id": "{{user_id}}",
       "notes": "Pasajeros: {{pasajeros}}, Presupuesto: {{presupuesto}}, Salida: {{ciudad_salida}}, Fechas: {{fechas_tentativas}}"
     }
     ```

   **Webhook 2 — A Callbell** (crear contacto en su CRM)
   - URL del API de Callbell para crear contacto. **Verificar contra https://dev.callbell.eu/** los endpoints exactos antes de configurar (TODO marker en código).
   - Auth: `Authorization: Bearer <API_TOKEN_CALLBELL_DE_VICO>` (lo tenés en tu password manager).
   - Body: name + phone + tags iniciales + funnel "PRIMER CONTACTO".

---

## Paso 5 — Configurar webhook outbound en Callbell (vos, con tu acceso de admin)

En Callbell de VICO (entrando como admin), Configuración → Webhooks:

- URL: `https://app.vibook.ai/api/integrations/callbell-in/<CALLBELL_URL_TOKEN>/webhook`
- Eventos a suscribir:
  - `funnel_changed`
  - `tag_added`
  - `tag_removed`
  - `agent_assigned`
  - `message_created` (opcional para mostrar último mensaje en card)
- Signing secret: pegá el `MANYCHAT_HMAC_SECRET` que generaste en el Paso 3 (Callbell lo va a usar para firmar el body, Vibook lo verifica con el secret encriptado en `org_integrations`).

⚠️ Aclaración: el nombre `MANYCHAT_HMAC_SECRET` es confuso — lo correcto es que **el secret que va en Callbell** es el `CALLBELL_HMAC_SECRET` del Paso 3.

---

## Paso 6 — Mapear UUIDs Callbell ↔ Vibook (vos, script one-off)

Sin esto, el sync entrante de cambios de funnel/tag NO va a aplicar. Cuando VICO tenga sus tags/funnels en Callbell con los mismos labels que el preset:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
VICO_ORG_ID='<VICO_ORG_ID>' npx tsx scripts/seed-callbell-mapping.ts
```

(Script todavía no implementado. Por ahora podés hacerlo manual via SQL Editor con queries tipo:)

```sql
-- Repetir para cada tag/funnel con el callbell_uuid real obtenido vía API
UPDATE lead_tags
SET callbell_tag_uuid = '<uuid-de-callbell-para-CANCUN>'
WHERE org_id = '<VICO_ORG_ID>' AND label = 'CANCUN';
```

Para el MVP funcional sin sync, podés omitir este paso — los leads van a entrar de todos modos, solo que cuando una vendedora cambie funnel en Callbell, Vibook no se entera hasta que el cron de reconcile corra (cada 30 min).

---

## Paso 7 — Crear Railway Cron Service (vos en Railway)

1. Railway dashboard → proyecto Vibook → New Service → Cron Service
2. Name: `vibook-callbell-reconcile`
3. Schedule: `*/30 * * * *`
4. Command:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.vibook.ai/api/cron/callbell-reconcile
   ```
5. Hereda `CRON_SECRET` del environment compartido.
6. Activar.

---

## Paso 8 — QA antes de entregar a VICO (vos)

Antes de avisarle a Enzo "ya está, entrá", mandá **5 mensajes de prueba** desde números tuyos al WhatsApp de VICO.

Para cada uno verificá:
1. Lead aparece en `app.vibook.ai/sales/crm-manychat` (loguéandote como user owner de VICO).
2. Contacto aparece en Callbell de VICO con tags + funnel inicial.
3. Cambiar funnel en Callbell de "PRIMER CONTACTO" → "COTIZANDO" → el kanban en Vibook se actualiza dentro de 30s (webhook) o de 30 min (cron).

Si hay errores, revisar `webhook_event_log`:

```sql
SELECT processed_at, integration, event_type, result, error_detail
FROM webhook_event_log
WHERE org_id = '<VICO_ORG_ID>'
ORDER BY processed_at DESC LIMIT 30;
```

---

## Paso 9 — Verificar Lozada intocado (vos, último check antes de entregar)

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npm test -- __tests__/isolation/advanced-mode-tenant-isolation.test.ts
```

Esperado: 9 pass.

Además, login como Maxi → `/sales/crm-manychat` → kanban legacy (list_name) idéntico al de siempre.

---

## Paso 10 — Entregar a VICO

Mandar mail a Enzo con las credenciales:

```
Subject: Vibook listo - tu acceso

Hola Enzo,

Listo el setup de Vibook para VICO Travel Group. Te dejo las credenciales:

URL: https://app.vibook.ai/login
Tu user: e.maineri@vicotravelgroup.com
Password temporal: <PEGAR_TEMP_PASSWORD_DEL_PASO_1>

Apenas entres te va a pedir que la cambies.

Los users del resto del equipo te los paso por WhatsApp para que cada uno
cambie la suya en el primer login.

El bot está conectado y los leads ya están entrando tanto a Callbell como
a Vibook. Probá entrando a Sales → CRM Manychat para ver el kanban estilo
Callbell con las etiquetas.

Cualquier cosa que veas rara escribime directo.
```

Después por WhatsApp pasale las temp passwords del resto del equipo.

---

## Rollback (si algo sale mal después de entregar)

### Soft: desactivar VICO sin tirar nada

```sql
UPDATE org_integrations SET is_active = false WHERE org_id = '<VICO_ORG_ID>';
UPDATE organizations SET crm_mode = 'legacy' WHERE id = '<VICO_ORG_ID>';
```

VICO vuelve a la UI legacy. Vibook deja de aceptar webhooks de su token. Cero impacto sobre Lozada.

### Duro: tirar el feature completo

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

Revertir el deploy de Railway al commit anterior. Lozada queda como antes.

---

## Resumen de qué hacés vos vs qué hace VICO

| Acción | Quién |
|---|---|
| Crear org y users en Supabase | **Vos** |
| Pasar passwords temporales a VICO | **Vos** |
| Activar advanced CRM mode + seed | **Vos** |
| Generar y guardar tokens | **Vos** |
| Configurar bot ManyChat (incluye conectar a Meta Business de VICO via acceso temporal) | **Vos** |
| Configurar webhook outbound en Callbell de VICO | **Vos** (con acceso admin que Enzo te dio) |
| Mapear UUIDs Callbell ↔ Vibook | **Vos** |
| Crear Railway Cron Service | **Vos** |
| QA con leads de prueba | **Vos** |
| Login con su user temporal y cambiar password | **VICO** |
| Usar Vibook como CRM | **VICO** |
| Reportar problemas / pedir cambios | **VICO** |

**Nada técnico cae del lado de VICO.** Llave en mano = llave en mano.
