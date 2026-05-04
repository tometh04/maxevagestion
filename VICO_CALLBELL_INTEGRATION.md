# VICO Travel Group — Integración Callbell + ManyChat + Vibook

> **Última actualización**: 2026-05-04
> **Estado**: Diseño cerrado al ~95%. Pendiente: actualizar spec con seed plan + pasar a writing-plans.
> **Propósito**: doc maestro para ejecutar la integración del primer cliente que necesita el modo "CRM avanzado" en Vibook (VICO Travel Group). Documenta TODAS las decisiones tomadas en el brainstorming, el modelo de datos, el flujo de eventos y las garantías de no-impacto sobre Lozada.

---

## 1. Cliente y caso de uso

**Cliente**: VICO Travel Group — agencia de viajes que ya opera con Callbell como CRM principal y quiere sumar Vibook como capa adicional para captura de leads vía bot de WhatsApp + gestión a futuro.

**Volumen**:
- 32 conversaciones nuevas por día
- 134 conversaciones activas diarias en promedio
- 26 ventas/mes (≈2.7% conversion)

**Equipo**: 10 usuarios — 6 vendedoras (3 fijas + 3 freelancers), 1 posventa, 2 administración, 1 contable. Referente técnico: Enzo Maineri.

**Canales**: 2 líneas de WhatsApp + Instagram DM + Facebook Messenger (todo agregado en Callbell).

**Operación actual**: las vendedoras laburan exclusivamente en Callbell con su propio sistema de funnels y tags multi-categoría documentado en su instructivo interno (`Downloads/INSTRUCTIVO USO DE CALLBELL Vico.pdf`).

---

## 2. Qué construimos (alcance del MVP)

Tres componentes independientes que actúan en paralelo:

### 2.1 Bot de ManyChat
Bot armado por Tomi desde cero. Captura leads y dispara **dos webhooks paralelos** desde el mismo flow:
- Uno apunta a Vibook (con su mapping de campos)
- Otro apunta a Callbell API (con su propio mapping)

Cada sistema interpreta la data a su manera, sin acoplamiento. Si un sistema falla, el otro entra igual.

### 2.2 Modo `crm_mode = 'advanced'` en Vibook
Capa nueva en Vibook que:
- Soporta **tags multi-categoría** (temperatura, destino, mes, origen — el mismo modelo que usa Callbell)
- Soporta **funnels custom por tenant** (los 7 funnels de VICO viven configurados, no hardcodeados)
- Renderiza un Kanban dinámico que se ve y siente como el de Callbell
- Activa por tenant. Lozada queda en `crm_mode = 'legacy'` y **no ve un solo pixel diferente** ni necesita migración.

### 2.3 Sync Callbell → Vibook (híbrido)
Cuando una vendedora cambia algo en Callbell, Vibook se entera:
- **Webhook entrante** desde Callbell para eventos en tiempo real (cambio de funnel, agregado/quitado de tag, asignación de agente, mensaje nuevo)
- **Cron de reconciliación cada 30 min** que compara estado y rellena lo que se haya perdido por algún webhook fallido

**Sync inverso (Vibook → Callbell) NO va en MVP**. Si la vendedora cambia algo en Vibook, queda solo en Vibook. Justificación: VICO opera primariamente en Callbell durante los primeros 30-60 días. Cuando se den vuelta y empiecen a operar en Vibook, sumamos el push inverso (fase 2).

---

## 3. Modelo de datos

### 3.1 Columna nueva en `organizations`

```sql
ALTER TABLE organizations
  ADD COLUMN crm_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK (crm_mode IN ('legacy', 'advanced'));
```

- `legacy` → comportamiento actual (status enum NEW/IN_PROGRESS/QUOTED/WON/LOST + region + destination texto libre)
- `advanced` → funnels y tags vienen de las tablas nuevas

**Lozada queda en `legacy` por default**. VICO se setea en `advanced` durante el onboarding.

### 3.2 Tablas nuevas (todas con RLS por `org_id`)

```sql
-- Categorías de tags configurables por tenant
CREATE TABLE lead_tag_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                              -- "temperatura", "destino", "mes", "origen"
  color           TEXT NOT NULL,                              -- "red", "green", "purple", "orange"
  cardinality     TEXT NOT NULL CHECK (cardinality IN ('one', 'many')), -- "one" = 1 tag por lead, "many" = N tags
  display_order   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, name)
);

-- Tags individuales (ej. CALIENTE, PUNTA CANA, JULIO, PUBLICIDAD)
CREATE TABLE lead_tags (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES lead_tag_categories(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  color_override  TEXT,                                       -- opcional, sobreescribe color de categoría
  display_order   INT NOT NULL DEFAULT 0,
  callbell_tag_uuid TEXT,                                     -- opcional, mapeo al UUID de la tag en Callbell para sync
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, label)
);

-- Asignación de tags a leads
CREATE TABLE lead_tag_assignments (
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id          UUID NOT NULL REFERENCES lead_tags(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  assigned_by     UUID REFERENCES users(id),
  PRIMARY KEY (lead_id, tag_id)
);

-- Funnels custom por tenant
CREATE TABLE lead_funnels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                              -- "PRIMER CONTACTO", "COTIZANDO", etc.
  display_order   INT NOT NULL,
  color           TEXT,
  is_terminal     BOOLEAN DEFAULT FALSE,                      -- VENDIDO y NO VENDIDO son terminales
  is_default_new  BOOLEAN DEFAULT FALSE,                      -- el que se asigna a leads recién creados
  callbell_funnel_uuid TEXT,                                  -- opcional, mapeo al funnel de Callbell
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, name)
);

-- Etapa actual del lead (solo para crm_mode = 'advanced')
ALTER TABLE leads ADD COLUMN funnel_id UUID REFERENCES lead_funnels(id);
```

**Importante**: las queries existentes sobre `leads.status` siguen funcionando. La columna `funnel_id` es opcional y solo se llena para tenants en modo `advanced`.

### 3.3 Tabla `integration_webhooks` (genérica, ya diseñada en sesiones previas)

Una sola fila por (org, integration). Para VICO arrancan tres:

```
| org_id | integration   | webhook_token  | webhook_secret    | is_active | config (JSONB)       |
|--------|---------------|----------------|-------------------|-----------|----------------------|
| VICO   | manychat      | <token random> | <secret>          | true      | { "bot_id": "..." }  |
| VICO   | callbell-in   | <token random> | <secret callbell> | true      | {}                   |
| VICO   | callbell-out  | -              | <api token>       | true      | { "api_token": "yR9bWyWU..." } |
```

- **`manychat`**: token que va en la URL del webhook que dispara ManyChat (recibimos leads del bot)
- **`callbell-in`**: token que va en la URL que recibe webhooks salientes de Callbell (cambio de funnel, tag, agente)
- **`callbell-out`**: stora el API token de Callbell que usamos para mandar requests salientes (crear contact, fetch updates en el cron de reconciliación)

⚠️ **`webhook_secret` debe estar encriptado en la DB** (columna `webhook_secret_encrypted`). Patrón a definir en spec — usar `pgcrypto` o tabla de secrets aparte. El token de Callbell que VICO mandó por PDF se rota antes de productivo.

---

## 4. Flujo de datos completo

```
┌────────────────────────────────────────────────────────────────┐
│  CLIENTE escribe al WhatsApp / IG / FB de VICO                 │
└─────────────────────────────────┬──────────────────────────────┘
                                  ↓
┌────────────────────────────────────────────────────────────────┐
│  CALLBELL captura el chat                                      │
└─────────────────────────────────┬──────────────────────────────┘
                                  ↓
┌────────────────────────────────────────────────────────────────┐
│  MANYCHAT BOT toma el control                                  │
│  Pregunta: nombre, destino, mes, fechas, pasajeros, presupuesto│
└──────────────────┬───────────────────────┬─────────────────────┘
                   ↓                       ↓
        ┌──────────────────┐    ┌─────────────────────┐
        │ POST a Vibook    │    │ POST a Callbell API │
        │ (webhook propio) │    │ (crear contact +    │
        │                  │    │  tags + funnel)     │
        └────────┬─────────┘    └──────────┬──────────┘
                 ↓                         ↓
    ┌─────────────────────────┐  ┌──────────────────────┐
    │ Vibook crea lead en     │  │ Callbell muestra el  │
    │ crm_mode=advanced:      │  │ contacto a la        │
    │ - leads (con funnel_id) │  │ vendedora con sus    │
    │ - lead_tag_assignments  │  │ tags y funnel        │
    │ - notes con timestamp   │  │ asignados            │
    └────────────┬────────────┘  └──────────┬───────────┘
                 │                          ↓
                 │              ┌─────────────────────────┐
                 │              │ VENDEDORA cambia funnel │
                 │              │ / agrega tag / toma chat│
                 │              └────────────┬────────────┘
                 │                           ↓
                 │              ┌─────────────────────────┐
                 │              │ CALLBELL dispara webhook│
                 │              │ outbound a Vibook       │
                 │              └────────────┬────────────┘
                 │                           ↓
                 │              ┌─────────────────────────┐
                 │              │ POST /api/integrations/ │
                 │              │ callbell-in/{token}     │
                 │              │ /webhook                │
                 │              └────────────┬────────────┘
                 │                           ↓
                 │              ┌─────────────────────────┐
                 ↓              │ Vibook actualiza:       │
    ┌─────────────────────────┐ │ - funnel_id             │
    │ VICO ve en Vibook el    │←│ - lead_tag_assignments  │
    │ lead con su kanban,     │ │ - assigned_seller_id    │
    │ tags, funnel y filtros  │ └─────────────────────────┘
    └─────────────────────────┘
                                ┌─────────────────────────┐
                                │ CRON cada 30 min:       │
                                │ /api/cron/callbell-     │
                                │ reconcile               │
                                │ → fetch últimos eventos │
                                │   de Callbell API       │
                                │ → diff vs estado Vibook │
                                │ → reconcilia diff       │
                                └─────────────────────────┘
```

---

## 5. Bot ManyChat — comportamiento

### 5.1 Mensaje de bienvenida (a partir del que tienen hoy)

VICO ya tiene un primer mensaje con 5 opciones. Lo respetamos:

1. **Quiero viajar** ✈️ → flow de calificación de lead nuevo
2. **Ya tengo mi viaje y quiero hacer una consulta** 📋 → ruta posventa (NO crea lead, busca contacto existente)
3. **Estoy en viaje y tengo un problema** ⚠️ → ruta urgencia (NO crea lead, escala a Florencia/posventa)
4. **Quiero info del Mundial** 🏆 → flow campaña Mundial (crea lead con tag MUNDIAL)
5. **Quiero info del paquete F1** 🏎️🏁 → flow campaña F1 (crea lead con tag FORMULA 1)

**Solo las opciones 1, 4 y 5 disparan los 2 webhooks**. Las opciones 2 y 3 son operativas internas de Callbell y no nos involucran.

### 5.2 Set de preguntas del flow de calificación (opción 1)

Confirmado en sesiones previas:
- Nombre
- Destino (texto libre — el bot NO ofrece lista cerrada)
- Mes de viaje
- Cantidad de pasajeros (adultos + edades de menores si aplica)
- Ciudad de salida (Buenos Aires / Mendoza / Córdoba / Rosario / otra)
- Presupuesto por persona (rangos cerrados)
- Fechas tentativas (texto libre, ej. "primera quincena de julio")
- Email (opcional)

Al final el bot resume y deriva a vendedora con: "Te transfiero a un agente que te responderá a la brevedad".

### 5.3 Atribución de campañas

ManyChat puede leer el `referral` que manda Meta cuando el lead viene de un anuncio (`ctwa_clid`, `ad_id`). El bot debe:
- Si viene de campaña Mundial → entrar directo al flow opción 4 con tag MUNDIAL
- Si viene de campaña F1 → opción 5 con tag FORMULA 1
- Si viene de Meta Ads genérico → opción 1 con tag PUBLICIDAD
- Si viene orgánico → opción 1 sin tag de origen (la vendedora la pone)

### 5.4 Mapping de campos

**Hacia Vibook**:
```json
{
  "name": "...",
  "phone": "+54...",
  "email": "...",
  "destination_text": "Punta Cana",        // texto crudo del cliente
  "travel_month": "JULIO",
  "passengers": { "adults": 2, "minors_ages": [12, 14] },
  "departure_city": "Mendoza",
  "budget_per_person_range": "1000-2000",
  "travel_dates_text": "primera quincena de julio",
  "campaign_source": "mundial" | "f1" | "publicidad" | null,
  "manychat_user_id": "...",
  "callbell_contact_uuid": "..."           // si Callbell ya lo asignó
}
```

**Hacia Callbell**:
- Crea contact con phone + name
- Asigna tags: temperatura inicial (vacío — la vendedora la pone), destino, mes, origen
- Setea funnel inicial: PRIMER CONTACTO

---

## 6. Seed plan — inicialización del tenant en `crm_mode = 'advanced'`

Cuando una org se setea en `advanced`, hay que poblar las tablas con un preset. Para VICO el preset es **espejo del Callbell que ya tienen**. Esto se ejecuta una sola vez al onboardear.

### 6.1 Categorías

| name        | color  | cardinality | display_order |
|-------------|--------|-------------|---------------|
| temperatura | red    | one         | 1             |
| destino     | green  | many        | 2             |
| mes         | purple | one         | 3             |
| origen      | orange | one         | 4             |

### 6.2 Tags iniciales (de las screenshots del Callbell de VICO)

**temperatura**: CALIENTE, TEMPLADO, FRIO

**destino** (≈40 confirmadas, lista creciente):
ARUBA, BARILOCHE, BAYAHIBE, BUZIOS, CABO FRIO, CAMBORIU, CANCUN, CARTAGENA, CATARATAS, COLOMBIA, COSTA RICA, CRUCERO, CUBA, CURAZAO, DISNEY, EEUU, EGIPTO, EUROPA, EXOTICOS, FLORIANOPOLIS, FORMULA 1, GRECIA, JAMAICA, JAPON, JUAN DOLIO, MACEIO, MALDIVAS, MARAGOGI, MIAMI, MUNDIAL, NACIONAL, NATAL, PANAMA, PERU, PIPA, PLAYA DEL CARMEN, PUNTA CANA, RIO DE JANEIRO, SAN ANDRES, TURQUIA.

**mes**: ENERO, FEBRERO, MARZO, ABRIL, MAYO, JUNIO, JULIO, AGOSTO, SEPTIEMBRE, OCTUBRE, NOVIEMBRE, DICIEMBRE

**origen**: DERIVACION DE TRAFICO, PUBLICIDAD, CANALES, REFERIDO, OPERADOR

### 6.3 Funnels (orden y colores del instructivo de VICO)

| display_order | name             | color  | is_terminal | is_default_new |
|---------------|------------------|--------|-------------|----------------|
| 1             | PRIMER CONTACTO  | gray   | false       | **true**       |
| 2             | COTIZANDO        | yellow | false       | false          |
| 3             | SEGUIMIENTO      | orange | false       | false          |
| 4             | VENDIDO          | green  | true        | false          |
| 5             | NO VENDIDO       | red    | true        | false          |
| 6             | EN VIAJE         | blue   | false       | false          |
| 7             | CLIENTE VICO     | purple | false       | false          |

### 6.4 Mapeo de tags a UUIDs de Callbell

Después del seed, se corre un script one-off (`scripts/seed-vico-callbell-mapping.ts`) que:
1. Hace fetch a la API de Callbell con el token de VICO para listar todas sus tags y funnels
2. Hace match por `label` (case-insensitive) entre nuestros `lead_tags`/`lead_funnels` y lo que devuelve Callbell
3. Setea las columnas `callbell_tag_uuid` y `callbell_funnel_uuid` en cada fila

Esto permite que cuando el sync recibe un evento de Callbell con un UUID de tag, podamos mapearlo a nuestra fila correspondiente.

### 6.5 Implementación del seed

Función `lib/crm-presets/seed-advanced-mode.ts`:
- Recibe `org_id`
- Inserta categorías, tags, funnels en una transacción
- Pone `organizations.crm_mode = 'advanced'`
- Loggea en `security_audit_log` evento tipo `CRM_MODE_CHANGED`

Para VICO se invoca a mano la primera vez. Si en el futuro otro tenant pide modo `advanced`, se llama el mismo seed con su `org_id`.

---

## 7. Garantías para Lozada — sección crítica

Las mismas que pusimos en el doc anterior, **siguen vigentes y se refuerzan con esta integración**.

### 7.1 Qué NO se toca

- Lozada queda en `crm_mode = 'legacy'` por default. Cero migración.
- Tabla `leads` mantiene `status`, `region`, `destination` con sus CHECKs actuales. La columna nueva `funnel_id` es nullable y permanece NULL para todos los leads de Lozada.
- UI actual de `/sales/leads`, `/sales/crm-manychat` se sirve solo a tenants `legacy`. Lozada entra y ve **lo mismo de siempre, pixel a pixel**.
- Webhooks de Trello (`/api/trello/webhook`) y ManyChat de Lozada (`/api/webhooks/manychat`) NO se modifican.
- Env vars existentes intactas.
- Scripts de Trello (`scripts/setup-trello-*`, `scripts/register-trello-webhook-*`) intactos.
- Sin migration destructiva. Las migraciones nuevas son 100% additive.

### 7.2 Tabla de riesgos vs mitigaciones

| Riesgo | Mitigación |
|---|---|
| "¿Y si las tablas nuevas afectan performance de Lozada?" | RLS y queries existentes no las consultan. Solo el código nuevo del modo `advanced` las lee. Lozada nunca toca esas filas. |
| "¿Y si la columna `crm_mode` rompe queries existentes?" | Default `'legacy'` y NOT NULL. Las queries que no la lean siguen funcionando. Las que la lean tienen que ser explícitas. |
| "¿Y si el código del modo advanced bypassea RLS y mete data en Lozada?" | RLS por `org_id` en TODAS las tablas nuevas. Tests de isolation extendidos para cubrir las nuevas tablas. |
| "¿Y si VICO crea una tag con `org_id` de Lozada por bug?" | Imposible: las inserciones se hacen con scoped client del tenant, RLS bloquea cross-org. |
| "¿Y si las tags de VICO terminan apareciendo en el kanban de Lozada?" | UI de Lozada (modo legacy) ni siquiera renderiza el componente de tags. Componente solo se monta para `crm_mode === 'advanced'`. |
| "¿Y si hay rollback del feature?" | Drop de las 4 tablas nuevas + drop columna `crm_mode` + revert deploy. Lozada sigue funcionando idéntico. |

### 7.3 Checklist pre-merge

- [ ] `npm test` pasa, incluyendo isolation suite (41 tests).
- [ ] Tests nuevos de tag/funnel isolation pasan (cross-org).
- [ ] Login como Maxi → `/sales/leads` carga la UI legacy idéntica a antes.
- [ ] Login como Maxi → kanban de Lozada muestra la misma data y mismas columnas.
- [ ] `SELECT COUNT(*) FROM leads WHERE org_id = '<lozada>'` igual antes y después de la migration.
- [ ] Webhook Trello recibe evento test → crea lead en Lozada normalmente.
- [ ] Webhook ManyChat de Lozada recibe payload test → crea lead normalmente.
- [ ] No aparece columna `funnel_id` poblada en ningún lead de Lozada.

---

## 8. Roadmap

### Fase 1 — MVP (lo que estamos diseñando ahora)

- [x] Decisiones de arquitectura
- [x] Cuestionario a VICO + respuestas
- [x] Doc maestro (este archivo)
- [ ] Spec técnico actualizado
- [ ] Plan de implementación (writing-plans)
- [ ] Migration: tablas + columna `crm_mode`
- [ ] Endpoint webhook `manychat` para `crm_mode = 'advanced'`
- [ ] Endpoint webhook `callbell-in` (sync)
- [ ] Cron `callbell-reconcile`
- [ ] UI Kanban dinámico para modo advanced
- [ ] Componente de tags multi-categoría
- [ ] Filtros multi-categoría
- [ ] Seed function + script de mapping de UUIDs
- [ ] Bot ManyChat (lo arma Tomi en paralelo)
- [ ] Tests + QA con leads reales

**Estimado**: 8-12 semanas (la opción `b` que confirmaste implica UI completa desde día 1).

### Fase 2 — cuando VICO opere primariamente en Vibook

- [ ] Push Vibook → Callbell (sync inverso)
- [ ] Resolución de conflictos en bidirectional sync
- [ ] UI self-service para que ellos editen sus tags/funnels
- [ ] Recordatorios automáticos 24h/48h post cotización (espejo de Callbell)
- [ ] Plantillas de mensajes guardadas en Vibook
- [ ] Reportes específicos del modo advanced

### Fase 3 — generalización

- [ ] Activar `crm_mode = 'advanced'` para más tenants vía wizard de onboarding
- [ ] Migration path opcional de `legacy` → `advanced` para Lozada (si lo piden)
- [ ] Marketplace de presets ("Callbell-style", "HubSpot-style", "minimal", etc.)

---

## 9. Seguridad

### 9.1 Token de Callbell expuesto

El token API de Callbell de VICO viajó por PDF en el cuestionario respondido. Acciones:

1. **Antes de productivo**: pedirle a Enzo que lo rote desde Callbell. Generar uno nuevo y mandárselo a Tomi por canal seguro (no por mail/WhatsApp con copia, no en PDF).
2. **Storage**: nunca commitear a git. Va a la columna `webhook_secret_encrypted` de `integration_webhooks` (encriptada en reposo).
3. **Acceso**: solo el código del backend lo lee, decifra al vuelo. Logs nunca lo imprimen.
4. **Patrón a futuro**: el cliente onboardea ingresando el token directo en `/settings/integrations/callbell`. Vibook nunca recibe el token por canales humanos.

### 9.2 Webhooks entrantes

Todos los endpoints (`manychat`, `callbell-in`) validan:
- Token único en URL (lookup en `integration_webhooks` con `is_active = true`) — 404 si no existe
- HMAC del payload con `webhook_secret` específico del tenant — 401 si firma inválida
- Idempotencia: `event_id` del proveedor guardado en tabla `webhook_event_log` para no procesar el mismo evento dos veces
- Rate limit: 100 req/min por token (defensivo)

### 9.3 RLS

Todas las tablas nuevas tienen `ENABLE ROW LEVEL SECURITY` con policy `tenant_isolation` por `org_id`. Patrón idéntico al del Pilar 1 del SaaS conversion.

---

## 10. Archivos relacionados

| Archivo | Propósito |
|---|---|
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/VICO_CALLBELL_INTEGRATION.md` | Este doc — referencia maestra |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-20-callbell-crm-integration-design.md` | Spec técnico detallado (a actualizar a continuación) |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-27-vico-questionnaire.md` | Cuestionario que mandamos a VICO |
| `/Users/tomiisanchezz/Downloads/INSTRUCTIVO USO DE CALLBELL Vico.pdf` | Manual interno de VICO (referencia, no commitear) |
| `/Users/tomiisanchezz/Downloads/Cuestionario Vico Travel.pdf` | Respuestas de VICO (referencia, no commitear) |

---

## 11. Próximos pasos inmediatos

1. **Actualizar el spec técnico** (`docs/superpowers/specs/2026-04-20-callbell-crm-integration-design.md`) con todo lo de este doc.
2. **Pasar a `superpowers:writing-plans`** para descomponer en tasks ejecutables ordenadas.
3. **Tomi en paralelo**: empezar a armar el bot de ManyChat (el flow del paso 5 de este doc).
4. **VICO en paralelo**: pedir a Enzo (a) la rotación del token Callbell, (b) la conexión de Meta Business cuando estemos listos para conectar ManyChat al WhatsApp Business.
