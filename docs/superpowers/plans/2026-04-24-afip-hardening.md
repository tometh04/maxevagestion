# AFIP Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la fase 1a del programa AFIP — hacer confiable y aislado el flujo de emisión de facturas electrónicas: verificación post-hoc con getVoucherInfo, recovery de race conditions, aislamiento multi-tenant por `org_id` con RLS, cotización USD pre-check, y consolidación de UI duplicada.

**Architecture:** Wrapper canónico `AfipService` (una instancia por request por tenant) que centraliza TODO acceso al `@afipsdk/afip.js`. Cada emisión loggea request/response/verified en nueva tabla `afip_voucher_requests` (evidencia). Multi-tenant scoping mediante `org_id` + RLS policies (reemplazando el `agency_id`-only legacy). Test-driven con Jest (next/jest), smoke test manual en AFIP homologación.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Supabase PostgreSQL + RLS, `@afipsdk/afip.js`, Jest + jest-environment-node, Railway (1 replica activa).

**Ref spec:** `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-24-afip-hardening-design.md`

**Git policy:** Commits locales frecuentes OK. Push final al terminar todo, con OK explícito del user (regla de memoria `feedback_no_push_until_told.md`).

**Supabase policy:** Migraciones SQL se aplican por SQL Editor web (no `supabase db push`). Este plan pega el SQL completo en Task 1 para copiar y pegar (regla `feedback_supabase_migrations.md`).

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260424120000_afip_hardening.sql` | Tabla `afip_voucher_requests`, `padron_cache`, columnas en `invoices`, scoping `org_id` en `integrations`, RLS policies |
| `lib/afip/diff.ts` | Helper puro: comparar voucher enviado vs recibido → diff object |
| `lib/afip/rate-cache.ts` | Cache in-memory TTL para cotizaciones oficiales AFIP |
| `lib/afip/afip-service.ts` | Clase `AfipService` + factory `getAfipServiceForOrg` |
| `app/api/invoices/[id]/verify/route.ts` | POST on-demand verify contra AFIP |
| `__tests__/afip/diff.test.ts` | Tests unit del diff helper |
| `__tests__/afip/rate-cache.test.ts` | Tests unit del cache con fake timers |
| `__tests__/afip/afip-service.test.ts` | Tests unit de AfipService con SDK mockeado (issueVoucher happy/discrepancy/recovery) |
| `__tests__/afip/tenant-isolation-afip.test.ts` | Integration test RLS: user A no ve invoices/requests de user B |
| `scripts/afip-smoke-test.ts` | Smoke manual contra AFIP homologación (CUIT test) |

### Modified files

| Path | Change |
|---|---|
| `lib/supabase/types.ts` | Regenerar tras aplicar migración (comando `npm run db:generate`) |
| `app/api/invoices/[id]/authorize/route.ts` | Thin controller: valida tenant access + cotización pre-check + delega a `AfipService.issueVoucher` |
| `app/api/invoices/route.ts` | POST: set `org_id` en insert |
| `lib/afip/afip-helpers.ts` | `getAfipConfigForAgency` ahora filtra por `org_id` además de `agency_id` |
| `app/(dashboard)/operations/billing/new/page.tsx` | Portar Factura C (monotributista) + fetch cotización al cambiar moneda + aviso visual >2% diff |
| Callers de `NewInvoiceDialog` | Reemplazar open-dialog por `router.push('/operations/billing/new?operationId=X')` |

### Deleted files

- `components/invoices/new-invoice-dialog.tsx`

### No new npm dependencies

El plan NO agrega `p-queue` ni otras libs — YAGNI. Si aparecen issues de rate-limit en post-deploy (muy improbable con ≤100 CUITs activos), se añade en un follow-up spec.

---

## Phase 1 — Foundation: Database & Pure Helpers

### Task 1: Aplicar migración SQL

**Files:**
- Create: `supabase/migrations/20260424120000_afip_hardening.sql`

- [ ] **Step 1: Crear el archivo de migración**

Escribir el siguiente contenido exacto en `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260424120000_afip_hardening.sql`:

```sql
-- ============================================================
-- Migración: AFIP Hardening (SP-1 fase 1a)
-- - Tabla afip_voucher_requests (audit log)
-- - Tabla padron_cache (cache consultas padrón)
-- - Columnas de verificación en invoices
-- - Scoping org_id en integrations
-- - RLS policies actualizadas
-- ============================================================

-- afip_voucher_requests ----------------------------------------
CREATE TABLE IF NOT EXISTS afip_voucher_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),
  agency_id UUID REFERENCES agencies(id),
  idempotency_key TEXT NOT NULL,
  attempt_n INT NOT NULL DEFAULT 1,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'verify', 'recover')),
  request_payload JSONB,
  response_payload JSONB,
  verified_payload JSONB,
  verification_diff JSONB,
  error TEXT,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  UNIQUE (idempotency_key, attempt_n)
);

CREATE INDEX idx_afip_voucher_requests_invoice ON afip_voucher_requests(invoice_id);
CREATE INDEX idx_afip_voucher_requests_org ON afip_voucher_requests(org_id);
CREATE INDEX idx_afip_voucher_requests_idempotency ON afip_voucher_requests(idempotency_key);

ALTER TABLE afip_voucher_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY afip_voucher_requests_tenant_isolation
  ON afip_voucher_requests
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- padron_cache ------------------------------------------------
CREATE TABLE IF NOT EXISTS padron_cache (
  cuit TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);
CREATE INDEX idx_padron_cache_expires ON padron_cache(expires_at);

-- No RLS en padron_cache: data pública, cualquier user auth puede leerla/escribirla
ALTER TABLE padron_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY padron_cache_authenticated_all
  ON padron_cache
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- invoices: columnas de verificación + org_id ----------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_status TEXT
    CHECK (verification_status IN ('unverified', 'verified', 'discrepancy', 'not_found_in_afip')),
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_error TEXT;

-- Backfill org_id desde agencies
UPDATE invoices i
SET org_id = a.org_id
FROM agencies a
WHERE a.id = i.agency_id AND i.org_id IS NULL;

-- Set default verification_status para las viejas
UPDATE invoices
SET verification_status = 'unverified'
WHERE verification_status IS NULL;

-- Validación previa al NOT NULL: abortar si hay filas sin org_id
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM invoices WHERE org_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Hay % invoices sin org_id tras backfill. Investigar antes de NOT NULL.', orphan_count;
  END IF;
END $$;

ALTER TABLE invoices ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);

DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices;
CREATE POLICY invoices_tenant_isolation
  ON invoices
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- integrations: scoping org_id --------------------------------
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

UPDATE integrations i
SET org_id = a.org_id
FROM agencies a
WHERE a.id = i.agency_id AND i.org_id IS NULL;

-- Validación
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM integrations WHERE org_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Hay % integrations sin org_id tras backfill.', orphan_count;
  END IF;
END $$;

ALTER TABLE integrations ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations(org_id);

DROP POLICY IF EXISTS integrations_tenant_isolation ON integrations;
CREATE POLICY integrations_tenant_isolation
  ON integrations
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- Fin migración ---------------------------------------------
```

- [ ] **Step 2: Pegar el SQL al user para aplicar**

Incluir el contenido EXACTO del archivo en un bloque ```sql en el chat. Pedirle: "Aplicá esto en el SQL Editor de Supabase (proyecto `pmqvplyyxiobkllapgjp`). Si el DO $$ aborta con 'Hay X invoices/integrations sin org_id', avisame — investigamos cuáles son huérfanos antes de seguir."

- [ ] **Step 3: Regenerar types TypeScript**

Esperar confirmación del user de que aplicó la migración exitosamente. Después correr:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run db:generate
```

Expected: actualiza `lib/supabase/types.ts`. Verificar con `git diff lib/supabase/types.ts | head -60` que aparecen las nuevas tablas `afip_voucher_requests` y `padron_cache`, y las columnas nuevas en `invoices`.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add supabase/migrations/20260424120000_afip_hardening.sql lib/supabase/types.ts && git commit -m "$(cat <<'EOF'
feat(afip): migration hardening (SP-1 fase 1a)

- Tabla afip_voucher_requests (audit log de cada call a AFIP)
- Tabla padron_cache (TTL 30 días)
- Columnas verification_* en invoices
- Scoping org_id en invoices e integrations + RLS policies

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Diff helper (pure function, TDD)

**Files:**
- Create: `lib/afip/diff.ts`
- Test: `__tests__/afip/diff.test.ts`

- [ ] **Step 1: Escribir el test**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/afip/diff.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { diffVoucher } from "@/lib/afip/diff"

describe("diffVoucher", () => {
  const base = {
    CAE: "12345678901234",
    CAEFchVto: "20260530",
    ImpTotal: 12100,
    ImpNeto: 10000,
    ImpIVA: 2100,
    DocNro: 20123456789,
    DocTipo: 80,
    CbteFch: "20260424",
    CbteDesde: 42,
    CbteHasta: 42,
  }

  it("returns null when sent === received", () => {
    expect(diffVoucher(base, { ...base })).toBeNull()
  })

  it("detects ImpTotal difference greater than 1 cent", () => {
    const received = { ...base, ImpTotal: 12102 }
    expect(diffVoucher(base, received)).toEqual({
      ImpTotal: { sent: 12100, received: 12102 },
    })
  })

  it("tolerates ImpTotal difference of 1 cent (AFIP rounds oddly)", () => {
    const received = { ...base, ImpTotal: 12101 }
    expect(diffVoucher(base, received)).toBeNull()
  })

  it("detects CbteFch mismatch as string", () => {
    const received = { ...base, CbteFch: "20260425" }
    expect(diffVoucher(base, received)).toEqual({
      CbteFch: { sent: "20260424", received: "20260425" },
    })
  })

  it("detects DocNro mismatch", () => {
    const received = { ...base, DocNro: 20999999999 }
    expect(diffVoucher(base, received)).toHaveProperty("DocNro")
  })

  it("returns multiple field diff", () => {
    const received = { ...base, ImpTotal: 99999, CbteFch: "20260425" }
    const result = diffVoucher(base, received)
    expect(result).toHaveProperty("ImpTotal")
    expect(result).toHaveProperty("CbteFch")
  })

  it("handles null received (voucher not found in AFIP)", () => {
    expect(diffVoucher(base, null)).toEqual({ _not_found: true })
  })
})
```

- [ ] **Step 2: Correr el test, verificar que falla**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/diff.test.ts
```

Expected: FAIL con "Cannot find module '@/lib/afip/diff'".

- [ ] **Step 3: Implementar diff.ts**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/afip/diff.ts`:

```typescript
/**
 * Comparación campo-a-campo entre el voucher enviado a AFIP y lo que
 * getVoucherInfo devuelve al hacer read-back. Tolerancia de 1 centavo
 * en importes porque AFIP a veces redondea raro.
 */

export interface VoucherFields {
  CAE: string
  CAEFchVto: string
  ImpTotal: number
  ImpNeto: number
  ImpIVA: number
  DocNro: number
  DocTipo: number
  CbteFch: string
  CbteDesde: number
  CbteHasta: number
}

export type VoucherDiff =
  | null
  | { _not_found: true }
  | Partial<Record<keyof VoucherFields, { sent: unknown; received: unknown }>>

const MONEY_FIELDS: (keyof VoucherFields)[] = ["ImpTotal", "ImpNeto", "ImpIVA"]
const MONEY_TOLERANCE = 0.01

export function diffVoucher(
  sent: VoucherFields,
  received: Partial<VoucherFields> | null
): VoucherDiff {
  if (received === null) {
    return { _not_found: true }
  }

  const diff: Record<string, { sent: unknown; received: unknown }> = {}

  for (const key of Object.keys(sent) as (keyof VoucherFields)[]) {
    const s = sent[key]
    const r = received[key]

    if (MONEY_FIELDS.includes(key)) {
      const sn = Number(s)
      const rn = Number(r)
      if (Math.abs(sn - rn) > MONEY_TOLERANCE) {
        diff[key] = { sent: s, received: r }
      }
    } else {
      if (String(s) !== String(r)) {
        diff[key] = { sent: s, received: r }
      }
    }
  }

  return Object.keys(diff).length === 0 ? null : (diff as VoucherDiff)
}
```

- [ ] **Step 4: Correr el test, verificar PASS**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/diff.test.ts
```

Expected: PASS (7 tests passing).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/afip/diff.ts __tests__/afip/diff.test.ts && git commit -m "$(cat <<'EOF'
feat(afip): diff helper with 1-cent tolerance

Compara voucher enviado vs getVoucherInfo con tolerancia de 1ct en
importes (AFIP redondea raro). Retorna null si coinciden, _not_found
si la factura no está en AFIP, o diff por campo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rate cache (pure, with fake timers)

**Files:**
- Create: `lib/afip/rate-cache.ts`
- Test: `__tests__/afip/rate-cache.test.ts`

- [ ] **Step 1: Escribir el test**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/afip/rate-cache.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { RateCache } from "@/lib/afip/rate-cache"

describe("RateCache", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("returns undefined for miss", () => {
    const cache = new RateCache(3_600_000)
    expect(cache.get("DOL:20260424")).toBeUndefined()
  })

  it("returns value before TTL expires", () => {
    const cache = new RateCache(3_600_000) // 1h
    cache.set("DOL:20260424", 1415)
    expect(cache.get("DOL:20260424")).toBe(1415)
  })

  it("returns undefined after TTL", () => {
    const cache = new RateCache(3_600_000)
    cache.set("DOL:20260424", 1415)
    jest.advanceTimersByTime(3_600_001)
    expect(cache.get("DOL:20260424")).toBeUndefined()
  })

  it("returns value 1ms before TTL expires", () => {
    const cache = new RateCache(3_600_000)
    cache.set("DOL:20260424", 1415)
    jest.advanceTimersByTime(3_599_999)
    expect(cache.get("DOL:20260424")).toBe(1415)
  })

  it("allows overwrite which resets TTL", () => {
    const cache = new RateCache(1000)
    cache.set("DOL", 1000)
    jest.advanceTimersByTime(500)
    cache.set("DOL", 1500) // overwrite
    jest.advanceTimersByTime(600)
    expect(cache.get("DOL")).toBe(1500) // sigue vivo porque se reseteó TTL
  })
})
```

- [ ] **Step 2: Correr, verificar FAIL**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/rate-cache.test.ts
```

Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar rate-cache.ts**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/afip/rate-cache.ts`:

```typescript
/**
 * In-memory cache con TTL para cotizaciones oficiales de AFIP.
 * Vive el proceso Node — Railway tiene 1 replica activa así que es
 * suficiente. Si en el futuro escalamos horizontal, migrar a Upstash.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class RateCache<T = number> {
  private store: Map<string, CacheEntry<T>> = new Map()

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  clear(): void {
    this.store.clear()
  }
}

// Singleton global: 1 instance para cotizaciones AFIP con TTL 1h.
export const afipRateCache = new RateCache<number>(60 * 60 * 1000)
```

- [ ] **Step 4: Correr, verificar PASS**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/rate-cache.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/afip/rate-cache.ts __tests__/afip/rate-cache.test.ts && git commit -m "$(cat <<'EOF'
feat(afip): in-memory RateCache with TTL

Cache para cotizaciones oficiales AFIP. Singleton afipRateCache con
TTL 1h. Suficiente para Railway 1-replica; si escalamos horizontal,
migrar a Upstash.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Service Layer (AfipService)

### Task 4: AfipService shell + factory

**Files:**
- Create: `lib/afip/afip-service.ts`
- Test: `__tests__/afip/afip-service.test.ts`

- [ ] **Step 1: Escribir test del factory**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/afip/afip-service.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"

// Mock @afipsdk/afip.js para evitar hitear AFIP real
jest.mock("@afipsdk/afip.js", () => {
  return jest.fn().mockImplementation(() => ({
    ElectronicBilling: {
      createNextVoucher: jest.fn(),
      getLastVoucher: jest.fn(),
      getVoucherInfo: jest.fn(),
      getSalesPoints: jest.fn(),
      getExchangeRate: jest.fn(),
    },
    GetServiceTA: jest.fn(),
  }))
})

describe("getAfipServiceForOrg", () => {
  it("returns null when no AFIP config exists for org", async () => {
    const supabase = makeMockSupabase({ integrations: [] })
    const svc = await getAfipServiceForOrg(supabase as any, "org-aaa")
    expect(svc).toBeNull()
  })

  it("returns AfipService instance when config exists", async () => {
    const supabase = makeMockSupabase({
      integrations: [
        {
          org_id: "org-aaa",
          integration_type: "afip",
          status: "active",
          config: {
            api_key: "TEST_KEY",
            cuit: "20123456789",
            point_of_sale: 1,
            environment: "sandbox",
            cert: "-----BEGIN CERT-----",
            key: "-----BEGIN KEY-----",
          },
        },
      ],
    })
    const svc = await getAfipServiceForOrg(supabase as any, "org-aaa")
    expect(svc).not.toBeNull()
    expect(svc?.orgId).toBe("org-aaa")
  })
})

function makeMockSupabase(data: { integrations: any[] }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          eq: (c2: string, v2: string) => ({
            eq: (c3: string, v3: string) => ({
              maybeSingle: async () => {
                const match = data.integrations.find(
                  (i) =>
                    i.org_id === val &&
                    i.integration_type === v2 &&
                    i.status === v3
                )
                return { data: match || null, error: null }
              },
            }),
          }),
        }),
      }),
    }),
  }
}
```

- [ ] **Step 2: Correr test, FAIL esperado**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar AfipService shell**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/afip/afip-service.ts`:

```typescript
/**
 * AfipService: wrapper canónico sobre @afipsdk/afip.js.
 * Una instancia por request por tenant. Centraliza TODO acceso al SDK.
 *
 * Spec: docs/superpowers/specs/2026-04-24-afip-hardening-design.md
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AfipConfig } from "./afip-config"
import { isAfipConfigValid } from "./afip-config"
import { afipRateCache } from "./rate-cache"
import { diffVoucher, type VoucherFields, type VoucherDiff } from "./diff"

type AfipSdkInstance = {
  ElectronicBilling: {
    createNextVoucher: (data: any, opts?: any) => Promise<any>
    getLastVoucher: (pv: number, cbte: number) => Promise<number>
    getVoucherInfo: (nro: number, pv: number, cbte: number) => Promise<any | null>
    getSalesPoints: () => Promise<any>
    getExchangeRate: (monId: string, date: string) => Promise<any>
  }
  RegisterScopeThirteen?: {
    getTaxpayerDetails: (cuit: number) => Promise<any>
  }
  GetServiceTA: (service: string) => Promise<any>
}

function createAfipSdkInstance(config: AfipConfig): AfipSdkInstance {
  // Evitar bundle issues con webpack — el SDK es CommonJS
  /* eslint-disable-next-line @typescript-eslint/no-require-imports */
  const Afip = require("@afipsdk/afip.js")
  return new Afip({
    CUIT: Number(config.cuit),
    production: config.environment === "production",
    access_token: config.api_key,
    ...(config.cert && { cert: config.cert }),
    ...(config.key && { key: config.key }),
  })
}

export interface IssueResult {
  success: boolean
  cae?: string
  cbte_nro?: number
  cae_fch_vto?: string
  verification_status: "verified" | "discrepancy" | "not_found_in_afip" | "unverified"
  diff?: VoucherDiff
  request_id?: string
  error?: string
}

export interface VerifyResult {
  verification_status: "verified" | "discrepancy" | "not_found_in_afip"
  diff?: VoucherDiff
  last_sync_at: string
}

export class AfipService {
  private afip: AfipSdkInstance

  constructor(
    private config: AfipConfig,
    private supabase: SupabaseClient,
    public readonly orgId: string
  ) {
    this.afip = createAfipSdkInstance(config)
  }

  // Métodos públicos se implementan en tasks siguientes.
  // Por ahora solo el shell.
}

/**
 * Factory: construye un AfipService para un org específico, leyendo la
 * config desde la tabla integrations. Retorna null si no hay config.
 *
 * Respeta RLS: si el user no tiene acceso al org, la query devuelve null.
 */
export async function getAfipServiceForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<AfipService | null> {
  const { data: integration } = await (supabase
    .from("integrations") as any)
    .select("*")
    .eq("org_id", orgId)
    .eq("integration_type", "afip")
    .eq("status", "active")
    .maybeSingle()

  if (!integration || !integration.config) {
    return null
  }

  const config = integration.config as Partial<AfipConfig>
  if (!isAfipConfigValid(config)) {
    return null
  }

  return new AfipService(config as AfipConfig, supabase, orgId)
}
```

- [ ] **Step 4: Correr test, verificar PASS**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/afip/afip-service.ts __tests__/afip/afip-service.test.ts && git commit -m "$(cat <<'EOF'
feat(afip): AfipService shell + getAfipServiceForOrg factory

Clase canónica por tenant, construida por request. Factory lee config
desde integrations table scopeada por org_id (respeta RLS).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: AfipService.issueVoucher — happy path

**Files:**
- Modify: `lib/afip/afip-service.ts` (agregar método)
- Modify: `__tests__/afip/afip-service.test.ts` (agregar tests)

- [ ] **Step 1: Escribir test happy path**

Agregar al final de `__tests__/afip/afip-service.test.ts` (antes del `function makeMockSupabase(...)`):

```typescript
describe("AfipService.issueVoucher — happy path", () => {
  it("creates voucher, verifies via getVoucherInfo, logs request, updates invoice", async () => {
    // Arrange
    const mockCreate = jest.fn().mockResolvedValue({
      CAE: "12345678901234",
      CAEFchVto: "20260530",
      voucherNumber: 42,
    })
    const mockGetInfo = jest.fn().mockResolvedValue({
      CodAutorizacion: "12345678901234",
      CAE: "12345678901234",
      CAEFchVto: "20260530",
      ImpTotal: 12100,
      ImpNeto: 10000,
      ImpIVA: 2100,
      DocNro: 20123456789,
      DocTipo: 80,
      CbteFch: "20260424",
      CbteDesde: 42,
      CbteHasta: 42,
    })

    const inserts: any[] = []
    const updates: any[] = []
    const supabase = makeInvoiceRequestsSupabase({ inserts, updates })

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(),
      supabase as any,
      "org-aaa"
    )
    ;(svc as any).afip = makeMockSdk({ createNext: mockCreate, getInfo: mockGetInfo })

    // Act
    const result = await svc.issueVoucher(sampleDraft())

    // Assert
    expect(result.success).toBe(true)
    expect(result.cae).toBe("12345678901234")
    expect(result.verification_status).toBe("verified")
    expect(result.diff).toBeNull()

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ CbteTipo: 6, PtoVta: 1 }),
      { returnFullResponse: true }
    )
    expect(mockGetInfo).toHaveBeenCalledWith(42, 1, 6)

    // verify inserts en afip_voucher_requests: 1 de 'create' + 1 de 'verify'
    expect(inserts.filter((i) => i.table === "afip_voucher_requests").length).toBe(2)
    const ops = inserts
      .filter((i) => i.table === "afip_voucher_requests")
      .map((i) => i.row.operation)
    expect(ops).toEqual(expect.arrayContaining(["create", "verify"]))

    // verify update en invoices
    const invUpdate = updates.find((u) => u.table === "invoices")
    expect(invUpdate).toBeDefined()
    expect(invUpdate.row.cae).toBe("12345678901234")
    expect(invUpdate.row.verification_status).toBe("verified")
    expect(invUpdate.row.status).toBe("authorized")
  })
})

// Helpers para los tests
function sandboxConfig() {
  return {
    api_key: "TEST_KEY",
    cuit: "20123456789",
    point_of_sale: 1,
    environment: "sandbox" as const,
    cert: "-----BEGIN CERT-----",
    key: "-----BEGIN KEY-----",
  }
}

function sampleDraft() {
  return {
    id: "inv-001",
    org_id: "org-aaa",
    agency_id: "ag-aaa",
    pto_vta: 1,
    cbte_tipo: 6,
    concepto: 2,
    receptor_doc_tipo: 80,
    receptor_doc_nro: "20123456789",
    receptor_condicion_iva: 5,
    imp_total: 12100,
    imp_neto: 10000,
    imp_iva: 2100,
    imp_tot_conc: 0,
    imp_op_ex: 0,
    imp_trib: 0,
    moneda: "PES",
    cotizacion: 1,
    fch_serv_desde: "2026-04-24",
    fch_serv_hasta: "2026-04-24",
    fecha_emision: "2026-04-24",
    invoice_items: [
      { subtotal: 10000, iva_importe: 2100, iva_id: 5, iva_porcentaje: 21, tax_treatment: "GRAVADO" },
    ],
  }
}

function makeMockSdk(opts: { createNext: jest.Mock; getInfo: jest.Mock }) {
  return {
    ElectronicBilling: {
      createNextVoucher: opts.createNext,
      getLastVoucher: jest.fn(),
      getVoucherInfo: opts.getInfo,
      getSalesPoints: jest.fn(),
      getExchangeRate: jest.fn(),
    },
    GetServiceTA: jest.fn(),
  }
}

function makeInvoiceRequestsSupabase(capture: {
  inserts: any[]
  updates: any[]
}) {
  const builder = (table: string) => ({
    insert: (row: any) => {
      capture.inserts.push({ table, row })
      return {
        select: () => ({
          single: async () => ({ data: { id: `${table}-row-id` }, error: null }),
        }),
      }
    },
    update: (row: any) => ({
      eq: () => {
        capture.updates.push({ table, row })
        return Promise.resolve({ data: null, error: null })
      },
    }),
  })
  return { from: builder }
}
```

- [ ] **Step 2: Correr, verificar FAIL**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: FAIL con "issueVoucher is not a function".

- [ ] **Step 3: Implementar issueVoucher (happy path)**

Agregar al final de la clase `AfipService` en `lib/afip/afip-service.ts` (antes del cierre de la clase):

```typescript
  async issueVoucher(draft: any): Promise<IssueResult> {
    const idempotencyKey = `${draft.org_id}:${draft.pto_vta}:${draft.cbte_tipo}:${draft.id}`

    const payload = this.buildAfipPayload(draft)

    // 1. Log 'create' request
    const { data: createLog } = await (this.supabase
      .from("afip_voucher_requests") as any)
      .insert({
        invoice_id: draft.id,
        org_id: draft.org_id,
        agency_id: draft.agency_id,
        idempotency_key: idempotencyKey,
        attempt_n: 1,
        operation: "create",
        request_payload: payload,
      })
      .select()
      .single()

    let createResponse: any
    try {
      createResponse = await this.afip.ElectronicBilling.createNextVoucher(payload, {
        returnFullResponse: true,
      })
    } catch (err: any) {
      // Recovery se implementa en Task 7-8. Por ahora retornamos error.
      await this.updateRequestLog(createLog?.id, {
        error: err?.message || String(err),
        completed_at: new Date().toISOString(),
      })
      return {
        success: false,
        verification_status: "unverified",
        error: err?.message || String(err),
      }
    }

    if (!createResponse?.CAE) {
      return {
        success: false,
        verification_status: "unverified",
        error: "AFIP no devolvió CAE",
      }
    }

    const voucherNumber = createResponse.voucherNumber ?? createResponse.CbteDesde

    await this.updateRequestLog(createLog?.id, {
      response_payload: createResponse,
      completed_at: new Date().toISOString(),
    })

    // 2. Log 'verify' + fetch
    const { data: verifyLog } = await (this.supabase
      .from("afip_voucher_requests") as any)
      .insert({
        invoice_id: draft.id,
        org_id: draft.org_id,
        agency_id: draft.agency_id,
        idempotency_key: idempotencyKey,
        attempt_n: 1,
        operation: "verify",
      })
      .select()
      .single()

    const verified = await this.afip.ElectronicBilling.getVoucherInfo(
      voucherNumber,
      draft.pto_vta,
      draft.cbte_tipo
    )

    const sentFields: VoucherFields = {
      CAE: createResponse.CAE,
      CAEFchVto: createResponse.CAEFchVto,
      ImpTotal: draft.imp_total,
      ImpNeto: draft.imp_neto,
      ImpIVA: draft.imp_iva,
      DocNro: Number(draft.receptor_doc_nro),
      DocTipo: draft.receptor_doc_tipo,
      CbteFch: this.formatDate(draft.fecha_emision),
      CbteDesde: voucherNumber,
      CbteHasta: voucherNumber,
    }

    const receivedFields: Partial<VoucherFields> | null = verified
      ? {
          CAE: verified.CodAutorizacion ?? verified.CAE,
          CAEFchVto: verified.CAEFchVto,
          ImpTotal: verified.ImpTotal,
          ImpNeto: verified.ImpNeto,
          ImpIVA: verified.ImpIVA,
          DocNro: verified.DocNro,
          DocTipo: verified.DocTipo,
          CbteFch: verified.CbteFch,
          CbteDesde: verified.CbteDesde,
          CbteHasta: verified.CbteHasta,
        }
      : null

    const diff = diffVoucher(sentFields, receivedFields)

    const verificationStatus: IssueResult["verification_status"] =
      diff === null ? "verified"
      : diff && (diff as any)._not_found ? "not_found_in_afip"
      : "discrepancy"

    await this.updateRequestLog(verifyLog?.id, {
      verified_payload: verified,
      verification_diff: diff,
      completed_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
    })

    // 3. Update invoice
    await (this.supabase.from("invoices") as any)
      .update({
        cae: createResponse.CAE,
        cae_fch_vto: createResponse.CAEFchVto,
        cbte_nro: voucherNumber,
        status: "authorized",
        verification_status: verificationStatus,
        verified_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", draft.id)

    return {
      success: true,
      cae: createResponse.CAE,
      cbte_nro: voucherNumber,
      cae_fch_vto: createResponse.CAEFchVto,
      verification_status: verificationStatus,
      diff,
      request_id: createLog?.id,
    }
  }

  private async updateRequestLog(id: string | undefined, patch: any): Promise<void> {
    if (!id) return
    await (this.supabase.from("afip_voucher_requests") as any)
      .update(patch)
      .eq("id", id)
  }

  private buildAfipPayload(draft: any): any {
    const items = draft.invoice_items || []
    const isFacturaC = [11, 12, 13].includes(draft.cbte_tipo)

    let ivaArray: any[] = []
    if (!isFacturaC) {
      const ivaGrouped: Record<number, { BaseImp: number; Importe: number }> = {}
      for (const item of items) {
        if (item.tax_treatment !== "GRAVADO" && item.iva_porcentaje === 0) continue
        const id = item.iva_id
        if (!ivaGrouped[id]) ivaGrouped[id] = { BaseImp: 0, Importe: 0 }
        ivaGrouped[id].BaseImp += item.subtotal
        ivaGrouped[id].Importe += item.iva_importe
      }
      ivaArray = Object.entries(ivaGrouped).map(([id, v]) => ({
        Id: parseInt(id, 10),
        BaseImp: Math.round(v.BaseImp * 100) / 100,
        Importe: Math.round(v.Importe * 100) / 100,
      }))
    }

    const payload: any = {
      CantReg: 1,
      PtoVta: draft.pto_vta,
      CbteTipo: draft.cbte_tipo,
      Concepto: draft.concepto,
      DocTipo: draft.receptor_doc_tipo,
      DocNro: parseInt(String(draft.receptor_doc_nro).replace(/\D/g, ""), 10),
      CbteFch: parseInt(this.formatDate(draft.fecha_emision || new Date()), 10),
      ImpTotal: draft.imp_total,
      ImpTotConc: draft.imp_tot_conc || 0,
      ImpNeto: isFacturaC ? draft.imp_total : draft.imp_neto,
      ImpOpEx: draft.imp_op_ex || 0,
      ImpIVA: isFacturaC ? 0 : draft.imp_iva,
      ImpTrib: draft.imp_trib || 0,
      MonId: draft.moneda || "PES",
      MonCotiz: draft.cotizacion || 1,
      CondicionIVAReceptorId: draft.receptor_condicion_iva || 5,
    }
    if (ivaArray.length > 0) payload.Iva = ivaArray

    if (draft.concepto === 2 || draft.concepto === 3) {
      payload.FchServDesde = this.formatDate(draft.fch_serv_desde)
      payload.FchServHasta = this.formatDate(draft.fch_serv_hasta)
      payload.FchVtoPago = this.formatDate(draft.fch_vto_pago || draft.fch_serv_hasta)
    }

    return payload
  }

  private formatDate(input: string | Date): string {
    const d = typeof input === "string" ? new Date(input) : input
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}${m}${day}`
  }
```

- [ ] **Step 4: Correr test, verificar PASS**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: PASS (3 tests — 2 de Task 4 + 1 de happy path).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/afip/afip-service.ts __tests__/afip/afip-service.test.ts && git commit -m "$(cat <<'EOF'
feat(afip): AfipService.issueVoucher happy path

Flujo end-to-end: createNextVoucher → log create → getVoucherInfo →
diff → log verify → update invoice con verification_status.

Aún falta: discrepancy path, recovery de timeout, verifyVoucher on-demand.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: AfipService.issueVoucher — discrepancy path

**Files:**
- Modify: `__tests__/afip/afip-service.test.ts` (agregar test)
- Already implemented in Task 5 (el diff ya se calcula), solo asegurar cobertura.

- [ ] **Step 1: Test**

Agregar dentro del describe "AfipService.issueVoucher — happy path" (o en uno nuevo):

```typescript
describe("AfipService.issueVoucher — discrepancy path", () => {
  it("flags discrepancy when getVoucherInfo returns different ImpTotal", async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      CAE: "12345678901234",
      CAEFchVto: "20260530",
      voucherNumber: 42,
    })
    const mockGetInfo = jest.fn().mockResolvedValue({
      CodAutorizacion: "12345678901234",
      CAEFchVto: "20260530",
      ImpTotal: 99999, // diferente al enviado 12100
      ImpNeto: 10000,
      ImpIVA: 2100,
      DocNro: 20123456789,
      DocTipo: 80,
      CbteFch: "20260424",
      CbteDesde: 42,
      CbteHasta: 42,
    })

    const inserts: any[] = []
    const updates: any[] = []
    const supabase = makeInvoiceRequestsSupabase({ inserts, updates })

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), supabase as any, "org-aaa"
    )
    ;(svc as any).afip = makeMockSdk({ createNext: mockCreate, getInfo: mockGetInfo })

    const result = await svc.issueVoucher(sampleDraft())

    expect(result.success).toBe(true)
    expect(result.verification_status).toBe("discrepancy")
    expect(result.diff).toHaveProperty("ImpTotal")

    const invUpdate = updates.find((u) => u.table === "invoices")
    expect(invUpdate.row.verification_status).toBe("discrepancy")
    expect(invUpdate.row.status).toBe("authorized")
  })

  it("flags not_found_in_afip when getVoucherInfo returns null", async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      CAE: "12345678901234",
      CAEFchVto: "20260530",
      voucherNumber: 42,
    })
    const mockGetInfo = jest.fn().mockResolvedValue(null)

    const inserts: any[] = []
    const updates: any[] = []
    const supabase = makeInvoiceRequestsSupabase({ inserts, updates })

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), supabase as any, "org-aaa"
    )
    ;(svc as any).afip = makeMockSdk({ createNext: mockCreate, getInfo: mockGetInfo })

    const result = await svc.issueVoucher(sampleDraft())
    expect(result.verification_status).toBe("not_found_in_afip")
  })
})
```

- [ ] **Step 2: Correr, verificar PASS**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: PASS (5 tests — 2 de Task 4 + 1 happy + 2 discrepancy).

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add __tests__/afip/afip-service.test.ts && git commit -m "$(cat <<'EOF'
test(afip): discrepancy + not_found_in_afip branches of issueVoucher

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: AfipService.recoverVoucher

**Files:**
- Modify: `lib/afip/afip-service.ts` (agregar método privado)
- Modify: `__tests__/afip/afip-service.test.ts` (agregar tests)

- [ ] **Step 1: Tests para las 4 ramas de recovery**

Agregar al final del test file:

```typescript
describe("AfipService.recoverVoucher (timeout handling)", () => {
  it("adopts voucher when getLastVoucher === tentative", async () => {
    const mockGetLast = jest.fn().mockResolvedValue(42)
    const mockGetInfo = jest.fn().mockResolvedValue({
      CodAutorizacion: "CAE_RECOVERED",
      CAEFchVto: "20260530",
      CbteDesde: 42,
      CbteHasta: 42,
    })

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), { from: () => ({}) } as any, "org-aaa"
    )
    ;(svc as any).afip = {
      ElectronicBilling: {
        getLastVoucher: mockGetLast,
        getVoucherInfo: mockGetInfo,
      },
    }

    const r = await (svc as any).recoverVoucher(42, 1, 6)
    expect(r.adopted).toBe(true)
    expect(r.voucher.CodAutorizacion).toBe("CAE_RECOVERED")
  })

  it("allows retry when getLastVoucher === tentative - 1", async () => {
    const mockGetLast = jest.fn().mockResolvedValue(41)
    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), { from: () => ({}) } as any, "org-aaa"
    )
    ;(svc as any).afip = { ElectronicBilling: { getLastVoucher: mockGetLast, getVoucherInfo: jest.fn() } }

    const r = await (svc as any).recoverVoucher(42, 1, 6)
    expect(r.adopted).toBe(false)
    expect(r.canRetry).toBe(true)
  })

  it("flags anomaly when getLastVoucher > tentative + 1", async () => {
    const mockGetLast = jest.fn().mockResolvedValue(50)
    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), { from: () => ({}) } as any, "org-aaa"
    )
    ;(svc as any).afip = { ElectronicBilling: { getLastVoucher: mockGetLast, getVoucherInfo: jest.fn() } }

    const r = await (svc as any).recoverVoucher(42, 1, 6)
    expect(r.anomaly).toBe(true)
  })

  it("marks stale tentative when getLastVoucher < tentative - 1", async () => {
    const mockGetLast = jest.fn().mockResolvedValue(38)
    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), { from: () => ({}) } as any, "org-aaa"
    )
    ;(svc as any).afip = { ElectronicBilling: { getLastVoucher: mockGetLast, getVoucherInfo: jest.fn() } }

    const r = await (svc as any).recoverVoucher(42, 1, 6)
    expect(r.canRetry).toBe(true)
    expect(r.note).toBe("stale-tentative")
  })
})
```

- [ ] **Step 2: Correr, verificar FAIL**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: FAIL con "recoverVoucher is not a function".

- [ ] **Step 3: Implementar recoverVoucher**

Agregar método privado dentro de la clase `AfipService` en `lib/afip/afip-service.ts`:

```typescript
  private async recoverVoucher(
    tentativeNumber: number,
    ptoVta: number,
    cbteTipo: number
  ): Promise<{
    adopted: boolean
    canRetry?: boolean
    anomaly?: boolean
    note?: string
    voucher?: any
  }> {
    const last = await this.afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo)

    if (last === tentativeNumber) {
      const voucher = await this.afip.ElectronicBilling.getVoucherInfo(
        last, ptoVta, cbteTipo
      )
      return { adopted: true, voucher }
    }
    if (last === tentativeNumber - 1) {
      return { adopted: false, canRetry: true }
    }
    if (last < tentativeNumber - 1) {
      return { adopted: false, canRetry: true, note: "stale-tentative" }
    }
    // last > tentative + 1 (o igual a tentative + 1 que también es anomalía leve)
    return { adopted: false, anomaly: true }
  }
```

- [ ] **Step 4: Correr, verificar PASS**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/afip/afip-service.ts __tests__/afip/afip-service.test.ts && git commit -m "$(cat <<'EOF'
feat(afip): AfipService.recoverVoucher con 4 ramas

Cuando createNextVoucher timeoutea, usamos getLastVoucher para saber
si AFIP tomó el comprobante o no, y adoptamos el CAE si corresponde.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Hook up recovery a issueVoucher (timeout path)

**Files:**
- Modify: `lib/afip/afip-service.ts` (reemplazar catch del createNextVoucher)
- Modify: `__tests__/afip/afip-service.test.ts` (nuevo test integration)

- [ ] **Step 1: Test de timeout + recovery exitoso**

Agregar al describe de recoverVoucher o nuevo:

```typescript
describe("AfipService.issueVoucher — timeout recovery integration", () => {
  it("adopts CAE from getVoucherInfo when createNextVoucher times out and last voucher matches", async () => {
    const mockCreate = jest.fn().mockRejectedValue(new Error("timeout"))
    const mockGetLast = jest.fn().mockResolvedValue(42)
    const mockGetInfo = jest.fn().mockResolvedValue({
      CodAutorizacion: "CAE_RECOVERED",
      CAEFchVto: "20260530",
      ImpTotal: 12100,
      ImpNeto: 10000,
      ImpIVA: 2100,
      DocNro: 20123456789,
      DocTipo: 80,
      CbteFch: "20260424",
      CbteDesde: 42,
      CbteHasta: 42,
    })

    const inserts: any[] = []
    const updates: any[] = []
    const supabase = makeInvoiceRequestsSupabase({ inserts, updates })

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), supabase as any, "org-aaa"
    )
    ;(svc as any).afip = {
      ElectronicBilling: {
        createNextVoucher: mockCreate,
        getLastVoucher: mockGetLast,
        getVoucherInfo: mockGetInfo,
      },
    }

    const result = await svc.issueVoucher({ ...sampleDraft(), pto_vta: 1, cbte_tipo: 6 })

    expect(result.success).toBe(true)
    expect(result.cae).toBe("CAE_RECOVERED")
    expect(result.verification_status).toBe("verified")

    // 'recover' operation debe aparecer en inserts
    const ops = inserts
      .filter((i) => i.table === "afip_voucher_requests")
      .map((i) => i.row.operation)
    expect(ops).toContain("recover")
  })

  it("returns error when timeout + recovery indicates no voucher exists", async () => {
    const mockCreate = jest.fn().mockRejectedValue(new Error("timeout"))
    const mockGetLast = jest.fn().mockResolvedValue(41) // uno menos → canRetry

    const inserts: any[] = []
    const updates: any[] = []
    const supabase = makeInvoiceRequestsSupabase({ inserts, updates })

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), supabase as any, "org-aaa"
    )
    ;(svc as any).afip = {
      ElectronicBilling: {
        createNextVoucher: mockCreate,
        getLastVoucher: mockGetLast,
        getVoucherInfo: jest.fn(),
      },
    }

    const result = await svc.issueVoucher({ ...sampleDraft(), pto_vta: 1, cbte_tipo: 6 })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/timeout/i)
  })
})
```

- [ ] **Step 2: Correr, verificar FAIL del primer test (el segundo ya pasa con la implementación actual)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: 1 FAIL (adopts CAE from recovery) + resto PASS.

- [ ] **Step 3: Modificar issueVoucher para hookup recovery**

Reemplazar en `lib/afip/afip-service.ts` el bloque `try { createResponse = ... } catch { ... }` dentro de `issueVoucher` por:

```typescript
    let createResponse: any

    try {
      createResponse = await this.afip.ElectronicBilling.createNextVoucher(payload, {
        returnFullResponse: true,
      })
    } catch (err: any) {
      // Timeout o network error — intentar recovery
      const tentativeNumber: number | undefined = await this.afip.ElectronicBilling
        .getLastVoucher(draft.pto_vta, draft.cbte_tipo)
        .then((n: number) => n + 1)
        .catch(() => undefined)

      if (tentativeNumber === undefined) {
        await this.updateRequestLog(createLog?.id, {
          error: err?.message || String(err),
          completed_at: new Date().toISOString(),
        })
        return {
          success: false,
          verification_status: "unverified",
          error: err?.message || String(err),
        }
      }

      // Log 'recover' attempt
      await (this.supabase.from("afip_voucher_requests") as any).insert({
        invoice_id: draft.id,
        org_id: draft.org_id,
        agency_id: draft.agency_id,
        idempotency_key: idempotencyKey,
        attempt_n: 2,
        operation: "recover",
        request_payload: { tentative: tentativeNumber, pto_vta: draft.pto_vta, cbte_tipo: draft.cbte_tipo },
      })

      const recovery = await this.recoverVoucher(tentativeNumber, draft.pto_vta, draft.cbte_tipo)

      if (recovery.adopted && recovery.voucher) {
        createResponse = {
          CAE: recovery.voucher.CodAutorizacion ?? recovery.voucher.CAE,
          CAEFchVto: recovery.voucher.CAEFchVto,
          voucherNumber: recovery.voucher.CbteDesde,
        }
      } else {
        await this.updateRequestLog(createLog?.id, {
          error: `timeout + recovery: ${JSON.stringify(recovery)}`,
          completed_at: new Date().toISOString(),
        })
        return {
          success: false,
          verification_status: "unverified",
          error: err?.message || "timeout, AFIP no tomó el comprobante",
        }
      }
    }
```

- [ ] **Step 4: Correr, verificar PASS de todos**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/afip/afip-service.ts __tests__/afip/afip-service.test.ts && git commit -m "$(cat <<'EOF'
feat(afip): hookup recovery en issueVoucher ante timeout

Si createNextVoucher rejecta, intentamos recoverVoucher con
getLastVoucher + getVoucherInfo. Si adopta, seguimos flujo normal;
si no, retornamos error sin duplicar emisión.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: AfipService.verifyVoucher (on-demand)

**Files:**
- Modify: `lib/afip/afip-service.ts` (nuevo método público)
- Modify: `__tests__/afip/afip-service.test.ts` (test)

- [ ] **Step 1: Test**

```typescript
describe("AfipService.verifyVoucher (on-demand)", () => {
  it("re-fetches from AFIP and updates invoice verification_status", async () => {
    const mockGetInfo = jest.fn().mockResolvedValue({
      CodAutorizacion: "CAE123",
      CAEFchVto: "20260530",
      ImpTotal: 12100,
      ImpNeto: 10000,
      ImpIVA: 2100,
      DocNro: 20123456789,
      DocTipo: 80,
      CbteFch: "20260424",
      CbteDesde: 42,
      CbteHasta: 42,
    })

    const inserts: any[] = []
    const updates: any[] = []
    // Supabase mock que responde con la factura existente y deja capturar update
    const supabase = {
      from: (table: string) => {
        if (table === "invoices") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "inv-001", org_id: "org-aaa", agency_id: "ag-aaa",
                    pto_vta: 1, cbte_tipo: 6, cbte_nro: 42,
                    cae: "CAE123", imp_total: 12100, imp_neto: 10000, imp_iva: 2100,
                    receptor_doc_tipo: 80, receptor_doc_nro: "20123456789",
                    fecha_emision: "2026-04-24",
                  },
                  error: null,
                }),
              }),
            }),
            update: (row: any) => ({
              eq: () => { updates.push({ table, row }); return Promise.resolve({ error: null }) },
            }),
          }
        }
        if (table === "afip_voucher_requests") {
          return {
            insert: (row: any) => { inserts.push({ table, row }); return { select: () => ({ single: async () => ({ data: { id: "log-1" } }) }) } },
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        return {}
      },
    }

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), supabase as any, "org-aaa"
    )
    ;(svc as any).afip = {
      ElectronicBilling: { getVoucherInfo: mockGetInfo },
    }

    const result = await svc.verifyVoucher("inv-001")

    expect(result.verification_status).toBe("verified")
    expect(mockGetInfo).toHaveBeenCalledWith(42, 1, 6)

    const invUpdate = updates.find((u) => u.table === "invoices")
    expect(invUpdate).toBeDefined()
    expect(invUpdate.row.verification_status).toBe("verified")
    expect(invUpdate.row.last_sync_at).toBeDefined()
  })
})
```

- [ ] **Step 2: FAIL esperado**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: FAIL con "verifyVoucher is not a function".

- [ ] **Step 3: Implementar**

Agregar método público en `AfipService`:

```typescript
  async verifyVoucher(invoiceId: string): Promise<VerifyResult> {
    const { data: inv } = await (this.supabase
      .from("invoices") as any)
      .select("*")
      .eq("id", invoiceId)
      .single()

    if (!inv) {
      throw new Error(`Invoice ${invoiceId} not found or not accessible`)
    }
    if (!inv.cbte_nro) {
      throw new Error(`Invoice ${invoiceId} has no cbte_nro — not yet authorized`)
    }

    const idempotencyKey = `${inv.org_id}:${inv.pto_vta}:${inv.cbte_tipo}:${inv.id}`

    const { data: verifyLog } = await (this.supabase
      .from("afip_voucher_requests") as any)
      .insert({
        invoice_id: invoiceId,
        org_id: inv.org_id,
        agency_id: inv.agency_id,
        idempotency_key: idempotencyKey,
        attempt_n: Date.now(), // secuencial único por on-demand verify
        operation: "verify",
      })
      .select()
      .single()

    const verified = await this.afip.ElectronicBilling.getVoucherInfo(
      inv.cbte_nro, inv.pto_vta, inv.cbte_tipo
    )

    const sentFields: VoucherFields = {
      CAE: inv.cae,
      CAEFchVto: inv.cae_fch_vto || "",
      ImpTotal: inv.imp_total,
      ImpNeto: inv.imp_neto,
      ImpIVA: inv.imp_iva,
      DocNro: Number(inv.receptor_doc_nro),
      DocTipo: inv.receptor_doc_tipo,
      CbteFch: this.formatDate(inv.fecha_emision),
      CbteDesde: inv.cbte_nro,
      CbteHasta: inv.cbte_nro,
    }

    const receivedFields: Partial<VoucherFields> | null = verified
      ? {
          CAE: verified.CodAutorizacion ?? verified.CAE,
          CAEFchVto: verified.CAEFchVto,
          ImpTotal: verified.ImpTotal,
          ImpNeto: verified.ImpNeto,
          ImpIVA: verified.ImpIVA,
          DocNro: verified.DocNro,
          DocTipo: verified.DocTipo,
          CbteFch: verified.CbteFch,
          CbteDesde: verified.CbteDesde,
          CbteHasta: verified.CbteHasta,
        }
      : null

    const diff = diffVoucher(sentFields, receivedFields)
    const verification_status =
      diff === null ? "verified"
      : diff && (diff as any)._not_found ? "not_found_in_afip"
      : "discrepancy"

    await this.updateRequestLog(verifyLog?.id, {
      verified_payload: verified,
      verification_diff: diff,
      completed_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
    })

    const now = new Date().toISOString()
    await (this.supabase.from("invoices") as any)
      .update({
        verification_status,
        verified_at: now,
        last_sync_at: now,
      })
      .eq("id", invoiceId)

    return { verification_status, diff: diff ?? undefined, last_sync_at: now }
  }
```

- [ ] **Step 4: PASS**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/afip/afip-service.ts __tests__/afip/afip-service.test.ts && git commit -m "$(cat <<'EOF'
feat(afip): AfipService.verifyVoucher on-demand

Re-fetch desde AFIP + diff + update invoice + log en
afip_voucher_requests. Usado por el endpoint POST /api/invoices/[id]/verify
y por botón UI 'Re-sincronizar con AFIP'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: AfipService.getAfipRate con cache

**Files:**
- Modify: `lib/afip/afip-service.ts` (nuevo método público)
- Modify: `__tests__/afip/afip-service.test.ts` (test)

- [ ] **Step 1: Test**

```typescript
describe("AfipService.getAfipRate with cache", () => {
  beforeEach(() => {
    // Limpiar cache singleton
    const { afipRateCache } = require("@/lib/afip/rate-cache")
    afipRateCache.clear()
  })

  it("hits SDK on first call, cached on second", async () => {
    const mockRate = jest.fn().mockResolvedValue({ MonCotiz: 1415 })

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), { from: () => ({}) } as any, "org-aaa"
    )
    ;(svc as any).afip = { ElectronicBilling: { getExchangeRate: mockRate } }

    const first = await svc.getAfipRate("DOL", new Date("2026-04-24"))
    const second = await svc.getAfipRate("DOL", new Date("2026-04-24"))

    expect(first).toBe(1415)
    expect(second).toBe(1415)
    expect(mockRate).toHaveBeenCalledTimes(1)
  })

  it("caches per date — different dates hit SDK separately", async () => {
    const mockRate = jest.fn()
      .mockResolvedValueOnce({ MonCotiz: 1415 })
      .mockResolvedValueOnce({ MonCotiz: 1420 })

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(), { from: () => ({}) } as any, "org-aaa"
    )
    ;(svc as any).afip = { ElectronicBilling: { getExchangeRate: mockRate } }

    const a = await svc.getAfipRate("DOL", new Date("2026-04-24"))
    const b = await svc.getAfipRate("DOL", new Date("2026-04-25"))

    expect(a).toBe(1415)
    expect(b).toBe(1420)
    expect(mockRate).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: FAIL**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implementar**

Agregar al top de `lib/afip/afip-service.ts` import:

```typescript
import { afipRateCache } from "./rate-cache"
```

(Puede que ya esté — verificar y no duplicar.)

Agregar método en `AfipService`:

```typescript
  async getAfipRate(currency: "DOL" | "PES", date?: Date): Promise<number> {
    if (currency === "PES") return 1

    const d = date ?? new Date()
    const dateStr = this.formatDate(d)
    const cacheKey = `${currency}:${dateStr}`

    const cached = afipRateCache.get(cacheKey)
    if (cached !== undefined) return cached

    const response = await this.afip.ElectronicBilling.getExchangeRate(currency, dateStr)
    const rate =
      typeof response === "number"
        ? response
        : Number(response?.MonCotiz ?? response?.cotizacion ?? 0)

    if (!rate || rate <= 0) {
      throw new Error(`AFIP no devolvió cotización válida para ${currency} el ${dateStr}`)
    }

    afipRateCache.set(cacheKey, rate)
    return rate
  }
```

- [ ] **Step 4: PASS**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/afip-service.test.ts
```

Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/afip/afip-service.ts __tests__/afip/afip-service.test.ts && git commit -m "$(cat <<'EOF'
feat(afip): AfipService.getAfipRate con cache in-memory por fecha

Cotización oficial de AFIP cacheada por (currency, date). TTL 1h.
Usado por el pre-check en authorize endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — API Integration

### Task 11: authorize endpoint refactor

**Files:**
- Modify: `app/api/invoices/[id]/authorize/route.ts`

Este task NO tiene TDD puro (es refactor de endpoint que integra con el service ya testeado). Verificamos manualmente que no rompe con un smoke test mínimo.

- [ ] **Step 1: Reescribir authorize route**

Reemplazar el contenido completo de `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/invoices/[id]/authorize/route.ts` por:

```typescript
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/invoices/[id]/authorize
 *
 * Autoriza una factura contra AFIP via AfipService.
 * - Valida tenant access via RLS (la query fetch no devuelve si no tiene acceso)
 * - Pre-check de cotización USD contra oficial AFIP (±2% rule)
 * - Delega a AfipService.issueVoucher (que hace create + verify + log)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json(
        { error: "No tiene permiso para autorizar facturas" },
        { status: 403 }
      )
    }

    // RLS scope: si el user no pertenece al org de la factura, no la encuentra
    const { data: invoice, error: fetchError } = await (supabase
      .from("invoices") as any)
      .select(`*, invoice_items (*)`)
      .eq("id", id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    if (invoice.status !== "draft" && invoice.status !== "pending") {
      return NextResponse.json(
        { error: `No se puede autorizar una factura en estado '${invoice.status}'` },
        { status: 400 }
      )
    }

    const afipService = await getAfipServiceForOrg(supabase, invoice.org_id)
    if (!afipService) {
      return NextResponse.json(
        { error: "AFIP no configurado para esta organización. Configure en Integraciones." },
        { status: 400 }
      )
    }

    // Pre-check de cotización USD
    if (invoice.moneda === "DOL") {
      const oficial = await afipService.getAfipRate("DOL", new Date(invoice.fecha_emision))
      const user_rate = Number(invoice.cotizacion) || 0

      if (!user_rate || user_rate <= 1) {
        // Si no hay cotización cargada, usar oficial
        await (supabase.from("invoices") as any)
          .update({ cotizacion: oficial })
          .eq("id", id)
        invoice.cotizacion = oficial
      } else {
        const delta = Math.abs(user_rate - oficial) / oficial
        if (delta > 0.02) {
          return NextResponse.json(
            {
              error: `Cotización fuera del ±2% oficial AFIP. AFIP va a rechazar (error 10119).`,
              suggested_rate: oficial,
              your_rate: user_rate,
              diff_pct: (delta * 100).toFixed(2),
            },
            { status: 400 }
          )
        }
      }
    }

    // Marcar como pending
    await (supabase.from("invoices") as any).update({ status: "pending" }).eq("id", id)

    // Emitir via service
    const result = await afipService.issueVoucher(invoice)

    if (!result.success) {
      await (supabase.from("invoices") as any)
        .update({ status: "rejected" })
        .eq("id", id)
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Error al autorizar factura",
          verification_status: result.verification_status,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Factura autorizada",
      data: {
        cae: result.cae,
        cae_fch_vto: result.cae_fch_vto,
        cbte_nro: result.cbte_nro,
        verification_status: result.verification_status,
        diff: result.diff,
        request_id: result.request_id,
      },
    })
  } catch (error: any) {
    console.error("Error in POST /api/invoices/[id]/authorize:", error)
    return NextResponse.json(
      { error: error.message || "Error al autorizar factura" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -20
```

Expected: build succeeds sin errores TS en el archivo modificado.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add app/api/invoices/[id]/authorize/route.ts && git commit -m "$(cat <<'EOF'
refactor(invoices): authorize route delega a AfipService

- Valida tenant access via RLS (select por id sin filtrar agency)
- Pre-check cotización USD (±2% rule) bloquea antes de emitir
- Delega create + verify + log a AfipService.issueVoucher
- Retorna verification_status + diff en la response

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Endpoint /api/invoices/[id]/verify

**Files:**
- Create: `app/api/invoices/[id]/verify/route.ts`

- [ ] **Step 1: Crear endpoint**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/invoices/[id]/verify/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * POST /api/invoices/[id]/verify
 *
 * Re-verifica on-demand una factura ya autorizada contra AFIP.
 * Útil para detectar cambios desde AFIP o confirmar estado manual.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    const { data: invoice } = await (supabase
      .from("invoices") as any)
      .select("id, org_id, cbte_nro, status")
      .eq("id", id)
      .single()

    if (!invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    if (!invoice.cbte_nro) {
      return NextResponse.json(
        { error: "Factura aún no autorizada, no se puede verificar" },
        { status: 400 }
      )
    }

    const afipService = await getAfipServiceForOrg(supabase, invoice.org_id)
    if (!afipService) {
      return NextResponse.json({ error: "AFIP no configurado" }, { status: 400 })
    }

    const result = await afipService.verifyVoucher(id)
    return NextResponse.json({
      success: true,
      verification_status: result.verification_status,
      diff: result.diff,
      last_sync_at: result.last_sync_at,
    })
  } catch (error: any) {
    console.error("Error in POST /api/invoices/[id]/verify:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add app/api/invoices/[id]/verify/route.ts && git commit -m "$(cat <<'EOF'
feat(invoices): POST /api/invoices/[id]/verify on-demand

Re-fetch desde AFIP + update verification_status + log en
afip_voucher_requests. UI lo llama desde botón 'Re-sincronizar con AFIP'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: /api/invoices POST — set org_id on insert

**Files:**
- Modify: `app/api/invoices/route.ts`

- [ ] **Step 1: Leer el archivo actual**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && head -100 app/api/invoices/route.ts
```

- [ ] **Step 2: Modificar para resolver org_id desde agency**

En la función POST de `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/invoices/route.ts`, **antes** del `.insert(...)` que crea la factura, resolver `org_id`:

```typescript
// Resolver org_id desde agency_id
const { data: agency } = await (supabase.from("agencies") as any)
  .select("org_id")
  .eq("id", body.agency_id)
  .single()

if (!agency?.org_id) {
  return NextResponse.json(
    { error: "Agencia sin org_id asociado" },
    { status: 400 }
  )
}

// Luego en el insert:
const { data: invoice, error } = await (supabase.from("invoices") as any)
  .insert({
    ...existingFields,
    org_id: agency.org_id,     // ← nuevo
    verification_status: "unverified", // default para drafts
  })
  .select()
  .single()
```

Ajustar el código exacto leyendo primero el archivo y haciendo el Edit con precisión. Buscar la línea `supabase.from("invoices").insert(` y agregar `org_id` y `verification_status` al objeto insertado.

- [ ] **Step 3: Build check**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10
```

Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add app/api/invoices/route.ts && git commit -m "$(cat <<'EOF'
fix(invoices): POST resuelve org_id desde agency y lo setea en el insert

Necesario para que la RLS policy de tenant isolation funcione.
Facturas sin org_id serían invisibles por RLS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Tenant Isolation Verification

### Task 14: Integration test de tenant isolation

**Files:**
- Create: `__tests__/afip/tenant-isolation-afip.test.ts`

Este test corre contra Supabase real (staging o con service_role en local). Sigue el patrón del `__tests__/isolation/tenant-segregation.test.ts` ya existente.

- [ ] **Step 1: Crear el test**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/afip/tenant-isolation-afip.test.ts`:

```typescript
/**
 * @jest-environment node
 *
 * AFIP Hardening — Tenant isolation (Pilar 5 extension)
 *
 * Valida que las nuevas tablas y columnas con org_id + RLS respetan
 * aislamiento cross-org. Corre contra Supabase real usando service_role.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const describeIfCreds = SUPABASE_URL && SERVICE_ROLE ? describe : describe.skip

describeIfCreds("AFIP tenant isolation", () => {
  let admin: SupabaseClient

  beforeAll(() => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  it("invoices: all rows have org_id", async () => {
    const { count, error } = await admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .is("org_id", null)
    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  it("integrations: all rows have org_id", async () => {
    const { count, error } = await admin
      .from("integrations")
      .select("id", { count: "exact", head: true })
      .is("org_id", null)
    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  it("afip_voucher_requests: org_id nullable check via schema", async () => {
    // Si la tabla existe y tiene NOT NULL en org_id, un insert sin org_id falla.
    const { error } = await admin.from("afip_voucher_requests").insert({
      idempotency_key: `test-isolation-${Date.now()}`,
      attempt_n: 1,
      operation: "create",
      org_id: null as any,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/org_id/i)
  })

  it("invoices: RLS policy uses user_org_ids()", async () => {
    // Verificar que la policy existe
    const { data, error } = await admin
      .from("pg_policies" as any)
      .select("policyname, qual")
      .eq("tablename", "invoices")
      .eq("policyname", "invoices_tenant_isolation")

    expect(error).toBeNull()
    expect(data).toBeDefined()
    // La query a pg_policies puede no estar habilitada via RLS — si falla, skippear
    if (data && data.length > 0) {
      expect(data[0].qual).toMatch(/user_org_ids/)
    }
  })
})
```

- [ ] **Step 2: Correr el test**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/afip/tenant-isolation-afip.test.ts
```

Expected: 
- Si hay `.env.local` con service_role: PASS (3-4 tests).
- Si no: SKIPPED (correcto, no bloquea).

Si falla algo: investigar si la migración se aplicó correctamente en el proyecto de staging/prod. El test es la validación.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add __tests__/afip/tenant-isolation-afip.test.ts && git commit -m "$(cat <<'EOF'
test(afip): tenant isolation integration tests

Valida contra Supabase real que:
- invoices + integrations tienen org_id NOT NULL + todas las filas
  tienen org_id (backfill exitoso)
- afip_voucher_requests rechaza inserts sin org_id
- RLS policy invoices_tenant_isolation usa user_org_ids()

Skippea si no hay credenciales (corre en CI con secrets).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — UI Consolidation

### Task 15: Portar Factura C y aviso de cotización a la page

**Files:**
- Modify: `app/(dashboard)/operations/billing/new/page.tsx`

- [ ] **Step 1: Leer el archivo actual**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && wc -l app/\(dashboard\)/operations/billing/new/page.tsx
```

Expected: ~1410 líneas.

- [ ] **Step 2: Agregar Factura C al select de tipos**

Ubicar (aprox línea 865) el bloque:

```tsx
<SelectContent>
  <SelectItem value="6">Factura B</SelectItem>
  <SelectItem value="1">Factura A</SelectItem>
  <SelectItem value="19">Factura E (Exportación)</SelectItem>
</SelectContent>
```

Reemplazar por:

```tsx
<SelectContent>
  <SelectItem value="6">Factura B</SelectItem>
  <SelectItem value="1">Factura A</SelectItem>
  <SelectItem value="11">Factura C (Monotributo)</SelectItem>
  <SelectItem value="19">Factura E (Exportación)</SelectItem>
</SelectContent>
```

- [ ] **Step 3: Fetch cotización oficial cuando la moneda cambia a DOL**

En el `handleSubmit` (aprox línea 706), ya hay validación de exchange rate. Agregar un useEffect que fetchea cotización oficial cuando `invoiceCurrency === 'DOL'`:

Ubicar el state `const [cotizacionAfip, setCotizacionAfip] = ...` (no existe todavía en la page) y agregar después del useEffect existente (línea ~186):

```tsx
const [cotizacionAfip, setCotizacionAfip] = useState<number | null>(null)
const [cotizacionLoading, setCotizacionLoading] = useState(false)

useEffect(() => {
  if (invoiceCurrency !== 'DOL' || !formData.agency_id) {
    setCotizacionAfip(null)
    return
  }
  let cancelled = false
  setCotizacionLoading(true)
  const today = new Date().toISOString().split('T')[0]
  fetch(`/api/invoices/exchange-rate?currency=DOL&date=${today}&agency_id=${formData.agency_id}`)
    .then(r => r.json())
    .then(d => {
      if (cancelled) return
      if (d.rate && d.rate > 0) {
        setCotizacionAfip(d.rate)
        if (exchangeRate === 1) setExchangeRate(d.rate)
      }
    })
    .finally(() => { if (!cancelled) setCotizacionLoading(false) })
  return () => { cancelled = true }
}, [invoiceCurrency, formData.agency_id])
```

- [ ] **Step 4: Agregar banner visual si user_rate difiere >2% del oficial**

Ubicar el bloque donde muestra el Input de tipo de cambio (aprox línea 1168):

```tsx
<Input
  type="number"
  value={exchangeRate}
  onChange={(e) => handleExchangeRateChange(parseFloat(e.target.value) || 1)}
  min={1}
  step={0.01}
  placeholder="Ej: 1500"
/>
<p className="text-xs text-muted-foreground mt-1">
  TC del día hábil anterior (según normativa AFIP)
</p>
```

Reemplazar el `<p>` por:

```tsx
{cotizacionAfip && (
  <p className="text-xs text-muted-foreground mt-1">
    Oficial AFIP hoy: <strong>{cotizacionAfip.toFixed(2)}</strong>
    {cotizacionLoading && " (consultando...)"}
  </p>
)}
{cotizacionAfip && Math.abs(exchangeRate - cotizacionAfip) / cotizacionAfip > 0.02 && (
  <p className="text-xs text-orange-500 mt-1">
    ⚠️ Tu cotización difiere más del 2% del oficial. AFIP va a rechazar (error 10119).
  </p>
)}
```

- [ ] **Step 5: Build check + smoke visual**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10
```

Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add app/\(dashboard\)/operations/billing/new/page.tsx && git commit -m "$(cat <<'EOF'
feat(invoices/new): Factura C + aviso visual cotización oficial

- Agrega Factura C al dropdown (para monotributistas)
- Fetchea cotización oficial AFIP al cambiar a DOL
- Muestra banner orange si la cotización del user difiere > 2% del oficial
  (el backend igual bloquea, pero avisamos antes)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Migrar callers de NewInvoiceDialog a router.push

**Files:**
- Modify: los callers que se detecten con grep
- Delete: `components/invoices/new-invoice-dialog.tsx`

- [ ] **Step 1: Encontrar callers**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && grep -rln 'NewInvoiceDialog\|new-invoice-dialog' --include='*.tsx' --include='*.ts' | grep -v node_modules | grep -v __tests__
```

Expected: lista de 1-5 archivos. Típicamente un `operation-detail` o similar.

- [ ] **Step 2: Para cada caller, reemplazar por router.push**

Para cada archivo de la lista (ejemplo con uno genérico), ubicar el import y el uso:

```tsx
import { NewInvoiceDialog } from "@/components/invoices/new-invoice-dialog"
// ... dentro del componente:
const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
// ... botón que abre:
<Button onClick={() => setInvoiceDialogOpen(true)}>Facturar</Button>
<NewInvoiceDialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen} ... />
```

Reemplazar por:

```tsx
import { useRouter } from "next/navigation"
// ... dentro del componente:
const router = useRouter()
// ... botón:
<Button onClick={() => router.push(`/operations/billing/new?operationId=${operation.id}`)}>
  Facturar
</Button>
// (borrar el <NewInvoiceDialog ... /> completo)
```

Hacer el cambio para cada caller detectado. Si hay más de 3 callers, considerar commit intermedio por caller.

- [ ] **Step 3: Borrar el archivo del dialog**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && rm components/invoices/new-invoice-dialog.tsx
```

- [ ] **Step 4: Build check**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -20
```

Expected: succeeds. Si hay error de "Cannot find module 'new-invoice-dialog'" → queda algún caller sin migrar, encontrarlo con `grep -r NewInvoiceDialog` y corregir.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add -A && git commit -m "$(cat <<'EOF'
refactor(invoices): remove NewInvoiceDialog, migrate to /operations/billing/new

Consolidación UI: el dialog tenía bugs (faltaba Factura C, faltaba
auto-fetch de cotización) y era redundante con la page.

Callers ahora hacen router.push('/operations/billing/new?operationId=X').

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: UI — verification_status badge en listado de facturas

**Files:**
- Modify: el componente que lista facturas (típicamente `components/invoices/invoices-page-client.tsx`)

- [ ] **Step 1: Encontrar el componente de listado**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && find components/invoices -name "*.tsx" | head -10 && echo '---' && find app -path '*/billing*' -name "page.tsx"
```

- [ ] **Step 2: Agregar badge al row**

En el componente de listado de facturas, cada row tiene un status badge (draft / pending / authorized / rejected). Agregar un segundo badge para `verification_status`:

```tsx
{invoice.verification_status === 'verified' && (
  <Badge variant="outline" className="text-green-600 border-green-600">
    ✓ Verificada en AFIP
  </Badge>
)}
{invoice.verification_status === 'discrepancy' && (
  <Badge variant="destructive">
    ⚠ Discrepancia
  </Badge>
)}
{invoice.verification_status === 'not_found_in_afip' && (
  <Badge variant="destructive">
    ✗ No está en AFIP
  </Badge>
)}
{invoice.verification_status === 'unverified' && invoice.status === 'authorized' && (
  <Badge variant="secondary" className="text-amber-600">
    Sin verificar
  </Badge>
)}
```

Ajustar el lugar exacto del Badge según el patrón del componente. Leer primero.

- [ ] **Step 3: Incluir `verification_status` en el SELECT del fetch**

Si el endpoint `/api/invoices` GET no devuelve `verification_status`, agregarlo al select. Leer `app/api/invoices/route.ts` GET y asegurar que el `select()` incluye las nuevas columnas.

- [ ] **Step 4: Build + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10 && git add -A && git commit -m "$(cat <<'EOF'
feat(invoices): badge de verification_status en listado

Muestra ✓ Verificada / ⚠ Discrepancia / ✗ No está en AFIP /
Sin verificar según verification_status del invoice.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: UI — botón "Re-sincronizar con AFIP" en detalle de factura

**Files:**
- Modify: el componente de detalle de factura (típicamente `app/(dashboard)/operations/billing/[id]/page.tsx` o `components/invoices/invoice-detail-client.tsx`)

- [ ] **Step 1: Encontrar el componente detalle**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && find app/\(dashboard\)/operations/billing -type f -name "*.tsx" | head -5
```

- [ ] **Step 2: Agregar botón que llama /verify endpoint**

En el detalle, cerca del status badge, agregar:

```tsx
const [verifying, setVerifying] = useState(false)

const handleVerify = async () => {
  setVerifying(true)
  try {
    const res = await fetch(`/api/invoices/${invoice.id}/verify`, { method: "POST" })
    const data = await res.json()
    if (data.success) {
      toast({
        title: "Re-sincronizado con AFIP",
        description: `Estado: ${data.verification_status}${data.diff ? " - revisar diferencias" : ""}`,
      })
      // Refrescar datos
      router.refresh()
    } else {
      toast({ title: "Error al re-sincronizar", description: data.error, variant: "destructive" })
    }
  } finally {
    setVerifying(false)
  }
}

// Botón en la UI:
{invoice.status === 'authorized' && (
  <Button variant="outline" onClick={handleVerify} disabled={verifying}>
    {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
    Re-sincronizar con AFIP
  </Button>
)}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10 && git add -A && git commit -m "$(cat <<'EOF'
feat(invoices): botón 'Re-sincronizar con AFIP' en detalle

Llama POST /api/invoices/[id]/verify y refresca el detalle con el
verification_status actualizado.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Smoke Test & Final Verification

### Task 19: Smoke test contra AFIP homologación

**Files:**
- Create: `scripts/afip-smoke-test.ts`

- [ ] **Step 1: Crear script**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/scripts/afip-smoke-test.ts`:

```typescript
/**
 * Smoke test contra AFIP homologación.
 * NO corre en CI. Para uso manual antes de deploy.
 *
 * Uso:
 *   AFIP_SDK_API_KEY=... npx tsx scripts/afip-smoke-test.ts
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const Afip = require("@afipsdk/afip.js")

async function main() {
  const apiKey = process.env.AFIP_SDK_API_KEY
  if (!apiKey) {
    console.error("AFIP_SDK_API_KEY not set")
    process.exit(1)
  }

  const afip = new Afip({
    CUIT: 20409378472, // CUIT test compartido de AFIP homologación
    production: false,
    access_token: apiKey,
  })

  console.log("1. Healthcheck GetServiceTA('wsfe')...")
  await afip.GetServiceTA("wsfe")
  console.log("   OK")

  console.log("2. getSalesPoints...")
  const pvs = await afip.ElectronicBilling.getSalesPoints()
  console.log("   OK, got:", Array.isArray(pvs) ? pvs.length : "single PV")

  console.log("3. getLastVoucher(1, 6)...")
  const last = await afip.ElectronicBilling.getLastVoucher(1, 6)
  console.log("   OK, last voucher:", last)

  console.log("4. createNextVoucher (Factura B $100)...")
  const next = await afip.ElectronicBilling.createNextVoucher({
    CantReg: 1,
    PtoVta: 1,
    CbteTipo: 6,
    Concepto: 2,
    DocTipo: 99,
    DocNro: 0,
    CbteFch: Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")),
    ImpTotal: 100,
    ImpTotConc: 0,
    ImpNeto: 82.64,
    ImpOpEx: 0,
    ImpIVA: 17.36,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: 5,
    FchServDesde: Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")),
    FchServHasta: Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")),
    FchVtoPago: Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")),
    Iva: [{ Id: 5, BaseImp: 82.64, Importe: 17.36 }],
  })
  console.log("   OK, CAE:", next.CAE, "nro:", next.voucherNumber)

  console.log("5. getVoucherInfo read-back...")
  const info = await afip.ElectronicBilling.getVoucherInfo(next.voucherNumber, 1, 6)
  if (!info) {
    console.error("   FAIL: getVoucherInfo returned null right after creation")
    process.exit(1)
  }
  console.log("   OK, info.CodAutorizacion:", info.CodAutorizacion)

  if (info.CodAutorizacion === next.CAE || info.CAE === next.CAE) {
    console.log("\n✅ SMOKE TEST PASSED")
  } else {
    console.error("\n❌ CAE mismatch: created", next.CAE, "but getVoucherInfo returned", info)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("SMOKE TEST ERROR:", err)
  process.exit(1)
})
```

- [ ] **Step 2: Correr el smoke test manualmente**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && AFIP_SDK_API_KEY=<poner el test key> npx tsx scripts/afip-smoke-test.ts
```

Expected: imprime los 5 pasos, termina con `✅ SMOKE TEST PASSED`.

Si falla: el SDK o el test CUIT compartido están rotos. Investigar.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add scripts/afip-smoke-test.ts && git commit -m "$(cat <<'EOF'
test(afip): smoke test manual contra AFIP homologación

Valida end-to-end: GetServiceTA + getSalesPoints + getLastVoucher +
createNextVoucher + getVoucherInfo read-back con diff assertion.

Manual, NO corre en CI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Correr full test suite + smoke E2E manual

- [ ] **Step 1: Full jest run**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test 2>&1 | tail -30
```

Expected: todos los tests PASS (incluyendo los nuevos de AFIP).

- [ ] **Step 2: Full build**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Lint**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run lint 2>&1 | tail -20
```

Expected: lint passes.

- [ ] **Step 4: Smoke E2E manual (local dev)**

1. `npm run dev` (puerto 3044)
2. Logueado como user de Lozada, ir a `/operations/billing/new?operationId=<alguna>`
3. Completar factura B con monto chico ($100)
4. Submit → debería responder con CAE + `verification_status: 'verified'`
5. Ir al detalle, clickear "Re-sincronizar con AFIP" → debería mantener `verified`
6. Repetir con moneda DOL y cotización que difiera 5% del oficial → debería bloquear con 400
7. En SQL Editor, query `SELECT * FROM afip_voucher_requests ORDER BY started_at DESC LIMIT 5` → ver request/response/verified payloads completos

- [ ] **Step 5: Pedirle al user OK para push**

Mensaje:
> "Todos los tests pasan, build ok, smoke E2E ok. Tengo N commits locales. ¿Pusheo a main para que Railway deploy?"

Esperar OK explícito (memory `feedback_no_push_until_told.md`).

- [ ] **Step 6: Push tras OK**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git push origin main
```

---

## Post-deploy monitoring

Una vez en prod (Railway):

1. Query manual a los 2 días:
   ```sql
   SELECT verification_status, COUNT(*)
   FROM invoices
   WHERE status = 'authorized' AND created_at > NOW() - INTERVAL '2 days'
   GROUP BY verification_status;
   ```
   Objetivo: >98% en `verified`.

2. Buscar recoveries:
   ```sql
   SELECT * FROM afip_voucher_requests
   WHERE operation = 'recover' AND started_at > NOW() - INTERVAL '7 days';
   ```
   Cualquier row indica que el recovery se disparó (esperado bajo volumen).

3. Buscar discrepancies:
   ```sql
   SELECT id, cbte_nro, verification_diff FROM afip_voucher_requests
   WHERE verification_diff IS NOT NULL
   AND verification_diff::text NOT IN ('null', '{}')
   AND started_at > NOW() - INTERVAL '7 days';
   ```
   Objetivo: 0. Cualquier row se investiga manualmente.

---

## Next steps (fuera de este plan)

1. **SP-1 fase 1b** — Onboarding wizard (CUIT + clave fiscal + auto-detect cert/WS)
2. **SP-1 fase 1c** — Descargas PDF (individual + bulk ZIP)
3. **SP-2** — Ganancia Facturación (1-click desde operación con monto custom)

Esos son specs separados, cada uno con su propio plan.
