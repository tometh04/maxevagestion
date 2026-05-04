# Spec — Integración Callbell + ManyChat + Vibook (modo `advanced`)

**Fecha inicial**: 2026-04-20
**Última actualización**: 2026-05-04
**Estado**: ✅ Diseño cerrado. Listo para pasar a writing-plans.
**Cliente piloto**: VICO Travel Group.
**Doc maestro**: `/Users/tomiisanchezz/Desktop/Repos/erplozada/VICO_CALLBELL_INTEGRATION.md`

> Este spec es el documento técnico detallado. El doc maestro (link arriba) tiene el contexto de negocio, las garantías a Lozada y el roadmap. Acá está todo lo que un dev necesita para implementar.

---

## 1. Resumen ejecutivo

Construir un nuevo **modo `crm_mode = 'advanced'`** en Vibook que soporta tags multi-categoría y funnels custom por tenant, configurable per-org. Se activa para VICO. Lozada y todos los demás tenants quedan en `crm_mode = 'legacy'` y no perciben cambios.

El bot ManyChat de VICO dispara dos webhooks paralelos al recibir un lead — uno a Vibook, otro a Callbell. Vibook escucha cambios desde Callbell vía webhook entrante + cron de reconciliación cada 30 min. El push inverso (Vibook → Callbell) queda fuera del MVP.

---

## 2. Decisiones cerradas

### 2.1 Modelo `crm_mode` por tenant

Columna nueva `organizations.crm_mode TEXT NOT NULL DEFAULT 'legacy' CHECK IN ('legacy', 'advanced')`.

- **`legacy`**: comportamiento actual. `leads.status` enum + `region` + `destination` texto libre. Default para todos los tenants existentes.
- **`advanced`**: usa `lead_funnels` + `lead_tag_*`. Las queries del modo legacy ignoran las tablas nuevas. VICO se setea explícitamente en este modo.

Lozada queda en `legacy`. La UI distingue qué renderizar leyendo `org.crm_mode` desde el contexto.

### 2.2 Tags multi-categoría con cardinality variable

Cuatro categorías para VICO (configurables por tenant):

| Categoría | Cardinality | Color | Ejemplos |
|---|---|---|---|
| temperatura | `one` | red | CALIENTE, TEMPLADO, FRIO |
| destino | `many` | green | PUNTA CANA, BARILOCHE, MUNDIAL, F1, EUROPA, etc. |
| mes | `one` | purple | ENERO–DICIEMBRE |
| origen | `one` | orange | PUBLICIDAD, REFERIDO, etc. |

Confirmado por VICO que los destinos pueden ser **múltiples por lead** (ej. cliente que duda entre PUNTA CANA y CANCUN tiene ambas tags hasta cerrar venta).

### 2.3 Funnels custom por tenant

Tabla `lead_funnels` con orden y colores configurables. VICO arranca con sus 7 funnels seedeados:
PRIMER CONTACTO (default new) → COTIZANDO → SEGUIMIENTO → VENDIDO/NO VENDIDO (terminales) + EN VIAJE + CLIENTE VICO (posventa).

Columna nueva `leads.funnel_id UUID NULL REFERENCES lead_funnels(id)`. Solo se llena en modo `advanced`. En modo `legacy` queda NULL siempre.

### 2.4 Arquitectura de webhooks: 2 paralelos desde ManyChat

```
ManyChat ──┬──→ POST /api/integrations/manychat/{token}/webhook    (Vibook)
           └──→ POST a Callbell API                                  (Callbell)
```

Cada destino mapea la data a su modelo. Independientes. Si uno falla, el otro entra. Se descartó la opción de relay (Vibook → Callbell) en favor de esta porque ManyChat soporta múltiples actions consecutivas en el mismo flow.

### 2.5 Sync Callbell → Vibook: híbrido (webhook + cron)

**Webhook entrante** desde Callbell para cambios en tiempo real:
- Cambio de funnel
- Tag agregada/quitada
- Asignación o cambio de agente
- Mensaje nuevo del cliente (opcional, para mostrar último mensaje en card)

Endpoint: `POST /api/integrations/callbell-in/{token}/webhook`. Misma estructura de validación que Trello (HMAC + lookup token).

**Cron de reconciliación** cada 30 min: `POST /api/cron/callbell-reconcile`.
- Llama API de Callbell con `last_synced_at` de cada tenant en modo advanced.
- Hace diff entre estado Callbell y estado Vibook.
- Reconcilia diferencias (escribe solo donde Callbell tiene data más nueva).
- Patrón: Railway Cron Service con Bearer auth (igual que crons existentes).

### 2.6 Sync Vibook → Callbell: NO en MVP

Las acciones del usuario en Vibook NO se replican a Callbell. Documentado como deuda técnica explícita en el doc maestro como Fase 2.

### 2.7 Auto-provisioning en signup (genérico)

`POST /api/onboarding/route.ts` ya crea filas en `integration_webhooks` para todas las integraciones soportadas con `is_active = false`. Cuando un tenant pide modo `advanced`, se activan las que correspondan (en VICO: `manychat` + `callbell-in` + `callbell-out`).

### 2.8 Tags creadas dinámicamente

VICO crea tags al vuelo en Callbell cuando aparece un destino nuevo. Vibook **no las crea automáticamente** — solo guarda la `destination_text` que mandó el bot tal cual y la vendedora decide si la promueve a tag oficial. Razón: evitar contaminación del namespace de tags por typos del cliente.

Sub-decisión técnica: el cron de reconciliación detecta tags nuevas creadas en Callbell y las inserta en `lead_tags` de Vibook automáticamente (mapeando por UUID).

### 2.9 Asignación de vendedoras: Callbell la maneja

VICO ya configuró asignación automática y proporcional en Callbell entre las 3 vendedoras fijas + Team Leader que reparte a freelancers. Vibook NO arma lógica de asignación — solo escucha el evento `agent_assigned` desde Callbell y mapea a `users.id` de Vibook por email.

### 2.10 Bot tiene 5 rutas iniciales

Solo las opciones 1, 4, 5 del menú inicial generan lead nuevo en Vibook. Las opciones 2 (consulta de cliente con viaje activo) y 3 (urgencia en destino) son operativas internas de Callbell y no nos involucran.

### 2.11 Seed inicial para tenant en modo advanced

Función `lib/crm-presets/seed-advanced-mode.ts` que recibe `org_id` y puebla:
- 4 categorías default (temperatura, destino, mes, origen)
- Tags iniciales por categoría (lista en doc maestro sección 6.2)
- 7 funnels iniciales con orden y colores
- Pone `organizations.crm_mode = 'advanced'`

Después se corre `scripts/seed-callbell-mapping.ts` que:
- Fetch tags y funnels reales de Callbell del tenant
- Hace match por `label` con nuestros records
- Setea `callbell_tag_uuid` y `callbell_funnel_uuid`

Todo en una transacción. Loggea `CRM_MODE_CHANGED` en `security_audit_log`.

---

## 3. Schema completo

### 3.1 Migration

```sql
-- Migration: vico_advanced_crm_mode

-- 1. Columna en organizations
ALTER TABLE organizations
  ADD COLUMN crm_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK (crm_mode IN ('legacy', 'advanced'));

-- 2. Tabla lead_tag_categories
CREATE TABLE lead_tag_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL,
  cardinality     TEXT NOT NULL CHECK (cardinality IN ('one', 'many')),
  display_order   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);
CREATE INDEX idx_lead_tag_categories_org ON lead_tag_categories(org_id);
ALTER TABLE lead_tag_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lead_tag_categories USING (org_id IN (SELECT user_org_ids()));

-- 3. Tabla lead_tags
CREATE TABLE lead_tags (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id         UUID NOT NULL REFERENCES lead_tag_categories(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  color_override      TEXT,
  display_order       INT NOT NULL DEFAULT 0,
  callbell_tag_uuid   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, label)
);
CREATE INDEX idx_lead_tags_org ON lead_tags(org_id);
CREATE INDEX idx_lead_tags_category ON lead_tags(category_id);
CREATE INDEX idx_lead_tags_callbell_uuid ON lead_tags(callbell_tag_uuid) WHERE callbell_tag_uuid IS NOT NULL;
ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lead_tags USING (org_id IN (SELECT user_org_ids()));

-- 4. Tabla lead_tag_assignments
CREATE TABLE lead_tag_assignments (
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id          UUID NOT NULL REFERENCES lead_tags(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by     UUID REFERENCES users(id),
  PRIMARY KEY (lead_id, tag_id)
);
CREATE INDEX idx_lead_tag_assignments_lead ON lead_tag_assignments(lead_id);
CREATE INDEX idx_lead_tag_assignments_org ON lead_tag_assignments(org_id);
ALTER TABLE lead_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lead_tag_assignments USING (org_id IN (SELECT user_org_ids()));

-- 5. Tabla lead_funnels
CREATE TABLE lead_funnels (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  display_order           INT NOT NULL,
  color                   TEXT,
  is_terminal             BOOLEAN NOT NULL DEFAULT FALSE,
  is_default_new          BOOLEAN NOT NULL DEFAULT FALSE,
  callbell_funnel_uuid    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);
CREATE INDEX idx_lead_funnels_org ON lead_funnels(org_id);
CREATE UNIQUE INDEX idx_lead_funnels_one_default ON lead_funnels(org_id) WHERE is_default_new = TRUE;
ALTER TABLE lead_funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lead_funnels USING (org_id IN (SELECT user_org_ids()));

-- 6. Columna funnel_id en leads (nullable, solo para crm_mode = 'advanced')
ALTER TABLE leads ADD COLUMN funnel_id UUID REFERENCES lead_funnels(id);
CREATE INDEX idx_leads_funnel ON leads(funnel_id) WHERE funnel_id IS NOT NULL;

-- 7. Webhook event log (idempotencia + auditoría)
CREATE TABLE webhook_event_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration     TEXT NOT NULL,
  event_id        TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result          TEXT NOT NULL CHECK (result IN ('ok', 'error', 'duplicate', 'ignored')),
  error_detail    TEXT,
  UNIQUE (org_id, integration, event_id)
);
CREATE INDEX idx_webhook_event_log_org_integration ON webhook_event_log(org_id, integration);
CREATE INDEX idx_webhook_event_log_processed_at ON webhook_event_log(processed_at);
ALTER TABLE webhook_event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_event_log USING (org_id IN (SELECT user_org_ids()));

-- 8. Trigger updated_at
CREATE TRIGGER set_updated_at_lead_tag_categories BEFORE UPDATE ON lead_tag_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at_lead_tags BEFORE UPDATE ON lead_tags FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at_lead_funnels BEFORE UPDATE ON lead_funnels FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

⚠️ **Esta migration se ejecuta en Supabase SQL Editor manualmente** (consistente con la práctica establecida — `supabase db push` está desincronizado).

---

## 4. Endpoints

### 4.1 `POST /api/integrations/manychat/{token}/webhook`
Recibe lead nuevo del bot ManyChat.

```ts
// Pseudo-código
1. Lookup en integration_webhooks WHERE webhook_token = {token} AND integration = 'manychat' AND is_active
2. 404 si no existe
3. Validar HMAC del body con webhook_secret_decrypted
4. 401 si firma inválida
5. Parsear payload
6. Idempotencia: INSERT INTO webhook_event_log (org_id, 'manychat', event_id, ...) ON CONFLICT DO NOTHING. Si CONFLICT, return 200 (duplicate)
7. Si org.crm_mode === 'advanced':
   - Buscar funnel default_new
   - Crear lead con funnel_id, contact_name, contact_phone
   - Crear lead_tag_assignments para tags resueltas (ver sección 4.4)
   - Setear notes con timestamp + mensaje
8. Si org.crm_mode === 'legacy':
   - Comportamiento actual de createLead (status NEW, region OTROS, etc.)
9. Return 200 con lead_id
```

### 4.2 `POST /api/integrations/callbell-in/{token}/webhook`
Recibe webhooks salientes desde Callbell (cambios hechos por vendedora).

```ts
// Pseudo-código
1-6. Idem 4.1 pero con integration = 'callbell-in'
7. Switch event_type:
   - 'funnel_changed' → lookup leads WHERE callbell_contact_uuid = X → update funnel_id
   - 'tag_added' / 'tag_removed' → upsert/delete en lead_tag_assignments
   - 'agent_assigned' → lookup user by email del agent → update assigned_seller_id
   - 'message_received' → append a notes
8. Si tag o funnel referenciado no existe en Vibook → fetch desde Callbell API y crear
9. Return 200
```

### 4.3 `POST /api/cron/callbell-reconcile`
Cron de reconciliación cada 30 min.

```ts
// Pseudo-código
1. Validar Authorization: Bearer ${CRON_SECRET}
2. Para cada org WHERE crm_mode = 'advanced' Y tiene callbell-out activo:
   - Fetch desde Callbell API: contacts + tags + funnels actualizados desde org.last_callbell_sync_at
   - Para cada contacto modificado:
     - Buscar lead correspondiente por callbell_contact_uuid
     - Comparar funnel_id, tags asignadas, agent
     - Si difiere: aplicar update (Callbell wins)
     - Loggear en webhook_event_log con integration = 'callbell-cron'
   - Update org.last_callbell_sync_at = NOW()
3. Return 200 con contador de events procesados
```

### 4.4 Resolución de tags al crear lead

Cuando llega payload de ManyChat con `destination_text: "Punta Cana"`, `travel_month: "JULIO"`, `campaign_source: "mundial"`:

```ts
async function resolveTagAssignments(orgId, payload): Promise<TagAssignment[]> {
  const assignments = []

  // Destino: matching case-insensitive contra lead_tags WHERE category = destino
  const destinationTag = await findTagByLabel(orgId, 'destino', payload.destination_text)
  if (destinationTag) assignments.push({ tag_id: destinationTag.id })
  // Si no matchea, NO creamos tag — la vendedora decide

  // Mes: matching case-insensitive
  const monthTag = await findTagByLabel(orgId, 'mes', payload.travel_month)
  if (monthTag) assignments.push({ tag_id: monthTag.id })

  // Origen: derivado de campaign_source
  const originLabel = mapCampaignToOrigin(payload.campaign_source)  // "mundial"→"PUBLICIDAD"
  if (originLabel) {
    const originTag = await findTagByLabel(orgId, 'origen', originLabel)
    if (originTag) assignments.push({ tag_id: originTag.id })
  }

  // Temperatura: NO se asigna en lead nuevo — la vendedora la pone

  return assignments
}
```

---

## 5. UI

### 5.1 Routing condicional

Componente top-level en `/sales/leads/page.tsx`:

```tsx
const { data: org } = useCurrentOrg()
if (org.crm_mode === 'advanced') {
  return <AdvancedCRMKanban orgId={org.id} />  // componente nuevo
}
return <LegacyCRMKanban />  // componente actual, sin cambios
```

Lozada nunca renderiza `AdvancedCRMKanban`.

### 5.2 Componentes nuevos

- `<AdvancedCRMKanban>` — kanban dinámico con columnas según `lead_funnels` del tenant
- `<LeadCardAdvanced>` — card que muestra tags coloreadas por categoría
- `<TagFilter>` — filtro multi-categoría con checkboxes y búsqueda
- `<FunnelDragDrop>` — manejo de drag-drop entre columnas con optimistic update + API call
- `<TagAssignmentDialog>` — dialog para agregar/quitar tags de un lead
- `<TagManagementSettings>` — settings page para que admin del tenant edite categorías/tags (Fase 2)

### 5.3 Settings

Nueva página `/settings/integrations/callbell` (solo visible si `crm_mode = 'advanced'`):
- Estado de la integración
- Botón "Re-sincronizar" que dispara `/api/cron/callbell-reconcile` para esa org puntual
- Logs de últimos eventos del `webhook_event_log`

---

## 6. Archivos a crear/modificar

### Nuevos
```
supabase/migrations/<fecha>_advanced_crm_mode.sql
lib/crm-presets/seed-advanced-mode.ts
lib/crm-presets/vico-preset.ts                     # tags, funnels, mapping VICO
lib/integrations/manychat/handler-advanced.ts      # nuevo handler
lib/integrations/callbell/api-client.ts            # cliente para API de Callbell
lib/integrations/callbell/sync-handler.ts          # procesa eventos entrantes
lib/integrations/callbell/reconcile.ts             # lógica del cron
lib/integrations/secrets.ts                        # encrypt/decrypt webhook_secret
app/api/integrations/manychat/[token]/webhook/route.ts
app/api/integrations/callbell-in/[token]/webhook/route.ts
app/api/cron/callbell-reconcile/route.ts
app/(dashboard)/sales/leads/_components/advanced-crm-kanban.tsx
app/(dashboard)/sales/leads/_components/lead-card-advanced.tsx
app/(dashboard)/sales/leads/_components/tag-filter.tsx
app/(dashboard)/sales/leads/_components/tag-assignment-dialog.tsx
app/(dashboard)/settings/integrations/callbell/page.tsx
scripts/seed-vico.ts                               # one-off para activar VICO
scripts/seed-callbell-mapping.ts                   # mapea UUIDs Callbell ↔ Vibook
__tests__/integrations/manychat-advanced.test.ts
__tests__/integrations/callbell-sync.test.ts
__tests__/integrations/callbell-reconcile.test.ts
__tests__/isolation/advanced-mode-tenant-isolation.test.ts
```

### Modificados (mínimo)
```
app/api/onboarding/route.ts                        # agregar provisioning de webhooks (ya estaba diseñado)
app/(dashboard)/sales/leads/page.tsx               # routing legacy/advanced
app/(dashboard)/sales/leads/_components/leads-page-client.tsx  # condicional render
lib/supabase/types.ts                              # regenerar tipos post-migration
```

---

## 7. Tests

### 7.1 Unit
- `seed-advanced-mode.ts` con mock de Supabase admin
- `resolveTagAssignments` para todos los casos (matchea, no matchea, mes inválido, etc.)
- HMAC verification (válido, inválido, secret rotado)
- Idempotencia: mismo `event_id` dos veces → segundo es duplicate

### 7.2 Integration
- Webhook ManyChat end-to-end con payload realista → lead creado + tags asignadas
- Webhook Callbell-in: cada event_type produce el cambio esperado
- Cron de reconciliación: detecta diff y reconcilia

### 7.3 Isolation (CRÍTICO)
- Webhook de VICO con `org_id` de Lozada en payload → ignora payload, usa el del token
- Tag de VICO no aparece nunca en query de Lozada
- Cambio de funnel desde Callbell de VICO no toca leads de Lozada
- Cron procesa solo orgs en `advanced` — Lozada queda intocada

### 7.4 No-regresión Lozada
- Login Maxi → `/sales/leads` carga UI legacy
- Webhook ManyChat de Lozada → crea lead con `funnel_id IS NULL`, status NEW, region OTROS
- Webhook Trello de Lozada → idem
- Counts de leads de Lozada antes/después de migration: idénticos

---

## 8. Variables de entorno

Nuevas:
```
CALLBELL_API_BASE_URL=https://api.callbell.eu/v1.1   # confirmar versión actual
WEBHOOK_SECRET_ENCRYPTION_KEY=<32-byte hex>          # para encriptar tokens en DB
```

Reutilizadas:
```
CRON_SECRET=<existente>                               # para validar /api/cron/*
NEXT_PUBLIC_APP_URL=https://app.vibook.ai             # para construir webhook URLs
```

---

## 9. Métricas de éxito

- 0 leads de VICO perdidos en el flujo bot → Vibook (verificable comparando contra Callbell)
- Latencia webhook ManyChat → Vibook < 2s (p95)
- Webhook Callbell → Vibook latencia < 10s (p95)
- Cron de reconciliación detecta < 1% de divergencia (si es más, hay un bug en el webhook)
- 0 tests de isolation fallando
- Lozada: 0 incidentes reportados, métricas idénticas pre/post deploy

---

## 10. Riesgos identificados y mitigaciones

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Webhook de Callbell se pierde por caída de Railway | Cron de reconciliación cada 30 min recupera |
| R2 | Callbell cambia formato de payload sin avisar | Tests con fixture + alerta en `webhook_event_log` cuando aparece event_type desconocido |
| R3 | Vendedora cambia mismo lead simultáneamente en Callbell y Vibook | MVP: solo Callbell wins (no hay push inverso). Fase 2: timestamp wins |
| R4 | Token API Callbell expuesto en PDF | Rotar antes de productivo. Storage en columna encriptada. Acceso solo desde backend |
| R5 | Bug en código advanced inserta data en Lozada | RLS por `org_id` en todas las tablas nuevas. Tests de isolation extendidos |
| R6 | UI advanced tiene bug que rompe Lozada | Componentes separados (legacy vs advanced) en archivos distintos. Lozada nunca importa nada del modo advanced |
| R7 | Migration falla mid-way en producción | Migration en una sola transacción. Si falla, rollback total. Testeada en staging primero |
| R8 | Performance: filtros multi-categoría sobre tabla grande | Índices en `lead_tag_assignments(lead_id, tag_id)` y en `leads(funnel_id)` |

---

## 11. Próximos pasos

1. **User review de este spec** + del doc maestro.
2. Pasar a `superpowers:writing-plans` para descomponer en plan ejecutable con tasks granulares.
3. Implementar en este orden orientativo:
   1. Migration + tipos generados
   2. Seed function + script de VICO (sin activar todavía)
   3. Endpoints webhook (ManyChat advanced + Callbell-in)
   4. Cron de reconciliación
   5. UI advanced kanban + componentes de tags
   6. Settings page
   7. Tests completos
   8. Activar VICO en staging con bot ManyChat de prueba
   9. QA con leads reales antes de prod
4. **Tomi en paralelo**: armar bot ManyChat siguiendo set MVP de preguntas + 2 webhooks paralelos.

---

## 12. Fuera de scope (explícito)

- Push Vibook → Callbell (sync inverso). Fase 2.
- UI self-service para que tenants editen categorías y tags. Fase 2.
- Recordatorios automáticos 24h/48h estilo Callbell. Fase 2.
- Plantillas de mensajes guardadas en Vibook. Fase 2.
- Migration path de Lozada de `legacy` a `advanced`. Fase 3.
- Marketplace de presets de CRM. Fase 3.
- Operations creadas automáticamente al marcar VENDIDO en Callbell. **No definido**: cuando VICO empiece a usar Vibook como ERP, se decide cómo se materializa la operation. Por ahora el funnel VENDIDO solo es informativo.
- Outbound messaging (Vibook → cliente vía Callbell). Fase 2+.
- Integración con `wa_*` (wha-control). No relacionado.
