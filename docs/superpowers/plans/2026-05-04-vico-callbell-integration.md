# VICO Callbell Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar `crm_mode = 'advanced'` en Vibook con tags multi-categoría + funnels custom por tenant, y conectar el bot ManyChat de VICO + sync bidireccional con Callbell, sin tocar la operación actual de Lozada.

**Architecture:** Dual-mode CRM activado por columna `organizations.crm_mode`. Ingreso vía dos webhooks paralelos desde ManyChat (uno a Vibook, otro a Callbell). Sync Callbell → Vibook por webhook entrante + cron de reconciliación cada 30 min en Railway. RLS por `org_id` en todas las tablas nuevas. Defense-in-depth: scoped client + filtros explícitos.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres + RLS), shadcn/ui, Jest, Railway Cron Services, Callbell REST API v1.1.

**Specs de referencia:**
- Doc maestro: `/Users/tomiisanchezz/Desktop/Repos/erplozada/VICO_CALLBELL_INTEGRATION.md`
- Spec técnico: `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-20-callbell-crm-integration-design.md`

---

## File Structure

### Crear (paths absolutos)

| Path | Responsabilidad |
|---|---|
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260504000001_advanced_crm_mode.sql` | Schema: columna `crm_mode` + 5 tablas nuevas + RLS |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/secrets.ts` | encrypt/decrypt de webhook secrets |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/tag-resolver.ts` | Resolver tags al crear lead desde payload de bot |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/api-client.ts` | HTTP client para Callbell REST API |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/types.ts` | Types del payload de Callbell |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/sync-handler.ts` | Procesa eventos entrantes de Callbell |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/reconcile.ts` | Lógica del cron de reconciliación |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/manychat/handler-advanced.ts` | Handler de webhook ManyChat para `crm_mode = 'advanced'` |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/hmac.ts` | HMAC verification compartida |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/crm-presets/seed-advanced-mode.ts` | Función genérica de seed |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/crm-presets/vico-preset.ts` | Data específica VICO (tags + funnels) |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/integrations/manychat/[token]/webhook/route.ts` | Endpoint ManyChat advanced |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/integrations/callbell-in/[token]/webhook/route.ts` | Endpoint webhook entrante de Callbell |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/cron/callbell-reconcile/route.ts` | Cron de reconciliación |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/_components/advanced-crm-kanban.tsx` | Kanban dinámico modo advanced |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/_components/lead-card-advanced.tsx` | Card con tags coloreadas |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/_components/tag-filter.tsx` | Filtro multi-categoría |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/_components/tag-assignment-dialog.tsx` | Dialog para agregar/quitar tags |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/settings/integrations/callbell/page.tsx` | Settings page para callbell integration |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/scripts/seed-vico.ts` | Script one-off para activar VICO |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/scripts/seed-callbell-mapping.ts` | Mapea UUIDs Callbell ↔ Vibook |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/integrations/tag-resolver.test.ts` | Unit tests del resolver |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/integrations/seed-advanced-mode.test.ts` | Unit tests del seed |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/integrations/manychat-advanced.test.ts` | Integration tests del webhook |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/integrations/callbell-sync.test.ts` | Integration tests del sync |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/isolation/advanced-mode-tenant-isolation.test.ts` | Isolation tests del modo advanced |

### Modificar

| Path | Cambio |
|---|---|
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/supabase/types.ts` | Regenerar types post-migration |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/page.tsx` | Routing condicional `legacy` vs `advanced` |
| `/Users/tomiisanchezz/Desktop/Repos/erplozada/.env.example` | Documentar `WEBHOOK_SECRET_ENCRYPTION_KEY`, `CALLBELL_API_BASE_URL` |

---

## FASE 1 — Foundation: Schema + Seed

### Task 1: Migration SQL

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260504000001_advanced_crm_mode.sql`

**Contexto importante:** Por convención del proyecto, las migrations se aplican manualmente desde Supabase SQL Editor (`supabase db push` está desincronizado). El archivo se commitea como referencia, pero la ejecución real es manual.

- [ ] **Step 1: Crear el archivo de migration con el SQL completo**

Contenido completo del archivo:

```sql
-- ============================================================================
-- MIGRATION 159 — Advanced CRM mode (VICO Callbell integration)
-- ============================================================================
-- Habilita modo CRM avanzado por tenant: tags multi-categoría + funnels custom.
-- Lozada queda en 'legacy' (default), VICO se setea en 'advanced' por seed.
--
-- Impact:
-- - Tabla organizations: columna nueva crm_mode (default 'legacy', no rompe queries existentes)
-- - 5 tablas nuevas con RLS por org_id
-- - Columna nueva leads.funnel_id (nullable, NULL para legacy)
-- - webhook_event_log para idempotencia + auditoría
-- ============================================================================

-- 1. Columna crm_mode en organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS crm_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK (crm_mode IN ('legacy', 'advanced'));

COMMENT ON COLUMN organizations.crm_mode IS
  'legacy = status enum + region/destination. advanced = funnels y tags desde lead_funnels/lead_tag_*. Per-tenant CRM model.';

-- 2. Tabla lead_tag_categories
CREATE TABLE IF NOT EXISTS lead_tag_categories (
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

CREATE INDEX IF NOT EXISTS idx_lead_tag_categories_org ON lead_tag_categories(org_id);

ALTER TABLE lead_tag_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON lead_tag_categories;
CREATE POLICY tenant_isolation ON lead_tag_categories
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 3. Tabla lead_tags
CREATE TABLE IF NOT EXISTS lead_tags (
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

CREATE INDEX IF NOT EXISTS idx_lead_tags_org ON lead_tags(org_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_category ON lead_tags(category_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_callbell_uuid ON lead_tags(callbell_tag_uuid)
  WHERE callbell_tag_uuid IS NOT NULL;

ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON lead_tags;
CREATE POLICY tenant_isolation ON lead_tags
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 4. Tabla lead_tag_assignments
CREATE TABLE IF NOT EXISTS lead_tag_assignments (
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id          UUID NOT NULL REFERENCES lead_tags(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by     UUID REFERENCES users(id),
  PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_lead ON lead_tag_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_org ON lead_tag_assignments(org_id);

ALTER TABLE lead_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON lead_tag_assignments;
CREATE POLICY tenant_isolation ON lead_tag_assignments
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 5. Tabla lead_funnels
CREATE TABLE IF NOT EXISTS lead_funnels (
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

CREATE INDEX IF NOT EXISTS idx_lead_funnels_org ON lead_funnels(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_funnels_one_default
  ON lead_funnels(org_id) WHERE is_default_new = TRUE;

ALTER TABLE lead_funnels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON lead_funnels;
CREATE POLICY tenant_isolation ON lead_funnels
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 6. Columna funnel_id en leads (nullable, solo se llena en advanced mode)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES lead_funnels(id);
CREATE INDEX IF NOT EXISTS idx_leads_funnel ON leads(funnel_id) WHERE funnel_id IS NOT NULL;

-- 7. Tabla webhook_event_log (idempotencia + auditoría)
CREATE TABLE IF NOT EXISTS webhook_event_log (
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

CREATE INDEX IF NOT EXISTS idx_webhook_event_log_org_integration
  ON webhook_event_log(org_id, integration);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_processed_at
  ON webhook_event_log(processed_at);

ALTER TABLE webhook_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON webhook_event_log;
CREATE POLICY tenant_isolation ON webhook_event_log
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 8. Triggers updated_at
DROP TRIGGER IF EXISTS set_updated_at_lead_tag_categories ON lead_tag_categories;
CREATE TRIGGER set_updated_at_lead_tag_categories
  BEFORE UPDATE ON lead_tag_categories
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_lead_tags ON lead_tags;
CREATE TRIGGER set_updated_at_lead_tags
  BEFORE UPDATE ON lead_tags
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_lead_funnels ON lead_funnels;
CREATE TRIGGER set_updated_at_lead_funnels
  BEFORE UPDATE ON lead_funnels
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 9. last_callbell_sync_at en organizations (para el cron de reconciliación)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS last_callbell_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN organizations.last_callbell_sync_at IS
  'Timestamp del último cron de reconciliación con Callbell. NULL si nunca corrió.';
```

- [ ] **Step 2: Pegar el SQL en el chat para que el user lo ejecute en Supabase SQL Editor**

Usar el patrón habitual: copiar el contenido completo del archivo y pegarlo en el chat con el aviso "ejecutar este SQL en Supabase SQL Editor (proyecto `pmqvplyyxiobkllapgjp` — prod) y avisar cuando esté aplicado".

- [ ] **Step 3: Esperar confirmación del user que aplicó la migration**

Validar después con:

```bash
psql "$SUPABASE_DB_URL" -c "\\d organizations" | grep crm_mode
psql "$SUPABASE_DB_URL" -c "SELECT COUNT(*) FROM lead_tag_categories;"
```

Resultado esperado: `crm_mode | text | not null default 'legacy'::text` y `count = 0`.

- [ ] **Step 4: Commit del archivo de migration**

```bash
git add supabase/migrations/20260504000001_advanced_crm_mode.sql
git commit -m "feat(crm): migration for advanced CRM mode (tags + funnels)

- Add organizations.crm_mode column (default 'legacy')
- Add lead_tag_categories, lead_tags, lead_tag_assignments tables
- Add lead_funnels table + leads.funnel_id column
- Add webhook_event_log for idempotency + auditing
- All new tables with RLS by org_id
- last_callbell_sync_at on organizations for reconciliation cron"
```

---

### Task 2: Regenerar tipos TypeScript

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/supabase/types.ts`

- [ ] **Step 1: Correr el script de regeneración de tipos**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run db:generate
```

Resultado esperado: `lib/supabase/types.ts` actualizado con tipos para las 5 tablas nuevas (`lead_tag_categories`, `lead_tags`, `lead_tag_assignments`, `lead_funnels`, `webhook_event_log`) y la columna `crm_mode` en `organizations`.

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit 2>&1 | head -20
```

Resultado esperado: cero errores. Si hay errores en archivos no relacionados, ignorar — solo verificar que no hay errores nuevos por los tipos.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "chore(types): regenerate Supabase types after CRM migration"
```

---

### Task 3: VICO preset data

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/crm-presets/vico-preset.ts`

- [ ] **Step 1: Crear el archivo con la data del preset VICO**

Contenido completo:

```typescript
/**
 * Preset de seed para VICO Travel Group.
 * Espejo de la configuración actual de su Callbell (tags + funnels)
 * según el instructivo y el cuestionario respondido.
 *
 * Uso: ver lib/crm-presets/seed-advanced-mode.ts
 */

export type TagCategoryPreset = {
  name: string
  color: string
  cardinality: "one" | "many"
  display_order: number
  tags: Array<{ label: string; display_order: number }>
}

export type FunnelPreset = {
  name: string
  display_order: number
  color: string
  is_terminal: boolean
  is_default_new: boolean
}

export const VICO_TAG_CATEGORIES: TagCategoryPreset[] = [
  {
    name: "temperatura",
    color: "red",
    cardinality: "one",
    display_order: 1,
    tags: [
      { label: "CALIENTE", display_order: 1 },
      { label: "TEMPLADO", display_order: 2 },
      { label: "FRIO", display_order: 3 },
    ],
  },
  {
    name: "destino",
    color: "green",
    cardinality: "many",
    display_order: 2,
    tags: [
      { label: "ARUBA", display_order: 1 },
      { label: "BARILOCHE", display_order: 2 },
      { label: "BAYAHIBE", display_order: 3 },
      { label: "BUZIOS", display_order: 4 },
      { label: "CABO FRIO", display_order: 5 },
      { label: "CAMBORIU", display_order: 6 },
      { label: "CANCUN", display_order: 7 },
      { label: "CARTAGENA", display_order: 8 },
      { label: "CATARATAS", display_order: 9 },
      { label: "COLOMBIA", display_order: 10 },
      { label: "COSTA RICA", display_order: 11 },
      { label: "CRUCERO", display_order: 12 },
      { label: "CUBA", display_order: 13 },
      { label: "CURAZAO", display_order: 14 },
      { label: "DISNEY", display_order: 15 },
      { label: "EEUU", display_order: 16 },
      { label: "EGIPTO", display_order: 17 },
      { label: "EUROPA", display_order: 18 },
      { label: "EXOTICOS", display_order: 19 },
      { label: "FLORIANOPOLIS", display_order: 20 },
      { label: "FORMULA 1", display_order: 21 },
      { label: "GRECIA", display_order: 22 },
      { label: "JAMAICA", display_order: 23 },
      { label: "JAPON", display_order: 24 },
      { label: "JUAN DOLIO", display_order: 25 },
      { label: "MACEIO", display_order: 26 },
      { label: "MALDIVAS", display_order: 27 },
      { label: "MARAGOGI", display_order: 28 },
      { label: "MIAMI", display_order: 29 },
      { label: "MUNDIAL", display_order: 30 },
      { label: "NACIONAL", display_order: 31 },
      { label: "NATAL", display_order: 32 },
      { label: "PANAMA", display_order: 33 },
      { label: "PERU", display_order: 34 },
      { label: "PIPA", display_order: 35 },
      { label: "PLAYA DEL CARMEN", display_order: 36 },
      { label: "PUNTA CANA", display_order: 37 },
      { label: "RIO DE JANEIRO", display_order: 38 },
      { label: "SAN ANDRES", display_order: 39 },
      { label: "TURQUIA", display_order: 40 },
    ],
  },
  {
    name: "mes",
    color: "purple",
    cardinality: "one",
    display_order: 3,
    tags: [
      { label: "ENERO", display_order: 1 },
      { label: "FEBRERO", display_order: 2 },
      { label: "MARZO", display_order: 3 },
      { label: "ABRIL", display_order: 4 },
      { label: "MAYO", display_order: 5 },
      { label: "JUNIO", display_order: 6 },
      { label: "JULIO", display_order: 7 },
      { label: "AGOSTO", display_order: 8 },
      { label: "SEPTIEMBRE", display_order: 9 },
      { label: "OCTUBRE", display_order: 10 },
      { label: "NOVIEMBRE", display_order: 11 },
      { label: "DICIEMBRE", display_order: 12 },
    ],
  },
  {
    name: "origen",
    color: "orange",
    cardinality: "one",
    display_order: 4,
    tags: [
      { label: "DERIVACION DE TRAFICO", display_order: 1 },
      { label: "PUBLICIDAD", display_order: 2 },
      { label: "CANALES", display_order: 3 },
      { label: "REFERIDO", display_order: 4 },
      { label: "OPERADOR", display_order: 5 },
    ],
  },
]

export const VICO_FUNNELS: FunnelPreset[] = [
  { name: "PRIMER CONTACTO", display_order: 1, color: "gray", is_terminal: false, is_default_new: true },
  { name: "COTIZANDO", display_order: 2, color: "yellow", is_terminal: false, is_default_new: false },
  { name: "SEGUIMIENTO", display_order: 3, color: "orange", is_terminal: false, is_default_new: false },
  { name: "VENDIDO", display_order: 4, color: "green", is_terminal: true, is_default_new: false },
  { name: "NO VENDIDO", display_order: 5, color: "red", is_terminal: true, is_default_new: false },
  { name: "EN VIAJE", display_order: 6, color: "blue", is_terminal: false, is_default_new: false },
  { name: "CLIENTE VICO", display_order: 7, color: "purple", is_terminal: false, is_default_new: false },
]
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit lib/crm-presets/vico-preset.ts
```

Resultado esperado: cero errores.

- [ ] **Step 3: Commit**

```bash
git add lib/crm-presets/vico-preset.ts
git commit -m "feat(crm-presets): add VICO preset (40 destinos + 7 funnels + temperatura/mes/origen)"
```

---

### Task 4: Función genérica de seed (TDD)

**Files:**
- Test: `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/integrations/seed-advanced-mode.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/crm-presets/seed-advanced-mode.ts`

- [ ] **Step 1: Escribir el test de la función**

```typescript
/**
 * @jest-environment node
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { seedAdvancedMode } from "@/lib/crm-presets/seed-advanced-mode"
import { VICO_TAG_CATEGORIES, VICO_FUNNELS } from "@/lib/crm-presets/vico-preset"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const skipIfNoCreds = !SUPABASE_URL || !SERVICE_ROLE
const describeOrSkip = skipIfNoCreds ? describe.skip : describe

describeOrSkip("seedAdvancedMode", () => {
  let admin: ReturnType<typeof createClient>
  let testOrgId: string

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE!)
    // Crear org de prueba
    const { data, error } = await admin
      .from("organizations")
      .insert({
        name: "TEST_SEED_ORG",
        slug: `test-seed-${Date.now()}`,
        plan: "STARTER",
        subscription_status: "TRIAL",
      })
      .select("id")
      .single()
    if (error) throw error
    testOrgId = (data as any).id
  })

  afterAll(async () => {
    // Cleanup
    if (testOrgId) {
      await admin.from("organizations").delete().eq("id", testOrgId)
    }
  })

  it("creates 4 categories, 60 tags, 7 funnels for VICO preset and sets crm_mode='advanced'", async () => {
    await seedAdvancedMode(admin as any, testOrgId, {
      categories: VICO_TAG_CATEGORIES,
      funnels: VICO_FUNNELS,
    })

    const { data: cats } = await admin
      .from("lead_tag_categories")
      .select("id")
      .eq("org_id", testOrgId)
    expect(cats?.length).toBe(4)

    const { data: tags } = await admin
      .from("lead_tags")
      .select("id")
      .eq("org_id", testOrgId)
    expect(tags?.length).toBe(60) // 3 + 40 + 12 + 5

    const { data: funnels } = await admin
      .from("lead_funnels")
      .select("id, is_default_new")
      .eq("org_id", testOrgId)
    expect(funnels?.length).toBe(7)
    const defaults = (funnels ?? []).filter((f: any) => f.is_default_new)
    expect(defaults.length).toBe(1)

    const { data: org } = await admin
      .from("organizations")
      .select("crm_mode")
      .eq("id", testOrgId)
      .single()
    expect((org as any)?.crm_mode).toBe("advanced")
  })

  it("is idempotent — calling twice doesn't duplicate", async () => {
    await seedAdvancedMode(admin as any, testOrgId, {
      categories: VICO_TAG_CATEGORIES,
      funnels: VICO_FUNNELS,
    })
    // Llamada 2
    await seedAdvancedMode(admin as any, testOrgId, {
      categories: VICO_TAG_CATEGORIES,
      funnels: VICO_FUNNELS,
    })
    const { data: tags } = await admin
      .from("lead_tags")
      .select("id")
      .eq("org_id", testOrgId)
    expect(tags?.length).toBe(60)
  })
})
```

- [ ] **Step 2: Correr test para que falle (función no existe todavía)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/integrations/seed-advanced-mode.test.ts
```

Resultado esperado: FAIL con "Cannot find module '@/lib/crm-presets/seed-advanced-mode'".

- [ ] **Step 3: Implementar la función**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/crm-presets/seed-advanced-mode.ts` con:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { TagCategoryPreset, FunnelPreset } from "./vico-preset"

export type SeedConfig = {
  categories: TagCategoryPreset[]
  funnels: FunnelPreset[]
}

/**
 * Seed idempotente de un tenant en crm_mode='advanced'.
 * Pone organizations.crm_mode = 'advanced' al final.
 *
 * Idempotencia: hace upsert por (org_id, name) en categories/funnels y
 * por (category_id, label) en tags. Llamarla 2 veces no duplica.
 *
 * Requiere: admin client con service_role.
 */
export async function seedAdvancedMode(
  admin: SupabaseClient<Database>,
  orgId: string,
  config: SeedConfig
): Promise<void> {
  // 1. Categorías
  for (const cat of config.categories) {
    const { data: existing } = await admin
      .from("lead_tag_categories")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", cat.name)
      .maybeSingle()

    let categoryId: string
    if (existing) {
      categoryId = (existing as any).id
      await (admin.from("lead_tag_categories") as any)
        .update({
          color: cat.color,
          cardinality: cat.cardinality,
          display_order: cat.display_order,
        })
        .eq("id", categoryId)
    } else {
      const { data: created, error } = await (admin
        .from("lead_tag_categories") as any)
        .insert({
          org_id: orgId,
          name: cat.name,
          color: cat.color,
          cardinality: cat.cardinality,
          display_order: cat.display_order,
        })
        .select("id")
        .single()
      if (error) throw error
      categoryId = (created as any).id
    }

    // 2. Tags de la categoría
    for (const tag of cat.tags) {
      await (admin.from("lead_tags") as any).upsert(
        {
          org_id: orgId,
          category_id: categoryId,
          label: tag.label,
          display_order: tag.display_order,
        },
        { onConflict: "category_id,label" }
      )
    }
  }

  // 3. Funnels
  for (const f of config.funnels) {
    await (admin.from("lead_funnels") as any).upsert(
      {
        org_id: orgId,
        name: f.name,
        display_order: f.display_order,
        color: f.color,
        is_terminal: f.is_terminal,
        is_default_new: f.is_default_new,
      },
      { onConflict: "org_id,name" }
    )
  }

  // 4. Activar modo advanced
  const { error: updateErr } = await (admin
    .from("organizations") as any)
    .update({ crm_mode: "advanced" })
    .eq("id", orgId)
  if (updateErr) throw updateErr
}
```

- [ ] **Step 4: Correr test para verificar que pasa**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/integrations/seed-advanced-mode.test.ts
```

Resultado esperado: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/crm-presets/seed-advanced-mode.ts __tests__/integrations/seed-advanced-mode.test.ts
git commit -m "feat(crm-presets): seedAdvancedMode function with idempotent upserts + tests"
```

---

## FASE 2 — Backend: webhooks + sync + cron

### Task 5: Helper de encriptación de webhook secrets

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/secrets.ts`

- [ ] **Step 1: Implementar el helper**

```typescript
import crypto from "crypto"

/**
 * Encriptación AES-256-GCM de webhook secrets.
 *
 * La key viene de WEBHOOK_SECRET_ENCRYPTION_KEY (32 bytes hex).
 * Generar con: openssl rand -hex 32
 *
 * Format: <iv-hex>:<ciphertext-hex>:<auth-tag-hex>
 */

const ALGO = "aes-256-gcm"
const IV_LEN = 12
const AUTH_TAG_LEN = 16

function getKey(): Buffer {
  const hex = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY
  if (!hex) {
    throw new Error("WEBHOOK_SECRET_ENCRYPTION_KEY no configurada")
  }
  if (hex.length !== 64) {
    throw new Error(
      `WEBHOOK_SECRET_ENCRYPTION_KEY debe ser 64 chars hex (32 bytes); recibí ${hex.length}`
    )
  }
  return Buffer.from(hex, "hex")
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`
}

export function decryptSecret(stored: string): string {
  const key = getKey()
  const parts = stored.split(":")
  if (parts.length !== 3) {
    throw new Error("Formato de secret encriptado inválido")
  }
  const [ivHex, ciphertextHex, authTagHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const ciphertext = Buffer.from(ciphertextHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  if (authTag.length !== AUTH_TAG_LEN) {
    throw new Error(`Auth tag length inválida: ${authTag.length}`)
  }
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}
```

- [ ] **Step 2: Generar key de prueba para .env.local**

```bash
echo "WEBHOOK_SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> /Users/tomiisanchezz/Desktop/Repos/erplozada/.env.local
```

Resultado esperado: línea agregada al `.env.local`. Verificar con `tail -3 /Users/tomiisanchezz/Desktop/Repos/erplozada/.env.local`.

- [ ] **Step 3: Documentar en `.env.example`**

Editar `/Users/tomiisanchezz/Desktop/Repos/erplozada/.env.example` y agregar:

```
# Encriptación de webhook secrets (32 bytes hex). Generar con: openssl rand -hex 32
WEBHOOK_SECRET_ENCRYPTION_KEY=

# Callbell API base URL (verificar versión actual contra docs oficiales)
CALLBELL_API_BASE_URL=https://api.callbell.eu/v1.1
```

- [ ] **Step 4: Test rápido inline**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && node -e "
require('dotenv').config({ path: '.env.local' });
const { encryptSecret, decryptSecret } = require('./lib/integrations/secrets.ts');
const enc = encryptSecret('hola-mundo');
console.log('encrypted:', enc.slice(0, 30) + '...');
console.log('decrypted:', decryptSecret(enc));
"
```

(Si Node no soporta TS directo, usar `tsx`: `npx tsx -e "..."`).

Resultado esperado: print `decrypted: hola-mundo`.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/secrets.ts .env.example
git commit -m "feat(integrations): AES-256-GCM encrypt/decrypt for webhook secrets"
```

---

### Task 6: Tag resolver utility (TDD)

**Files:**
- Test: `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/integrations/tag-resolver.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/tag-resolver.ts`

- [ ] **Step 1: Test del resolver**

```typescript
import { mapCampaignToOriginLabel, normalizeTagLabel } from "@/lib/integrations/tag-resolver"

describe("normalizeTagLabel", () => {
  it("uppercases and trims", () => {
    expect(normalizeTagLabel("  punta cana ")).toBe("PUNTA CANA")
  })
  it("removes diacritics", () => {
    expect(normalizeTagLabel("Cancún")).toBe("CANCUN")
  })
  it("collapses multiple spaces", () => {
    expect(normalizeTagLabel("playa  del   carmen")).toBe("PLAYA DEL CARMEN")
  })
})

describe("mapCampaignToOriginLabel", () => {
  it("maps mundial to PUBLICIDAD", () => {
    expect(mapCampaignToOriginLabel("mundial")).toBe("PUBLICIDAD")
  })
  it("maps f1 to PUBLICIDAD", () => {
    expect(mapCampaignToOriginLabel("f1")).toBe("PUBLICIDAD")
  })
  it("maps generic ad source to PUBLICIDAD", () => {
    expect(mapCampaignToOriginLabel("publicidad")).toBe("PUBLICIDAD")
  })
  it("returns null for unknown", () => {
    expect(mapCampaignToOriginLabel(null)).toBeNull()
    expect(mapCampaignToOriginLabel(undefined)).toBeNull()
    expect(mapCampaignToOriginLabel("xxx")).toBeNull()
  })
})
```

- [ ] **Step 2: Correr test (debe fallar)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/integrations/tag-resolver.test.ts
```

Resultado esperado: FAIL — "Cannot find module".

- [ ] **Step 3: Implementar el resolver**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

/**
 * Normaliza un label de tag: uppercase, trim, collapse spaces, remove diacritics.
 */
export function normalizeTagLabel(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

/**
 * Mapea el campaign_source que manda ManyChat al label de origen canónico.
 * Si no hay match, retorna null y la vendedora pone la tag a mano.
 */
export function mapCampaignToOriginLabel(
  campaignSource: string | null | undefined
): string | null {
  if (!campaignSource) return null
  const normalized = campaignSource.toLowerCase().trim()
  const map: Record<string, string> = {
    mundial: "PUBLICIDAD",
    f1: "PUBLICIDAD",
    formula1: "PUBLICIDAD",
    "formula 1": "PUBLICIDAD",
    publicidad: "PUBLICIDAD",
    "meta-ads": "PUBLICIDAD",
    meta_ads: "PUBLICIDAD",
    referido: "REFERIDO",
    referral: "REFERIDO",
    organico: "DERIVACION DE TRAFICO",
    organic: "DERIVACION DE TRAFICO",
    web: "DERIVACION DE TRAFICO",
    operador: "OPERADOR",
    canal: "CANALES",
    canales: "CANALES",
  }
  return map[normalized] ?? null
}

/**
 * Busca el lead_tag por (org_id, category_name, label_normalizado).
 * Retorna null si no hay match (no crea tags al vuelo).
 */
export async function findTagByLabel(
  admin: SupabaseClient<Database>,
  orgId: string,
  categoryName: string,
  rawLabel: string
): Promise<{ id: string } | null> {
  const normalized = normalizeTagLabel(rawLabel)
  const { data: cat } = await admin
    .from("lead_tag_categories")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", categoryName)
    .maybeSingle()
  if (!cat) return null
  const { data: tag } = await admin
    .from("lead_tags")
    .select("id")
    .eq("category_id", (cat as any).id)
    .eq("label", normalized)
    .maybeSingle()
  return (tag as { id: string } | null) ?? null
}

/**
 * Resuelve las tags a asignar a un lead a partir del payload de ManyChat.
 * Solo retorna IDs de tags que existen — destinos no listados se ignoran
 * (la vendedora los agrega después).
 */
export type ManychatLeadPayload = {
  destination_text?: string | null
  travel_month?: string | null
  campaign_source?: string | null
}

export async function resolveTagAssignments(
  admin: SupabaseClient<Database>,
  orgId: string,
  payload: ManychatLeadPayload
): Promise<{ tag_id: string }[]> {
  const assignments: { tag_id: string }[] = []

  if (payload.destination_text) {
    const tag = await findTagByLabel(admin, orgId, "destino", payload.destination_text)
    if (tag) assignments.push({ tag_id: tag.id })
  }

  if (payload.travel_month) {
    const tag = await findTagByLabel(admin, orgId, "mes", payload.travel_month)
    if (tag) assignments.push({ tag_id: tag.id })
  }

  const originLabel = mapCampaignToOriginLabel(payload.campaign_source)
  if (originLabel) {
    const tag = await findTagByLabel(admin, orgId, "origen", originLabel)
    if (tag) assignments.push({ tag_id: tag.id })
  }

  return assignments
}
```

- [ ] **Step 4: Correr tests**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/integrations/tag-resolver.test.ts
```

Resultado esperado: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/tag-resolver.ts __tests__/integrations/tag-resolver.test.ts
git commit -m "feat(integrations): tag resolver with label normalization and campaign mapping"
```

---

### Task 7: HMAC verification compartido

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/hmac.ts`

- [ ] **Step 1: Implementar helper de HMAC**

```typescript
import crypto from "crypto"

/**
 * Verifica HMAC del body de un webhook. Timing-safe.
 *
 * - Callbell usa HMAC-SHA256 en header X-Callbell-Signature
 * - ManyChat permite custom headers; usamos X-Vibook-Signature con SHA256
 *
 * @param algo - "sha1" | "sha256"
 * @param body - el body crudo del request (string)
 * @param signature - valor del header
 * @param secret - secret decifrado del tenant
 * @param encoding - "hex" | "base64" (default: "hex")
 */
export function verifyHmac(
  algo: "sha1" | "sha256",
  body: string,
  signature: string,
  secret: string,
  encoding: "hex" | "base64" = "hex"
): boolean {
  if (!signature) return false
  const expected = crypto.createHmac(algo, secret).update(body).digest(encoding)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/integrations/hmac.ts
git commit -m "feat(integrations): shared HMAC verification helper (sha1/sha256)"
```

---

### Task 8: Callbell API client

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/types.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/api-client.ts`

⚠️ **Antes de implementar este task, validar contra docs oficiales de Callbell** (`https://dev.callbell.eu/`) los nombres exactos de endpoints y campos. La estructura abajo es razonable pero puede tener typos respecto a la API real.

- [ ] **Step 1: Definir types**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/types.ts`:

```typescript
/**
 * Types del payload de Callbell — verificar contra https://dev.callbell.eu/
 * antes de implementar.
 */

export type CallbellContact = {
  uuid: string
  name: string
  phoneNumber: string
  email?: string | null
  channel: "whatsapp" | "instagram" | "facebook" | string
  tags: CallbellTag[]
  funnelStage?: CallbellFunnelStage | null
  assignedAgent?: CallbellAgent | null
  createdAt: string
  updatedAt: string
}

export type CallbellTag = {
  uuid: string
  name: string
  color?: string
}

export type CallbellFunnelStage = {
  uuid: string
  name: string
  order?: number
}

export type CallbellAgent = {
  uuid: string
  name: string
  email: string
}

export type CallbellWebhookEvent = {
  type:
    | "message_created"
    | "contact_created"
    | "tag_added"
    | "tag_removed"
    | "funnel_changed"
    | "agent_assigned"
    | string
  uuid: string
  timestamp: string
  data: {
    contact?: CallbellContact
    tag?: CallbellTag
    funnelStage?: CallbellFunnelStage
    agent?: CallbellAgent
    [k: string]: unknown
  }
}
```

- [ ] **Step 2: Implementar API client**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/api-client.ts`:

```typescript
import type { CallbellContact, CallbellTag, CallbellFunnelStage } from "./types"

const BASE_URL = process.env.CALLBELL_API_BASE_URL || "https://api.callbell.eu/v1.1"

export class CallbellClient {
  constructor(private apiToken: string) {
    if (!apiToken) throw new Error("Callbell API token requerido")
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Callbell API ${res.status} ${path}: ${text.slice(0, 300)}`)
    }
    return (await res.json()) as T
  }

  /**
   * Lista todas las tags del workspace.
   * Endpoint exacto: GET /tags (verificar paginación en docs).
   */
  async listTags(): Promise<CallbellTag[]> {
    const data = await this.request<{ tags: CallbellTag[] }>("/tags")
    return data.tags
  }

  /**
   * Lista funnels.
   */
  async listFunnels(): Promise<CallbellFunnelStage[]> {
    const data = await this.request<{ funnelStages: CallbellFunnelStage[] }>(
      "/funnel-stages"
    )
    return data.funnelStages
  }

  /**
   * Trae contactos modificados desde un timestamp ISO.
   */
  async listContactsModifiedSince(sinceISO: string): Promise<CallbellContact[]> {
    const url = `/contacts?modified_since=${encodeURIComponent(sinceISO)}`
    const data = await this.request<{ contacts: CallbellContact[] }>(url)
    return data.contacts
  }

  /**
   * Trae un contacto por uuid.
   */
  async getContact(uuid: string): Promise<CallbellContact> {
    const data = await this.request<{ contact: CallbellContact }>(`/contacts/${uuid}`)
    return data.contact
  }
}
```

- [ ] **Step 3: TODO marker para validar contra docs reales**

Agregar al inicio de `api-client.ts`:

```typescript
// ⚠️ TODO al implementar: verificar contra https://dev.callbell.eu/
//   - Nombres exactos de endpoints (puede ser /v1/contacts vs /v1.1/contacts)
//   - Shape exacto de respuestas (paginación, wrapping)
//   - Auth header (Bearer vs Token vs custom)
// Cualquier discrepancia: actualizar este archivo y los types antes de seguir.
```

- [ ] **Step 4: Commit**

```bash
git add lib/integrations/callbell/types.ts lib/integrations/callbell/api-client.ts
git commit -m "feat(callbell): API client with listTags, listFunnels, listContactsModifiedSince"
```

---

### Task 9: ManyChat advanced webhook endpoint (TDD)

**Files:**
- Test: `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/integrations/manychat-advanced.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/manychat/handler-advanced.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/integrations/manychat/[token]/webhook/route.ts`

- [ ] **Step 1: Test del handler**

```typescript
/**
 * @jest-environment node
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { handleManychatAdvancedLead } from "@/lib/integrations/manychat/handler-advanced"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skipIfNoCreds = !SUPABASE_URL || !SERVICE_ROLE
const describeOrSkip = skipIfNoCreds ? describe.skip : describe

describeOrSkip("handleManychatAdvancedLead", () => {
  let admin: ReturnType<typeof createClient>
  let testOrgId: string
  let testAgencyId: string
  let defaultFunnelId: string

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE!)
    // Crear org + agency + advanced mode con datos mínimos
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "TEST_MANYCHAT_ORG",
        slug: `test-mc-${Date.now()}`,
        plan: "STARTER",
        subscription_status: "TRIAL",
        crm_mode: "advanced",
      })
      .select("id")
      .single()
    testOrgId = (org as any).id

    const { data: agency } = await admin
      .from("agencies")
      .insert({ org_id: testOrgId, name: "Test Agency" })
      .select("id")
      .single()
    testAgencyId = (agency as any).id

    // Crear category destino + tag CANCUN + funnel default PRIMER CONTACTO
    const { data: cat } = await admin
      .from("lead_tag_categories")
      .insert({ org_id: testOrgId, name: "destino", color: "green", cardinality: "many", display_order: 1 })
      .select("id")
      .single()
    await admin
      .from("lead_tags")
      .insert({ org_id: testOrgId, category_id: (cat as any).id, label: "CANCUN", display_order: 1 })

    const { data: f } = await admin
      .from("lead_funnels")
      .insert({
        org_id: testOrgId,
        name: "PRIMER CONTACTO",
        display_order: 1,
        color: "gray",
        is_default_new: true,
      })
      .select("id")
      .single()
    defaultFunnelId = (f as any).id
  })

  afterAll(async () => {
    if (testOrgId) {
      await admin.from("organizations").delete().eq("id", testOrgId)
    }
  })

  it("creates lead with funnel_id and assigns destination tag", async () => {
    const result = await handleManychatAdvancedLead(admin as any, testOrgId, testAgencyId, {
      name: "Cliente Test",
      phone: "+5491123456789",
      destination_text: "Cancun",
      travel_month: "JULIO",
      campaign_source: "publicidad",
      manychat_user_id: "mc-test-1",
    })

    expect(result.lead_id).toBeDefined()

    const { data: lead } = await admin
      .from("leads")
      .select("id, funnel_id, contact_name, contact_phone")
      .eq("id", result.lead_id)
      .single()
    expect((lead as any).funnel_id).toBe(defaultFunnelId)
    expect((lead as any).contact_name).toBe("Cliente Test")

    const { data: assignments } = await admin
      .from("lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", result.lead_id)
    expect((assignments ?? []).length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Correr test (debe fallar)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/integrations/manychat-advanced.test.ts
```

Resultado esperado: FAIL — "Cannot find module".

- [ ] **Step 3: Implementar el handler**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/manychat/handler-advanced.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { resolveTagAssignments, type ManychatLeadPayload } from "@/lib/integrations/tag-resolver"

export type AdvancedLeadInput = ManychatLeadPayload & {
  name: string
  phone: string
  email?: string | null
  manychat_user_id?: string | null
  callbell_contact_uuid?: string | null
  notes?: string | null
}

export type HandlerResult = {
  lead_id: string
  created: boolean
  tags_assigned: number
}

/**
 * Crea o actualiza un lead en crm_mode='advanced' a partir de un payload de ManyChat.
 * Se llama desde el endpoint POST /api/integrations/manychat/[token]/webhook
 * cuando la org está en advanced.
 */
export async function handleManychatAdvancedLead(
  admin: SupabaseClient<Database>,
  orgId: string,
  agencyId: string,
  input: AdvancedLeadInput
): Promise<HandlerResult> {
  // 1. Buscar funnel default
  const { data: funnel, error: funnelErr } = await admin
    .from("lead_funnels")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default_new", true)
    .maybeSingle()
  if (funnelErr) throw funnelErr
  if (!funnel) {
    throw new Error(
      `Org ${orgId} en crm_mode advanced sin funnel default — corré el seed antes`
    )
  }
  const funnelId = (funnel as any).id

  // 2. Dedupe por phone + agency
  const { data: existing } = await admin
    .from("leads")
    .select("id, notes")
    .eq("agency_id", agencyId)
    .eq("contact_phone", input.phone)
    .maybeSingle()

  const noteStamp = `[${new Date().toISOString()} · ManyChat]\n${input.notes ?? "(primer contacto)"}\n`

  if (existing) {
    const newNotes = `${(existing as any).notes ?? ""}\n${noteStamp}`.trim()
    await (admin.from("leads") as any).update({ notes: newNotes }).eq("id", (existing as any).id)
    return { lead_id: (existing as any).id, created: false, tags_assigned: 0 }
  }

  // 3. Crear lead nuevo
  // Nota: region/destination siguen NOT NULL en advanced para no romper queries legacy.
  // Usamos placeholders.
  const { data: created, error: createErr } = await (admin.from("leads") as any)
    .insert({
      org_id: orgId,
      agency_id: agencyId,
      source: "Manychat",
      status: "NEW",
      region: "OTROS",
      destination: input.destination_text || "A definir",
      contact_name: input.name,
      contact_phone: input.phone,
      contact_email: input.email ?? null,
      funnel_id: funnelId,
      notes: noteStamp,
    })
    .select("id")
    .single()
  if (createErr) throw createErr
  const leadId = (created as any).id

  // 4. Resolver y asignar tags
  const tagAssignments = await resolveTagAssignments(admin, orgId, input)
  if (tagAssignments.length > 0) {
    const rows = tagAssignments.map((t) => ({
      lead_id: leadId,
      tag_id: t.tag_id,
      org_id: orgId,
    }))
    await (admin.from("lead_tag_assignments") as any).insert(rows)
  }

  return { lead_id: leadId, created: true, tags_assigned: tagAssignments.length }
}
```

- [ ] **Step 4: Correr test**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/integrations/manychat-advanced.test.ts
```

Resultado esperado: 1 test PASS.

- [ ] **Step 5: Implementar endpoint**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/integrations/manychat/[token]/webhook/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/integrations/secrets"
import { verifyHmac } from "@/lib/integrations/hmac"
import { handleManychatAdvancedLead } from "@/lib/integrations/manychat/handler-advanced"
import { syncManychatLeadToLead } from "@/lib/manychat/sync"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient() as any

  // 1. Lookup integration_webhooks
  const { data: integ } = await admin
    .from("integration_webhooks")
    .select("org_id, webhook_secret, is_active")
    .eq("integration", "manychat")
    .eq("webhook_token", token)
    .maybeSingle()

  if (!integ || !integ.is_active) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // 2. HMAC
  const body = await request.text()
  const signature = request.headers.get("x-vibook-signature") || ""
  let secret: string
  try {
    secret = decryptSecret(integ.webhook_secret)
  } catch (e: any) {
    console.error("Error decifrando webhook_secret:", e?.message)
    return NextResponse.json({ error: "Server config error" }, { status: 500 })
  }
  if (!verifyHmac("sha256", body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // 3. Idempotencia
  const eventId = payload.event_id || payload.manychat_user_id || `mc-${Date.now()}`
  const { error: logErr } = await admin.from("webhook_event_log").insert({
    org_id: integ.org_id,
    integration: "manychat",
    event_id: eventId,
    event_type: "lead",
    payload,
    result: "ok",
  })
  if (logErr && logErr.code === "23505") {
    return NextResponse.json({ status: "duplicate" }, { status: 200 })
  }

  // 4. Routing por crm_mode
  const { data: org } = await admin
    .from("organizations")
    .select("crm_mode")
    .eq("id", integ.org_id)
    .single()

  if ((org as any)?.crm_mode === "advanced") {
    // Resolver agency_id (asume default agency de la org)
    const { data: agency } = await admin
      .from("agencies")
      .select("id")
      .eq("org_id", integ.org_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!agency) {
      return NextResponse.json({ error: "No agency for org" }, { status: 500 })
    }
    const result = await handleManychatAdvancedLead(admin, integ.org_id, (agency as any).id, payload)
    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  }

  // crm_mode = 'legacy' → handler existente
  const result = await syncManychatLeadToLead(payload, admin)
  return NextResponse.json({
    success: true,
    created: result.created,
    leadId: result.leadId,
  }, { status: result.created ? 201 : 200 })
}
```

- [ ] **Step 6: Verificar que TS compila**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit 2>&1 | grep -E "manychat|integrations" | head -20
```

Resultado esperado: cero errores en estos archivos.

- [ ] **Step 7: Commit**

```bash
git add app/api/integrations/manychat lib/integrations/manychat __tests__/integrations/manychat-advanced.test.ts
git commit -m "feat(manychat): advanced webhook endpoint + handler with tag resolution"
```

---

### Task 10: Callbell-in webhook endpoint

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/sync-handler.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/integrations/callbell-in/[token]/webhook/route.ts`

- [ ] **Step 1: Implementar sync handler**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/sync-handler.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { CallbellWebhookEvent } from "./types"

export async function processCallbellEvent(
  admin: SupabaseClient<Database>,
  orgId: string,
  event: CallbellWebhookEvent
): Promise<{ handled: boolean; lead_id?: string }> {
  const contactUuid = event.data.contact?.uuid
  if (!contactUuid) return { handled: false }

  // Buscar lead por callbell_contact_uuid (asume columna o JSONB)
  // Por simplicidad: matching por phone (Callbell entrega phone en contact)
  const phone = event.data.contact?.phoneNumber
  if (!phone) return { handled: false }

  const { data: lead } = await admin
    .from("leads")
    .select("id, notes")
    .eq("org_id", orgId)
    .eq("contact_phone", phone)
    .maybeSingle()
  if (!lead) return { handled: false }

  const leadId = (lead as any).id

  switch (event.type) {
    case "funnel_changed": {
      const callbellFunnelUuid = event.data.funnelStage?.uuid
      if (!callbellFunnelUuid) break
      const { data: funnel } = await admin
        .from("lead_funnels")
        .select("id")
        .eq("org_id", orgId)
        .eq("callbell_funnel_uuid", callbellFunnelUuid)
        .maybeSingle()
      if (funnel) {
        await (admin.from("leads") as any)
          .update({ funnel_id: (funnel as any).id })
          .eq("id", leadId)
      }
      break
    }

    case "tag_added": {
      const callbellTagUuid = event.data.tag?.uuid
      if (!callbellTagUuid) break
      const { data: tag } = await admin
        .from("lead_tags")
        .select("id")
        .eq("org_id", orgId)
        .eq("callbell_tag_uuid", callbellTagUuid)
        .maybeSingle()
      if (tag) {
        await (admin.from("lead_tag_assignments") as any).upsert(
          { lead_id: leadId, tag_id: (tag as any).id, org_id: orgId },
          { onConflict: "lead_id,tag_id" }
        )
      }
      break
    }

    case "tag_removed": {
      const callbellTagUuid = event.data.tag?.uuid
      if (!callbellTagUuid) break
      const { data: tag } = await admin
        .from("lead_tags")
        .select("id")
        .eq("org_id", orgId)
        .eq("callbell_tag_uuid", callbellTagUuid)
        .maybeSingle()
      if (tag) {
        await admin
          .from("lead_tag_assignments")
          .delete()
          .eq("lead_id", leadId)
          .eq("tag_id", (tag as any).id)
      }
      break
    }

    case "agent_assigned": {
      const agentEmail = event.data.agent?.email
      if (!agentEmail) break
      const { data: user } = await admin
        .from("users")
        .select("id")
        .eq("email", agentEmail)
        .eq("org_id", orgId)
        .maybeSingle()
      if (user) {
        await (admin.from("leads") as any)
          .update({ assigned_seller_id: (user as any).id })
          .eq("id", leadId)
      }
      break
    }

    case "message_created": {
      const text = (event.data as any).message?.text
      if (text) {
        const noteStamp = `[${new Date().toISOString()} · Callbell msg]\n${text}\n`
        const newNotes = `${(lead as any).notes ?? ""}\n${noteStamp}`.trim()
        await (admin.from("leads") as any).update({ notes: newNotes }).eq("id", leadId)
      }
      break
    }

    default:
      return { handled: false, lead_id: leadId }
  }

  return { handled: true, lead_id: leadId }
}
```

- [ ] **Step 2: Implementar endpoint**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/integrations/callbell-in/[token]/webhook/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/integrations/secrets"
import { verifyHmac } from "@/lib/integrations/hmac"
import { processCallbellEvent } from "@/lib/integrations/callbell/sync-handler"
import type { CallbellWebhookEvent } from "@/lib/integrations/callbell/types"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient() as any

  const { data: integ } = await admin
    .from("integration_webhooks")
    .select("org_id, webhook_secret, is_active")
    .eq("integration", "callbell-in")
    .eq("webhook_token", token)
    .maybeSingle()

  if (!integ || !integ.is_active) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await request.text()
  const signature = request.headers.get("x-callbell-signature") || ""
  let secret: string
  try {
    secret = decryptSecret(integ.webhook_secret)
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
  if (!verifyHmac("sha256", body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: CallbellWebhookEvent
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventId = event.uuid || `cb-${Date.now()}`
  const { error: logErr } = await admin.from("webhook_event_log").insert({
    org_id: integ.org_id,
    integration: "callbell-in",
    event_id: eventId,
    event_type: event.type,
    payload: event,
    result: "ok",
  })
  if (logErr && logErr.code === "23505") {
    return NextResponse.json({ status: "duplicate" }, { status: 200 })
  }

  const result = await processCallbellEvent(admin, integ.org_id, event)
  return NextResponse.json(result, { status: 200 })
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/integrations/callbell/sync-handler.ts app/api/integrations/callbell-in
git commit -m "feat(callbell): incoming webhook endpoint with funnel/tag/agent/message sync"
```

---

### Task 11: Cron de reconciliación

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/reconcile.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/cron/callbell-reconcile/route.ts`

- [ ] **Step 1: Implementar lógica de reconciliación**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/integrations/callbell/reconcile.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { CallbellClient } from "./api-client"
import { decryptSecret } from "@/lib/integrations/secrets"
import { processCallbellEvent } from "./sync-handler"
import type { CallbellContact, CallbellWebhookEvent } from "./types"

/**
 * Reconcilia el estado entre Callbell y Vibook para todas las orgs en advanced mode.
 * Se llama desde el cron cada 30 min.
 */
export async function reconcileAllAdvancedOrgs(
  admin: SupabaseClient<Database>
): Promise<{ orgs_processed: number; events_applied: number }> {
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, last_callbell_sync_at")
    .eq("crm_mode", "advanced")

  let totalEvents = 0
  for (const org of (orgs ?? []) as any[]) {
    const orgEvents = await reconcileSingleOrg(admin, org.id, org.last_callbell_sync_at)
    totalEvents += orgEvents
  }
  return { orgs_processed: (orgs ?? []).length, events_applied: totalEvents }
}

async function reconcileSingleOrg(
  admin: SupabaseClient<Database>,
  orgId: string,
  lastSyncAt: string | null
): Promise<number> {
  const { data: integ } = await admin
    .from("integration_webhooks")
    .select("webhook_secret, is_active, config")
    .eq("org_id", orgId)
    .eq("integration", "callbell-out")
    .maybeSingle()
  if (!integ || !(integ as any).is_active) return 0

  const apiToken = decryptSecret((integ as any).webhook_secret)
  const client = new CallbellClient(apiToken)

  const since = lastSyncAt ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const contacts: CallbellContact[] = await client.listContactsModifiedSince(since)

  let applied = 0
  for (const c of contacts) {
    const synthEvent: CallbellWebhookEvent = {
      type: "contact_created",
      uuid: `reconcile-${c.uuid}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: { contact: c },
    }
    // El sync handler busca por phone — aplicamos cambios de funnel/tags/agent
    if (c.funnelStage) {
      await processCallbellEvent(admin, orgId, {
        ...synthEvent,
        type: "funnel_changed",
        data: { contact: c, funnelStage: c.funnelStage },
      })
      applied++
    }
    if (c.assignedAgent) {
      await processCallbellEvent(admin, orgId, {
        ...synthEvent,
        type: "agent_assigned",
        data: { contact: c, agent: c.assignedAgent },
      })
      applied++
    }
    // tags: comparar contra current y aplicar diff (simplificación: re-aplicar todas)
    for (const tag of c.tags ?? []) {
      await processCallbellEvent(admin, orgId, {
        ...synthEvent,
        type: "tag_added",
        data: { contact: c, tag },
      })
      applied++
    }
  }

  await (admin.from("organizations") as any)
    .update({ last_callbell_sync_at: new Date().toISOString() })
    .eq("id", orgId)

  return applied
}
```

- [ ] **Step 2: Implementar endpoint cron**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/cron/callbell-reconcile/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { reconcileAllAdvancedOrgs } from "@/lib/integrations/callbell/reconcile"

export async function POST(request: Request) {
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const start = Date.now()
  try {
    const result = await reconcileAllAdvancedOrgs(admin)
    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - start,
      ...result,
    })
  } catch (e: any) {
    console.error("callbell-reconcile error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/integrations/callbell/reconcile.ts app/api/cron/callbell-reconcile
git commit -m "feat(cron): callbell-reconcile endpoint + per-org reconciliation logic"
```

- [ ] **Step 4: Documentar Railway Cron Service**

Anotar en el doc maestro (`VICO_CALLBELL_INTEGRATION.md`) que hay que crear un Railway Cron Service nuevo con:

- Schedule: `*/30 * * * *`
- Command: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.vibook.ai/api/cron/callbell-reconcile`

Esto es config en Railway, no código. Lo crea Tomi a mano cuando deploy.

---

## FASE 3 — UI Advanced mode

### Task 12: Routing condicional en leads page

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/page.tsx`

- [ ] **Step 1: Leer la página actual para entender el patrón**

```bash
cat /Users/tomiisanchezz/Desktop/Repos/erplozada/app/\(dashboard\)/sales/leads/page.tsx | head -50
```

(Resultado: estructura actual del page con dynamic imports etc.)

- [ ] **Step 2: Modificar page.tsx para routing condicional**

Agregar al inicio (después de los imports actuales):

```tsx
import dynamic from "next/dynamic"
import { getScopedContext } from "@/lib/supabase/scoped-client"

const AdvancedCRMKanban = dynamic(
  () => import("./_components/advanced-crm-kanban").then((m) => m.AdvancedCRMKanban),
  { ssr: false }
)

// dentro del componente Page (es server component):
export default async function LeadsPage() {
  const { supabase, orgId } = await getScopedContext()
  const { data: org } = await supabase
    .from("organizations")
    .select("crm_mode")
    .eq("id", orgId)
    .single()

  if ((org as any)?.crm_mode === "advanced") {
    return <AdvancedCRMKanban orgId={orgId} />
  }

  // Comportamiento legacy actual — dejar todo el código existente intacto debajo.
  return <LegacyLeadsPage />
}
```

⚠️ **Importante**: el código legacy actual debe quedar tal cual, encapsulado en `<LegacyLeadsPage />`. Si el archivo no usa esa estructura, refactorearlo mínimo: extraer todo el JSX actual a un componente `LegacyLeadsPage` en el mismo archivo o en `_components/legacy-leads-page.tsx`.

- [ ] **Step 3: Verificar que carga para Lozada (que está en legacy)**

Manual: levantar `npm run dev` y entrar como Maxi. Resultado esperado: la página `/sales/leads` se ve idéntica a antes.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/sales/leads/page.tsx
git commit -m "feat(crm): routing condicional legacy/advanced en leads page"
```

---

### Task 13: Advanced kanban + lead card

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/_components/advanced-crm-kanban.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/_components/lead-card-advanced.tsx`

- [ ] **Step 1: Implementar lead card**

```tsx
"use client"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type LeadAdvanced = {
  id: string
  contact_name: string
  contact_phone: string
  notes: string | null
  tag_assignments: Array<{
    tag: { id: string; label: string; category: { name: string; color: string } }
  }>
  assigned_seller?: { name: string } | null
}

const COLOR_CLASSES: Record<string, string> = {
  red: "bg-red-100 text-red-800 border-red-300",
  green: "bg-green-100 text-green-800 border-green-300",
  purple: "bg-purple-100 text-purple-800 border-purple-300",
  orange: "bg-orange-100 text-orange-800 border-orange-300",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-300",
  blue: "bg-blue-100 text-blue-800 border-blue-300",
  gray: "bg-gray-100 text-gray-800 border-gray-300",
}

export function LeadCardAdvanced({ lead }: { lead: LeadAdvanced }) {
  return (
    <Card className="p-3 mb-2 cursor-pointer hover:shadow-md transition-shadow">
      <div className="font-medium text-sm">{lead.contact_name}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{lead.contact_phone}</div>
      <div className="flex flex-wrap gap-1 mt-2">
        {lead.tag_assignments.map((ta) => (
          <Badge
            key={ta.tag.id}
            variant="outline"
            className={`text-xs ${COLOR_CLASSES[ta.tag.category.color] ?? "bg-gray-100"}`}
          >
            {ta.tag.label}
          </Badge>
        ))}
      </div>
      {lead.assigned_seller && (
        <div className="text-[10px] text-muted-foreground mt-2">
          → {lead.assigned_seller.name}
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Implementar kanban container**

```tsx
"use client"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { LeadCardAdvanced } from "./lead-card-advanced"

type Funnel = { id: string; name: string; display_order: number; color: string | null }
type Lead = Parameters<typeof LeadCardAdvanced>[0]["lead"] & { funnel_id: string | null }

export function AdvancedCRMKanban({ orgId }: { orgId: string }) {
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: f } = await supabase
        .from("lead_funnels")
        .select("id, name, display_order, color")
        .eq("org_id", orgId)
        .order("display_order", { ascending: true })
      setFunnels((f ?? []) as any)

      const { data: l } = await supabase
        .from("leads")
        .select(`
          id, contact_name, contact_phone, notes, funnel_id,
          assigned_seller:assigned_seller_id(name),
          tag_assignments:lead_tag_assignments(
            tag:tag_id(id, label, category:category_id(name, color))
          )
        `)
        .eq("org_id", orgId)
        .not("funnel_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(500)
      setLeads((l ?? []) as any)
      setLoading(false)
    })()
  }, [orgId])

  if (loading) return <div className="p-6 text-muted-foreground">Cargando…</div>

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">CRM Vibook</h1>
      <div className="flex gap-3 overflow-x-auto">
        {funnels.map((f) => {
          const colLeads = leads.filter((l) => l.funnel_id === f.id)
          return (
            <div key={f.id} className="min-w-[280px] bg-muted/30 rounded-lg p-3 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm">{f.name}</h3>
                <span className="text-xs text-muted-foreground">{colLeads.length}</span>
              </div>
              {colLeads.map((lead) => (
                <LeadCardAdvanced key={lead.id} lead={lead} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar que renderiza sin errores**

Levantar dev server, entrar como user de VICO (después del seed). Si no hay user de VICO todavía, este test queda diferido a la fase 4.

Mientras tanto, verificar que TypeScript compila:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit 2>&1 | grep -E "advanced-crm|lead-card" | head -10
```

Resultado esperado: cero errores.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/sales/leads/_components/advanced-crm-kanban.tsx app/\(dashboard\)/sales/leads/_components/lead-card-advanced.tsx
git commit -m "feat(crm-ui): advanced kanban + lead card with multi-category tags"
```

---

### Task 14: Tag filter + assignment dialog

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/_components/tag-filter.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/sales/leads/_components/tag-assignment-dialog.tsx`

- [ ] **Step 1: Implementar tag filter (componente compacto)**

```tsx
"use client"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

type Category = {
  id: string
  name: string
  color: string
  tags: Array<{ id: string; label: string }>
}

export function TagFilter({
  categories,
  selected,
  onChange,
}: {
  categories: Category[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {categories.map((cat) => (
        <CategoryFilter
          key={cat.id}
          category={cat}
          selected={selected}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

function CategoryFilter({
  category,
  selected,
  onChange,
}: {
  category: Category
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedInThisCat = category.tags.filter((t) => selected.has(t.id))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {category.name} {selectedInThisCat.length > 0 && `(${selectedInThisCat.length})`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 max-h-80 overflow-y-auto">
        <div className="flex flex-col gap-1">
          {category.tags.map((t) => {
            const active = selected.has(t.id)
            return (
              <button
                key={t.id}
                onClick={() => {
                  const next = new Set(selected)
                  if (active) next.delete(t.id)
                  else next.add(t.id)
                  onChange(next)
                }}
                className={`text-left px-2 py-1 rounded text-sm hover:bg-muted ${active ? "bg-muted font-medium" : ""}`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Implementar tag assignment dialog (mínimo)**

```tsx
"use client"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  leadId: string
  onSaved?: () => void
}

export function TagAssignmentDialog({ open, onOpenChange, orgId, leadId, onSaved }: Props) {
  const [categories, setCategories] = useState<any[]>([])
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    ;(async () => {
      const { data: cats } = await supabase
        .from("lead_tag_categories")
        .select("id, name, color, cardinality, tags:lead_tags(id, label)")
        .eq("org_id", orgId)
        .order("display_order")
      setCategories((cats ?? []) as any)

      const { data: ass } = await supabase
        .from("lead_tag_assignments")
        .select("tag_id")
        .eq("lead_id", leadId)
      setAssigned(new Set((ass ?? []).map((a: any) => a.tag_id)))
    })()
  }, [open, orgId, leadId])

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const allTagIds = categories.flatMap((c) => c.tags.map((t: any) => t.id))
    const toRemove = allTagIds.filter((id) => !assigned.has(id))
    const toKeep = Array.from(assigned)

    await supabase
      .from("lead_tag_assignments")
      .delete()
      .eq("lead_id", leadId)
      .in("tag_id", toRemove)

    if (toKeep.length > 0) {
      await supabase
        .from("lead_tag_assignments")
        .upsert(
          toKeep.map((tagId) => ({ lead_id: leadId, tag_id: tagId, org_id: orgId })),
          { onConflict: "lead_id,tag_id" }
        )
    }
    setSaving(false)
    onSaved?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Etiquetas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat.id}>
              <div className="font-medium text-sm mb-2 capitalize">{cat.name}</div>
              <div className="flex flex-wrap gap-1">
                {cat.tags.map((t: any) => {
                  const active = assigned.has(t.id)
                  return (
                    <Badge
                      key={t.id}
                      variant={active ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        const next = new Set(assigned)
                        if (active) next.delete(t.id)
                        else {
                          if (cat.cardinality === "one") {
                            cat.tags.forEach((tt: any) => next.delete(tt.id))
                          }
                          next.add(t.id)
                        }
                        setAssigned(next)
                      }}
                    >
                      {t.label}
                    </Badge>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/sales/leads/_components/tag-filter.tsx app/\(dashboard\)/sales/leads/_components/tag-assignment-dialog.tsx
git commit -m "feat(crm-ui): tag filter popover + tag assignment dialog with cardinality enforcement"
```

---

### Task 15: Settings page para Callbell integration

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/settings/integrations/callbell/page.tsx`

- [ ] **Step 1: Implementar settings page (read-only para MVP)**

```tsx
import { getScopedContext } from "@/lib/supabase/scoped-client"
import { Card } from "@/components/ui/card"

export default async function CallbellIntegrationSettingsPage() {
  const { supabase, orgId } = await getScopedContext()

  const { data: org } = await supabase
    .from("organizations")
    .select("crm_mode, last_callbell_sync_at")
    .eq("id", orgId)
    .single()

  if ((org as any)?.crm_mode !== "advanced") {
    return <div className="p-6">Esta organización no está en modo CRM avanzado.</div>
  }

  const { data: integrations } = await supabase
    .from("integration_webhooks")
    .select("integration, is_active, created_at, updated_at")
    .eq("org_id", orgId)
    .in("integration", ["manychat", "callbell-in", "callbell-out"])

  const { data: recentEvents } = await supabase
    .from("webhook_event_log")
    .select("integration, event_type, processed_at, result")
    .eq("org_id", orgId)
    .order("processed_at", { ascending: false })
    .limit(20)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Integración Callbell</h1>

      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Última sincronización</div>
        <div className="font-medium">
          {(org as any)?.last_callbell_sync_at
            ? new Date((org as any).last_callbell_sync_at).toLocaleString("es-AR")
            : "Nunca"}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-medium mb-3">Estado de integraciones</h2>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr><th className="text-left">Integration</th><th className="text-left">Activa</th><th className="text-left">Última actualización</th></tr>
          </thead>
          <tbody>
            {(integrations ?? []).map((i: any) => (
              <tr key={i.integration}>
                <td className="py-1">{i.integration}</td>
                <td>{i.is_active ? "✓" : "✗"}</td>
                <td>{new Date(i.updated_at).toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-4">
        <h2 className="font-medium mb-3">Últimos 20 eventos</h2>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr><th className="text-left">Cuándo</th><th className="text-left">Source</th><th className="text-left">Tipo</th><th className="text-left">Resultado</th></tr>
          </thead>
          <tbody>
            {(recentEvents ?? []).map((e: any, i: number) => (
              <tr key={i}>
                <td className="py-1">{new Date(e.processed_at).toLocaleString("es-AR")}</td>
                <td>{e.integration}</td>
                <td>{e.event_type}</td>
                <td>{e.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/settings/integrations/callbell
git commit -m "feat(settings): callbell integration status page (read-only MVP)"
```

---

## FASE 4 — Activation + QA

### Task 16: Script seed-vico

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/scripts/seed-vico.ts`

- [ ] **Step 1: Implementar script**

```typescript
/**
 * scripts/seed-vico.ts
 *
 * One-off script para activar VICO Travel Group en crm_mode='advanced'.
 *
 * Uso:
 *   VICO_ORG_ID=<uuid> npx tsx scripts/seed-vico.ts
 *
 * Pre-requisitos:
 *   - La org de VICO ya existe (creada vía signup normal)
 *   - Migration 159 (advanced_crm_mode) aplicada
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
import { seedAdvancedMode } from "../lib/crm-presets/seed-advanced-mode"
import { VICO_TAG_CATEGORIES, VICO_FUNNELS } from "../lib/crm-presets/vico-preset"

loadEnv({ path: ".env.local" })

const orgId = process.env.VICO_ORG_ID
if (!orgId) {
  console.error("VICO_ORG_ID env var requerida")
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, key)

async function main() {
  console.log(`Seeding VICO org ${orgId}…`)
  await seedAdvancedMode(admin as any, orgId, {
    categories: VICO_TAG_CATEGORIES,
    funnels: VICO_FUNNELS,
  })
  const { data: counts } = await admin
    .rpc("noop")
    .then(async () => {
      const [c, t, f] = await Promise.all([
        admin.from("lead_tag_categories").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        admin.from("lead_tags").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        admin.from("lead_funnels").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      ])
      return { data: { categories: c.count, tags: t.count, funnels: f.count } }
    })
  console.log("Done. Counts:", counts)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Commit (NO ejecutar todavía)**

```bash
git add scripts/seed-vico.ts
git commit -m "chore(scripts): one-off seed script for VICO advanced mode activation"
```

---

### Task 17: Tests de no-regresión Lozada

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/isolation/advanced-mode-tenant-isolation.test.ts`

- [ ] **Step 1: Test de isolation**

```typescript
/**
 * @jest-environment node
 *
 * Verifica que:
 * - Tenant en advanced mode NO ve data de tenant en legacy
 * - Tenant en legacy NO ve tablas nuevas (las queries simplemente no devuelven)
 * - Webhook de un tenant NO crea filas en otro tenant
 * - Lozada (legacy) sigue intocado después de toda la migration
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const skipIfNoCreds = !SUPABASE_URL || !SERVICE_ROLE
const describeOrSkip = skipIfNoCreds ? describe.skip : describe

const LOZADA_ORG_ID = "1b326d20-d133-4112-a798-f54b5af7e7cb"

describeOrSkip("Advanced mode tenant isolation", () => {
  let admin: ReturnType<typeof createClient>

  beforeAll(() => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE!)
  })

  it("Lozada keeps crm_mode='legacy' (no accidental advance)", async () => {
    const { data } = await admin
      .from("organizations")
      .select("crm_mode")
      .eq("id", LOZADA_ORG_ID)
      .single()
    expect((data as any)?.crm_mode).toBe("legacy")
  })

  it("Lozada has no rows in lead_tag_categories", async () => {
    const { count } = await admin
      .from("lead_tag_categories")
      .select("id", { count: "exact", head: true })
      .eq("org_id", LOZADA_ORG_ID)
    expect(count).toBe(0)
  })

  it("Lozada has no rows in lead_tags", async () => {
    const { count } = await admin
      .from("lead_tags")
      .select("id", { count: "exact", head: true })
      .eq("org_id", LOZADA_ORG_ID)
    expect(count).toBe(0)
  })

  it("Lozada has no rows in lead_funnels", async () => {
    const { count } = await admin
      .from("lead_funnels")
      .select("id", { count: "exact", head: true })
      .eq("org_id", LOZADA_ORG_ID)
    expect(count).toBe(0)
  })

  it("Lozada leads have funnel_id IS NULL", async () => {
    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("org_id", LOZADA_ORG_ID)
      .not("funnel_id", "is", null)
    expect(count).toBe(0)
  })
})
```

- [ ] **Step 2: Correr tests**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/isolation/advanced-mode-tenant-isolation.test.ts
```

Resultado esperado: 5 PASS.

- [ ] **Step 3: Commit**

```bash
git add __tests__/isolation/advanced-mode-tenant-isolation.test.ts
git commit -m "test(isolation): assert Lozada untouched by advanced mode rollout"
```

---

### Task 18: Activar VICO + QA

**Manual / Operativo (no commits, pasos de runbook):**

- [ ] **Step 1: Verificar que la migration está aplicada en producción**

Pegar en chat para que Tomi confirme:

```
SELECT column_name FROM information_schema.columns
WHERE table_name = 'organizations' AND column_name IN ('crm_mode', 'last_callbell_sync_at');
SELECT COUNT(*) FROM lead_tag_categories;
SELECT COUNT(*) FROM lead_funnels;
```

Resultado esperado: 2 columnas, counts 0 antes del seed.

- [ ] **Step 2: Crear org de VICO via signup normal**

VICO se onboardea desde la UI normal de signup en `app.vibook.ai`. Anotar el `org_id` que sale.

- [ ] **Step 3: Correr seed-vico.ts**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && VICO_ORG_ID=<uuid> npx tsx scripts/seed-vico.ts
```

Resultado esperado: `Done. Counts: { categories: 4, tags: 60, funnels: 7 }`.

- [ ] **Step 4: Configurar webhooks integration_webhooks**

Pegar en chat para insertar las 3 filas con tokens reales:

```sql
-- Generar tokens random aparte (openssl rand -hex 16) y pasarlos acá:
-- Encriptar el secret de Callbell de VICO con encryptSecret() en un node REPL antes de pegarlo.

INSERT INTO integration_webhooks (org_id, integration, webhook_token, webhook_secret, is_active, config)
VALUES
  ('<vico-org-id>', 'manychat',     '<token-manychat>',     '<encrypted-secret>', true, '{}'),
  ('<vico-org-id>', 'callbell-in',  '<token-callbell-in>',  '<encrypted-secret>', true, '{}'),
  ('<vico-org-id>', 'callbell-out', 'unused-out',           '<encrypted-api-token>', true, '{}');
```

- [ ] **Step 5: Correr scripts/seed-callbell-mapping.ts (a crear si hace falta)**

Este script usa `CallbellClient` para fetch tags y funnels reales del workspace de VICO, y mapea por label normalizado a las filas de Vibook actualizando `callbell_tag_uuid` y `callbell_funnel_uuid`.

(Se implementa cuando se confirme contra docs reales de Callbell. No bloquea el activation inicial — el sync funciona pero los UUIDs no estarán mapeados hasta que se corra.)

- [ ] **Step 6: Crear Railway Cron Service**

En Railway dashboard de Tomi:
- Service nuevo: `vibook-callbell-reconcile`
- Schedule: `*/30 * * * *`
- Command: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.vibook.ai/api/cron/callbell-reconcile`
- Env vars: `CRON_SECRET` (mismo que el resto de los crons)

- [ ] **Step 7: Tomi configura bot ManyChat**

En paralelo a esto, Tomi arma el bot ManyChat con:
- Flow del set MVP de preguntas
- 5 rutas iniciales (lead nuevo / posventa / urgencia / Mundial / F1)
- 2 webhooks paralelos al final del flow:
  - POST `https://app.vibook.ai/api/integrations/manychat/<token-manychat>/webhook` con HMAC sha256 en `X-Vibook-Signature`
  - POST a Callbell API para crear contact + tags + funnel inicial

- [ ] **Step 8: VICO configura webhook outbound de Callbell**

Tomi le pasa a Enzo (referente técnico VICO) la URL:
`https://app.vibook.ai/api/integrations/callbell-in/<token-callbell-in>/webhook`

Y le indica configurarla en Callbell dashboard como webhook de eventos: `funnel_changed`, `tag_added`, `tag_removed`, `agent_assigned`, `message_created`.

- [ ] **Step 9: QA con 5 leads reales**

Mandar 5 mensajes de prueba al WhatsApp de VICO desde números distintos. Para cada uno verificar:
- Lead aparece en Vibook con tags correctos
- Lead aparece en Callbell con tags correctos
- Cuando vendedora cambia funnel en Callbell → Vibook se actualiza dentro de 30s (webhook) o dentro de 30 min (cron)
- Cuando vendedora agrega tag en Callbell → Vibook se actualiza
- Cuando vendedora cierra venta (funnel = VENDIDO) → Vibook refleja el cambio

- [ ] **Step 10: Verificar que Lozada sigue idéntico**

Login como Maxi en `app.vibook.ai`. Comprobar:
- `/sales/leads` carga con UI legacy (kanban actual)
- Counts de leads de Lozada sin cambios
- Webhook de Trello + ManyChat de Lozada siguen funcionando (mandar evento de prueba)

Si todo OK → integración productiva.

---

## Resumen de tasks

| Fase | Task | Descripción | Commits estimados |
|---|---|---|---|
| 1 | 1 | Migration SQL (pegar en chat) | 1 |
| 1 | 2 | Regenerar tipos | 1 |
| 1 | 3 | VICO preset data | 1 |
| 1 | 4 | Seed function (TDD) | 1 |
| 2 | 5 | Helper de encriptación | 1 |
| 2 | 6 | Tag resolver (TDD) | 1 |
| 2 | 7 | HMAC verification | 1 |
| 2 | 8 | Callbell API client | 1 |
| 2 | 9 | ManyChat advanced webhook (TDD) | 1 |
| 2 | 10 | Callbell-in webhook | 1 |
| 2 | 11 | Cron de reconciliación | 1 |
| 3 | 12 | Routing condicional | 1 |
| 3 | 13 | Advanced kanban + lead card | 1 |
| 3 | 14 | Tag filter + dialog | 1 |
| 3 | 15 | Settings page | 1 |
| 4 | 16 | Script seed-vico | 1 |
| 4 | 17 | Tests no-regresión Lozada | 1 |
| 4 | 18 | Activación + QA (manual) | 0 |

**Total**: 17 commits + activación operativa.

---

## Self-review

### Cobertura del spec

- ✅ Schema completo (sección 3.1 del spec) → Task 1
- ✅ Tipos generados → Task 2
- ✅ Seed function genérica + preset VICO → Tasks 3, 4
- ✅ Encriptación de webhook secrets → Task 5
- ✅ Tag resolver con label normalization → Task 6
- ✅ HMAC verification → Task 7
- ✅ Callbell API client → Task 8
- ✅ Endpoint ManyChat advanced (sección 4.1) → Task 9
- ✅ Endpoint Callbell-in (sección 4.2) → Task 10
- ✅ Cron de reconciliación (sección 4.3) → Task 11
- ✅ Routing condicional UI → Task 12
- ✅ Advanced kanban → Task 13
- ✅ Tag filter + assignment → Task 14
- ✅ Settings page → Task 15
- ✅ Script de activación VICO → Task 16
- ✅ Tests de no-regresión Lozada → Task 17
- ✅ Activación operativa + QA → Task 18

### Out of scope (correcto)

- Push Vibook → Callbell (Fase 2)
- UI self-service de tag/funnel management (Fase 2)
- Recordatorios automáticos 24h/48h (Fase 2)
- Drag-drop de funnels (Fase 2 — la UI de Task 13 muestra columnas pero no implementa drag, suficiente para MVP)
- Operations creadas al marcar VENDIDO (decidir cuando VICO use Vibook como ERP)
- AI parsing del mensaje (no se solicitó)

### Dependencias entre tasks

- Tasks 1, 2 son fundacionales: bloquean todo
- Tasks 3, 4 dependen de 1, 2
- Tasks 5, 7 son independientes entre sí
- Task 6 depende de 1
- Task 8 es independiente (validar contra docs reales antes)
- Tasks 9, 10 dependen de 5, 6, 7
- Task 11 depende de 8, 10
- Task 12 depende de 1
- Tasks 13, 14, 15 dependen de 12
- Task 16 depende de 4
- Task 17 depende de 1 (puede correr sin el resto del feature en marcha)
- Task 18 depende de TODO el resto

### Notas para el ejecutor

- **No pushear sin OK explícito** — todos los commits son locales. Push solo cuando Tomi lo apruebe.
- **Migrations en chat** — Tasks 1, 18.4 requieren pegar SQL en el chat para Supabase SQL Editor, no usar `supabase db push`.
- **Hosting Railway** — el cron de Task 11 se configura en Railway dashboard, no `vercel.json`.
- **Validar contra docs reales de Callbell** antes de Task 8 — los nombres de endpoints pueden estar desactualizados.
- **Lozada intacto** — antes de mergear cualquier task, correr Task 17 para confirmar que la regresión no aplica.
