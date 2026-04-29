# Admin Metrics Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que el MRR de `/admin/metrics` refleje la realidad — incluir Lozada (Enterprise sin custom_plan vía override manual), proyectar trials, mostrar movement (New/Churn 30d), y alertar de "casos rotos".

**Architecture:** Una columna nueva `organizations.manual_mrr_override_ars` que tiene prioridad en `computeMrrArs`. Helpers nuevos `computeTrialPipelineMrrArs` y `computePotentialMrrArs` reaprovechan la lógica de cálculo cambiando el filtro de status. La page lee organizations + custom_plans una sola vez y pasa por los 3 helpers para llegar a los KPIs nuevos.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), Recharts, Jest, dark slate Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-26-admin-metrics-phase-2-design.md`

---

## File Structure

### Crear

| Path | Responsabilidad |
|---|---|
| `supabase/migrations/20260426120000_organizations_manual_mrr_override.sql` | Migration 166 — agregar columna nullable |
| `app/api/admin/orgs/[id]/mrr-override/route.ts` | Endpoint PATCH para setear/borrar el override |
| `components/admin/mrr-override-card.tsx` | Client card en detalle de org con form numérico |
| `components/admin/enterprise-without-price-alert.tsx` | Server card amarilla con lista de orgs problema |
| `__tests__/api/admin/orgs/mrr-override.test.ts` | Tests del endpoint |

### Modificar

| Path | Cambio |
|---|---|
| `lib/admin/metrics.ts` | Honra override en `computeMrrArs` + 2 helpers nuevos |
| `__tests__/lib/admin/metrics.test.ts` | 6-8 tests nuevos para los 3 helpers |
| `app/admin/metrics/page.tsx` | Cards nuevas + alert + breakdown |
| `app/admin/orgs/[id]/page.tsx` | Insertar `<MrrOverrideCard>` después de Billing |
| `components/admin/tenant-metrics.tsx` | Card MRR usa override |
| `lib/supabase/types.ts` | Regenerado tras migration 166 |

---

## Notas de ejecución

- Commits locales libres, push solo con OK explícito de Tomi (memoria `feedback_no_push_until_told.md`).
- Migration 166 SQL al chat para pegar en SQL Editor (project `pmqvplyyxiobkllapgjp`), nunca `supabase db push`.
- Regen types con `npx supabase gen types typescript --project-id pmqvplyyxiobkllapgjp > lib/supabase/types.ts`. Sacar `npm warn exec` si aparece en line 1.
- Test runner: `npm run test`. TypeCheck: `npx tsc --noEmit -p tsconfig.json`.
- DO NOT use `git add .` / `git add -A` — uncommitted parallel-dev work in tree.

---

## Task 1: Migration 166 — `manual_mrr_override_ars` column

**Files:**
- Create: `supabase/migrations/20260426120000_organizations_manual_mrr_override.sql`

- [ ] **Step 1: Crear el archivo de migration**

```sql
-- =====================================================
-- Migración 166: organizations.manual_mrr_override_ars
-- =====================================================
-- Override manual del MRR para deals fuera del flow MP/custom_plan
-- (Enterprise pagando por transferencia, descuentos one-off, etc.).
-- Tiene prioridad sobre custom_plan y PLANS price en computeMrrArs.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS manual_mrr_override_ars NUMERIC(12,2);

COMMENT ON COLUMN organizations.manual_mrr_override_ars IS
  'Override manual del MRR mensual en ARS. Tiene prioridad sobre custom_plan y PLANS[plan].priceArsMonthly. Usado para deals que no pasan por MP (transferencia, factura manual). Nullable = sin override.';
```

- [ ] **Step 2: Pegar en Supabase SQL Editor**

Project: `pmqvplyyxiobkllapgjp`. Después correr verificación:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name = 'manual_mrr_override_ars';
```

Esperado: 1 row, type `numeric`.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260426120000_organizations_manual_mrr_override.sql
git commit -m "feat(saas): add organizations.manual_mrr_override_ars (mig 166)

Columna nullable NUMERIC(12,2). Override manual del MRR mensual para
deals fuera del flow MP (Enterprise por transferencia, etc.). Tiene
prioridad sobre custom_plan y PLANS price en computeMrrArs."
```

---

## Task 2: Regenerar Supabase types

- [ ] **Step 1: Correr el generador**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx supabase gen types typescript --project-id pmqvplyyxiobkllapgjp > lib/supabase/types.ts
```

- [ ] **Step 2: Verificar primera línea + que aparezca la columna**

```bash
head -3 lib/supabase/types.ts
grep "manual_mrr_override_ars" lib/supabase/types.ts | head -3
```

Esperado: primera línea `export type Json =`. Match para `manual_mrr_override_ars` en Row, Insert, Update.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "chore(types): regen supabase types after mig 166"
```

---

## Task 3: Update `lib/admin/metrics.ts` con override + 2 helpers nuevos (TDD)

**Files:**
- Modify: `lib/admin/metrics.ts`
- Modify: `__tests__/lib/admin/metrics.test.ts`

- [ ] **Step 1: Extender los tests existentes**

Editar `__tests__/lib/admin/metrics.test.ts`. Reemplazar el contenido completo por:

```ts
import {
  computeMrrArs,
  computeTrialPipelineMrrArs,
  computePotentialMrrArs,
} from "@/lib/admin/metrics"

const FUTURE = new Date(Date.now() + 86400 * 30 * 1000).toISOString()
const PAST = new Date(Date.now() - 86400 * 1000).toISOString()

describe("computeMrrArs", () => {
  it("TRIAL org → 0", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "TRIAL", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })

  it("ACTIVE STARTER → 29900", () => {
    expect(
      computeMrrArs(
        { plan: "STARTER", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(29900)
  })

  it("ACTIVE PRO → 119000", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(119000)
  })

  it("ACTIVE ENTERPRISE without custom_plan and without override → 0", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })

  it("ACTIVE custom_plan no discount → base_price", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp1", manual_mrr_override_ars: null },
        { base_price_ars: 500000, discount_percent: 0, discount_ends_at: null },
      ),
    ).toBe(500000)
  })

  it("ACTIVE custom_plan discount active → discounted", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp1", manual_mrr_override_ars: null },
        { base_price_ars: 500000, discount_percent: 20, discount_ends_at: FUTURE },
      ),
    ).toBe(400000)
  })

  it("ACTIVE custom_plan discount expired → base_price", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp1", manual_mrr_override_ars: null },
        { base_price_ars: 500000, discount_percent: 20, discount_ends_at: PAST },
      ),
    ).toBe(500000)
  })

  it("SUSPENDED → 0", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "SUSPENDED", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })

  // OVERRIDE tests — nuevos
  it("override > 0 wins over PLANS price", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: 250000 },
        null,
      ),
    ).toBe(250000)
  })

  it("override > 0 wins over custom_plan price", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp1", manual_mrr_override_ars: 719000 },
        { base_price_ars: 500000, discount_percent: 0, discount_ends_at: null },
      ),
    ).toBe(719000)
  })

  it("override = 0 falls through to PLANS price", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: 0 },
        null,
      ),
    ).toBe(119000)
  })

  it("override + non-paying status → 0 (status filter sigue primero)", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "TRIALING", custom_plan_id: null, manual_mrr_override_ars: 719000 },
        null,
      ),
    ).toBe(0)
  })
})

describe("computeTrialPipelineMrrArs", () => {
  it("returns 0 if status is not TRIALING", () => {
    expect(
      computeTrialPipelineMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })

  it("TRIALING with PRO plan returns 119000", () => {
    expect(
      computeTrialPipelineMrrArs(
        { plan: "PRO", subscription_status: "TRIALING", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(119000)
  })

  it("TRIALING with override returns override", () => {
    expect(
      computeTrialPipelineMrrArs(
        { plan: "ENTERPRISE", subscription_status: "TRIALING", custom_plan_id: null, manual_mrr_override_ars: 500000 },
        null,
      ),
    ).toBe(500000)
  })

  it("TRIALING with custom_plan returns custom price", () => {
    expect(
      computeTrialPipelineMrrArs(
        { plan: "ENTERPRISE", subscription_status: "TRIALING", custom_plan_id: "cp1", manual_mrr_override_ars: null },
        { base_price_ars: 300000, discount_percent: 0, discount_ends_at: null },
      ),
    ).toBe(300000)
  })
})

describe("computePotentialMrrArs", () => {
  it("ignores status — CANCELLED PRO still returns 119000", () => {
    expect(
      computePotentialMrrArs(
        { plan: "PRO", subscription_status: "CANCELLED", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(119000)
  })

  it("SUSPENDED with override returns override", () => {
    expect(
      computePotentialMrrArs(
        { plan: "ENTERPRISE", subscription_status: "SUSPENDED", custom_plan_id: null, manual_mrr_override_ars: 719000 },
        null,
      ),
    ).toBe(719000)
  })

  it("CANCELLED ENTERPRISE without anything → 0", () => {
    expect(
      computePotentialMrrArs(
        { plan: "ENTERPRISE", subscription_status: "CANCELLED", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npm run test -- __tests__/lib/admin/metrics.test.ts
```

Esperado: FAIL — el tipo `MrrOrg` no tiene `manual_mrr_override_ars`, y los exports `computeTrialPipelineMrrArs` / `computePotentialMrrArs` no existen.

- [ ] **Step 3: Implementar el código**

Reemplazar contenido completo de `lib/admin/metrics.ts` por:

```ts
import { PLANS } from "@/lib/billing/plans"

export type MrrOrg = {
  plan: string | null
  subscription_status: string
  custom_plan_id: string | null
  manual_mrr_override_ars: number | null
}

export type MrrCustomPlan = {
  base_price_ars: number
  discount_percent: number
  discount_ends_at: string | null
}

const PAYING_STATUSES = new Set(["ACTIVE", "PAST_DUE"])

/**
 * Calcula el MRR mensual de UNA org. Devuelve 0 si no contribuye.
 *
 * Precedencia (en este orden):
 *   1. Si status NOT IN (ACTIVE, PAST_DUE) → 0
 *   2. manual_mrr_override_ars > 0          → ese valor
 *   3. custom_plan_id + customPlan          → custom plan effective price
 *   4. PLANS[plan].priceArsMonthly          → plan default
 *   5. fallback                              → 0
 */
export function computeMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  if (!PAYING_STATUSES.has(org.subscription_status)) return 0
  return computeBaseMrrArs(org, customPlan)
}

/**
 * MRR proyectado de orgs en TRIALING. Mismo cálculo que MRR pero ignorando
 * el filtro de "ya está pagando". Para orgs que NO están en TRIALING devuelve 0.
 */
export function computeTrialPipelineMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  if (org.subscription_status !== "TRIALING") return 0
  return computeBaseMrrArs(org, customPlan)
}

/**
 * MRR "potencial" — lo que pagaría/pagaba la org si fuera ACTIVE. Usado para
 * Churn MRR (sumar lo que se perdió de orgs canceladas/suspendidas). NO filtra
 * por status, solo aplica override → custom → plan.
 */
export function computePotentialMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  return computeBaseMrrArs(org, customPlan)
}

// Lógica compartida: override → custom → plan. NO chequea status.
function computeBaseMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  if (org.manual_mrr_override_ars && org.manual_mrr_override_ars > 0) {
    return Math.round(Number(org.manual_mrr_override_ars))
  }
  if (org.custom_plan_id && customPlan) {
    const discountActive =
      customPlan.discount_ends_at != null &&
      new Date(customPlan.discount_ends_at).getTime() > Date.now()
    const factor = discountActive ? 1 - customPlan.discount_percent / 100 : 1
    return Math.round(customPlan.base_price_ars * factor)
  }
  const planDef = PLANS[org.plan as keyof typeof PLANS]
  return planDef?.priceArsMonthly ?? 0
}
```

- [ ] **Step 4: Correr tests y verificar PASS**

```bash
npm run test -- __tests__/lib/admin/metrics.test.ts
```

Esperado: 19 tests passing (12 computeMrrArs + 4 trialPipeline + 3 potential).

- [ ] **Step 5: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/admin/metrics|__tests__/lib/admin/metrics" | head
```

Esperado: empty.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/metrics.ts __tests__/lib/admin/metrics.test.ts
git commit -m "feat(admin): MRR override + trial pipeline + potential helpers

computeMrrArs ahora honra manual_mrr_override_ars con prioridad sobre
custom_plan y PLANS price.
computeTrialPipelineMrrArs proyecta MRR de orgs TRIALING (devuelve 0
para otros status).
computePotentialMrrArs ignora el status filter — usado para Churn MRR
(suma lo que pagaban orgs canceladas/suspendidas).

19 unit tests cubriendo todas las precedencias y branches."
```

---

## Task 4: Endpoint PATCH `/api/admin/orgs/[id]/mrr-override` (TDD)

**Files:**
- Create: `app/api/admin/orgs/[id]/mrr-override/route.ts`
- Create: `__tests__/api/admin/orgs/mrr-override.test.ts`

- [ ] **Step 1: Escribir tests failing**

Crear `__tests__/api/admin/orgs/mrr-override.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/admin/orgs/[id]/mrr-override/route"

jest.mock("@/lib/auth")
jest.mock("@/lib/supabase/server")
jest.mock("@/lib/auth/platform")
jest.mock("@/lib/security/audit")

import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

const mockGetUser = getCurrentUser as jest.Mock
const mockServerClient = createServerClient as jest.Mock
const mockAdminClient = createAdminClient as jest.Mock
const mockIsPA = isPlatformAdmin as jest.Mock
const mockLog = logSecurityEvent as jest.Mock

function makeReq(body: any) {
  return new Request("http://test.local/api/admin/orgs/abc/mrr-override", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const params = Promise.resolve({ id: "org-123" })

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ user: { id: "user-1", auth_id: "auth-1" } })
  mockServerClient.mockResolvedValue({} as any)
  mockIsPA.mockResolvedValue(true)
  mockLog.mockResolvedValue(undefined)
})

describe("PATCH /api/admin/orgs/[id]/mrr-override", () => {
  it("returns 403 when caller is not platform admin", async () => {
    mockIsPA.mockResolvedValue(false)
    const res = await PATCH(makeReq({ amount: 1000 }), { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 when amount is negative", async () => {
    const res = await PATCH(makeReq({ amount: -100 }), { params })
    expect(res.status).toBe(400)
  })

  it("returns 400 when amount is not a number or null", async () => {
    const res = await PATCH(makeReq({ amount: "not-a-number" }), { params })
    expect(res.status).toBe(400)
  })

  it("sets the override and logs audit event", async () => {
    const updateMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const selectMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({
      data: { manual_mrr_override_ars: 719000 },
      error: null,
    })
    const maybeSingleMock = jest.fn().mockResolvedValue({
      data: { manual_mrr_override_ars: null },
      error: null,
    })
    const fromMock = jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      update: updateMock,
    }))
    updateMock.mockImplementation(() => ({ eq: eqMock }))
    eqMock.mockImplementation(() => ({ select: selectMock }))
    selectMock.mockImplementation(() => ({ single: singleMock }))
    mockAdminClient.mockReturnValue({ from: fromMock })

    const res = await PATCH(makeReq({ amount: 719000 }), { params })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ manual_mrr_override_ars: 719000 })
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "MRR_OVERRIDE_UPDATED_BY_ADMIN",
        targetOrgId: "org-123",
        details: expect.objectContaining({
          before: { amount: null },
          after: { amount: 719000 },
        }),
      }),
    )
  })

  it("clears the override when amount is null", async () => {
    const updateMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const selectMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({
      data: { manual_mrr_override_ars: null },
      error: null,
    })
    const maybeSingleMock = jest.fn().mockResolvedValue({
      data: { manual_mrr_override_ars: 500000 },
      error: null,
    })
    const fromMock = jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      update: updateMock,
    }))
    updateMock.mockImplementation(() => ({ eq: eqMock }))
    eqMock.mockImplementation(() => ({ select: selectMock }))
    selectMock.mockImplementation(() => ({ single: singleMock }))
    mockAdminClient.mockReturnValue({ from: fromMock })

    const res = await PATCH(makeReq({ amount: null }), { params })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ manual_mrr_override_ars: null })
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
npm run test -- __tests__/api/admin/orgs/mrr-override.test.ts
```

Esperado: FAIL — "Cannot find module".

- [ ] **Step 3: Implementar endpoint**

Crear `app/api/admin/orgs/[id]/mrr-override/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params

  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { amount?: unknown }
  try {
    body = (await req.json()) as { amount?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  let amount: number | null
  if (body.amount === null) {
    amount = null
  } else if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    if (body.amount < 0) {
      return NextResponse.json({ error: "amount no puede ser negativo" }, { status: 400 })
    }
    amount = body.amount
  } else {
    return NextResponse.json(
      { error: "amount debe ser number o null" },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  const { data: before } = await (admin.from("organizations") as any)
    .select("manual_mrr_override_ars")
    .eq("id", orgId)
    .maybeSingle()

  if (!before) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  const { data: updated, error } = await (admin.from("organizations") as any)
    .update({ manual_mrr_override_ars: amount })
    .eq("id", orgId)
    .select("manual_mrr_override_ars")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logSecurityEvent({
    eventType: "MRR_OVERRIDE_UPDATED_BY_ADMIN",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    requestPath: req.url,
    details: {
      before: { amount: (before as any).manual_mrr_override_ars ?? null },
      after: { amount: (updated as any).manual_mrr_override_ars ?? null },
    },
  })

  return NextResponse.json({ ok: true, amount: (updated as any).manual_mrr_override_ars })
}
```

- [ ] **Step 4: Correr tests y verificar PASS**

```bash
npm run test -- __tests__/api/admin/orgs/mrr-override.test.ts
```

Esperado: 5 tests passing.

- [ ] **Step 5: Full test suite**

```bash
npm run test 2>&1 | tail -3
```

Esperado: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/orgs/\[id\]/mrr-override/route.ts __tests__/api/admin/orgs/mrr-override.test.ts
git commit -m "feat(admin): PATCH /api/admin/orgs/[id]/mrr-override

Endpoint para platform admins setear o borrar el manual_mrr_override_ars
de una org. Body: { amount: number | null }. Valida >=0 si presente.
Loguea MRR_OVERRIDE_UPDATED_BY_ADMIN con before/after. 5 tests
cubriendo 403, 400 negative/non-number, set y clear."
```

---

## Task 5: Componente `<MrrOverrideCard>`

**Files:**
- Create: `components/admin/mrr-override-card.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatArs } from "@/lib/billing/plans"

type Props = {
  orgId: string
  currentOverride: number | null
  hasCustomPlan: boolean
}

export function MrrOverrideCard({ orgId, currentOverride, hasCustomPlan }: Props) {
  const router = useRouter()
  const [value, setValue] = React.useState(
    currentOverride != null ? String(currentOverride) : "",
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(amount: number | null) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/mrr-override`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setSaving(false)
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed === "") return submit(null)
    const num = Number(trimmed)
    if (!Number.isFinite(num) || num < 0) {
      setError("Ingresá un número válido (>= 0) o dejá vacío para borrar.")
      return
    }
    submit(num)
  }

  function handleClear() {
    setValue("")
    submit(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">MRR mensual (override)</CardTitle>
        <CardDescription>
          Para deals fuera del flow MP/custom_plan (transferencia, factura manual). Tiene prioridad sobre custom_plan y PLANS price.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasCustomPlan && (
          <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
            ⚠️ Esta org tiene un custom plan registrado. El override tiene prioridad sobre el custom plan en el cálculo del MRR. Usar solo si necesitás saltear el custom plan deliberadamente.
          </div>
        )}
        <form onSubmit={handleSave} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="mrr-override" className="text-xs text-slate-400">
              Monto en ARS por mes
            </Label>
            <Input
              id="mrr-override"
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ej: 719000"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
            {currentOverride != null && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleClear}
                disabled={saving}
              >
                Borrar override
              </Button>
            )}
          </div>
        </form>
        {currentOverride != null && (
          <p className="mt-3 text-xs text-slate-500">
            Override actual: <span className="text-slate-300 font-medium">{formatArs(Number(currentOverride))}</span>
          </p>
        )}
        {error && (
          <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "mrr-override-card" | head
```

Esperado: empty.

- [ ] **Step 3: Commit**

```bash
git add components/admin/mrr-override-card.tsx
git commit -m "feat(admin): MrrOverrideCard — input para setear el override por org

Client card con input numérico y botones Guardar/Borrar. Warning amarillo
si la org ya tiene custom_plan_id (override toma prioridad). PATCH a
/api/admin/orgs/[id]/mrr-override + router.refresh() en éxito."
```

---

## Task 6: Wire `<MrrOverrideCard>` en `/admin/orgs/[id]/page.tsx`

**Files:**
- Modify: `app/admin/orgs/[id]/page.tsx`

- [ ] **Step 1: Leer el archivo + ubicar la zona de inserción**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
grep -n "TenantMetrics\|OrgProfileCard\|OrgMembersCard\|Billing" app/admin/orgs/\[id\]/page.tsx | head -10
```

- [ ] **Step 2: Agregar import + render**

Importar arriba con los otros imports admin:

```tsx
import { MrrOverrideCard } from "@/components/admin/mrr-override-card"
```

Insertar el componente DESPUÉS de la card "Billing" y ANTES de `<OrgProfileCard ...>`. Asegurarse que la query de la org incluya `manual_mrr_override_ars` (probablemente ya está cubierto por `select("*")` — verificar):

```bash
grep -B 1 -A 5 "from(\"organizations\").*select" app/admin/orgs/\[id\]/page.tsx | head -10
```

Si select es `*`, ya viene la columna nueva. Si es enumerado, agregarla.

Render insertion:

```tsx
<MrrOverrideCard
  orgId={org.id}
  currentOverride={
    org.manual_mrr_override_ars != null
      ? Number(org.manual_mrr_override_ars)
      : null
  }
  hasCustomPlan={!!org.custom_plan_id}
/>
```

- [ ] **Step 3: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "admin/orgs/\[id\]/page" | head
```

Esperado: empty.

- [ ] **Step 4: Commit**

```bash
git add app/admin/orgs/\[id\]/page.tsx
git commit -m "feat(admin): wire MrrOverrideCard en /admin/orgs/[id]

Inserta la card de override entre Billing y Perfil de la agencia.
Lee org.manual_mrr_override_ars desde el select(*) existente."
```

---

## Task 7: `<EnterpriseWithoutPriceAlert>` component

**Files:**
- Create: `components/admin/enterprise-without-price-alert.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"

export async function EnterpriseWithoutPriceAlert() {
  const admin = createAdminClient() as any
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name")
    .eq("plan", "ENTERPRISE")
    .in("subscription_status", ["ACTIVE", "PAST_DUE", "TRIALING"])
    .is("custom_plan_id", null)
    .or("manual_mrr_override_ars.is.null,manual_mrr_override_ars.eq.0")
    .limit(50)

  const list = (orgs ?? []) as Array<{ id: string; name: string }>

  if (list.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-300" />
        <div className="flex-1 space-y-2">
          <div className="text-sm font-medium text-amber-200">
            {list.length} org{list.length === 1 ? "" : "s"} Enterprise sin precio configurado
          </div>
          <p className="text-xs text-amber-300/80">
            Estos clientes están en estado pagador pero no aparecen en el MRR. Cargá un MRR override o un custom plan en cada org.
          </p>
          <ul className="space-y-1 text-sm">
            {list.slice(0, 8).map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orgs/${o.id}`}
                  className="text-amber-200 underline hover:text-amber-100"
                >
                  {o.name}
                </Link>
                <span className="text-amber-300/60"> — Configurar →</span>
              </li>
            ))}
            {list.length > 8 && (
              <li className="text-xs text-amber-300/60 italic">
                + {list.length - 8} más
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "enterprise-without-price-alert" | head
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/enterprise-without-price-alert.tsx
git commit -m "feat(admin): EnterpriseWithoutPriceAlert para /admin/metrics

Server component que detecta orgs Enterprise en status pagador sin
custom_plan_id ni manual_mrr_override_ars. Muestra lista linkeada
con CTA a configurar. Renderea null si no hay problemas."
```

---

## Task 8: Refactor `/admin/metrics/page.tsx` con cards nuevas

**Files:**
- Modify: `app/admin/metrics/page.tsx`

- [ ] **Step 1: Leer estado actual**

```bash
cat app/admin/metrics/page.tsx | head -80
```

Esperado: server component con counts + sección Revenue (MRR/ARR/AvgMrr/Churn30d) + breakdown table + bar chart Recharts.

- [ ] **Step 2: Reescribir con cards nuevas**

Reemplazar el contenido completo de `app/admin/metrics/page.tsx` por:

```tsx
import {
  AlertCircle, Ban, Briefcase, CheckCircle2, CircleDollarSign, Clock,
  LineChart, Sparkles, TrendingDown, TrendingUp, UserCheck, Users, Wallet,
} from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import {
  DataTableShell, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd,
} from "@/components/admin/data-table-shell"
import { EmptyState } from "@/components/admin/empty-state"
import { EnterpriseWithoutPriceAlert } from "@/components/admin/enterprise-without-price-alert"
import { MrrBarChart } from "@/components/admin/mrr-bar-chart"
import { formatArs, PLANS } from "@/lib/billing/plans"
import {
  computeMrrArs, computeTrialPipelineMrrArs, computePotentialMrrArs,
  type MrrOrg, type MrrCustomPlan,
} from "@/lib/admin/metrics"

export const dynamic = "force-dynamic"

export default async function AdminMetricsPage() {
  const admin = createAdminClient() as any
  const since30d = new Date(Date.now() - 30 * 86400 * 1000).toISOString()

  // === Counts por status ===
  const [
    { count: totalOrgs },
    { count: activeOrgs },
    { count: trialingOrgs },
    { count: trialLegacyOrgs },
    { count: pastDueOrgs },
    { count: pendingPaymentOrgs },
    { count: suspendedOrgs },
    { count: cancelledOrgs },
    { count: totalUsers },
    { count: totalOperations },
    { count: signups30d },
  ] = await Promise.all([
    admin.from("organizations").select("*", { count: "exact", head: true }),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "ACTIVE"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "TRIALING"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "TRIAL"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "PAST_DUE"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "PENDING_PAYMENT"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "SUSPENDED"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "CANCELLED"),
    admin.from("users").select("*", { count: "exact", head: true }).eq("is_active", true),
    admin.from("operations").select("*", { count: "exact", head: true }),
    admin.from("organizations").select("*", { count: "exact", head: true }).gte("created_at", since30d),
  ])

  // === Data para cálculos ===
  const [
    { data: orgsForMrr },
    { data: customPlans },
    { data: orgsForChurn },
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id, plan, subscription_status, custom_plan_id, manual_mrr_override_ars, created_at, updated_at"),
    admin
      .from("custom_plans")
      .select("org_id, base_price_ars, discount_percent, discount_ends_at"),
    admin
      .from("organizations")
      .select("id, plan, subscription_status, custom_plan_id, manual_mrr_override_ars, updated_at")
      .in("subscription_status", ["CANCELLED", "SUSPENDED"])
      .gte("updated_at", since30d),
  ])

  const cpMap = new Map<string, MrrCustomPlan>()
  for (const cp of (customPlans ?? []) as any[]) {
    cpMap.set(cp.org_id, {
      base_price_ars: Number(cp.base_price_ars),
      discount_percent: cp.discount_percent,
      discount_ends_at: cp.discount_ends_at,
    })
  }

  let mrrTotal = 0
  let trialPipelineMrr = 0
  let newMrr30d = 0
  let activePayingOrgs = 0
  const mrrByPlan = new Map<string, { count: number; mrr: number }>()

  for (const o of (orgsForMrr ?? []) as any[]) {
    const org: MrrOrg = {
      plan: o.plan,
      subscription_status: o.subscription_status,
      custom_plan_id: o.custom_plan_id,
      manual_mrr_override_ars: o.manual_mrr_override_ars != null ? Number(o.manual_mrr_override_ars) : null,
    }
    const cp = o.custom_plan_id ? cpMap.get(o.id) ?? null : null

    const mrr = computeMrrArs(org, cp)
    mrrTotal += mrr
    if (mrr > 0) activePayingOrgs += 1

    const pipeline = computeTrialPipelineMrrArs(org, cp)
    trialPipelineMrr += pipeline

    if (mrr > 0 && new Date(o.created_at).getTime() >= Date.parse(since30d)) {
      newMrr30d += mrr
    }

    const bucketKey = o.custom_plan_id ? "CUSTOM" : (o.plan ?? "OTHER")
    const bucket = mrrByPlan.get(bucketKey) ?? { count: 0, mrr: 0 }
    if (mrr > 0) {
      bucket.count += 1
      bucket.mrr += mrr
      mrrByPlan.set(bucketKey, bucket)
    }
  }

  let churnMrr30d = 0
  for (const o of (orgsForChurn ?? []) as any[]) {
    const org: MrrOrg = {
      plan: o.plan,
      subscription_status: o.subscription_status,
      custom_plan_id: o.custom_plan_id,
      manual_mrr_override_ars: o.manual_mrr_override_ars != null ? Number(o.manual_mrr_override_ars) : null,
    }
    const cp = o.custom_plan_id ? cpMap.get(o.id) ?? null : null
    churnMrr30d += computePotentialMrrArs(org, cp)
  }

  const arr = mrrTotal * 12
  const avgMrrPerActiveOrg = activePayingOrgs > 0 ? Math.round(mrrTotal / activePayingOrgs) : 0

  const breakdown = Array.from(mrrByPlan.entries())
    .map(([key, v]) => ({
      label: key === "CUSTOM" ? "Custom plan" : (PLANS[key as keyof typeof PLANS]?.name ?? key),
      count: v.count,
      mrr: v.mrr,
      pct: mrrTotal > 0 ? (v.mrr / mrrTotal) * 100 : 0,
    }))
    .sort((a, b) => b.mrr - a.mrr)

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Platform metrics"
        description="Vista global del SaaS — orgs por estado, MRR/ARR, breakdown por plan."
      />

      <EnterpriseWithoutPriceAlert />

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Tenants por estado</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Total" value={totalOrgs ?? 0} icon={Users} />
          <StatCard label="ACTIVE" value={activeOrgs ?? 0} icon={CheckCircle2} />
          <StatCard label="TRIALING" value={trialingOrgs ?? 0} icon={Clock} />
          <StatCard label="PENDING" value={pendingPaymentOrgs ?? 0} icon={AlertCircle} />
          <StatCard label="PAST_DUE" value={pastDueOrgs ?? 0} icon={AlertCircle} />
          <StatCard label="SUSPENDED" value={suspendedOrgs ?? 0} icon={Ban} />
          <StatCard label="CANCELLED" value={cancelledOrgs ?? 0} icon={Ban} />
        </div>
        {(trialLegacyOrgs ?? 0) > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Legacy TRIAL: {trialLegacyOrgs} (deberían migrarse a TRIALING o PENDING_PAYMENT)
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Actividad global</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard label="Users activos" value={totalUsers ?? 0} icon={UserCheck} />
          <StatCard label="Operaciones totales" value={totalOperations ?? 0} icon={Briefcase} />
          <StatCard label="Signups últimos 30d" value={signups30d ?? 0} icon={Sparkles} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Revenue</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="MRR"
            value={formatArs(mrrTotal)}
            icon={CircleDollarSign}
            hint="ARS / mes"
          />
          <StatCard
            label="ARR"
            value={formatArs(arr)}
            icon={TrendingUp}
            hint="ARS / año"
          />
          <StatCard
            label="Avg MRR / org"
            value={formatArs(avgMrrPerActiveOrg)}
            icon={LineChart}
            hint={`${activePayingOrgs} orgs pagando`}
          />
          <StatCard
            label="Pipeline MRR"
            value={formatArs(trialPipelineMrr)}
            icon={Wallet}
            hint={`${trialingOrgs ?? 0} en TRIALING`}
          />
          <StatCard
            label="New MRR 30d"
            value={formatArs(newMrr30d)}
            icon={TrendingUp}
            hint="orgs nuevas pagando"
          />
          <StatCard
            label="Churn MRR 30d"
            value={formatArs(churnMrr30d)}
            icon={TrendingDown}
            hint="orgs canceladas/suspendidas"
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Breakdown por plan</h2>
        {breakdown.length === 0 ? (
          <EmptyState
            icon={CircleDollarSign}
            title="Sin MRR por plan"
            description="Cuando haya orgs pagando aparecerán acá."
          />
        ) : (
          <>
            <DataTableShell>
              <DataTableHead>
                <tr>
                  <DataTableTh>Plan</DataTableTh>
                  <DataTableTh>Orgs pagando</DataTableTh>
                  <DataTableTh>MRR</DataTableTh>
                  <DataTableTh>% del total</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {breakdown.map((b) => (
                  <DataTableRow key={b.label}>
                    <DataTableTd className="font-medium text-slate-200">{b.label}</DataTableTd>
                    <DataTableTd>{b.count}</DataTableTd>
                    <DataTableTd>{formatArs(b.mrr)}</DataTableTd>
                    <DataTableTd className="text-slate-400">{b.pct.toFixed(1)}%</DataTableTd>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTableShell>
            <div className="mt-4">
              <MrrBarChart data={breakdown.map((b) => ({ label: b.label, mrr: b.mrr }))} />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: TypeCheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "admin/metrics" | head
```

Esperado: empty.

- [ ] **Step 4: Run tests**

```bash
npm run test 2>&1 | tail -3
```

Esperado: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/admin/metrics/page.tsx
git commit -m "feat(admin): metrics Phase 2 — Pipeline + New/Churn MRR + alert + counts

Refactor /admin/metrics:
- Status counts ahora explícitos: TRIALING separado de TRIAL legacy,
  PENDING_PAYMENT y CANCELLED visibles.
- Cards Revenue: MRR / ARR / Avg MRR / Pipeline MRR / New MRR 30d /
  Churn MRR 30d (estos 3 últimos nuevos).
- EnterpriseWithoutPriceAlert renderea arriba si hay orgs problema.
- Breakdown table + bar chart usan el cálculo unificado de
  computeMrrArs (que honra override + custom + plan)."
```

---

## Task 9: Update `tenant-metrics.tsx` para usar override

**Files:**
- Modify: `components/admin/tenant-metrics.tsx`

- [ ] **Step 1: Leer estado actual**

```bash
cat components/admin/tenant-metrics.tsx
```

Esperado: server component con 6 StatCards, una de ellas es MRR. Probablemente calcula MRR ad-hoc.

- [ ] **Step 2: Reemplazar el cálculo de MRR por uso de `computeMrrArs`**

Editar el archivo. Donde calcula MRR de la org, usar el helper existente:

```tsx
import { computeMrrArs, type MrrOrg, type MrrCustomPlan } from "@/lib/admin/metrics"
```

En el cálculo:

```tsx
// Después de fetchear org + customPlan:
const mrrOrg: MrrOrg = {
  plan: org.plan,
  subscription_status: org.subscription_status,
  custom_plan_id: org.custom_plan_id,
  manual_mrr_override_ars: org.manual_mrr_override_ars != null ? Number(org.manual_mrr_override_ars) : null,
}
const mrrCp: MrrCustomPlan | null = customPlan ? {
  base_price_ars: Number(customPlan.base_price_ars),
  discount_percent: customPlan.discount_percent,
  discount_ends_at: customPlan.discount_ends_at,
} : null
const mrr = computeMrrArs(mrrOrg, mrrCp)
```

Asegurarse que la query de la org incluya `manual_mrr_override_ars`. Si tenant-metrics tiene su propio fetch de organizations, agregar la columna al select.

- [ ] **Step 3: TypeCheck + tests**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "tenant-metrics" | head
npm run test 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add components/admin/tenant-metrics.tsx
git commit -m "refactor(admin): tenant-metrics usa computeMrrArs unificado

Reemplaza el cálculo ad-hoc de MRR del card por uso del helper
de lib/admin/metrics, así honra manual_mrr_override_ars y los demás
casos consistentemente con /admin/metrics."
```

---

## Task 10: Smoke E2E + push final

- [ ] **Step 1: Full test suite**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npm run test 2>&1 | tail -5
```

Esperado: all suites pass (incluye 19 nuevos tests metrics + 5 mrr-override + suite previa).

- [ ] **Step 2: TypeCheck final**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | grep -v "lib/supabase/types.ts\|lib/supabase/scoped-client.ts" | head
```

Esperado: empty (errores pre-existentes ignorados).

- [ ] **Step 3: Smoke checklist manual (después del push)**

En `admin.vibook.ai`:

- [ ] `/admin/orgs/{lozada-id}` → ver card "MRR mensual (override)" entre Billing y Perfil.
- [ ] Setear $719000 y guardar → router.refresh, override actual visible.
- [ ] Tenant-metrics card de Lozada ahora muestra MRR=$719000 (antes 0).
- [ ] Ir a `/admin/metrics`:
  - [ ] No aparece la alert "Enterprise sin precio" (Lozada ya tiene override).
  - [ ] MRR total incluye los $719000.
  - [ ] Pipeline MRR refleja los TRIALING.
  - [ ] Counts por status: TRIALING separado de TRIAL legacy.
- [ ] Borrar el override de Lozada → tenant-metrics vuelve a 0, alert reaparece.
- [ ] Volver a setear el override.
- [ ] Verificar audit log: `SELECT * FROM security_audit_log WHERE event_type = 'MRR_OVERRIDE_UPDATED_BY_ADMIN' ORDER BY created_at DESC LIMIT 5;` debería tener los 3 cambios.

- [ ] **Step 4: Push (con OK explícito de Tomi)**

```bash
git log origin/main..HEAD --oneline
git push origin main
```

Esperado: 8-9 commits empujados. Railway deploya en 1-2 min.

---

## Self-Review Checklist (autor)

- ✅ **Spec coverage**: Override (Task 1, 3, 4, 5, 6) ✓; Trial Pipeline (Task 3, 8) ✓; New/Churn MRR (Task 3, 8) ✓; Alert Enterprise (Task 7, 8) ✓; PENDING_PAYMENT count (Task 8) ✓; tenant-metrics use override (Task 9) ✓; tests (Task 3, 4) ✓; audit log MRR_OVERRIDE_UPDATED_BY_ADMIN (Task 4) ✓.
- ✅ **Sin placeholders**: cada step tiene código completo.
- ✅ **Type consistency**: `MrrOrg` extendido en Task 3 y referenciado consistentemente en Task 8 y 9. `manual_mrr_override_ars` siempre `number | null` después de Number() conversion. `computeMrrArs/computeTrialPipelineMrrArs/computePotentialMrrArs` mismas firmas.

## Out of Scope (recordatorio)

- Cohort retention, Quick Ratio, MRR movement con expansion/contraction.
- Time series MRR/ARR (necesita snapshots históricos).
- Trial conversion rate (necesita event tracking).
- LTV / CAC.
