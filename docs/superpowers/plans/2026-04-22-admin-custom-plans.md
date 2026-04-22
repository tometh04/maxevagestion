# Admin Custom Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship pricing engine + admin UX para cerrar Enterprise custom: precio por org, descuento temporal, features extras, MP preapproval con update in-place, extensión de trial, pagos manuales, y fix `/admin` 404.

**Architecture:** Tabla nueva `custom_plans` (1 por org) + `manual_payments` (histórico). Planes públicos siguen en `lib/billing/plans.ts` estático. Cuando `organizations.custom_plan_id` está seteado, el sistema usa ese; sino usa `organizations.plan`. MP maneja update in-place hasta +20% delta; superior cancela y recrea. Cron diario expira descuentos y actualiza preapproval MP. Reusamos `subscription_status` existente (`PENDING_PAYMENT`) — no agregamos status nuevos.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), Jest, shadcn/ui, Mercado Pago REST API, Railway Cron.

**Spec base:** [`docs/superpowers/specs/2026-04-22-admin-custom-plans-design.md`](/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-22-admin-custom-plans-design.md)

**Convenciones críticas (leer antes de arrancar):**
- **Migrations NUNCA se aplican con `supabase db push`** — el remote está desincronizado. Para cada migration se crea el archivo en `supabase/migrations/` y se pega el SQL en el chat para que Tomi lo corra en el SQL Editor de Supabase (project `pmqvplyyxiobkllapgjp`).
- **Nunca hacer `git push`** sin OK explícito del user. Commits locales libres.
- **Path convention**: todos los paths en absoluto, `/Users/tomiisanchezz/Desktop/Repos/erplozada/...`.
- **Plataforma admin**: Tomi es el único platform_admin (user_id vía `platform_admins` + `lib/auth/platform.ts::isPlatformAdmin`). Todos los endpoints admin validan eso antes de side-effects.
- **Audit log**: todos los endpoints admin que mutan estado llaman `logSecurityEvent()` de `lib/security/audit.ts`.

---

## Task 1: Fix `/admin` 404

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/admin/page.tsx`

**Context:** `https://app.vibook.ai/admin` tira 404 porque `app/admin/` solo tiene `layout.tsx` + subrutas. Falta el root page.

- [ ] **Step 1: Crear el redirect**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/admin/page.tsx
import { redirect } from "next/navigation"

export default function AdminIndexPage() {
  redirect("/admin/orgs")
}
```

- [ ] **Step 2: Verificar que el layout redirige no-admins**

Leer `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/admin/layout.tsx` y confirmar que ya hay `if (!isAdmin) redirect("/dashboard")`. No tocar — el guard del layout corre antes que nuestro redirect.

- [ ] **Step 3: Smoke local**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run dev
```
Abrir `http://localhost:3044/admin` → debería ir a `/admin/orgs`.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/admin/page.tsx
git commit -m "fix: /admin redirect a /admin/orgs (era 404)"
```

---

## Task 2: Migration 158 — `custom_plans`

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000158_custom_plans.sql`

**Context:** Tabla nueva para plans custom. Una fila por org. RLS: org members leen la suya, platform_admin lee todas.

- [ ] **Step 1: Crear el archivo de migration**

```sql
-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000158_custom_plans.sql

-- SaaS Admin Custom Plans — precio custom por org + descuento temporal + features extras.
-- Spec: docs/superpowers/specs/2026-04-22-admin-custom-plans-design.md

CREATE TABLE IF NOT EXISTS custom_plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  display_name     TEXT NOT NULL,
  base_price_ars   NUMERIC(12,2) NOT NULL CHECK (base_price_ars > 0),
  discount_percent SMALLINT NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  discount_ends_at TIMESTAMPTZ,
  features         JSONB NOT NULL DEFAULT '{"extras": []}'::jsonb,
  limits           JSONB NOT NULL DEFAULT '{}'::jsonb,
  billing_method   TEXT NOT NULL DEFAULT 'MP' CHECK (billing_method IN ('MP', 'MANUAL')),
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_plans_discount_ends_idx
  ON custom_plans (discount_ends_at)
  WHERE discount_percent > 0;

ALTER TABLE custom_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_plans_tenant_read ON custom_plans;
CREATE POLICY custom_plans_tenant_read ON custom_plans
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_org_ids()));

DROP POLICY IF EXISTS custom_plans_admin_all ON custom_plans;
CREATE POLICY custom_plans_admin_all ON custom_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

-- Reuse the same updated_at trigger function used by organizations. Si no existe
-- globalmente, crearla aquí.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_set_updated_at') THEN
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $body$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS custom_plans_updated_at ON custom_plans;
CREATE TRIGGER custom_plans_updated_at
  BEFORE UPDATE ON custom_plans
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();
```

- [ ] **Step 2: Avisar al user que debe correr el SQL en Supabase**

Pegar en el chat:
```
Correr este SQL en el Supabase SQL Editor (project pmqvplyyxiobkllapgjp):
<contenido de la migration>
```
No avanzar con Task 3 hasta que el user confirme que corrió sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260422000158_custom_plans.sql
git commit -m "migration 158: crear tabla custom_plans + RLS + updated_at trigger"
```

---

## Task 3: Migration 159 — `manual_payments`

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000159_manual_payments.sql`

**Context:** Histórico de pagos manuales para orgs con `billing_method='MANUAL'`. `covers_to` del último pago define el vencimiento de la suscripción.

- [ ] **Step 1: Crear migration**

```sql
-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000159_manual_payments.sql

-- Histórico de pagos manuales (transferencia, factura A, etc.) para custom_plans
-- con billing_method='MANUAL'. covers_to del último pago define vencimiento.

CREATE TABLE IF NOT EXISTS manual_payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount_ars     NUMERIC(12,2) NOT NULL CHECK (amount_ars > 0),
  paid_at        TIMESTAMPTZ NOT NULL,
  covers_from    DATE NOT NULL,
  covers_to      DATE NOT NULL CHECK (covers_to >= covers_from),
  payment_method TEXT,
  receipt_ref    TEXT,
  registered_by  UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_payments_org_covers_to_idx
  ON manual_payments (org_id, covers_to DESC);

ALTER TABLE manual_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manual_payments_tenant_read ON manual_payments;
CREATE POLICY manual_payments_tenant_read ON manual_payments
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_org_ids()));

DROP POLICY IF EXISTS manual_payments_admin_all ON manual_payments;
CREATE POLICY manual_payments_admin_all ON manual_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Pegar SQL en el chat y esperar confirmación del user.**

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260422000159_manual_payments.sql
git commit -m "migration 159: crear tabla manual_payments + RLS"
```

---

## Task 4: Migration 160 — `organizations.custom_plan_id` + regenerar types

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000160_organizations_custom_plan_id.sql`
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/supabase/types.ts`

- [ ] **Step 1: Crear migration**

```sql
-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000160_organizations_custom_plan_id.sql

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS custom_plan_id UUID REFERENCES custom_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizations_custom_plan_id_idx
  ON organizations (custom_plan_id)
  WHERE custom_plan_id IS NOT NULL;
```

- [ ] **Step 2: Pegar SQL en el chat y esperar confirmación del user.**

- [ ] **Step 3: Regenerar types**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run db:generate
```
Verificar que `lib/supabase/types.ts` ahora incluye `custom_plans`, `manual_payments`, y `organizations.custom_plan_id`.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260422000160_organizations_custom_plan_id.sql lib/supabase/types.ts
git commit -m "migration 160: organizations.custom_plan_id + regenerar types"
```

---

## Task 5: Lógica core — `lib/billing/custom-plans.ts` + tests

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/custom-plans.ts`
- Test: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/custom-plans.test.ts`

**Context:** Helpers puros (sin DB ni red). Tres funciones: `calculateEffectivePrice`, `shouldRequireMpReauth`, `mergeFeatures`.

- [ ] **Step 1: Escribir tests (TDD)**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/custom-plans.test.ts
import {
  calculateEffectivePrice,
  shouldRequireMpReauth,
  mergeFeatures,
  MP_REAUTH_THRESHOLD_PCT,
} from "./custom-plans"

describe("calculateEffectivePrice", () => {
  it("retorna base cuando discount=0", () => {
    expect(calculateEffectivePrice(719000, 0)).toBe(719000)
  })
  it("aplica 40% off", () => {
    expect(calculateEffectivePrice(719000, 40)).toBe(431400)
  })
  it("aplica 100% off (gratis)", () => {
    expect(calculateEffectivePrice(119000, 100)).toBe(0)
  })
  it("redondea a 2 decimales", () => {
    expect(calculateEffectivePrice(100, 33)).toBe(67)
  })
  it("tira si discount fuera de rango", () => {
    expect(() => calculateEffectivePrice(100, 150)).toThrow()
    expect(() => calculateEffectivePrice(100, -5)).toThrow()
  })
})

describe("shouldRequireMpReauth", () => {
  it("delta 0% → no re-auth", () => {
    expect(shouldRequireMpReauth(100000, 100000)).toBe(false)
  })
  it("delta -40% (bajada) → no re-auth", () => {
    expect(shouldRequireMpReauth(100000, 60000)).toBe(false)
  })
  it(`delta exacto +${MP_REAUTH_THRESHOLD_PCT}% → no re-auth`, () => {
    expect(shouldRequireMpReauth(100000, 100000 * (1 + MP_REAUTH_THRESHOLD_PCT / 100))).toBe(false)
  })
  it(`delta +${MP_REAUTH_THRESHOLD_PCT + 1}% → re-auth`, () => {
    expect(shouldRequireMpReauth(100000, 100000 * (1 + (MP_REAUTH_THRESHOLD_PCT + 1) / 100))).toBe(true)
  })
  it("delta +66% (caso real discount expira) → re-auth", () => {
    expect(shouldRequireMpReauth(431400, 719000)).toBe(true)
  })
})

describe("mergeFeatures", () => {
  const enterpriseBase = ["F1", "F2", "F3"]
  it("extras vacíos → solo base", () => {
    expect(mergeFeatures(enterpriseBase, { extras: [] })).toEqual({
      base: enterpriseBase,
      extras: [],
    })
  })
  it("extras habilitados se retornan", () => {
    expect(
      mergeFeatures(enterpriseBase, {
        extras: [
          { key: "callbell_bridge", label: "Bridge", enabled: true },
          { key: "misc_sla", label: "SLA 4h", enabled: true },
        ],
      })
    ).toEqual({
      base: enterpriseBase,
      extras: [
        { key: "callbell_bridge", label: "Bridge", enabled: true },
        { key: "misc_sla", label: "SLA 4h", enabled: true },
      ],
    })
  })
  it("extras con enabled:false se excluyen", () => {
    const result = mergeFeatures(enterpriseBase, {
      extras: [
        { key: "a", label: "A", enabled: true },
        { key: "b", label: "B", enabled: false },
      ],
    })
    expect(result.extras).toHaveLength(1)
    expect(result.extras[0].key).toBe("a")
  })
})
```

- [ ] **Step 2: Correr tests y verificar fallo**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/billing/custom-plans.test.ts
```
Esperado: falla porque `./custom-plans` no existe.

- [ ] **Step 3: Implementar lógica**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/custom-plans.ts

export const MP_REAUTH_THRESHOLD_PCT = 20

export interface CustomPlanFeatureExtra {
  key: string
  label: string
  enabled: boolean
}

export interface CustomPlanFeatures {
  extras: CustomPlanFeatureExtra[]
}

export function calculateEffectivePrice(base: number, discountPercent: number): number {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error(`discountPercent inválido: ${discountPercent}. Esperado 0..100.`)
  }
  const raw = base * (1 - discountPercent / 100)
  return Math.round(raw * 100) / 100
}

export function shouldRequireMpReauth(currentAmount: number, newAmount: number): boolean {
  if (newAmount <= currentAmount) return false
  const deltaPct = ((newAmount - currentAmount) / currentAmount) * 100
  return deltaPct > MP_REAUTH_THRESHOLD_PCT + 1e-9
}

export interface MergedFeatures {
  base: string[]
  extras: CustomPlanFeatureExtra[]
}

export function mergeFeatures(
  enterpriseBase: string[],
  custom: CustomPlanFeatures
): MergedFeatures {
  return {
    base: enterpriseBase,
    extras: (custom.extras ?? []).filter((e) => e.enabled),
  }
}
```

- [ ] **Step 4: Correr tests, verificar passing**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/billing/custom-plans.test.ts
```
Esperado: todos passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/billing/custom-plans.ts lib/billing/custom-plans.test.ts
git commit -m "feat(billing): lógica de custom plans (effective price, MP reauth threshold, merge features)"
```

---

## Task 6: Extender `lib/billing/mercadopago.ts` — `customAmount` param

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mercadopago.ts`

**Context:** La función actual `createPreapproval` toma un `plan: PlanId` y usa `PLANS[plan].priceArsMonthly`. Para custom plans necesitamos pasar un amount arbitrario. También necesitamos `updatePreapproval` para el update in-place.

- [ ] **Step 1: Leer el archivo actual**

```bash
cat /Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mercadopago.ts
```

- [ ] **Step 2: Agregar `customAmount`/`customReason` al tipo `CreatePreapprovalParams`**

En `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mercadopago.ts`, modificar la interface:

```ts
export interface CreatePreapprovalParams {
  orgId: string
  plan: PlanId | "CUSTOM"
  payerEmail: string
  backUrl: string
  includeFreeTrial?: boolean
  startDate?: string
  /** Requerido si plan === 'CUSTOM'. Monto en ARS. */
  customAmount?: number
  /** Requerido si plan === 'CUSTOM'. Aparece como "reason" en MP. */
  customReason?: string
}
```

Modificar `createPreapproval` para aceptar CUSTOM:

```ts
export async function createPreapproval(params: CreatePreapprovalParams): Promise<PreapprovalResult> {
  let amount: number
  let reason: string

  if (params.plan === "CUSTOM") {
    if (!params.customAmount || params.customAmount <= 0) {
      throw new Error("customAmount requerido y > 0 para plan CUSTOM")
    }
    if (!params.customReason) {
      throw new Error("customReason requerido para plan CUSTOM")
    }
    amount = params.customAmount
    reason = params.customReason
  } else {
    const plan = PLANS[params.plan]
    if (!plan) throw new Error(`Plan inválido: ${params.plan}`)
    if (plan.priceArsMonthly === null || plan.contactSalesOnly) {
      throw new Error(`Plan ${params.plan} es contact-sales-only, no se puede crear preapproval`)
    }
    amount = plan.priceArsMonthly
    reason = `Vibook — plan ${plan.name}`
  }

  const includeFreeTrial = params.includeFreeTrial ?? true

  const autoRecurring: any = {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: amount,
    currency_id: "ARS",
  }
  if (includeFreeTrial) {
    autoRecurring.free_trial = { frequency: 7, frequency_type: "days" }
  }
  if (params.startDate) {
    autoRecurring.start_date = params.startDate
  }

  const body = {
    reason,
    external_reference: params.orgId,
    payer_email: params.payerEmail,
    back_url: params.backUrl,
    auto_recurring: autoRecurring,
    status: "pending",
  }

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP preapproval failed (${res.status}): ${text}`)
  }
  return (await res.json()) as PreapprovalResult
}
```

- [ ] **Step 3: Agregar `updatePreapproval`**

Al final del archivo:

```ts
/**
 * Actualiza transaction_amount de un preapproval existente.
 * MP permite cambios in-place hasta cierto margen; si el delta supera
 * el threshold, MP puede pedir re-autorización del usuario. Ver
 * shouldRequireMpReauth() en custom-plans.ts — la lógica de decisión
 * queda fuera de este módulo (este solo ejecuta el PUT).
 */
export async function updatePreapproval(
  preapprovalId: string,
  patch: { transaction_amount?: number; status?: string; start_date?: string }
): Promise<any> {
  const body: any = {}
  if (patch.transaction_amount !== undefined) {
    body.auto_recurring = { transaction_amount: patch.transaction_amount }
  }
  if (patch.status !== undefined) body.status = patch.status
  if (patch.start_date !== undefined) {
    body.auto_recurring = { ...(body.auto_recurring ?? {}), start_date: patch.start_date }
  }

  const res = await fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP update preapproval failed (${res.status}): ${text}`)
  }
  return await res.json()
}
```

- [ ] **Step 4: Verificar que typecheck pasa**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
```
Esperado: sin errores en `lib/billing/mercadopago.ts`.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/billing/mercadopago.ts
git commit -m "feat(billing): mercadopago.ts soporta plan CUSTOM + updatePreapproval"
```

---

## Task 7: `lib/billing/mp-update.ts` — `applyPriceChange` + tests

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mp-update.ts`
- Test: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mp-update.test.ts`

**Context:** Función de alto nivel: dado un cambio de precio, decide si es update in-place o cancel+recreate, ejecuta y retorna el resultado. Se llama desde endpoints admin y desde el cron.

- [ ] **Step 1: Escribir tests con mocks**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mp-update.test.ts

import { applyPriceChange } from "./mp-update"

jest.mock("./mercadopago", () => ({
  fetchPreapproval: jest.fn(),
  updatePreapproval: jest.fn(),
  cancelPreapproval: jest.fn(),
  createPreapproval: jest.fn(),
}))

const mp = require("./mercadopago")

describe("applyPriceChange", () => {
  beforeEach(() => jest.clearAllMocks())

  it("sin preapproval → NO_PREAPPROVAL", async () => {
    const result = await applyPriceChange({
      preapprovalId: null,
      currentAmount: 0,
      newAmount: 100000,
      recreateParams: {} as any,
    })
    expect(result.action).toBe("NO_PREAPPROVAL")
    expect(mp.updatePreapproval).not.toHaveBeenCalled()
  })

  it("delta ≤ +20% → UPDATED_IN_PLACE", async () => {
    mp.fetchPreapproval.mockResolvedValue({
      auto_recurring: { transaction_amount: 100000 },
    })
    mp.updatePreapproval.mockResolvedValue({})
    const result = await applyPriceChange({
      preapprovalId: "pre_123",
      currentAmount: 100000,
      newAmount: 115000,
      recreateParams: {} as any,
    })
    expect(result.action).toBe("UPDATED_IN_PLACE")
    expect(mp.updatePreapproval).toHaveBeenCalledWith("pre_123", { transaction_amount: 115000 })
  })

  it("delta > +20% → REAUTH_REQUIRED (cancel + create nuevo)", async () => {
    mp.fetchPreapproval.mockResolvedValue({
      auto_recurring: { transaction_amount: 431400 },
    })
    mp.cancelPreapproval.mockResolvedValue({})
    mp.createPreapproval.mockResolvedValue({ id: "pre_new", init_point: "https://mp/x", status: "pending" })
    const result = await applyPriceChange({
      preapprovalId: "pre_old",
      currentAmount: 431400,
      newAmount: 719000,
      recreateParams: {
        orgId: "org_1",
        plan: "CUSTOM",
        customAmount: 719000,
        customReason: "Test",
        payerEmail: "a@b.com",
        backUrl: "https://app/settings/subscription",
        includeFreeTrial: false,
      },
    })
    expect(result.action).toBe("REAUTH_REQUIRED")
    expect(result.newPreapprovalId).toBe("pre_new")
    expect(result.checkoutUrl).toBe("https://mp/x")
    expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre_old")
    expect(mp.createPreapproval).toHaveBeenCalled()
  })

  it("bajada (delta < 0) → UPDATED_IN_PLACE", async () => {
    mp.fetchPreapproval.mockResolvedValue({
      auto_recurring: { transaction_amount: 100000 },
    })
    mp.updatePreapproval.mockResolvedValue({})
    const result = await applyPriceChange({
      preapprovalId: "pre_x",
      currentAmount: 100000,
      newAmount: 50000,
      recreateParams: {} as any,
    })
    expect(result.action).toBe("UPDATED_IN_PLACE")
  })
})
```

- [ ] **Step 2: Correr y ver que fallan**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/billing/mp-update.test.ts
```

- [ ] **Step 3: Implementar `mp-update.ts`**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mp-update.ts

import { shouldRequireMpReauth } from "./custom-plans"
import {
  fetchPreapproval,
  updatePreapproval,
  cancelPreapproval,
  createPreapproval,
  type CreatePreapprovalParams,
} from "./mercadopago"

export type ApplyPriceChangeAction =
  | "NO_PREAPPROVAL"
  | "UPDATED_IN_PLACE"
  | "REAUTH_REQUIRED"

export interface ApplyPriceChangeResult {
  action: ApplyPriceChangeAction
  /** Presente solo cuando action === REAUTH_REQUIRED */
  newPreapprovalId?: string
  checkoutUrl?: string
}

export interface ApplyPriceChangeInput {
  preapprovalId: string | null
  /** Monto actual conocido (último cobrado). Puede venir de DB para evitar fetch MP extra. */
  currentAmount: number
  newAmount: number
  /** Params para recrear el preapproval si hay que cancelar y volver a crear. */
  recreateParams: CreatePreapprovalParams
}

export async function applyPriceChange(
  input: ApplyPriceChangeInput
): Promise<ApplyPriceChangeResult> {
  if (!input.preapprovalId) {
    return { action: "NO_PREAPPROVAL" }
  }

  // Verificación del amount actual desde MP (source of truth).
  const mp = await fetchPreapproval(input.preapprovalId)
  const mpAmount =
    (mp?.auto_recurring?.transaction_amount as number | undefined) ?? input.currentAmount

  if (!shouldRequireMpReauth(mpAmount, input.newAmount)) {
    await updatePreapproval(input.preapprovalId, { transaction_amount: input.newAmount })
    return { action: "UPDATED_IN_PLACE" }
  }

  await cancelPreapproval(input.preapprovalId)
  const fresh = await createPreapproval(input.recreateParams)
  return {
    action: "REAUTH_REQUIRED",
    newPreapprovalId: fresh.id,
    checkoutUrl: fresh.init_point,
  }
}
```

- [ ] **Step 4: Correr tests**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/billing/mp-update.test.ts
```
Esperado: todos passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/billing/mp-update.ts lib/billing/mp-update.test.ts
git commit -m "feat(billing): applyPriceChange con decisión in-place vs re-auth MP"
```

---

## Task 8: API — POST/PATCH/DELETE `/api/admin/orgs/[id]/custom-plan`

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/custom-plan/route.ts`

**Context:** Tres métodos sobre el mismo recurso. Todos validan `isPlatformAdmin`. POST crea custom plan + preapproval MP (si billing_method=MP). PATCH edita y dispara `applyPriceChange` si cambia precio. DELETE cancela preapproval MP + borra row + clear `organizations.custom_plan_id`.

- [ ] **Step 1: Crear el archivo**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/custom-plan/route.ts

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { calculateEffectivePrice, type CustomPlanFeatures } from "@/lib/billing/custom-plans"
import { createPreapproval, cancelPreapproval } from "@/lib/billing/mercadopago"
import { applyPriceChange } from "@/lib/billing/mp-update"

type CustomPlanBody = {
  display_name?: string
  base_price_ars?: number
  discount_percent?: number
  discount_duration_months?: number
  features?: CustomPlanFeatures
  limits?: Record<string, unknown>
  billing_method?: "MP" | "MANUAL"
  notes?: string
}

async function requireAdmin() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const ok = await isPlatformAdmin(supabase, user.id)
  return { user, supabase, ok }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: orgId } = await params
  const body = (await request.json().catch(() => ({}))) as CustomPlanBody

  if (!body.display_name || !body.base_price_ars || body.base_price_ars <= 0) {
    return NextResponse.json({ error: "display_name y base_price_ars (>0) requeridos" }, { status: 400 })
  }
  const discount = body.discount_percent ?? 0
  const duration = body.discount_duration_months ?? 0
  if (discount < 0 || discount > 100) {
    return NextResponse.json({ error: "discount_percent debe estar entre 0 y 100" }, { status: 400 })
  }
  if (discount > 0 && duration <= 0) {
    return NextResponse.json({ error: "discount_duration_months > 0 requerido cuando hay descuento" }, { status: 400 })
  }
  const billingMethod = body.billing_method ?? "MP"

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, billing_email, mp_preapproval_id, custom_plan_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })
  if (org.custom_plan_id) {
    return NextResponse.json(
      { error: "Org ya tiene custom plan. Usar PATCH para editar o DELETE para reemplazar." },
      { status: 409 }
    )
  }

  const discountEndsAt =
    discount > 0 ? new Date(Date.now() + duration * 30 * 24 * 60 * 60 * 1000).toISOString() : null

  const { data: created, error: insertErr } = await admin
    .from("custom_plans")
    .insert({
      org_id: orgId,
      display_name: body.display_name,
      base_price_ars: body.base_price_ars,
      discount_percent: discount,
      discount_ends_at: discountEndsAt,
      features: body.features ?? { extras: [] },
      limits: body.limits ?? {},
      billing_method: billingMethod,
      notes: body.notes ?? null,
      created_by: user.id,
    })
    .select("*")
    .single()
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const updateOrgData: Record<string, unknown> = { custom_plan_id: created.id }

  let checkoutUrl: string | null = null
  if (billingMethod === "MP") {
    if (!org.billing_email) {
      await admin.from("custom_plans").delete().eq("id", created.id)
      return NextResponse.json(
        { error: "Org sin billing_email — no se puede crear preapproval MP" },
        { status: 400 }
      )
    }
    const effective = calculateEffectivePrice(body.base_price_ars, discount)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
    try {
      const mp = await createPreapproval({
        orgId,
        plan: "CUSTOM",
        payerEmail: org.billing_email,
        backUrl: `${appUrl}/settings/subscription?custom=ok`,
        customAmount: effective,
        customReason: `Vibook — ${body.display_name}`,
        includeFreeTrial: false,
      })
      updateOrgData.mp_preapproval_id = mp.id
      checkoutUrl = mp.init_point
    } catch (err: any) {
      await admin.from("custom_plans").delete().eq("id", created.id)
      return NextResponse.json({ error: `MP error: ${err.message}` }, { status: 502 })
    }
  }

  await admin.from("organizations").update(updateOrgData).eq("id", orgId)

  logSecurityEvent({
    eventType: "CUSTOM_PLAN_CREATED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "custom_plans",
    targetEntityId: created.id,
    details: { plan: created, checkoutUrl },
  })

  return NextResponse.json({ ok: true, custom_plan: created, checkout_url: checkoutUrl })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: orgId } = await params
  const body = (await request.json().catch(() => ({}))) as CustomPlanBody

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, billing_email, mp_preapproval_id, custom_plan_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org || !org.custom_plan_id) {
    return NextResponse.json({ error: "Org no tiene custom plan" }, { status: 404 })
  }

  const { data: current } = await admin
    .from("custom_plans")
    .select("*")
    .eq("id", org.custom_plan_id)
    .single()

  const update: Record<string, unknown> = {}
  for (const k of ["display_name", "features", "limits", "notes", "billing_method"] as const) {
    if (body[k] !== undefined) update[k] = body[k]
  }
  let priceChanged = false
  if (body.base_price_ars !== undefined && body.base_price_ars !== Number(current.base_price_ars)) {
    update.base_price_ars = body.base_price_ars
    priceChanged = true
  }
  if (
    body.discount_percent !== undefined &&
    body.discount_percent !== current.discount_percent
  ) {
    update.discount_percent = body.discount_percent
    priceChanged = true
    if (body.discount_percent > 0 && body.discount_duration_months) {
      update.discount_ends_at = new Date(
        Date.now() + body.discount_duration_months * 30 * 24 * 60 * 60 * 1000
      ).toISOString()
    } else if (body.discount_percent === 0) {
      update.discount_ends_at = null
    }
  }

  const { data: updated } = await admin
    .from("custom_plans")
    .update(update)
    .eq("id", current.id)
    .select("*")
    .single()

  let mpAction = null
  if (priceChanged && updated.billing_method === "MP" && org.mp_preapproval_id) {
    const newEffective = calculateEffectivePrice(
      Number(updated.base_price_ars),
      updated.discount_percent
    )
    const currentEffective = calculateEffectivePrice(
      Number(current.base_price_ars),
      current.discount_percent
    )
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
    mpAction = await applyPriceChange({
      preapprovalId: org.mp_preapproval_id,
      currentAmount: currentEffective,
      newAmount: newEffective,
      recreateParams: {
        orgId,
        plan: "CUSTOM",
        payerEmail: org.billing_email!,
        backUrl: `${appUrl}/settings/subscription?custom=ok`,
        customAmount: newEffective,
        customReason: `Vibook — ${updated.display_name}`,
        includeFreeTrial: false,
      },
    })
    if (mpAction.action === "REAUTH_REQUIRED" && mpAction.newPreapprovalId) {
      await admin
        .from("organizations")
        .update({
          mp_preapproval_id: mpAction.newPreapprovalId,
          subscription_status: "PAST_DUE",
        })
        .eq("id", orgId)
      logSecurityEvent({
        eventType: "CUSTOM_PLAN_MP_REAUTH_REQUIRED",
        severity: "WARNING",
        actorUserId: user.id,
        actorAuthId: (user as any).auth_id,
        targetOrgId: orgId,
        targetEntity: "custom_plans",
        targetEntityId: current.id,
        details: { currentEffective, newEffective, checkoutUrl: mpAction.checkoutUrl },
      })
    }
  }

  logSecurityEvent({
    eventType: "CUSTOM_PLAN_UPDATED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "custom_plans",
    targetEntityId: current.id,
    details: { before: current, after: updated, mpAction },
  })

  return NextResponse.json({ ok: true, custom_plan: updated, mp_action: mpAction })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: orgId } = await params
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, mp_preapproval_id, custom_plan_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org?.custom_plan_id) {
    return NextResponse.json({ error: "Org no tiene custom plan" }, { status: 404 })
  }

  const { data: cp } = await admin
    .from("custom_plans")
    .select("*")
    .eq("id", org.custom_plan_id)
    .single()

  if (org.mp_preapproval_id) {
    try {
      await cancelPreapproval(org.mp_preapproval_id)
    } catch (err) {
      console.warn("cancelPreapproval failed (continuando delete):", err)
    }
  }

  await admin.from("custom_plans").delete().eq("id", cp.id)
  await admin.from("organizations").update({ custom_plan_id: null, mp_preapproval_id: null }).eq("id", orgId)

  logSecurityEvent({
    eventType: "CUSTOM_PLAN_DELETED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "custom_plans",
    targetEntityId: cp.id,
    details: { deleted: cp },
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
```
Fixear cualquier error de tipos.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/api/admin/orgs/[id]/custom-plan/route.ts
git commit -m "feat(admin-api): CRUD custom-plan con MP preapproval + audit"
```

---

## Task 9: API — POST `/api/admin/orgs/[id]/extend-trial`

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/extend-trial/route.ts`

**Context:** Simple: suma N días a `trial_ends_at`. Si hay preapproval MP con `start_date` futuro, lo actualiza vía MP.

- [ ] **Step 1: Crear archivo**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/extend-trial/route.ts

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { updatePreapproval, fetchPreapproval } from "@/lib/billing/mercadopago"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: orgId } = await params
  const body = await request.json().catch(() => ({}))
  const days = Number(body.days)
  if (!Number.isInteger(days) || days <= 0 || days > 365) {
    return NextResponse.json({ error: "days debe ser entero entre 1 y 365" }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, trial_ends_at, mp_preapproval_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  const base = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : Date.now()
  const newTrialEnds = new Date(base + days * 24 * 60 * 60 * 1000).toISOString()

  await admin
    .from("organizations")
    .update({ trial_ends_at: newTrialEnds })
    .eq("id", orgId)

  // Si hay preapproval MP con start_date futuro, alinearlo.
  if (org.mp_preapproval_id) {
    try {
      const mp = await fetchPreapproval(org.mp_preapproval_id)
      const mpStart = mp?.auto_recurring?.start_date
      if (mpStart && new Date(mpStart).getTime() > Date.now()) {
        await updatePreapproval(org.mp_preapproval_id, { start_date: newTrialEnds })
      }
    } catch (err) {
      console.warn("fetchPreapproval en extend-trial falló (continuando):", err)
    }
  }

  logSecurityEvent({
    eventType: "TRIAL_EXTENDED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: { days, before: org.trial_ends_at, after: newTrialEnds },
  })

  return NextResponse.json({ ok: true, trial_ends_at: newTrialEnds })
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
git add app/api/admin/orgs/[id]/extend-trial/route.ts
git commit -m "feat(admin-api): POST extend-trial con audit"
```

---

## Task 10: API — POST `/api/admin/orgs/[id]/manual-payment`

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/manual-payment/route.ts`

- [ ] **Step 1: Crear archivo**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/manual-payment/route.ts

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: orgId } = await params
  const body = await request.json().catch(() => ({}))
  const { amount_ars, paid_at, covers_from, covers_to, payment_method, receipt_ref } = body

  if (!amount_ars || amount_ars <= 0 || !paid_at || !covers_from || !covers_to) {
    return NextResponse.json(
      { error: "amount_ars (>0), paid_at, covers_from, covers_to son requeridos" },
      { status: 400 }
    )
  }
  if (new Date(covers_to).getTime() < new Date(covers_from).getTime()) {
    return NextResponse.json({ error: "covers_to debe ser >= covers_from" }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const { data: payment, error } = await admin
    .from("manual_payments")
    .insert({
      org_id: orgId,
      amount_ars,
      paid_at,
      covers_from,
      covers_to,
      payment_method: payment_method ?? null,
      receipt_ref: receipt_ref ?? null,
      registered_by: user.id,
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mover status a ACTIVE y setear current_period_ends_at al covers_to
  // para que middleware/guard lo respete.
  await admin
    .from("organizations")
    .update({
      subscription_status: "ACTIVE",
      current_period_ends_at: new Date(covers_to).toISOString(),
    })
    .eq("id", orgId)

  logSecurityEvent({
    eventType: "MANUAL_PAYMENT_REGISTERED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "manual_payments",
    targetEntityId: payment.id,
    details: { payment },
  })

  return NextResponse.json({ ok: true, payment })
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
git add app/api/admin/orgs/[id]/manual-payment/route.ts
git commit -m "feat(admin-api): POST manual-payment + status ACTIVE + audit"
```

---

## Task 11: API — suspend / unsuspend / cancel-subscription

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/suspend/route.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/unsuspend/route.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/cancel-subscription/route.ts`

- [ ] **Step 1: Crear suspend**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/suspend/route.ts

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id: orgId } = await params
  const body = await request.json().catch(() => ({}))

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("subscription_status")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  await admin
    .from("organizations")
    .update({ subscription_status: "SUSPENDED" })
    .eq("id", orgId)

  logSecurityEvent({
    eventType: "TENANT_SUSPENDED",
    severity: "WARNING",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: { reason: body.reason ?? null, previous_status: org.subscription_status },
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Crear unsuspend**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/unsuspend/route.ts

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id: orgId } = await params

  const admin = createAdminClient() as any

  // Buscar el último TENANT_SUSPENDED para recuperar previous_status.
  const { data: lastSusp } = await admin
    .from("security_audit_log")
    .select("details")
    .eq("event_type", "TENANT_SUSPENDED")
    .eq("target_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const previous = (lastSusp?.details as any)?.previous_status ?? "ACTIVE"

  await admin
    .from("organizations")
    .update({ subscription_status: previous })
    .eq("id", orgId)

  logSecurityEvent({
    eventType: "TENANT_UNSUSPENDED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: { restored_to: previous },
  })

  return NextResponse.json({ ok: true, status: previous })
}
```

- [ ] **Step 3: Crear cancel-subscription**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/cancel-subscription/route.ts

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { cancelPreapproval } from "@/lib/billing/mercadopago"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id: orgId } = await params
  const body = await request.json().catch(() => ({}))

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("mp_preapproval_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  if (org.mp_preapproval_id) {
    try {
      await cancelPreapproval(org.mp_preapproval_id)
    } catch (err) {
      console.warn("cancelPreapproval falló (continuando cancel):", err)
    }
  }

  const graceEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await admin
    .from("organizations")
    .update({
      subscription_status: "CANCELLED",
      grace_period_ends_at: graceEnds,
      mp_preapproval_id: null,
    })
    .eq("id", orgId)

  logSecurityEvent({
    eventType: "SUBSCRIPTION_CANCELLED_BY_ADMIN",
    severity: "WARNING",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: { reason: body.reason ?? null, grace_ends: graceEnds },
  })

  return NextResponse.json({ ok: true, grace_period_ends_at: graceEnds })
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
git add app/api/admin/orgs/[id]/suspend/ app/api/admin/orgs/[id]/unsuspend/ app/api/admin/orgs/[id]/cancel-subscription/
git commit -m "feat(admin-api): suspend/unsuspend/cancel-subscription + audit"
```

---

## Task 12: API — mp-snapshot + eliminar PATCH viejo

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/mp-snapshot/route.ts`
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/route.ts` (eliminar PATCH)

- [ ] **Step 1: Crear mp-snapshot**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/mp-snapshot/route.ts

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { fetchPreapproval } from "@/lib/billing/mercadopago"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id: orgId } = await params
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("mp_preapproval_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  let preapproval: any = null
  if (org.mp_preapproval_id) {
    try {
      preapproval = await fetchPreapproval(org.mp_preapproval_id)
    } catch (err: any) {
      preapproval = { error: err.message }
    }
  }

  const { data: events } = await admin
    .from("billing_events")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5)

  return NextResponse.json({ preapproval, recent_events: events ?? [] })
}
```

- [ ] **Step 2: Eliminar PATCH viejo**

Modificar `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/route.ts` dejándolo vacío (o eliminar el archivo si no había otros exports):

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
# Ver contenido
cat app/api/admin/orgs/[id]/route.ts
```
Si todo el archivo era solo el PATCH, eliminar el archivo:
```bash
rm app/api/admin/orgs/[id]/route.ts
```
Si había más exports, eliminar solo la función PATCH con Edit.

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
git add app/api/admin/orgs/[id]/
git commit -m "feat(admin-api): mp-snapshot + eliminar PATCH legacy con dropdown"
```

---

## Task 13: UI — `components/admin/tenant-metrics.tsx` + `audit-log-inline.tsx`

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/tenant-metrics.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/audit-log-inline.tsx`

- [ ] **Step 1: tenant-metrics.tsx (Server Component)**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/tenant-metrics.tsx

import { createAdminClient } from "@/lib/supabase/server"

export async function TenantMetrics({ orgId }: { orgId: string }) {
  const admin = createAdminClient() as any

  const [membersQ, agenciesQ, opsTotalQ, opsMonthQ, lastLoginQ, mrrQ] = await Promise.all([
    admin.from("organization_members").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
    admin.from("agencies").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("operations").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    admin
      .from("operations")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    admin
      .from("users")
      .select("last_sign_in_at")
      .eq("org_id", orgId)
      .order("last_sign_in_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("custom_plans")
      .select("base_price_ars, discount_percent")
      .eq("org_id", orgId)
      .maybeSingle(),
  ])

  const effectiveMrr = mrrQ.data
    ? Number(mrrQ.data.base_price_ars) * (1 - (mrrQ.data.discount_percent ?? 0) / 100)
    : null

  const cards = [
    { label: "Miembros", value: membersQ.count ?? 0 },
    { label: "Agencias", value: agenciesQ.count ?? 0 },
    { label: "Ops mes", value: opsMonthQ.count ?? 0 },
    { label: "Ops total", value: opsTotalQ.count ?? 0 },
    {
      label: "MRR ARS",
      value: effectiveMrr != null ? effectiveMrr.toLocaleString("es-AR") : "—",
    },
    {
      label: "Último login",
      value: lastLoginQ.data?.last_sign_in_at
        ? new Date(lastLoginQ.data.last_sign_in_at).toLocaleDateString("es-AR")
        : "—",
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="border rounded-lg p-3">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className="text-xl font-semibold mt-1">{c.value}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: audit-log-inline.tsx (Server Component)**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/audit-log-inline.tsx

import { createAdminClient } from "@/lib/supabase/server"

export async function AuditLogInline({ orgId }: { orgId: string }) {
  const admin = createAdminClient() as any
  const { data: events } = await admin
    .from("security_audit_log")
    .select("created_at, event_type, severity, actor_user_id, details")
    .eq("target_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10)

  if (!events || events.length === 0) {
    return <div className="text-xs text-muted-foreground">Sin eventos registrados.</div>
  }

  return (
    <div className="space-y-1 text-xs">
      {events.map((e: any, i: number) => (
        <div key={i} className="flex items-start gap-3 py-1 border-b last:border-0">
          <span className="text-muted-foreground min-w-[140px]">
            {new Date(e.created_at).toLocaleString("es-AR")}
          </span>
          <span className="font-mono">{e.event_type}</span>
          <span className="text-muted-foreground">{e.severity}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add components/admin/tenant-metrics.tsx components/admin/audit-log-inline.tsx
git commit -m "feat(admin-ui): tenant-metrics + audit-log-inline components"
```

---

## Task 14: UI — `custom-plan-form.tsx` + `custom-plan-display.tsx`

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/custom-plan-form.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/custom-plan-display.tsx`

**Context:** Form para crear/editar + display para org que ya tiene plan. Es la pieza más pesada de UI admin.

- [ ] **Step 1: custom-plan-form.tsx (Client Component)**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/custom-plan-form.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Extra = { key: string; label: string; enabled: boolean }

export function CustomPlanForm({
  orgId,
  initial,
}: {
  orgId: string
  initial?: {
    display_name: string
    base_price_ars: number
    discount_percent: number
    discount_ends_at: string | null
    features: { extras: Extra[] }
    limits: Record<string, number>
    billing_method: "MP" | "MANUAL"
    notes: string | null
  }
}) {
  const router = useRouter()
  const isEdit = !!initial
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "")
  const [basePrice, setBasePrice] = useState(String(initial?.base_price_ars ?? ""))
  const [discountPct, setDiscountPct] = useState(String(initial?.discount_percent ?? 0))
  const [discountMonths, setDiscountMonths] = useState("0")
  const [billingMethod, setBillingMethod] = useState<"MP" | "MANUAL">(
    initial?.billing_method ?? "MP"
  )
  const [extras, setExtras] = useState<Extra[]>(initial?.features.extras ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ checkout_url?: string; error?: string } | null>(null)

  async function submit() {
    setSubmitting(true)
    setResult(null)
    try {
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(`/api/admin/orgs/${orgId}/custom-plan`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          base_price_ars: Number(basePrice),
          discount_percent: Number(discountPct),
          discount_duration_months: Number(discountMonths),
          features: { extras },
          billing_method: billingMethod,
          notes: notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ error: data.error ?? res.statusText })
      } else {
        setResult({ checkout_url: data.checkout_url ?? undefined })
        router.refresh()
      }
    } finally {
      setSubmitting(false)
    }
  }

  function addExtra() {
    setExtras([...extras, { key: `misc_${Date.now()}`, label: "", enabled: true }])
  }
  function removeExtra(i: number) {
    setExtras(extras.filter((_, idx) => idx !== i))
  }
  function updateExtra(i: number, patch: Partial<Extra>) {
    setExtras(extras.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">{isEdit ? "Editar plan custom" : "Crear plan custom"}</h2>

      <label className="block text-sm">
        <span className="text-muted-foreground">Display name</span>
        <input
          className="w-full border rounded px-2 py-1 bg-background"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enterprise Custom Agencia X"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Precio base ARS/mes</span>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            placeholder="719000"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Método de pago</span>
          <select
            className="w-full border rounded px-2 py-1 bg-background"
            value={billingMethod}
            onChange={(e) => setBillingMethod(e.target.value as any)}
          >
            <option value="MP">MercadoPago (recomendado)</option>
            <option value="MANUAL">Manual (transferencia/factura A)</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Descuento %</span>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={discountPct}
            onChange={(e) => setDiscountPct(e.target.value)}
            min={0}
            max={100}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Duración descuento (meses)</span>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={discountMonths}
            onChange={(e) => setDiscountMonths(e.target.value)}
            min={0}
            max={24}
          />
        </label>
      </div>

      <div className="text-sm">
        <div className="text-muted-foreground mb-1">Features extras acordadas (aparte del Enterprise base)</div>
        <div className="space-y-1">
          {extras.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="flex-1 border rounded px-2 py-1 bg-background text-sm"
                value={e.label}
                onChange={(ev) => updateExtra(i, { label: ev.target.value })}
                placeholder="Ej. Bridge Manychat → Callbell dedicado"
              />
              <input
                className="w-40 border rounded px-2 py-1 bg-background text-xs font-mono"
                value={e.key}
                onChange={(ev) => updateExtra(i, { key: ev.target.value })}
                placeholder="key_tecnica"
              />
              <input
                type="checkbox"
                checked={e.enabled}
                onChange={(ev) => updateExtra(i, { enabled: ev.target.checked })}
              />
              <button
                onClick={() => removeExtra(i)}
                className="text-xs text-red-600 hover:underline"
              >
                Borrar
              </button>
            </div>
          ))}
          <button onClick={addExtra} className="text-xs text-blue-600 hover:underline">
            + Agregar feature extra
          </button>
        </div>
      </div>

      <label className="block text-sm">
        <span className="text-muted-foreground">Notas internas</span>
        <textarea
          className="w-full border rounded px-2 py-1 bg-background text-sm"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Cerrado por WA 22/04, referido de X"
        />
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={submit}
          disabled={submitting}
          className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear plan + generar checkout"}
        </button>
        {result?.error && <span className="text-xs text-red-600">{result.error}</span>}
      </div>

      {result?.checkout_url && (
        <div className="border border-green-500 bg-green-50 dark:bg-green-900/10 rounded p-3 text-sm">
          <div className="font-semibold mb-1">Checkout URL generado:</div>
          <code className="block break-all text-xs bg-background px-2 py-1 rounded">
            {result.checkout_url}
          </code>
          <div className="text-xs text-muted-foreground mt-1">
            Mandale este link al cliente por WhatsApp. Al pagar, MP dispara webhook y la org pasa a ACTIVE.
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: custom-plan-display.tsx (Server Component con delete button + form toggle)**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/custom-plan-display.tsx

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CustomPlanForm } from "./custom-plan-form"

type CustomPlan = {
  display_name: string
  base_price_ars: number
  discount_percent: number
  discount_ends_at: string | null
  features: { extras: Array<{ key: string; label: string; enabled: boolean }> }
  limits: Record<string, number>
  billing_method: "MP" | "MANUAL"
  notes: string | null
}

export function CustomPlanDisplay({
  orgId,
  plan,
}: {
  orgId: string
  plan: CustomPlan
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function onDelete() {
    if (!confirm("¿Borrar custom plan? Esto cancela preapproval MP y vuelve al plan Enterprise base.")) return
    setDeleting(true)
    const res = await fetch(`/api/admin/orgs/${orgId}/custom-plan`, { method: "DELETE" })
    setDeleting(false)
    if (res.ok) router.refresh()
    else alert("Error borrando el plan")
  }

  if (editing) {
    return <CustomPlanForm orgId={orgId} initial={plan} />
  }

  const effectiveNow =
    plan.base_price_ars * (1 - (plan.discount_percent ?? 0) / 100)

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold">{plan.display_name}</h2>
          <div className="text-xs text-muted-foreground">
            Método: {plan.billing_method} · {plan.discount_percent > 0 ? `${plan.discount_percent}% off` : "sin descuento"}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-2 py-1 rounded border hover:bg-muted"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="text-xs px-2 py-1 rounded border text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-50"
          >
            {deleting ? "Borrando..." : "Borrar plan"}
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Precio base</dt>
        <dd>${plan.base_price_ars.toLocaleString("es-AR")} / mes</dd>
        <dt className="text-muted-foreground">Precio efectivo (ahora)</dt>
        <dd className="font-semibold">${effectiveNow.toLocaleString("es-AR")} / mes</dd>
        {plan.discount_ends_at && (
          <>
            <dt className="text-muted-foreground">Descuento vence</dt>
            <dd>{new Date(plan.discount_ends_at).toLocaleDateString("es-AR")}</dd>
          </>
        )}
      </dl>

      {plan.features?.extras?.length > 0 && (
        <div className="text-sm">
          <div className="text-muted-foreground mb-1">Extras acordadas:</div>
          <ul className="list-disc list-inside text-xs">
            {plan.features.extras
              .filter((e) => e.enabled)
              .map((e, i) => (
                <li key={i}>
                  {e.label}{" "}
                  <code className="text-muted-foreground">({e.key})</code>
                </li>
              ))}
          </ul>
        </div>
      )}

      {plan.notes && (
        <div className="text-xs text-muted-foreground whitespace-pre-wrap border-t pt-2">
          {plan.notes}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
git add components/admin/custom-plan-form.tsx components/admin/custom-plan-display.tsx
git commit -m "feat(admin-ui): custom-plan form + display con edit/delete"
```

---

## Task 15: UI — extend-trial, critical-actions, manual-payments, mp-snapshot

**Files (todos Client Components):**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/extend-trial-card.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/critical-actions.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/manual-payments-section.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/mp-snapshot.tsx`

- [ ] **Step 1: extend-trial-card.tsx**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/extend-trial-card.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function ExtendTrialCard({
  orgId,
  currentTrialEndsAt,
}: {
  orgId: string
  currentTrialEndsAt: string | null
}) {
  const router = useRouter()
  const [days, setDays] = useState("7")
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit() {
    setSubmitting(true)
    setMsg(null)
    const res = await fetch(`/api/admin/orgs/${orgId}/extend-trial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: Number(days) }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) setMsg(`Error: ${data.error}`)
    else {
      setMsg(`Nuevo trial_ends_at: ${new Date(data.trial_ends_at).toLocaleDateString("es-AR")}`)
      router.refresh()
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <h2 className="font-semibold">Extender trial</h2>
      <div className="text-xs text-muted-foreground">
        Trial actual vence:{" "}
        {currentTrialEndsAt
          ? new Date(currentTrialEndsAt).toLocaleDateString("es-AR")
          : "sin trial activo"}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">Extender por</span>
        <input
          type="number"
          className="w-20 border rounded px-2 py-1 bg-background text-sm"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          min={1}
          max={365}
        />
        <span className="text-sm">días</span>
        <button
          onClick={submit}
          disabled={submitting}
          className="text-sm px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {submitting ? "..." : "Extender"}
        </button>
      </div>
      {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
    </div>
  )
}
```

- [ ] **Step 2: critical-actions.tsx**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/critical-actions.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function CriticalActions({
  orgId,
  orgName,
  currentStatus,
}: {
  orgId: string
  orgName: string
  currentStatus: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function post(path: string, body?: any, confirmTextMatch?: string) {
    if (confirmTextMatch) {
      const input = prompt(`Para confirmar, escribí: ${confirmTextMatch}`)
      if (input !== confirmTextMatch) return
    }
    setBusy(true)
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
    setBusy(false)
    if (res.ok) router.refresh()
    else alert(`Error: ${(await res.json()).error ?? res.statusText}`)
  }

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <h2 className="font-semibold">Acciones críticas</h2>
      <div className="flex flex-wrap gap-2">
        {currentStatus !== "SUSPENDED" && (
          <button
            onClick={() =>
              post(`/api/admin/orgs/${orgId}/suspend`, { reason: "Admin action" }, orgName)
            }
            disabled={busy}
            className="text-xs px-3 py-1 rounded border text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-50"
          >
            Suspender acceso
          </button>
        )}
        {currentStatus === "SUSPENDED" && (
          <button
            onClick={() => post(`/api/admin/orgs/${orgId}/unsuspend`)}
            disabled={busy}
            className="text-xs px-3 py-1 rounded border hover:bg-muted disabled:opacity-50"
          >
            Desuspender
          </button>
        )}
        {currentStatus !== "CANCELLED" && (
          <button
            onClick={() =>
              post(
                `/api/admin/orgs/${orgId}/cancel-subscription`,
                { reason: "Admin action" },
                orgName
              )
            }
            disabled={busy}
            className="text-xs px-3 py-1 rounded border text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-50"
          >
            Cancelar suscripción
          </button>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        Suspender / cancelar pide escribir el nombre de la org como confirmación.
      </div>
    </div>
  )
}
```

- [ ] **Step 3: manual-payments-section.tsx**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/manual-payments-section.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type ManualPayment = {
  id: string
  amount_ars: number
  paid_at: string
  covers_from: string
  covers_to: string
  payment_method: string | null
  receipt_ref: string | null
}

export function ManualPaymentsSection({
  orgId,
  payments,
}: {
  orgId: string
  payments: ManualPayment[]
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    amount_ars: "",
    paid_at: new Date().toISOString().slice(0, 10),
    covers_from: new Date().toISOString().slice(0, 10),
    covers_to: "",
    payment_method: "",
    receipt_ref: "",
  })
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const res = await fetch(`/api/admin/orgs/${orgId}/manual-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_ars: Number(form.amount_ars),
        paid_at: new Date(form.paid_at).toISOString(),
        covers_from: form.covers_from,
        covers_to: form.covers_to,
        payment_method: form.payment_method || null,
        receipt_ref: form.receipt_ref || null,
      }),
    })
    setBusy(false)
    if (res.ok) {
      setCreating(false)
      router.refresh()
    } else {
      alert(`Error: ${(await res.json()).error}`)
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Pagos manuales</h2>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white"
          >
            Registrar pago
          </button>
        )}
      </div>

      {creating && (
        <div className="space-y-2 border rounded p-3 bg-muted/50">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>
              <span className="text-muted-foreground text-xs">Monto ARS</span>
              <input
                type="number"
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.amount_ars}
                onChange={(e) => setForm({ ...form, amount_ars: e.target.value })}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Fecha de pago</span>
              <input
                type="date"
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.paid_at}
                onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Cubre desde</span>
              <input
                type="date"
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.covers_from}
                onChange={(e) => setForm({ ...form, covers_from: e.target.value })}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Cubre hasta</span>
              <input
                type="date"
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.covers_to}
                onChange={(e) => setForm({ ...form, covers_to: e.target.value })}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Método</span>
              <input
                className="w-full border rounded px-2 py-1 bg-background"
                placeholder="Transferencia BBVA / Factura A"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              />
            </label>
            <label>
              <span className="text-muted-foreground text-xs">Nro comprobante</span>
              <input
                className="w-full border rounded px-2 py-1 bg-background"
                value={form.receipt_ref}
                onChange={(e) => setForm({ ...form, receipt_ref: e.target.value })}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="text-xs px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            >
              {busy ? "..." : "Registrar"}
            </button>
            <button
              onClick={() => setCreating(false)}
              className="text-xs px-3 py-1 rounded border"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="text-xs text-muted-foreground">Sin pagos registrados.</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-1">Fecha</th>
              <th>Monto</th>
              <th>Cubre</th>
              <th>Método</th>
              <th>Ref</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-1">{new Date(p.paid_at).toLocaleDateString("es-AR")}</td>
                <td>${Number(p.amount_ars).toLocaleString("es-AR")}</td>
                <td>
                  {p.covers_from} → {p.covers_to}
                </td>
                <td>{p.payment_method ?? "—"}</td>
                <td className="font-mono">{p.receipt_ref ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: mp-snapshot.tsx**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/mp-snapshot.tsx
"use client"

import { useState } from "react"

export function MpSnapshot({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/orgs/${orgId}/mp-snapshot`)
    const body = await res.json()
    setData(body)
    setLoading(false)
  }

  return (
    <div className="border rounded-lg p-4">
      <button
        onClick={() => {
          setOpen(!open)
          if (!open && !data) load()
        }}
        className="text-sm font-semibold w-full text-left"
      >
        {open ? "▾" : "▸"} MP snapshot + últimos webhooks
      </button>
      {open && (
        <div className="mt-3 text-xs space-y-3">
          {loading && <div>Cargando...</div>}
          {data && (
            <>
              <div>
                <div className="font-semibold mb-1">Preapproval actual:</div>
                <pre className="bg-muted p-2 rounded overflow-x-auto max-h-64">
                  {JSON.stringify(data.preapproval, null, 2)}
                </pre>
              </div>
              <div>
                <div className="font-semibold mb-1">Últimos eventos:</div>
                {(data.recent_events as any[]).length === 0 ? (
                  <div className="text-muted-foreground">Sin eventos.</div>
                ) : (
                  (data.recent_events as any[]).map((e, i) => (
                    <div key={i} className="border-b last:border-0 py-1">
                      <span className="text-muted-foreground">
                        {new Date(e.created_at).toLocaleString("es-AR")}
                      </span>{" "}
                      <code>{e.event_type}</code>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
git add components/admin/extend-trial-card.tsx components/admin/critical-actions.tsx components/admin/manual-payments-section.tsx components/admin/mp-snapshot.tsx
git commit -m "feat(admin-ui): extend trial + critical actions + manual payments + MP snapshot"
```

---

## Task 16: Rediseño `/admin/orgs/[id]/page.tsx` + eliminar org-actions.tsx antiguo

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/admin/orgs/[id]/page.tsx`
- Delete: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/admin/org-actions.tsx`

- [ ] **Step 1: Reescribir page.tsx**

Reemplazar completamente el contenido de `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/admin/orgs/[id]/page.tsx`:

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/admin/orgs/[id]/page.tsx

import Link from "next/link"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { TenantMetrics } from "@/components/admin/tenant-metrics"
import { CustomPlanForm } from "@/components/admin/custom-plan-form"
import { CustomPlanDisplay } from "@/components/admin/custom-plan-display"
import { ExtendTrialCard } from "@/components/admin/extend-trial-card"
import { CriticalActions } from "@/components/admin/critical-actions"
import { ManualPaymentsSection } from "@/components/admin/manual-payments-section"
import { MpSnapshot } from "@/components/admin/mp-snapshot"
import { AuditLogInline } from "@/components/admin/audit-log-inline"

export const dynamic = "force-dynamic"

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient() as any

  const { data: org } = await admin.from("organizations").select("*").eq("id", id).maybeSingle()
  if (!org) notFound()

  let customPlan: any = null
  if (org.custom_plan_id) {
    const r = await admin.from("custom_plans").select("*").eq("id", org.custom_plan_id).maybeSingle()
    customPlan = r.data
  }

  let manualPayments: any[] = []
  if (customPlan?.billing_method === "MANUAL") {
    const r = await admin
      .from("manual_payments")
      .select("*")
      .eq("org_id", id)
      .order("paid_at", { ascending: false })
      .limit(20)
    manualPayments = r.data ?? []
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <Link href="/admin/orgs" className="text-sm text-blue-600 hover:underline">
          ← Todas las orgs
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{org.name}</h1>
        <p className="text-sm text-muted-foreground">
          {org.slug} · {org.id}
        </p>
      </div>

      <TenantMetrics orgId={id} />

      <div className="border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Billing</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Plan base</dt>
          <dd>{org.plan || "—"}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{org.subscription_status || "—"}</dd>
          <dt className="text-muted-foreground">Trial ends</dt>
          <dd>{org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString("es-AR") : "—"}</dd>
          <dt className="text-muted-foreground">Grace ends</dt>
          <dd>
            {org.grace_period_ends_at
              ? new Date(org.grace_period_ends_at).toLocaleDateString("es-AR")
              : "—"}
          </dd>
          <dt className="text-muted-foreground">Billing email</dt>
          <dd>{org.billing_email || "—"}</dd>
          <dt className="text-muted-foreground">CUIT</dt>
          <dd>{org.cuit || "—"}</dd>
        </dl>
      </div>

      {customPlan ? (
        <CustomPlanDisplay orgId={id} plan={customPlan} />
      ) : (
        <CustomPlanForm orgId={id} />
      )}

      <ExtendTrialCard orgId={id} currentTrialEndsAt={org.trial_ends_at} />

      <CriticalActions orgId={id} orgName={org.name} currentStatus={org.subscription_status} />

      {customPlan?.billing_method === "MANUAL" && (
        <ManualPaymentsSection orgId={id} payments={manualPayments} />
      )}

      <MpSnapshot orgId={id} />

      <div className="border rounded-lg p-4">
        <h2 className="font-semibold mb-2">Audit log (últimos 10)</h2>
        <AuditLogInline orgId={id} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Eliminar `components/admin/org-actions.tsx`**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
rm components/admin/org-actions.tsx
```

- [ ] **Step 3: Typecheck + smoke UI**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
npm run dev
```
Abrir `http://localhost:3044/admin/orgs/<org-id>` y verificar que cargan todos los bloques.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/admin/orgs/[id]/page.tsx components/admin/org-actions.tsx
git commit -m "feat(admin-ui): rediseño de /admin/orgs/[id] + eliminar dropdown antiguo"
```

---

## Task 17: UI owner — `/settings/subscription` con 3 estados

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/settings/subscription/page.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/subscription/custom-plan-owner-view.tsx`

**Context:** Leer el archivo actual antes de modificar. Detectar `custom_plan_id` y renderizar custom-plan-owner-view con los 3 estados (pending payment, active, manual).

- [ ] **Step 1: Leer el archivo actual**

```bash
cat /Users/tomiisanchezz/Desktop/Repos/erplozada/app/\(dashboard\)/settings/subscription/page.tsx
```
Entender cómo obtiene `org` y cómo renderiza los planes públicos hoy. No vamos a romper ese flow — solo sumamos el branch de custom plan.

- [ ] **Step 2: Crear `custom-plan-owner-view.tsx`**

```tsx
// /Users/tomiisanchezz/Desktop/Repos/erplozada/components/subscription/custom-plan-owner-view.tsx

import { PLANS, formatArs } from "@/lib/billing/plans"

type CustomPlan = {
  display_name: string
  base_price_ars: number
  discount_percent: number
  discount_ends_at: string | null
  features: { extras: Array<{ key: string; label: string; enabled: boolean }> }
  billing_method: "MP" | "MANUAL"
}

type Org = {
  subscription_status: string | null
  mp_preapproval_id: string | null
  current_period_ends_at: string | null
  trial_ends_at: string | null
}

export function CustomPlanOwnerView({
  plan,
  org,
  checkoutUrl,
}: {
  plan: CustomPlan
  org: Org
  /** Si la suscripción está pending y MP, la caller obtiene el init_point para el CTA. */
  checkoutUrl: string | null
}) {
  const enterpriseFeatures = PLANS.ENTERPRISE.features
  const effective = plan.base_price_ars * (1 - (plan.discount_percent ?? 0) / 100)
  const hasDiscount = plan.discount_percent > 0 && plan.discount_ends_at

  // Detectar estado
  const isActive = org.subscription_status === "ACTIVE"
  const isPending = !isActive && plan.billing_method === "MP" && !!checkoutUrl
  const isManualUnpaid =
    !isActive && plan.billing_method === "MANUAL"

  return (
    <div className="max-w-2xl space-y-4">
      <div className="border rounded-lg p-6 space-y-4">
        {isPending && (
          <div className="text-sm font-semibold text-blue-600 uppercase tracking-wide">
            Tu plan personalizado está listo
          </div>
        )}
        <h1 className="text-2xl font-semibold">{plan.display_name}</h1>

        <div className="space-y-1">
          {hasDiscount ? (
            <>
              <div className="text-sm">
                <span className="text-muted-foreground">Precio actual</span>{" "}
                <span className="font-semibold">
                  {formatArs(effective)} / mes
                </span>{" "}
                <span className="text-xs text-muted-foreground">
                  (hasta {new Date(plan.discount_ends_at!).toLocaleDateString("es-AR")})
                </span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">A partir de ahí</span>{" "}
                <span className="font-semibold">
                  {formatArs(plan.base_price_ars)} / mes
                </span>
              </div>
              <div className="text-xs text-green-700 dark:text-green-400">
                Descuento promocional: {plan.discount_percent}% off
              </div>
            </>
          ) : (
            <div className="text-sm">
              <span className="text-muted-foreground">Precio</span>{" "}
              <span className="font-semibold">{formatArs(plan.base_price_ars)} / mes</span>
            </div>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <div className="font-semibold">Todo lo del plan Enterprise:</div>
          <ul className="space-y-0.5 text-xs">
            {enterpriseFeatures.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>

          {plan.features.extras.filter((e) => e.enabled).length > 0 && (
            <>
              <div className="font-semibold mt-3">
                + Features adicionales acordadas para tu agencia:
              </div>
              <ul className="space-y-0.5 text-xs">
                {plan.features.extras
                  .filter((e) => e.enabled)
                  .map((e) => (
                    <li key={e.key}>✓ {e.label}</li>
                  ))}
              </ul>
            </>
          )}
        </div>

        {isPending && (
          <a
            href={checkoutUrl!}
            className="block text-center text-sm font-semibold px-4 py-3 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Suscribirme y pagar con MercadoPago →
          </a>
        )}

        {isActive && plan.billing_method === "MP" && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            Cobro automático activo vía MercadoPago.{" "}
            {org.current_period_ends_at && (
              <>
                Próximo cobro: {new Date(org.current_period_ends_at).toLocaleDateString("es-AR")}.
              </>
            )}
          </div>
        )}

        {(isActive || isManualUnpaid) && plan.billing_method === "MANUAL" && (
          <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
            <div>Método de pago: Factura A / Transferencia.</div>
            {org.current_period_ends_at && (
              <div>
                Próximo vencimiento:{" "}
                {new Date(org.current_period_ends_at).toLocaleDateString("es-AR")}.
              </div>
            )}
            <div>Consultas de facturación: ventas@vibook.ai</div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Modificar `page.tsx` para usar custom view cuando aplique**

Editar `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/settings/subscription/page.tsx`. Al inicio del render, si `org.custom_plan_id`:

```tsx
// Agregar al top del archivo (fusionar con imports existentes)
import { CustomPlanOwnerView } from "@/components/subscription/custom-plan-owner-view"
import { fetchPreapproval } from "@/lib/billing/mercadopago"

// Dentro del componente, después de obtener `org`:
if (org.custom_plan_id) {
  const { data: customPlan } = await admin
    .from("custom_plans")
    .select("*")
    .eq("id", org.custom_plan_id)
    .maybeSingle()

  let checkoutUrl: string | null = null
  if (
    customPlan &&
    customPlan.billing_method === "MP" &&
    org.subscription_status !== "ACTIVE" &&
    org.mp_preapproval_id
  ) {
    try {
      const mp = await fetchPreapproval(org.mp_preapproval_id)
      if (mp?.init_point && mp?.status !== "authorized") {
        checkoutUrl = mp.init_point
      }
    } catch {
      // si MP no responde, mostrar sin CTA — el owner puede retry
    }
  }

  if (customPlan) {
    return <CustomPlanOwnerView plan={customPlan as any} org={org as any} checkoutUrl={checkoutUrl} />
  }
}

// ... (resto del render normal de planes públicos sigue abajo)
```

(El ejecutor adapta al código real de `page.tsx` — esos son los cambios quirúrgicos.)

- [ ] **Step 4: Typecheck + smoke**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit
npm run dev
```
Como owner de una org con custom plan, abrir `/settings/subscription` y ver custom view.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/\(dashboard\)/settings/subscription/page.tsx components/subscription/custom-plan-owner-view.tsx
git commit -m "feat(subscription): custom plan owner view con 3 estados (pending/active/manual)"
```

---

## Task 18: Middleware — redirect custom plan sin pago a `/settings/subscription`

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/middleware.ts`

**Context:** Hoy, cuando status bloquea acceso, el redirect va a `/onboarding/billing`. Para orgs con custom plan, queremos redirigir a `/settings/subscription` (donde verán el custom view con CTA de pago). El middleware NO puede importar código server-side pesado — pero sí puede leer una columna extra en su query existente.

- [ ] **Step 1: Modificar el select de `organizations` en middleware.ts**

En `middleware.ts`, línea ~187 (`await (supabase.from("organizations") as any).select(...)`). Agregar `custom_plan_id` al select:

```ts
const { data: orgRow } = await (supabase.from("organizations") as any)
  .select("subscription_status, current_period_ends_at, trial_ends_at, custom_plan_id")
  .eq("id", orgId)
  .maybeSingle()

const status = (orgRow as any)?.subscription_status as string | undefined
const periodEnds = (orgRow as any)?.current_period_ends_at as string | null | undefined
const trialEnds = (orgRow as any)?.trial_ends_at as string | null | undefined
const customPlanId = (orgRow as any)?.custom_plan_id as string | null | undefined
```

- [ ] **Step 2: Cambiar el redirect cuando está blocked**

Reemplazar el bloque `if (blocked)` existente con:

```ts
if (blocked) {
  const url = req.nextUrl.clone()
  url.pathname = customPlanId ? "/settings/subscription" : "/onboarding/billing"
  return NextResponse.redirect(url)
}
```

- [ ] **Step 3: Verificar que `/settings/subscription` está en isPaywallAllowed (ya lo está, línea ~158).**

No tocar eso — solo confirmar.

- [ ] **Step 4: Smoke**

Usar un org con `custom_plan_id` seteado y `subscription_status='SUSPENDED'` para simular blocked. Loguear y verificar que redirige a `/settings/subscription` en vez de `/onboarding/billing`.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add middleware.ts
git commit -m "feat(middleware): redirect custom-plan blocked a /settings/subscription"
```

---

## Task 19: Cron — `/api/cron/apply-pricing-changes`

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/cron/apply-pricing-changes/route.ts`
- Test: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/cron/apply-pricing-changes/route.test.ts`

**Context:** Dos pasadas: (1) expirar descuentos vencidos y actualizar MP, (2) notificación preventiva 7 días antes. Se llama por Railway Cron Service con `Authorization: Bearer $CRON_SECRET`.

- [ ] **Step 1: Escribir el endpoint**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/cron/apply-pricing-changes/route.ts

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { calculateEffectivePrice } from "@/lib/billing/custom-plans"
import { applyPriceChange } from "@/lib/billing/mp-update"
import { logSecurityEvent } from "@/lib/security/audit"

export const dynamic = "force-dynamic"

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return unauthorized()
  const auth = request.headers.get("authorization") ?? ""
  if (auth !== `Bearer ${secret}`) return unauthorized()

  const admin = createAdminClient() as any
  const now = new Date()
  const summary = { expired: 0, notified: 0, errors: [] as string[] }

  // Pasada 1: descuentos vencidos
  const { data: expiredRows } = await admin
    .from("custom_plans")
    .select("*, organizations!inner(id, mp_preapproval_id, billing_email)")
    .lte("discount_ends_at", now.toISOString())
    .gt("discount_percent", 0)

  for (const cp of expiredRows ?? []) {
    try {
      const orgRow = cp.organizations
      const currentEffective = calculateEffectivePrice(
        Number(cp.base_price_ars),
        cp.discount_percent
      )
      const newAmount = Number(cp.base_price_ars)

      let mpResult = null
      if (cp.billing_method === "MP" && orgRow.mp_preapproval_id) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
        mpResult = await applyPriceChange({
          preapprovalId: orgRow.mp_preapproval_id,
          currentAmount: currentEffective,
          newAmount,
          recreateParams: {
            orgId: orgRow.id,
            plan: "CUSTOM",
            payerEmail: orgRow.billing_email!,
            backUrl: `${appUrl}/settings/subscription?custom=reauth`,
            customAmount: newAmount,
            customReason: `Vibook — ${cp.display_name}`,
            includeFreeTrial: false,
          },
        })
      }

      await admin
        .from("custom_plans")
        .update({ discount_percent: 0, discount_ends_at: null })
        .eq("id", cp.id)

      if (mpResult?.action === "REAUTH_REQUIRED" && mpResult.newPreapprovalId) {
        await admin
          .from("organizations")
          .update({
            mp_preapproval_id: mpResult.newPreapprovalId,
            subscription_status: "PAST_DUE",
          })
          .eq("id", orgRow.id)
      }

      logSecurityEvent({
        eventType: "CUSTOM_PLAN_DISCOUNT_EXPIRED",
        severity: "INFO",
        actorUserId: null,
        actorAuthId: null,
        targetOrgId: orgRow.id,
        targetEntity: "custom_plans",
        targetEntityId: cp.id,
        details: { currentEffective, newAmount, mpResult },
      })
      summary.expired++
    } catch (err: any) {
      summary.errors.push(`cp=${cp.id}: ${err.message}`)
    }
  }

  // Pasada 2: notificación preventiva (7 días antes)
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const { data: upcomingRows } = await admin
    .from("custom_plans")
    .select("*, organizations!inner(id, billing_email)")
    .gt("discount_ends_at", now.toISOString())
    .lte("discount_ends_at", weekAhead.toISOString())
    .gt("discount_percent", 0)

  for (const cp of upcomingRows ?? []) {
    // Check si ya se notificó en los últimos 14 días
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data: priorNotice } = await admin
      .from("security_audit_log")
      .select("id")
      .eq("event_type", "CUSTOM_PLAN_DISCOUNT_EXPIRY_NOTICE_SENT")
      .eq("target_org_id", cp.organizations.id)
      .gte("created_at", twoWeeksAgo)
      .maybeSingle()
    if (priorNotice) continue

    // TODO Resend integration — por ahora loguear en audit (Resend es Prio 3b)
    logSecurityEvent({
      eventType: "CUSTOM_PLAN_DISCOUNT_EXPIRY_NOTICE_SENT",
      severity: "INFO",
      actorUserId: null,
      actorAuthId: null,
      targetOrgId: cp.organizations.id,
      targetEntity: "custom_plans",
      targetEntityId: cp.id,
      details: {
        discount_ends_at: cp.discount_ends_at,
        base_price_ars: cp.base_price_ars,
        billing_email: cp.organizations.billing_email,
        note: "Resend no integrado aún — notificación solo logueada. Avisar manualmente por WA/email.",
      },
    })
    summary.notified++
  }

  return NextResponse.json({ ok: true, ...summary })
}
```

- [ ] **Step 2: Escribir tests**

```ts
// /Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/cron/apply-pricing-changes/route.test.ts

/**
 * Tests mock del cron. Testea branching sin hitting DB real.
 * Usa jest mocks sobre los módulos core.
 */

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}))
jest.mock("@/lib/billing/mp-update", () => ({
  applyPriceChange: jest.fn(),
}))
jest.mock("@/lib/security/audit", () => ({
  logSecurityEvent: jest.fn(),
}))

import { POST } from "./route"

const supa = require("@/lib/supabase/server")
const mp = require("@/lib/billing/mp-update")
const audit = require("@/lib/security/audit")

function mockAdmin({ expired = [], upcoming = [], priorNotice = null } = {}) {
  const from = jest.fn((table: string) => {
    if (table === "custom_plans") {
      const chain: any = {
        select: () => chain,
        lte: () => chain,
        gte: () => chain,
        gt: () => chain,
        update: () => chain,
        eq: () => chain,
      }
      // Resolver la query: discount_ends_at <= now → expired; > now → upcoming.
      chain.then = (resolve: any) => {
        resolve({ data: [...expired, ...upcoming], error: null })
      }
      // Simplificación: primera llamada devuelve expired, segunda devuelve upcoming.
      return chain
    }
    if (table === "security_audit_log") {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        maybeSingle: async () => ({ data: priorNotice }),
      }
      return chain
    }
    if (table === "organizations") {
      return {
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
    }
    return {}
  })
  supa.createAdminClient.mockReturnValue({ from })
}

describe("POST /api/cron/apply-pricing-changes", () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...OLD_ENV, CRON_SECRET: "test-secret" }
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  it("401 sin auth", async () => {
    const res = await POST(new Request("http://localhost/api/cron/apply-pricing-changes", { method: "POST" }))
    expect(res.status).toBe(401)
  })

  it("401 con secret incorrecto", async () => {
    mockAdmin()
    const res = await POST(
      new Request("http://localhost/api/cron/apply-pricing-changes", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      })
    )
    expect(res.status).toBe(401)
  })

  // Tests de integración con supabase real quedan en __tests__/cron/... (ver Task 20)
})
```

*(Test más completo con seed de DB queda como E2E manual en staging — ver Task 20.)*

- [ ] **Step 3: Correr tests**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest app/api/cron/apply-pricing-changes/route.test.ts
```

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/api/cron/apply-pricing-changes/
git commit -m "feat(cron): apply-pricing-changes endpoint + bearer auth + audit"
```

---

## Task 20: Railway Cron setup + smoke E2E checklist

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/plans/2026-04-22-admin-custom-plans-e2e.md`

**Context:** Último paso — configurar el cron service en Railway y correr el smoke manual. Este task es mayormente texto-dirigido al user.

- [ ] **Step 1: Documentar instrucciones de Railway Cron Service**

Crear el archivo E2E checklist:

```markdown
# Admin Custom Plans — E2E Smoke Checklist

## 1. Railway Cron Service setup

En Railway (proyecto de producción de `maxevagestion`):

1. `+ New Service` → `Cron Service`.
2. Name: `cron-apply-pricing-changes`.
3. Schedule: `0 9 * * *` (09:00 UTC = 06:00 AR).
4. Start Command:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://app.vibook.ai/api/cron/apply-pricing-changes
   ```
5. Environment variables: `CRON_SECRET` (tomar del servicio principal).
6. Deploy.

Validación: correr manualmente desde el panel de Railway. Ver logs del servicio principal para confirmar que recibió la llamada.

## 2. Smoke tests en staging (o prod con org throwaway)

### 2.1 Crear custom plan MP con descuento

- [ ] Entrar a `/admin/orgs/<org-id>` como Tomi.
- [ ] Click "Crear plan custom". Completar:
      - Display name: `E2E Test Plan`
      - Base price: `100000`
      - Discount: `40%` por `1` mes
      - Features extras: `[{ label: "SLA 4h", key: "misc_sla_4h", enabled: true }]`
      - Billing method: MP
- [ ] Click "Crear plan + generar checkout".
- [ ] Copiar `checkout_url` que devuelve.
- [ ] Abrir el link en incognito + pagar con tarjeta de test MP (APRO 5031 7557 3453 0604, ANY CVV, future date).
- [ ] Verificar webhook MP llega (logs de Railway).
- [ ] Volver a `/admin/orgs/<org-id>` y confirmar `subscription_status = ACTIVE`.

### 2.2 Owner ve el plan

- [ ] Loguearse como owner de esa org → `/settings/subscription`.
- [ ] Debería ver: "Enterprise Custom Agencia X" con $60.000 / mes (con descuento) y $100.000 a partir del mes 2.
- [ ] Bullets: todas las features de Enterprise + `SLA 4h`.
- [ ] Status: cobro automático activo.

### 2.3 Extender trial

- [ ] (Requiere org en TRIAL — usar otro org de test) `/admin/orgs/<otra-id>`.
- [ ] Click "Extender trial" → `7` días → submit.
- [ ] Verificar que `trial_ends_at` se actualizó en la UI y en DB.

### 2.4 Cron expira descuento

- [ ] En la DB del E2E plan, updatear manualmente `discount_ends_at = now() - interval '1 hour'` para forzar.
- [ ] Disparar el cron manualmente desde Railway o:
      ```bash
      curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.vibook.ai/api/cron/apply-pricing-changes
      ```
- [ ] Verificar respuesta JSON: `{ ok: true, expired: 1, ... }`.
- [ ] Verificar en DB: `custom_plans.discount_percent = 0`, `discount_ends_at = null`.
- [ ] Verificar en MP panel: preapproval `transaction_amount` ahora es `$100.000` (o se canceló + creó uno nuevo si supera threshold).
- [ ] Verificar audit log: evento `CUSTOM_PLAN_DISCOUNT_EXPIRED`.

### 2.5 Manual payment path

- [ ] Crear otro custom plan con billing_method=MANUAL en una org de test.
- [ ] En `/admin/orgs/<id>` ver la sección "Pagos manuales".
- [ ] Click "Registrar pago" → amount $50000, paid_at hoy, covers_from hoy, covers_to en 30d.
- [ ] Confirmar que `organizations.subscription_status` pasa a `ACTIVE` y `current_period_ends_at` = covers_to.

### 2.6 Suspend / Unsuspend

- [ ] Click "Suspender acceso" → pide escribir nombre org → confirmar.
- [ ] Loguearse como owner → debe redirigir a `/settings/subscription` (si tiene custom_plan_id) o `/onboarding/billing` (si no).
- [ ] Volver como admin → click "Desuspender".
- [ ] Owner recupera acceso.

### 2.7 404 `/admin`

- [ ] Abrir `https://app.vibook.ai/admin` → debería redirigir a `/admin/orgs`.

## 3. Rollback plan

Si algo explota en prod:

- Borrar custom_plans: `UPDATE organizations SET custom_plan_id = NULL; DELETE FROM custom_plans;`.
- Rollback migrations 158-160 (drop de tablas custom_plans + manual_payments; column drop custom_plan_id).
- Revertir los commits de UI y endpoints: `git revert <commits>`.
- El paywall y billing legacy (PRO / Enterprise via plans.ts) sigue funcionando sin tocar.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add docs/superpowers/plans/2026-04-22-admin-custom-plans-e2e.md
git commit -m "docs: E2E checklist admin custom plans + Railway cron setup"
```

- [ ] **Step 3: Avisar al user que corra el smoke manualmente y que avise cuando terminó Task 20.**

---

## Resumen de entregables

- 3 migrations (158, 159, 160) + tabla `custom_plans`, `manual_payments`, `organizations.custom_plan_id`.
- Fix de `/admin` 404.
- Módulos `lib/billing/custom-plans.ts` + `mp-update.ts` con tests TDD.
- 9 endpoints admin (custom-plan POST/PATCH/DELETE, extend-trial, manual-payment, suspend, unsuspend, cancel, mp-snapshot).
- 8 componentes UI admin + rediseño de `/admin/orgs/[id]`.
- UI owner con 3 estados en `/settings/subscription`.
- Middleware: redirect a `/settings/subscription` para orgs con custom plan bloqueadas.
- Cron `/api/cron/apply-pricing-changes` + Railway Cron Service.
- E2E checklist para smoke manual.

Total: 20 tareas, ~475 líneas de spec + este plan.
