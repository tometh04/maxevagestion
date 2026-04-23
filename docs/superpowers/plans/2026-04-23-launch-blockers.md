# Vibook Launch Blockers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver todos los blockers pendientes para poder hacer public launch de Vibook SaaS — MP estable con cualquier cuenta, admin panel aislado y funcional, AFIP operativo, bulk import validado end-to-end, deuda crítica cerrada.

**Architecture:** Este NO es un plan de feature único — es la lista consolidada de todo lo que quedó pendiente al cierre de la sesión del 2026-04-22 y debe cerrarse antes de habilitar signups públicos. Cada sección es independiente — se ejecutan en paralelo o serie según capacity.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), Railway, Mercado Pago preapproval_plan API, AFIP SDK (futuro), shadcn/ui.

**Contexto al empezar:**
- Commits pusheados hasta `c8048d9` (fix admin redirect). Railway deployando.
- Backend bulk import completo (migration 161 ya aplicada en Supabase prod), UI live en `/settings?tab=import` y `/settings/import`.
- MP integración actual usa `POST /preapproval` con `payer_email` → falla con emails throwaway + bloquea users con cuenta MP en otro email.
- Tomi (`tomas.sanchez04@gmail.com`) supuestamente en `platform_admins`. Post-deploy redirige a `/admin/orgs`. Sin verificar end-to-end.
- Lozada (org `1b326d20-d133-4112-a798-f54b5af7e7cb`) está lifetime-free, **no toca MP**. Todo cambio en MP no afecta a Lozada.

**Convenciones críticas (leer antes de arrancar):**
- Migrations con SQL pegado en el chat (never `supabase db push`). Project ID: `pmqvplyyxiobkllapgjp`.
- Commits locales libres, push con OK explícito del user.
- Paths absolutos al mencionar archivos.
- Multi-tenant: `org_id` SIEMPRE del session, nunca del body.

**Criterios de "launch-ready":**
- [ ] Cualquier email puede suscribirse a PRO con MP sin errores (P0-1)
- [ ] Platform admin nunca ve el ERP, usuarios tenant nunca ven admin (P0-2)
- [ ] AFIP operativo para emitir facturas desde PRO/Enterprise (P0-3)
- [ ] Bulk import validado con Lozada + org de test (P0-4)
- [ ] Sin duplicados legacy exponiendo data rara (P1-1)
- [ ] Error messages claros en todo flow de pago (P1-2)

---

## P0-1: Migrar MP a `preapproval_plan` (6 tasks)

**Por qué:** La integración actual usa `POST /preapproval` con `payer_email`. Problemas validados en prod:
- Emails throwaway (ej `dropjar.com`) → MP tira 500 genérico.
- Emails sin cuenta MP → 500.
- Emails con cuenta MP pero distinto del `payer_email` → MP bloquea con "Tu e-mail no coincide con el de la suscripción".

La solución correcta de MP para SaaS es `POST /preapproval_plan` (plan template, sin email específico). El user va al init_point del plan, se loguea con cualquier cuenta MP, y MP crea la preapproval.

**Scope:** Agregar funciones nuevas sin tocar las viejas. Feature flag para activar el nuevo flow. Cutover cuando esté validado.

### Task 1: `createPreapprovalPlan()` en lib/billing/mercadopago.ts

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mercadopago.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mercadopago.test.ts` (si no existe; si existe, extender)

- [ ] **Step 1: Escribir test de createPreapprovalPlan (con fetch mockeado)**

Añadir a `mercadopago.test.ts`:

```ts
import { createPreapprovalPlan } from "./mercadopago"

describe("createPreapprovalPlan", () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it("POSTs to /preapproval_plan with expected body", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        id: "plan-123",
        init_point: "https://mp.example/plan-123",
        status: "active",
      }),
      headers: new Map([["x-request-id", "req-123"]]) as any,
    })
    global.fetch = mockFetch as any
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token"

    const res = await createPreapprovalPlan({
      reason: "Vibook PRO",
      amount: 119000,
      backUrl: "https://app.vibook.ai/onboarding/billing/return",
      includeFreeTrial: true,
    })

    expect(res.id).toBe("plan-123")
    expect(res.init_point).toBe("https://mp.example/plan-123")
    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe("https://api.mercadopago.com/preapproval_plan")
    const body = JSON.parse(call[1].body)
    expect(body.reason).toBe("Vibook PRO")
    expect(body.auto_recurring.transaction_amount).toBe(119000)
    expect(body.auto_recurring.free_trial).toEqual({ frequency: 7, frequency_type: "days" })
    expect(body.back_url).toBe("https://app.vibook.ai/onboarding/billing/return")
    expect(body.payer_email).toBeUndefined() // crítico: SIN email
  })

  it("omits free_trial when includeFreeTrial=false", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: "plan-2", init_point: "x", status: "active" }),
      headers: new Map() as any,
    })
    global.fetch = mockFetch as any
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token"

    await createPreapprovalPlan({
      reason: "Custom Enterprise",
      amount: 299000,
      backUrl: "https://app.vibook.ai/settings/subscription",
      includeFreeTrial: false,
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.auto_recurring.free_trial).toBeUndefined()
  })

  it("throws MP preapproval_plan failed con status+body cuando response no-ok", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: "invalid data", status: 400 }),
      headers: new Map() as any,
    })
    global.fetch = mockFetch as any
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token"

    await expect(createPreapprovalPlan({
      reason: "x", amount: 1, backUrl: "https://x", includeFreeTrial: false,
    })).rejects.toThrow(/MP preapproval_plan failed \(400\)/)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (módulo no existe)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/billing/mercadopago.test.ts
```

Expected: FAIL, "Cannot find export createPreapprovalPlan".

- [ ] **Step 3: Implementar createPreapprovalPlan**

Agregar al final de `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mercadopago.ts`:

```ts
export interface CreatePreapprovalPlanParams {
  /** Nombre humano del plan (ej "Vibook PRO"). ASCII-only para evitar 500 raros de MP. */
  reason: string
  /** Monto ARS por mes. */
  amount: number
  /** URL absoluta de retorno post-pago. */
  backUrl: string
  /** Si true incluye free_trial 7 días. */
  includeFreeTrial: boolean
}

export interface PreapprovalPlanResult {
  id: string
  init_point: string
  status: string
}

/**
 * Crea un preapproval_plan (template de suscripción) — versión SaaS del
 * preapproval. Devuelve un init_point genérico al que cualquier user puede
 * entrar con cualquier cuenta MP. No requiere payer_email al crear.
 *
 * Cuando un user se suscribe vía el init_point, MP crea automáticamente
 * un preapproval asociado y dispara webhook subscription_preapproval.created
 * con el preapproval_id + payer info.
 */
export async function createPreapprovalPlan(
  params: CreatePreapprovalPlanParams
): Promise<PreapprovalPlanResult> {
  const autoRecurring: any = {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: params.amount,
    currency_id: "ARS",
  }
  if (params.includeFreeTrial) {
    autoRecurring.free_trial = { frequency: 7, frequency_type: "days" }
  }

  const body = {
    reason: params.reason,
    auto_recurring: autoRecurring,
    back_url: params.backUrl,
    // Nota: NO payer_email. Cualquier user puede usar el plan.
  }

  console.log("[mp.createPreapprovalPlan] POST body:", JSON.stringify(body))

  const res = await fetch(`${MP_API}/preapproval_plan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const rawText = await res.text()
  console.log(
    "[mp.createPreapprovalPlan] response status:",
    res.status,
    "x-request-id:",
    res.headers.get("x-request-id"),
    "body:",
    rawText.slice(0, 2000)
  )

  if (!res.ok) {
    throw new Error(`MP preapproval_plan failed (${res.status}): ${rawText}`)
  }
  return JSON.parse(rawText) as PreapprovalPlanResult
}

/** Fetch preapproval_plan existente (GET). Útil para cache/reuso. */
export async function fetchPreapprovalPlan(planId: string): Promise<any> {
  const res = await fetch(`${MP_API}/preapproval_plan/${planId}`, {
    headers: { Authorization: `Bearer ${mpAccessToken()}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP fetch preapproval_plan failed (${res.status}): ${text}`)
  }
  return await res.json()
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest lib/billing/mercadopago.test.ts
```

Expected: 3/3 PASS para createPreapprovalPlan.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/billing/mercadopago.ts lib/billing/mercadopago.test.ts
git commit -m "feat(mp): createPreapprovalPlan sin payer_email (SaaS pattern)

createPreapprovalPlan + fetchPreapprovalPlan para migrar a flujo
SaaS estándar: plan template sin email específico, cualquier user
con cualquier cuenta MP puede subscribirse vía init_point.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2: Schema DB — tabla `mp_plans` para cachear plan IDs

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260423000162_mp_plans_cache.sql`

**Context:** Creamos 1 preapproval_plan por combinación (plan_id, amount). Los cacheamos en DB para reusarlos — no creamos uno por user. Ej: 1 plan PRO_STANDARD ($119k, trial 7d) es reutilizable por todos los tenants nuevos.

- [ ] **Step 1: Crear migration file**

```sql
-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260423000162_mp_plans_cache.sql

-- mp_plans: caché de preapproval_plan IDs de MP para reusar entre tenants.
-- No contiene data sensible — solo IDs y metadata del plan template.
CREATE TABLE IF NOT EXISTS mp_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Key lógica: "PRO_STANDARD" | "STARTER_STANDARD" | "CUSTOM_<org_slug>"
  plan_key text NOT NULL UNIQUE,
  -- El ID que devolvió MP al crear el plan
  mp_preapproval_plan_id text NOT NULL UNIQUE,
  -- Monto ARS/mes del plan
  amount_ars numeric NOT NULL,
  -- Si el plan tiene 7d free trial
  include_free_trial boolean NOT NULL DEFAULT true,
  -- init_point cacheado (MP no cambia, pero re-fetch via fetchPreapprovalPlan si dudás)
  init_point text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mp_plans_plan_key_idx ON mp_plans (plan_key);

-- RLS: solo platform_admins leen/escriben. Los tenants NO necesitan acceso.
ALTER TABLE mp_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mp_plans_admin_read ON mp_plans;
CREATE POLICY mp_plans_admin_read ON mp_plans FOR SELECT
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )));
DROP POLICY IF EXISTS mp_plans_admin_write ON mp_plans;
CREATE POLICY mp_plans_admin_write ON mp_plans FOR ALL
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )));
-- service_role bypassea RLS (para crear plans desde endpoints server-side).
```

- [ ] **Step 2: Pegar SQL al user y esperar confirmación**

Pegar el contenido entre `--- SQL START ---` y `--- SQL END ---` al user, decirle: "Correlo en Supabase SQL Editor (project pmqvplyyxiobkllapgjp)". Esperar OK.

- [ ] **Step 3: Regenerar types**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx supabase gen types typescript --project-id pmqvplyyxiobkllapgjp > lib/supabase/types.ts.new
# Chequear que no haya 'npm warn' en línea 1 (bug conocido)
head -1 lib/supabase/types.ts.new
# Si aparece warn, borrar la primera línea:
# tail -n +2 lib/supabase/types.ts.new > lib/supabase/types.ts && rm lib/supabase/types.ts.new
# Si no, mover directo:
mv lib/supabase/types.ts.new lib/supabase/types.ts
grep -c "mp_plans" lib/supabase/types.ts  # expect ≥3 (Row, Insert, Update)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260423000162_mp_plans_cache.sql lib/supabase/types.ts
git commit -m "migration 162: mp_plans cache + types regen

Tabla para cachear preapproval_plan IDs de MP. Reusamos el mismo
plan template para múltiples tenants en vez de crear uno por user.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3: Helper `ensureMpPlan()` — get-or-create del plan cacheado

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mp-plans.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mp-plans.test.ts`

**Context:** En lugar de crear un plan por cada checkout, mantenemos uno cacheado por `plan_key`. Los planes PRO/STARTER son estáticos. Los CUSTOM_<slug> se crean al vuelo pero se cachean para retries.

- [ ] **Step 1: Test TDD**

```ts
// lib/billing/mp-plans.test.ts
import { buildPlanKey } from "./mp-plans"

describe("buildPlanKey", () => {
  it("PRO estándar", () => {
    expect(buildPlanKey({ plan: "PRO" })).toBe("PRO_STANDARD")
  })
  it("STARTER estándar", () => {
    expect(buildPlanKey({ plan: "STARTER" })).toBe("STARTER_STANDARD")
  })
  it("CUSTOM usa org slug + amount hash corto", () => {
    const k = buildPlanKey({ plan: "CUSTOM", orgSlug: "agen-tst-v3", amount: 299000 })
    expect(k).toMatch(/^CUSTOM_agen-tst-v3_299000$/)
  })
  it("CUSTOM sin slug/amount tira error", () => {
    expect(() => buildPlanKey({ plan: "CUSTOM" } as any)).toThrow(/orgSlug.*amount/i)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/billing/mp-plans.test.ts
```

- [ ] **Step 3: Implementar lib/billing/mp-plans.ts**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { createPreapprovalPlan, fetchPreapprovalPlan } from "./mercadopago"
import { PLANS, type PlanId } from "./plans"

export interface BuildPlanKeyInput {
  plan: PlanId | "CUSTOM"
  /** Solo para CUSTOM: slug del org cuyo plan es. */
  orgSlug?: string
  /** Solo para CUSTOM: monto efectivo ARS. */
  amount?: number
}

export function buildPlanKey(input: BuildPlanKeyInput): string {
  if (input.plan === "CUSTOM") {
    if (!input.orgSlug || !input.amount) {
      throw new Error("buildPlanKey CUSTOM requiere orgSlug y amount")
    }
    return `CUSTOM_${input.orgSlug}_${input.amount}`
  }
  return `${input.plan}_STANDARD`
}

export interface EnsureMpPlanInput {
  plan: PlanId | "CUSTOM"
  reason: string
  amount: number
  backUrl: string
  includeFreeTrial: boolean
  orgSlug?: string
}

export interface EnsureMpPlanResult {
  plan_key: string
  mp_preapproval_plan_id: string
  init_point: string
  cached: boolean
}

/**
 * Get-or-create del preapproval_plan. Si ya existe en mp_plans con misma key,
 * lo devuelve. Si no, lo crea en MP y guarda el ID.
 *
 * Requiere adminClient (service_role) para bypassear RLS de mp_plans.
 */
export async function ensureMpPlan(
  admin: SupabaseClient,
  input: EnsureMpPlanInput
): Promise<EnsureMpPlanResult> {
  const plan_key = buildPlanKey({
    plan: input.plan,
    orgSlug: input.orgSlug,
    amount: input.amount,
  })

  const { data: existing } = await (admin as any)
    .from("mp_plans")
    .select("mp_preapproval_plan_id, init_point")
    .eq("plan_key", plan_key)
    .maybeSingle()

  if (existing) {
    return {
      plan_key,
      mp_preapproval_plan_id: existing.mp_preapproval_plan_id,
      init_point: existing.init_point,
      cached: true,
    }
  }

  const created = await createPreapprovalPlan({
    reason: input.reason,
    amount: input.amount,
    backUrl: input.backUrl,
    includeFreeTrial: input.includeFreeTrial,
  })

  await (admin as any).from("mp_plans").insert({
    plan_key,
    mp_preapproval_plan_id: created.id,
    amount_ars: input.amount,
    include_free_trial: input.includeFreeTrial,
    init_point: created.init_point,
  })

  return {
    plan_key,
    mp_preapproval_plan_id: created.id,
    init_point: created.init_point,
    cached: false,
  }
}
```

- [ ] **Step 4: Run — expect 4/4 PASS**

```bash
npx jest lib/billing/mp-plans.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/billing/mp-plans.ts lib/billing/mp-plans.test.ts
git commit -m "feat(mp): ensureMpPlan get-or-create con cache DB

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4: Refactor `/api/billing/checkout` a usar preapproval_plan

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/billing/checkout/route.ts`

**Context:** Cambiamos el flow: en lugar de crear un preapproval por user, devolvemos el init_point de un plan cacheado. El webhook `subscription_preapproval.created` se encarga de guardar el `mp_preapproval_id` en la org cuando el user completa el checkout.

- [ ] **Step 1: Leer el endpoint actual completo para entender estado**

```bash
cat app/api/billing/checkout/route.ts
```

Tomar nota de: role gate, org lookup, isReactivation, has_used_trial, backUrl calculation.

- [ ] **Step 2: Reemplazar la llamada `createPreapproval` con `ensureMpPlan`**

Cambiar el bloque:

```ts
  let preapproval
  try {
    preapproval = await createPreapproval({
      orgId, plan, payerEmail, backUrl, includeFreeTrial, startDate,
    })
  } catch (err: any) {
    const mpMsg = err?.message || String(err)
    console.error("checkout: MP createPreapproval failed", mpMsg)
    return NextResponse.json(
      { error: `MercadoPago rechazó el checkout: ${mpMsg}` },
      { status: 502 }
    )
  }
```

Por:

```ts
  let mpPlan
  try {
    const reason = `Vibook ${planDef.name}` // ASCII only
    mpPlan = await ensureMpPlan(admin, {
      plan,
      reason,
      amount: planDef.priceArsMonthly,
      backUrl,
      includeFreeTrial,
    })
  } catch (err: any) {
    const mpMsg = err?.message || String(err)
    console.error("checkout: MP ensureMpPlan failed", mpMsg)
    return NextResponse.json(
      { error: `MercadoPago rechazó el checkout: ${mpMsg}` },
      { status: 502 }
    )
  }
```

Y el response:

```ts
  // Antes: { init_point: preapproval.init_point, preapproval_id: preapproval.id }
  // Ahora: el preapproval_id todavía no existe — lo creará MP cuando el user acepte.
  return NextResponse.json({
    init_point: mpPlan.init_point,
    plan_key: mpPlan.plan_key,
    mp_preapproval_plan_id: mpPlan.mp_preapproval_plan_id,
  })
```

**Importante:** el `billing_events` INSERT y `mp_preapproval_id` save de la org ahora van **en el webhook**, no acá. En este endpoint solo loggeamos que el user inició checkout.

Cambiar el bloque:

```ts
  // Log del intento para auditoría
  await admin.from("billing_events").insert({
    org_id: orgId,
    event_type: "CHECKOUT_INITIATED",
    external_id: preapproval.id,  // ← cambiar
    amount_cents: (planDef.priceArsMonthly ?? 0) * 100,
    currency: "ARS",
    status: preapproval.status,  // ← cambiar
    payload: { ... init_point: preapproval.init_point, ... },
  })

  const orgUpdates: Record<string, any> = {
    mp_preapproval_id: preapproval.id,  // ← QUITAR
    has_used_trial: true,
  }
```

A:

```ts
  await admin.from("billing_events").insert({
    org_id: orgId,
    event_type: "CHECKOUT_INITIATED",
    external_id: mpPlan.mp_preapproval_plan_id, // del PLAN, no preapproval individual
    amount_cents: (planDef.priceArsMonthly ?? 0) * 100,
    currency: "ARS",
    status: "pending",
    payload: {
      plan,
      plan_key: mpPlan.plan_key,
      init_point: mpPlan.init_point,
      payer_email: payerEmail, // informativo solo
      initiated_by_user_id: user.id,
      included_free_trial: includeFreeTrial,
      is_reactivation: isReactivation,
      start_date: startDate,
    },
  })

  // mp_preapproval_id NO se setea acá — lo seteará el webhook cuando MP cree
  // la preapproval individual tras la aceptación del user.
  const orgUpdates: Record<string, any> = {
    has_used_trial: true,
  }
```

Y agregar el import al tope:

```ts
import { ensureMpPlan } from "@/lib/billing/mp-plans"
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsc --noEmit 2>&1 | grep "api/billing/checkout" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/api/billing/checkout/route.ts
git commit -m "refactor(billing): checkout usa preapproval_plan en vez de preapproval

Cualquier user con cualquier cuenta MP puede pagar. El mp_preapproval_id
de la org se guarda en el webhook subscription_preapproval.created cuando
el user completa el checkout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4b: Aplicar el mismo refactor a `/api/admin/orgs/[id]/custom-plan`

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/admin/orgs/[id]/custom-plan/route.ts`

**Context:** El endpoint de custom plans del admin panel usa `createPreapproval` directo (líneas ~101-108). Sin migración, un enterprise plan custom va a fallar igual que PRO.

- [ ] **Step 1: Cambiar el call a createPreapproval por ensureMpPlan**

En POST y PATCH, donde invoca `createPreapproval(...)`, reemplazar por:

```ts
import { ensureMpPlan } from "@/lib/billing/mp-plans"

// Donde estaba createPreapproval(...):
const mp = await ensureMpPlan(admin, {
  plan: "CUSTOM",
  reason: `Vibook ${body.display_name}`, // ASCII
  amount: effective,
  backUrl: `${appUrl}/settings/subscription?custom=ok`,
  includeFreeTrial: false,
  orgSlug: org.slug,
})

// Nota: mp_preapproval_id ya NO se guarda acá — el webhook lo hace cuando el user completa el checkout.
// updateOrgData.mp_preapproval_id = mp.id  ← QUITAR
checkoutUrl = mp.init_point
```

- [ ] **Step 2: Cambiar PATCH (price change) similar — ahora applyPriceChange debería trabajar contra el plan template, no contra preapproval individual.**

Este sub-refactor es más complejo (cambiar precio en preapproval_plan requiere DELETE + CREATE en MP; el método `applyPriceChange` viejo no aplica). Revisar `lib/billing/mp-update.ts` y adaptar.

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsc --noEmit 2>&1 | grep "custom-plan/route" || echo "OK"
git add app/api/admin/orgs/[id]/custom-plan/route.ts lib/billing/mp-update.ts
git commit -m "refactor(custom-plan): usar preapproval_plan pattern (any-email)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 5: Webhook handler procesa nuevo payload subscription_preapproval

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/billing/mp-webhook/route.ts` (o el path real del webhook — verificar con `find app/api -name "webhook*"`)

**Context:** Hoy el webhook escucha `authorized_payment.created` y `subscription_preapproval.updated`. Con preapproval_plan, el evento que nos importa es `subscription_preapproval.created` — MP nos notifica que un user completó el checkout y ahora tiene una preapproval individual. Ese es el momento de guardar `mp_preapproval_id` en la org del user.

- [ ] **Step 1: Localizar webhook handler existente**

```bash
find app/api -name "route.ts" -path "*webhook*" -o -name "route.ts" -path "*mp*" | head -5
grep -l "subscription_preapproval\|preapproval.created" app/api/**/route.ts 2>/dev/null
```

Típicamente está en `app/api/billing/mp-webhook/route.ts`.

- [ ] **Step 2: Leer el handler actual**

```bash
cat app/api/billing/mp-webhook/route.ts
```

- [ ] **Step 3: Agregar manejo de `subscription_preapproval.created`**

Identificar el dispatch por `type` / `action` del payload MP. Agregar rama nueva:

```ts
// Al inicio del archivo, si no está:
import { fetchPreapproval } from "@/lib/billing/mercadopago"

// Dentro del handler, en el switch/if dispatch:
if (body.type === "subscription_preapproval" && body.action === "created") {
  const preapprovalId = body.data?.id
  if (!preapprovalId) {
    console.error("webhook subscription_preapproval.created sin data.id", body)
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  // Fetch el preapproval para obtener external_reference (org_id) + payer info
  const mp = await fetchPreapproval(preapprovalId)
  const orgId = mp?.external_reference as string | undefined
  if (!orgId) {
    // Plan-based preapproval puede no tener external_reference si no lo pasamos.
    // En este caso buscamos por preapproval_plan_id + heurística. Por ahora:
    console.warn("subscription_preapproval sin external_reference — skip", preapprovalId)
    return NextResponse.json({ ok: true, note: "no external_reference" })
  }

  const admin = createAdminClient() as any
  await admin.from("organizations").update({
    mp_preapproval_id: preapprovalId,
    subscription_status: mp.status === "authorized" ? "TRIALING" : "PENDING_PAYMENT",
  }).eq("id", orgId)

  await admin.from("billing_events").insert({
    org_id: orgId,
    event_type: "PREAPPROVAL_CREATED",
    external_id: preapprovalId,
    amount_cents: (mp.auto_recurring?.transaction_amount ?? 0) * 100,
    currency: "ARS",
    status: mp.status,
    payload: { preapproval: mp },
  })

  return NextResponse.json({ ok: true })
}
```

**Nota:** para que `external_reference` llegue acá necesitamos pasarlo **al redirigir al user al init_point**. MP permite un query param `external_reference=<org_id>` que se propaga. Modificar el endpoint checkout para agregarlo al init_point:

```ts
// En app/api/billing/checkout/route.ts, antes del return:
const initPointWithRef = new URL(mpPlan.init_point)
initPointWithRef.searchParams.set("external_reference", orgId)

return NextResponse.json({
  init_point: initPointWithRef.toString(),
  plan_key: mpPlan.plan_key,
  mp_preapproval_plan_id: mpPlan.mp_preapproval_plan_id,
})
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -E "mp-webhook|checkout/route" || echo "OK"
```

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/api/billing/mp-webhook/route.ts app/api/billing/checkout/route.ts
git commit -m "feat(webhook): manejar subscription_preapproval.created

Cuando el user completa checkout en el init_point del plan, MP crea
una preapproval individual y nos notifica por webhook. Ahí guardamos
mp_preapproval_id en la org y transicionamos a TRIALING.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## P0-2: Validar admin redirect + aislar rutas (3 tasks)

**Por qué:** El fix del login-form (`c8048d9`) está pusheado pero sin validar end-to-end. Usuario reporta seguir cayendo al ERP. Hay que confirmar que `platform_admins` tiene la entry correcta y que Railway deployó.

### Task 6: Verificar `tomas.sanchez04@gmail.com` en `platform_admins`

**Files:** ninguno (solo diagnóstico DB).

- [ ] **Step 1: Correr query en Supabase SQL Editor**

```sql
SELECT
  u.id AS user_id,
  u.auth_id::text,
  u.email,
  u.org_id::text,
  u.role,
  CASE WHEN pa.user_id IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_platform_admin
FROM users u
LEFT JOIN platform_admins pa ON pa.user_id = u.id
WHERE u.email IN ('tomas.sanchez04@gmail.com', 'admin@vibook.ai')
ORDER BY u.email;
```

- [ ] **Step 2: Si `is_platform_admin = NO` para `tomas.sanchez04@gmail.com`, insertar**

```sql
INSERT INTO platform_admins (user_id, granted_by, granted_at)
SELECT u.id, u.id, NOW()
FROM users u
WHERE u.email = 'tomas.sanchez04@gmail.com'
ON CONFLICT DO NOTHING;

-- Verificar
SELECT u.email, pa.granted_at
FROM users u
JOIN platform_admins pa ON pa.user_id = u.id
WHERE u.email = 'tomas.sanchez04@gmail.com';
```

- [ ] **Step 3: Smoke post-deploy**

Abrir ventana incógnita, loguearse con `tomas.sanchez04@gmail.com`. Verificar:
- Después del login, URL es `/admin/orgs` (no `/dashboard`).
- Sidebar admin muestra "Platform Admin" + links Organizaciones / Métricas / Audit log.
- NO hay link "Volver al ERP".

### Task 7: Middleware gate para admin rutas

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/middleware.ts`

**Context:** Hoy un tenant user que tipea `/admin/orgs` manualmente no es redirigido — solo el admin layout hace el check server-side después de render. Agregar check en middleware para defense-in-depth.

- [ ] **Step 1: Agregar check antes del bloque de paywall**

Agregar al middleware, después de la resolución de `authUserId` y antes del `if (authUserId && !isOnboardingAllowed)`:

```ts
  // Defense-in-depth: non-admins no entran a /admin.
  if (authUserId && pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    const { data: userRow } = await (supabase.from("users") as any)
      .select("id")
      .eq("auth_id", authUserId)
      .maybeSingle()
    const userId = (userRow as any)?.id
    if (userId) {
      const { data: adminRow } = await (supabase.from("platform_admins") as any)
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle()
      if (!adminRow) {
        const url = req.nextUrl.clone()
        url.pathname = "/dashboard"
        return NextResponse.redirect(url)
      }
    }
  }
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep "middleware" || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add middleware.ts
git commit -m "fix(middleware): non-admins no entran a /admin (defense-in-depth)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 8: Verificación post-deploy

**Files:** ninguno.

- [ ] **Step 1: Esperar Railway deploy del push anterior**

Ver dashboard Railway, service maxevagestion, confirmar que commit `c8048d9` o posterior está ACTIVE con Deployment successful.

- [ ] **Step 2: Smoke admin login (ventana incógnita)**

1. Ir a `app.vibook.ai/login`
2. Login con `tomas.sanchez04@gmail.com`
3. **Expected:** redirect a `/admin/orgs` (ver lista de orgs).
4. Click "Agen Tst V3" → ver detalle con secciones (suspend, extend-trial, custom-plan form, mp-snapshot).

- [ ] **Step 3: Smoke tenant user no entra a admin**

1. Ventana incógnita
2. Login con user tenant (ej `eatiagame@gmail.com`)
3. Navegar a `app.vibook.ai/admin/orgs`
4. **Expected:** redirect a `/dashboard`.

---

## P0-3: AFIP SDK — emisión de facturas electrónicas (scope inicial)

**Por qué:** PRO y Enterprise venden "Facturación electrónica AFIP self-serve" como feature. Actualmente la UI existe (Settings → Facturación AFIP) pero no emite facturas reales. Bloquea activación de clientes Enterprise.

**Scope MVP:**
- Emitir FC-A / FC-B / FC-C desde una operación cerrada.
- Usar WSAA (auth) + WSFEv1 (facturación electrónica) vía AFIP SDK.
- No factura proporcional / notas de crédito / notas de débito en este scope.

### Task 9: Spec detallado de AFIP (brainstorming + design spec)

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-24-afip-mvp.md`

**Context:** AFIP SDK tiene particularidades que requieren diseño previo: certificado por agencia, CUIT representado, puntos de venta, tipos de comprobante, alícuotas IVA, IIBB por jurisdicción. No se puede improvisar.

- [ ] **Step 1: Sesión de brainstorming con el user**

Usar superpowers:brainstorming. Topics a cubrir:
1. Qué tipos de comprobante (A/B/C/E)? Monotributo vs Resp. Inscripto?
2. 1 CUIT por agencia/tenant o CUIT compartido de Vibook?
3. Punto de venta — ¿admin lo configura o se auto-sincroniza desde AFIP?
4. Cómo se almacenan certificados (.crt + .key por CUIT)?
5. IVA 21% / 10.5% / 27% / exento — mapping desde operations.operator_cost vs sale_amount?
6. IIBB por jurisdicción (CABA vs Rosario) — ¿aplica en v1?
7. Numeración: ¿usamos la numeración de AFIP o llevamos nuestra paralela?
8. Flow UI: desde operation detail, un botón "Emitir factura" → form con datos → confirmar → CAE.

- [ ] **Step 2: Escribir el spec**

Salida: documento `docs/superpowers/specs/2026-04-24-afip-mvp.md` con:
- Decisiones tomadas
- Schema de tabla `afip_credentials` (por org)
- Contrato del endpoint `/api/afip/issue-invoice`
- Happy path + error handling
- Tests mínimos (unit sobre auth WSAA, e2e sobre homologación AFIP)

- [ ] **Step 3: Commit spec**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add docs/superpowers/specs/2026-04-24-afip-mvp.md
git commit -m "docs: spec AFIP MVP facturación electrónica

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10: Escribir plan AFIP a partir del spec

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/plans/2026-04-24-afip-mvp.md`

- [ ] **Step 1:** Usar superpowers:writing-plans sobre el spec de Task 9. Dejar el plan listo para ejecutar como punto de partida P0-3 implementación. **El plan queda fuera del scope de este documento — este meta-plan solo lo referencia.**

---

## P0-4: Validar bulk import end-to-end (2 tasks)

**Por qué:** Backend + UI pusheados. Tests unitarios 36/36 pass. PERO jamás se ejecutó un import real contra DB. Riesgo de bug runtime que solo se ve con data real.

### Task 11: Smoke import con org de test

**Files:** ninguno (testing manual).

**Context:** Seguir el checklist de `docs/superpowers/plans/2026-04-23-bulk-import-e2e.md`.

- [ ] **Step 1: Org de test lista**

Crear org nueva vía signup público con email test. Ej `test-import-v1@tometh.com`. Completar hasta dashboard (skip MP).

- [ ] **Step 2: Import agencies**

1. Ir a `/settings?tab=import` con user admin de la org test.
2. Acordeón "Agencias" → "Descargar plantilla" → abre CSV con 2 filas ejemplo.
3. Editar CSV: dejar solo 1 fila nueva (ej `name="Sucursal Test",city="Córdoba",timezone="America/Argentina/Buenos_Aires"`).
4. "Subir CSV" → preview muestra 1 OK, 0 errores.
5. "Importar 1 filas" → toast "1 insertada, 0 duplicadas omitidas".
6. Ir a `/settings/agencies` → verificar que aparece "Sucursal Test" con el `org_id` correcto.

- [ ] **Step 3: Import customers con dup**

1. Volver a import.
2. Descargar plantilla de Clientes.
3. Crear CSV con 2 filas, una con DNI "99999999" y otra con mismo DNI.
4. Subir → preview: **debería** detectar dup intra-CSV y marcar 1 fila como error.
5. Corregir DNI de 2da fila → re-subir → 2 OK.
6. Importar → 2 insertadas.
7. Re-subir mismo CSV → **0 insertadas, 2 duplicadas omitidas** (dedupe por doc).

- [ ] **Step 4: Verificar isolation**

1. Segunda ventana, crear otra org de test.
2. Subir customers.csv con DNI "99999999" (mismo que org 1).
3. **Expected:** se inserta OK. Cross-tenant no colisiona.
4. Query verificación:

```sql
SELECT org_id::text, document_number, first_name
FROM customers
WHERE document_number = '99999999';
-- Expected: 2 rows, distintos org_id.
```

- [ ] **Step 5: Test FK resolution operations**

1. Preparar CSV operations con `seller_email="noexiste@x.com"`.
2. Subir → **Expected:** error 400 con mensaje "seller no encontrado" en la fila.
3. Corregir email a uno real (ej `eatiagame@gmail.com` si está en esa org) → re-subir → OK.
4. Importar → verificar en `/operations` que aparece la op + en DB `operation_customers` tiene una fila con `role='primary'`.

### Task 12: Documentar resultado smoke

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/plans/2026-04-23-bulk-import-smoke-report.md`

- [ ] **Step 1:** Anotar en el doc cada bug encontrado con reproducción exacta. Si no hay bugs: anotar "smoke OK, N entidades importadas, cross-tenant validado".

- [ ] **Step 2: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add docs/superpowers/plans/2026-04-23-bulk-import-smoke-report.md
git commit -m "docs: reporte smoke bulk import post-deploy"
```

---

## P1-1: Cleanup legacy dups de Lozada (2 tasks)

**Por qué:** 42 duplicados "Costo de Operadores" + 2 "Banco Galicia USD" + 4 customers por DNI + ~30 payments por composite key. No rompen nada hoy (dedupe RPC los detecta) pero contaminan reports. Sacar UNIQUE constraints después del cleanup.

### Task 13: Merge de 42 "Costo de Operadores"

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260424000163_cleanup_lozada_dups.sql`

**Context:** Hay que update todos los `cash_movements.financial_account_id` y `ledger_movements.financial_account_id` que apuntan a los 41 duplicados, para que apunten al "canónico" (el más antiguo). Después delete los 41 duplicados.

- [ ] **Step 1: Identificar canónico**

```sql
-- Query de exploración (no ejecutar aún)
SELECT id, created_at
FROM financial_accounts
WHERE org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'
  AND name = 'Costo de Operadores'
ORDER BY created_at ASC
LIMIT 5;
-- Tomar el id más viejo como canónico.
```

- [ ] **Step 2: Crear migration con merge + delete**

```sql
-- supabase/migrations/20260424000163_cleanup_lozada_dups.sql

-- Cleanup financial_accounts dups en Lozada.
-- Estrategia: mergear al más viejo (canónico), delete el resto.

DO $$
DECLARE
  v_canonical_id uuid;
  v_org_id uuid := '1b326d20-d133-4112-a798-f54b5af7e7cb';
  v_name text := 'Costo de Operadores';
  v_deleted_ids uuid[];
BEGIN
  -- Canónico = más viejo
  SELECT id INTO v_canonical_id
  FROM financial_accounts
  WHERE org_id = v_org_id AND name = v_name
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_canonical_id IS NULL THEN
    RAISE NOTICE 'No se encontró canónico, skip';
    RETURN;
  END IF;

  -- Recolectar IDs a borrar
  SELECT array_agg(id) INTO v_deleted_ids
  FROM financial_accounts
  WHERE org_id = v_org_id AND name = v_name AND id != v_canonical_id;

  IF v_deleted_ids IS NULL OR array_length(v_deleted_ids, 1) = 0 THEN
    RAISE NOTICE 'Sin dups, skip';
    RETURN;
  END IF;

  -- Update FKs: cash_movements
  UPDATE cash_movements
  SET financial_account_id = v_canonical_id
  WHERE financial_account_id = ANY(v_deleted_ids);

  -- Update FKs: ledger_movements
  UPDATE ledger_movements
  SET financial_account_id = v_canonical_id
  WHERE financial_account_id = ANY(v_deleted_ids);

  -- Update FKs: payments (si tiene — verificar)
  -- Si no tiene financial_account_id, skip este bloque.

  -- Delete los dups
  DELETE FROM financial_accounts
  WHERE id = ANY(v_deleted_ids);

  RAISE NOTICE 'Merged % dups de "Costo de Operadores" al canónico %', array_length(v_deleted_ids, 1), v_canonical_id;
END $$;

-- Idem para "Banco Galicia USD"
DO $$
DECLARE
  v_canonical_id uuid;
  v_org_id uuid := '1b326d20-d133-4112-a798-f54b5af7e7cb';
  v_name text := 'Banco Galicia USD';
  v_deleted_ids uuid[];
BEGIN
  SELECT id INTO v_canonical_id
  FROM financial_accounts
  WHERE org_id = v_org_id AND name = v_name
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_canonical_id IS NULL THEN RETURN; END IF;

  SELECT array_agg(id) INTO v_deleted_ids
  FROM financial_accounts
  WHERE org_id = v_org_id AND name = v_name AND id != v_canonical_id;

  IF v_deleted_ids IS NULL THEN RETURN; END IF;

  UPDATE cash_movements SET financial_account_id = v_canonical_id WHERE financial_account_id = ANY(v_deleted_ids);
  UPDATE ledger_movements SET financial_account_id = v_canonical_id WHERE financial_account_id = ANY(v_deleted_ids);
  DELETE FROM financial_accounts WHERE id = ANY(v_deleted_ids);

  RAISE NOTICE 'Merged % dups de "Banco Galicia USD"', array_length(v_deleted_ids, 1);
END $$;

-- Ahora que Lozada está limpio, agregamos el UNIQUE constraint que
-- no pudo aplicarse en migration 161.
ALTER TABLE financial_accounts DROP CONSTRAINT IF EXISTS financial_accounts_org_name_unique;
ALTER TABLE financial_accounts ADD CONSTRAINT financial_accounts_org_name_unique UNIQUE (org_id, name);
```

- [ ] **Step 3: Dry-run primero**

Pegar al user **solo los SELECTs y NOTICEs** del bloque (sin UPDATE/DELETE/ALTER). Verificar que los counts sean ~42 y ~2 respectivamente. Si no matchea, PARAR y diagnosticar.

- [ ] **Step 4: Ejecutar migration real**

Pegar el SQL completo al user. Esperar "success".

- [ ] **Step 5: Verificar post-migration**

```sql
-- Conteo después
SELECT org_id::text, name, COUNT(*) FROM financial_accounts
WHERE org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'
GROUP BY org_id, name
HAVING COUNT(*) > 1;
-- Expected: 0 rows (sin dups).

-- Constraint activa
SELECT conname FROM pg_constraint
WHERE conrelid = 'financial_accounts'::regclass
  AND conname = 'financial_accounts_org_name_unique';
-- Expected: 1 row.
```

- [ ] **Step 6: Commit migration**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260424000163_cleanup_lozada_dups.sql
git commit -m "migration 163: cleanup 44 financial_accounts dups de Lozada

Merged al canónico (más viejo) + delete rest + agregar UNIQUE constraint
(org_id, name) que no pudo aplicarse en mig 161 por los dups.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 14: Cleanup customers + payments dups

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260424000164_cleanup_lozada_customers_payments.sql`

**Context:** 4 customers con mismo DNI (AAI008544, 47040432, 35585626 × 2, ivan@importado.com × 2), ~30 payments composite dup. Mismo pattern: merge al canónico + delete + add UNIQUE.

- [ ] **Step 1: Diagnóstico específico**

```sql
-- Customers por DNI
SELECT id, first_name, last_name, document_number, created_at
FROM customers
WHERE org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'
  AND document_number IN ('AAI008544', '47040432', '35585626')
ORDER BY document_number, created_at;

-- Customers por email (cuando no hay doc)
SELECT id, first_name, last_name, email, created_at
FROM customers
WHERE org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'
  AND email = 'ivan@importado.com'
  AND (document_number IS NULL OR document_number = '')
ORDER BY created_at;

-- Payments dup (primero 5)
SELECT id, operation_id::text, amount, date_due, direction, created_at
FROM payments
WHERE org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'
  AND (operation_id, amount, date_due, direction) IN (
    SELECT operation_id, amount, date_due, direction
    FROM payments
    WHERE org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'
    GROUP BY operation_id, amount, date_due, direction
    HAVING COUNT(*) > 1
    LIMIT 5
  )
ORDER BY operation_id, amount, created_at;
```

- [ ] **Step 2: Crear migration con merge customers + delete payments dup + restore UNIQUE**

```sql
-- supabase/migrations/20260424000164_cleanup_lozada_customers_payments.sql

-- Cleanup customers por DNI dup (4 pares: 3 DNIs + 1 email).
DO $$
DECLARE
  v_org_id uuid := '1b326d20-d133-4112-a798-f54b5af7e7cb';
  r RECORD;
  v_canonical uuid;
  v_delete_ids uuid[];
BEGIN
  -- Loop por cada document_number duplicado
  FOR r IN (
    SELECT document_number
    FROM customers
    WHERE org_id = v_org_id
      AND document_number IS NOT NULL AND document_number != ''
    GROUP BY document_number HAVING COUNT(*) > 1
  ) LOOP
    SELECT id INTO v_canonical
    FROM customers
    WHERE org_id = v_org_id AND document_number = r.document_number
    ORDER BY created_at ASC LIMIT 1;

    SELECT array_agg(id) INTO v_delete_ids
    FROM customers
    WHERE org_id = v_org_id AND document_number = r.document_number
      AND id != v_canonical;

    -- Update FK en operation_customers
    UPDATE operation_customers SET customer_id = v_canonical
    WHERE customer_id = ANY(v_delete_ids);

    DELETE FROM customers WHERE id = ANY(v_delete_ids);
    RAISE NOTICE 'Customer DNI % → merged % dups', r.document_number, array_length(v_delete_ids, 1);
  END LOOP;
END $$;

-- Cleanup customers por email sin doc (dup con misma email).
DO $$
DECLARE
  v_org_id uuid := '1b326d20-d133-4112-a798-f54b5af7e7cb';
  r RECORD;
  v_canonical uuid;
  v_delete_ids uuid[];
BEGIN
  FOR r IN (
    SELECT email
    FROM customers
    WHERE org_id = v_org_id
      AND email IS NOT NULL AND email != ''
      AND (document_number IS NULL OR document_number = '')
    GROUP BY email HAVING COUNT(*) > 1
  ) LOOP
    SELECT id INTO v_canonical
    FROM customers
    WHERE org_id = v_org_id AND email = r.email
      AND (document_number IS NULL OR document_number = '')
    ORDER BY created_at ASC LIMIT 1;

    SELECT array_agg(id) INTO v_delete_ids
    FROM customers
    WHERE org_id = v_org_id AND email = r.email
      AND (document_number IS NULL OR document_number = '')
      AND id != v_canonical;

    UPDATE operation_customers SET customer_id = v_canonical
    WHERE customer_id = ANY(v_delete_ids);

    DELETE FROM customers WHERE id = ANY(v_delete_ids);
    RAISE NOTICE 'Customer email % → merged % dups', r.email, array_length(v_delete_ids, 1);
  END LOOP;
END $$;

-- Cleanup payments dup composite (mantener más viejo, delete resto).
DO $$
DECLARE
  v_org_id uuid := '1b326d20-d133-4112-a798-f54b5af7e7cb';
  r RECORD;
  v_canonical uuid;
  v_delete_ids uuid[];
BEGIN
  FOR r IN (
    SELECT operation_id, amount, date_due, direction
    FROM payments
    WHERE org_id = v_org_id
    GROUP BY operation_id, amount, date_due, direction
    HAVING COUNT(*) > 1
  ) LOOP
    SELECT id INTO v_canonical
    FROM payments
    WHERE org_id = v_org_id
      AND operation_id = r.operation_id
      AND amount = r.amount
      AND date_due = r.date_due
      AND direction = r.direction
    ORDER BY created_at ASC LIMIT 1;

    SELECT array_agg(id) INTO v_delete_ids
    FROM payments
    WHERE org_id = v_org_id
      AND operation_id = r.operation_id
      AND amount = r.amount
      AND date_due = r.date_due
      AND direction = r.direction
      AND id != v_canonical;

    -- Update FK en ledger_movements (si apunta a payment_id)
    UPDATE ledger_movements SET payment_id = v_canonical
    WHERE payment_id = ANY(v_delete_ids);

    DELETE FROM payments WHERE id = ANY(v_delete_ids);
  END LOOP;
END $$;

-- Restore UNIQUE constraints
DROP INDEX IF EXISTS customers_org_document_unique;
CREATE UNIQUE INDEX customers_org_document_unique
  ON customers (org_id, document_number)
  WHERE document_number IS NOT NULL AND document_number != '';

DROP INDEX IF EXISTS customers_org_email_unique;
CREATE UNIQUE INDEX customers_org_email_unique
  ON customers (org_id, email)
  WHERE email IS NOT NULL AND email != '' AND (document_number IS NULL OR document_number = '');

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_org_composite_unique;
ALTER TABLE payments ADD CONSTRAINT payments_org_composite_unique
  UNIQUE (org_id, operation_id, amount, date_due, direction);
```

- [ ] **Step 3: Dry-run + ejecutar + verificar (mismo pattern que Task 13 Step 3-5)**

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260424000164_cleanup_lozada_customers_payments.sql
git commit -m "migration 164: cleanup customers+payments dups Lozada + restore UNIQUE

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## P1-2: Error messages claros en flow de pago (1 task)

**Por qué:** "MercadoPago rechazó el checkout: MP preapproval failed (500): {...}" es un error mostrado al user. Malo. Usuarios no técnicos se asustan.

### Task 15: Mapper de errores MP → mensajes de user

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mp-error-mapper.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/mp-error-mapper.test.ts`
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/billing/checkout/route.ts`

- [ ] **Step 1: Test**

```ts
// lib/billing/mp-error-mapper.test.ts
import { mpErrorToUserMessage } from "./mp-error-mapper"

describe("mpErrorToUserMessage", () => {
  it("500 Internal server error → mensaje genérico amigable", () => {
    const msg = mpErrorToUserMessage('MP preapproval_plan failed (500): {"message":"Internal server error","status":500}')
    expect(msg).toMatch(/No pudimos procesar/i)
    expect(msg).not.toMatch(/Internal server error/i)
  })
  it("400 con cause invalid email", () => {
    const msg = mpErrorToUserMessage('MP preapproval failed (400): {"message":"invalid payer_email","cause":[{"code":"3033","description":"Invalid email"}]}')
    expect(msg).toMatch(/email.*inválido/i)
  })
  it("mensaje desconocido → fallback genérico", () => {
    const msg = mpErrorToUserMessage("totally unknown error xyz")
    expect(msg).toMatch(/No pudimos procesar/i)
  })
})
```

- [ ] **Step 2: Run expect FAIL**

- [ ] **Step 3: Implementar**

```ts
// lib/billing/mp-error-mapper.ts

/**
 * Convierte mensajes crudos de MP (ej "MP preapproval failed (500): {...}")
 * a mensajes amigables para mostrar al user en el flow de checkout.
 *
 * Input siempre es el .message de un Error lanzado por lib/billing/mercadopago.ts.
 */
export function mpErrorToUserMessage(raw: string): string {
  // Email inválido por MP
  if (/invalid.*email|payer_email.*invalid|email.*format/i.test(raw)) {
    return "El email de facturación es inválido o no existe en Mercado Pago. Verificá el email en Configuración y probá de nuevo."
  }

  // Amount inválido
  if (/invalid.*amount|transaction_amount/i.test(raw)) {
    return "El monto del plan no pudo ser procesado por Mercado Pago. Contactanos a hola@vibook.ai."
  }

  // 500 genérico
  if (/\(500\)|Internal server error/.test(raw)) {
    return "Mercado Pago está teniendo problemas temporales. Reintentá en unos minutos. Si persiste, contactanos a hola@vibook.ai."
  }

  // 400 con cause
  if (/\(400\)/.test(raw)) {
    return "No pudimos procesar tu pago. Revisá los datos de facturación en Configuración."
  }

  // Default
  return "No pudimos procesar tu pago. Si el problema persiste, contactanos a hola@vibook.ai."
}
```

- [ ] **Step 4: Run tests PASS**

- [ ] **Step 5: Integrar en checkout route**

En `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/billing/checkout/route.ts`, cambiar:

```ts
// Antes:
return NextResponse.json(
  { error: `MercadoPago rechazó el checkout: ${mpMsg}` },
  { status: 502 }
)

// Después:
import { mpErrorToUserMessage } from "@/lib/billing/mp-error-mapper"
// ...
return NextResponse.json(
  { error: mpErrorToUserMessage(mpMsg) },
  { status: 502 }
)
```

- [ ] **Step 6: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/billing/mp-error-mapper.ts lib/billing/mp-error-mapper.test.ts app/api/billing/checkout/route.ts
git commit -m "feat(billing): error messages user-friendly para MP

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## P2: Backlog (memoria de sesiones previas)

Items ya identificados que **no bloquean launch** pero conviene cerrar antes de escalar:

### Task 16: Desvincular `admin.vibook.ai` de Vercel legacy
Cloudflare DNS ya apunta a Railway, pero Vercel puede seguir configurado. Verificar con `curl -I https://admin.vibook.ai` que devuelve headers de Railway (`railway-edge`), no Vercel.

### Task 17: Restore types para `exchange_rates` y `destination_requirements`
Los typecheck errors pre-existentes (23 en total al final del bulk import) incluyen estas tablas. Regenerar types.ts y fixear imports rotos.

### Task 18: Change password `admin@vibook.ai`
Cuenta de servicio. Rotar password + documentar en password manager del equipo.

### Task 19: Middleware `host=admin.vibook.ai` tweak
Hoy `app.vibook.ai/admin/*` funciona. Si queremos que `admin.vibook.ai/*` sea el entry point admin exclusivo, hay que routear en middleware por Host header. Diseño separado.

### Task 20: Railway Cron para `apply-pricing-changes`
Endpoint `/api/cron/apply-pricing-changes` existe (del custom plans sprint) pero Railway Cron Service no está creado. Crear service: `curl -X POST "$APP_URL/api/cron/apply-pricing-changes" -H "Authorization: Bearer $CRON_SECRET"` daily 03:00.

### Task 21: Smoke E2E del custom plans sprint
Validar que custom plan → discount → MP update → discount expiry funciona end-to-end con org de test. Checklist detallado al hacer la task.

---

## Ejecución

**Orden sugerido (camino crítico al launch):**

1. **Hoy/mañana:** P0-2 (validar admin redirect) — unblocks admin testing, 30 min.
2. **Esta semana:** P0-1 (preapproval_plan) — 3-4h de trabajo.
3. **Paralelo:** P0-4 (bulk import smoke) — 1h, independiente.
4. **Esta semana:** P1-1 (cleanup Lozada) — 1h, importante pero no bloqueante.
5. **Próxima semana:** P1-2 (error mapper) — 30 min.
6. **Próxima 2 semanas:** P0-3 (AFIP MVP) — spec + plan + implementación = 20-30h.
7. **Cuando termine AFIP:** P2 backlog.

**Total estimado crítico (P0 + P1):** ~10h para todo excepto AFIP. AFIP aparte requiere brainstorming + plan dedicado.

---

## Resumen entregables

- 6 tasks P0-1 (MP preapproval_plan migration + custom plans refactor)
- 3 tasks P0-2 (admin redirect validation)
- 2 tasks P0-3 (AFIP spec + plan, implementación en plan separado)
- 2 tasks P0-4 (bulk import smoke + report)
- 2 tasks P1-1 (Lozada cleanup migrations)
- 1 task P1-2 (error mapper)
- 6 tasks P2 (backlog)

**Total: 21 tasks.**

Este plan NO incluye la implementación AFIP — esa requiere su propio spec + plan (Task 9-10 arrancan ese track).
