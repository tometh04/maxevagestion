# Paywall + Suscripciones MercadoPago — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar paywall obligatorio post-signup con trial 7 días via MercadoPago preapproval, autogestión completa (cancelar/reactivar/cambiar tarjeta), manejo de cobros fallidos y defense-in-depth que no se pueda bypassear.

**Architecture:** State machine idempotente en webhook MP (fuente única de verdad del estado de suscripción), 3 capas de gate (middleware + server-side guard + RLS), nueva pantalla `/onboarding/billing` dedicada fuera del layout dashboard, cron diario de reconciliación como safety net para webhooks perdidos, historial completo en `billing_events` (audit log).

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), MercadoPago REST API (preapproval), Jest para unit tests de lógica pura, Railway cron services.

**Spec de referencia:** `docs/superpowers/specs/2026-04-21-paywall-mercadopago-design.md`

---

## File Structure

### Archivos nuevos
```
supabase/migrations/
  20260421000157_saas_billing_hardening.sql        (Fase 1)

lib/billing/
  guard.ts                                          (Fase 2) — isAccessAllowed, assertSubscriptionActive
  guard.test.ts                                     (Fase 2) — unit tests de isAccessAllowed
  state-machine.ts                                  (Fase 4) — transitionFromMP, idempotencia
  state-machine.test.ts                             (Fase 4) — unit tests de transitionFromMP

app/onboarding/billing/
  page.tsx                                          (Fase 3) — paywall full-screen
  return/page.tsx                                   (Fase 3) — polling tras MP
  _components/plan-card.tsx                         (Fase 3) — card de plan

app/api/billing/
  status/route.ts                                   (Fase 3) — GET polling status
  cancel/route.ts                                   (Fase 5) — POST cancelar suscripción
  reactivate/route.ts                               (Fase 5) — POST reactivar
  update-card-link/route.ts                         (Fase 5) — GET URL de MP para update

app/api/cron/billing-reconcile/route.ts             (Fase 7)

components/billing/
  subscription-banner.tsx                           (Fase 6) — banner global en dashboard
  cancel-dialog.tsx                                 (Fase 6) — dialog de confirmación cancel
  reactivate-dialog.tsx                             (Fase 6) — dialog de reactivación
  payment-method-card.tsx                           (Fase 6) — card con tarjeta y botón cambiar
  billing-history-table.tsx                         (Fase 6) — tabla historial pagos
```

### Archivos modificados
```
lib/billing/mercadopago.ts                          (Fases 3, 5, 7, 8) — free_trial, sandbox, update helpers
middleware.ts                                       (Fase 2, 3) — gate con nuevos estados
app/(dashboard)/layout.tsx                          (Fase 2, 6) — assertSubscriptionActive + banner
app/(dashboard)/settings/subscription/page.tsx      (Fase 6) — refactor total
app/api/billing/checkout/route.ts                   (Fase 3) — free_trial condicional, 409 si ya hay preapproval
app/api/billing/mp-webhook/route.ts                 (Fase 4) — state machine idempotente
components/register-form.tsx                        (Fase 3) — redirect al paywall tras signup
.env.example                                        (Fase 8) — MERCADOPAGO_ACCESS_TOKEN_SANDBOX, MP_USE_SANDBOX
```

---

## Phase 1: Schema hardening

**Objetivo:** Dejar la DB lista con las columnas nuevas y valores de `subscription_status` expandidos, sin romper orgs existentes.

### Task 1.1: Migration SQL

**Files:**
- Create: `supabase/migrations/20260421000157_saas_billing_hardening.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Migration 157: SaaS billing hardening — paywall + MP robusto.
--
-- Contexto: rediseño completo del flow de suscripciones. Se agregan columnas
-- para trackear período pagado y trial usado, expande el CHECK constraint
-- de subscription_status con los nuevos valores, y migra orgs existentes.
-- También agrega UNIQUE para idempotencia de webhooks MP.
--
-- Spec: docs/superpowers/specs/2026-04-21-paywall-mercadopago-design.md

-- Columnas nuevas
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS current_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.current_period_ends_at IS
  'Fin del período pagado/trial actual. Durante TRIALING = trial_ends_at. '
  'Durante ACTIVE = next_payment_date del preapproval MP. Se congela al CANCELLED.';
COMMENT ON COLUMN public.organizations.mp_last_synced_at IS
  'preapproval.last_modified del último webhook MP procesado. Usado para detectar '
  'webhooks out-of-order e idempotencia.';
COMMENT ON COLUMN public.organizations.has_used_trial IS
  'True después del primer preapproval creado con free_trial. Previene exploit de '
  're-trialing (cancelar y volver a suscribirse con trial nuevo).';

-- Expandir CHECK de subscription_status. Valores actuales: TRIAL, ACTIVE, PAST_DUE,
-- CANCELLED, SUSPENDED. Nuevos: PENDING_PAYMENT, TRIALING. TRIAL queda como legacy
-- permitido para no romper backfill en transición.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN (
    'PENDING_PAYMENT', 'TRIALING', 'ACTIVE', 'PAST_DUE',
    'CANCELLED', 'SUSPENDED',
    'TRIAL'  -- legacy, backfilleado abajo. No se usa en código nuevo.
  ));

-- Backfill de orgs existentes:
--   TRIAL sin preapproval → PENDING_PAYMENT (nunca eligieron plan)
--   TRIAL con preapproval → TRIALING + has_used_trial=true
UPDATE public.organizations
   SET subscription_status = 'PENDING_PAYMENT'
 WHERE subscription_status = 'TRIAL'
   AND mp_preapproval_id IS NULL;

UPDATE public.organizations
   SET subscription_status = 'TRIALING',
       has_used_trial = true,
       current_period_ends_at = trial_ends_at
 WHERE subscription_status = 'TRIAL'
   AND mp_preapproval_id IS NOT NULL;

-- ACTIVE legacy: has_used_trial=true para no re-ofrecer trial
UPDATE public.organizations
   SET has_used_trial = true
 WHERE subscription_status IN ('ACTIVE', 'PAST_DUE')
   AND mp_preapproval_id IS NOT NULL;

-- Idempotencia de webhooks: unique sobre (external_id, event_type) donde
-- external_id no es null. El webhook usa ON CONFLICT DO NOTHING para skip.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_idempotency
  ON public.billing_events (external_id, event_type)
  WHERE external_id IS NOT NULL;

COMMENT ON INDEX idx_billing_events_idempotency IS
  'Previene double-procesamiento de webhooks MP cuando MP retryea. '
  'Combinado con comparación de last_modified, garantiza idempotencia.';
```

- [ ] **Step 2: Verify SQL compiles locally**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && cat supabase/migrations/20260421000157_saas_billing_hardening.sql | head -5`
Expected: outputs the comment header.

- [ ] **Step 3: Post SQL in chat for Tomi to run in Supabase SQL Editor**

Copy the entire migration content into the chat with instructions: "Corré esto en Supabase SQL Editor (producción). Avisame cuando termine para seguir con Fase 2."

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/20260421000157_saas_billing_hardening.sql
git commit -m "mig 157: saas billing hardening — paywall + MP robusto

Agrega columnas current_period_ends_at, mp_last_synced_at, has_used_trial.
Expande CHECK de subscription_status con PENDING_PAYMENT y TRIALING.
Backfill de orgs existentes: TRIAL sin preapproval → PENDING_PAYMENT,
TRIAL con preapproval → TRIALING + has_used_trial=true.
UNIQUE sobre billing_events(external_id, event_type) para idempotencia MP.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2: Guard helper + middleware gate

**Objetivo:** Capa B y A del defense-in-depth. Bloquear acceso al dashboard para orgs que no tienen suscripción activa. Por ahora redirige a `/settings/subscription` (fallback) — en Fase 3 se crea `/onboarding/billing` y el redirect se actualiza.

### Task 2.1: Tests de `isAccessAllowed`

**Files:**
- Create: `lib/billing/guard.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

```ts
// lib/billing/guard.test.ts
import { isAccessAllowed, type BillingOrg } from "./guard"

function makeOrg(overrides: Partial<BillingOrg>): BillingOrg {
  return {
    subscription_status: "ACTIVE",
    current_period_ends_at: null,
    trial_ends_at: null,
    ...overrides,
  }
}

describe("isAccessAllowed", () => {
  it("allows ACTIVE", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "ACTIVE" }))).toBe(true)
  })

  it("allows TRIALING", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "TRIALING" }))).toBe(true)
  })

  it("allows PAST_DUE (banner pero puede entrar durante retry)", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "PAST_DUE" }))).toBe(true)
  })

  it("blocks PENDING_PAYMENT", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "PENDING_PAYMENT" }))).toBe(false)
  })

  it("blocks SUSPENDED", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "SUSPENDED" }))).toBe(false)
  })

  it("allows CANCELLED with future current_period_ends_at", () => {
    const future = new Date(Date.now() + 86400_000).toISOString()
    expect(isAccessAllowed(makeOrg({
      subscription_status: "CANCELLED",
      current_period_ends_at: future,
    }))).toBe(true)
  })

  it("blocks CANCELLED with past current_period_ends_at", () => {
    const past = new Date(Date.now() - 86400_000).toISOString()
    expect(isAccessAllowed(makeOrg({
      subscription_status: "CANCELLED",
      current_period_ends_at: past,
    }))).toBe(false)
  })

  it("blocks CANCELLED with null current_period_ends_at (defensivo)", () => {
    expect(isAccessAllowed(makeOrg({
      subscription_status: "CANCELLED",
      current_period_ends_at: null,
    }))).toBe(false)
  })

  it("blocks legacy TRIAL with null trial_ends_at (migrated orgs must use new statuses)", () => {
    // Post-migration 157 no debería haber TRIAL. Por si queda alguna:
    expect(isAccessAllowed(makeOrg({
      subscription_status: "TRIAL",
      trial_ends_at: null,
    }))).toBe(false)
  })

  it("allows legacy TRIAL with future trial_ends_at (backward compat)", () => {
    const future = new Date(Date.now() + 86400_000).toISOString()
    expect(isAccessAllowed(makeOrg({
      subscription_status: "TRIAL",
      trial_ends_at: future,
    }))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx jest lib/billing/guard.test.ts`
Expected: FAIL — "Cannot find module './guard'"

### Task 2.2: Implementar `guard.ts`

**Files:**
- Create: `lib/billing/guard.ts`

- [ ] **Step 1: Implementar funciones**

```ts
// lib/billing/guard.ts
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * Subset de columnas de organizations que el guard necesita. Copiado acá
 * para no depender del type generado de Supabase (que puede estar desync).
 */
export type BillingSubscriptionStatus =
  | "PENDING_PAYMENT"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "SUSPENDED"
  | "TRIAL" // legacy

export interface BillingOrg {
  subscription_status: BillingSubscriptionStatus | string
  current_period_ends_at: string | null
  trial_ends_at: string | null
}

/**
 * Regla pura: ¿este org tiene acceso al ERP ahora mismo?
 *
 * Usado por (A) middleware para decidir redirect a /onboarding/billing,
 * (B) assertSubscriptionActive en layouts/API routes, (C) tests.
 *
 * No hace I/O. Es la fuente única de verdad de la regla de acceso.
 */
export function isAccessAllowed(org: BillingOrg): boolean {
  const status = org.subscription_status
  const now = Date.now()

  if (status === "SUSPENDED" || status === "PENDING_PAYMENT") return false

  if (status === "CANCELLED") {
    if (!org.current_period_ends_at) return false
    return new Date(org.current_period_ends_at).getTime() > now
  }

  if (status === "TRIAL") {
    // Legacy. Post-mig 157 no debería existir. Fallback defensivo.
    if (!org.trial_ends_at) return false
    return new Date(org.trial_ends_at).getTime() > now
  }

  // TRIALING, ACTIVE, PAST_DUE → acceso concedido (PAST_DUE tiene banner pero entra)
  return true
}

/**
 * Guard de server component / API route. Si el user no tiene acceso,
 * redirige a /onboarding/billing. Llamar desde el layout del (dashboard)
 * y desde APIs de negocio.
 */
export async function assertSubscriptionActive(): Promise<void> {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.org_id) redirect("/onboarding")

  const admin = createAdminClient() as any
  const { data } = await admin
    .from("organizations")
    .select("subscription_status, current_period_ends_at, trial_ends_at")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!data) redirect("/onboarding") // org sin fila = estado inválido

  if (!isAccessAllowed(data as BillingOrg)) {
    redirect("/onboarding/billing")
  }
}
```

- [ ] **Step 2: Run tests, verify pass**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx jest lib/billing/guard.test.ts`
Expected: PASS (10 tests)

### Task 2.3: Actualizar middleware

**Files:**
- Modify: `middleware.ts` (lines 145-204, bloque de paywall gate)

- [ ] **Step 1: Reemplazar la lógica de paywall gate**

Encontrar en middleware.ts el bloque que empieza con `const isPaywallAllowed` y terminar antes del `return response` final. Reemplazarlo con:

```ts
  const isPaywallAllowed =
    isOnboardingAllowed ||
    pathname.startsWith("/onboarding/billing") ||
    pathname.startsWith("/paywall") ||  // legacy route, mantener por compat
    pathname.startsWith("/settings/subscription") ||
    pathname.startsWith("/api/billing") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin")

  if (authUserId && !isOnboardingAllowed) {
    const { data: userRow } = await (supabase.from("users") as any)
      .select("org_id, is_active")
      .eq("auth_id", authUserId)
      .maybeSingle()

    const orgId = (userRow as any)?.org_id as string | null | undefined
    const isActive = (userRow as any)?.is_active !== false

    if (!isActive) return response

    if (userRow && !orgId) {
      const url = req.nextUrl.clone()
      url.pathname = "/onboarding"
      return NextResponse.redirect(url)
    }

    // Paywall gate — usa isAccessAllowed (inlined acá porque middleware es Edge
    // y no puede importar server-side code). La lógica debe coincidir con
    // lib/billing/guard.ts.
    if (orgId && !isPaywallAllowed) {
      const { data: orgRow } = await (supabase.from("organizations") as any)
        .select("subscription_status, current_period_ends_at, trial_ends_at")
        .eq("id", orgId)
        .maybeSingle()

      const status = (orgRow as any)?.subscription_status as string | undefined
      const periodEnds = (orgRow as any)?.current_period_ends_at as string | null | undefined
      const trialEnds = (orgRow as any)?.trial_ends_at as string | null | undefined
      const now = Date.now()

      let blocked = false
      if (status === "SUSPENDED" || status === "PENDING_PAYMENT") blocked = true
      else if (status === "CANCELLED") {
        blocked = !periodEnds || new Date(periodEnds).getTime() <= now
      } else if (status === "TRIAL") {
        blocked = !trialEnds || new Date(trialEnds).getTime() <= now
      }

      if (blocked) {
        const url = req.nextUrl.clone()
        url.pathname = "/onboarding/billing"
        return NextResponse.redirect(url)
      }
    }
  }
```

- [ ] **Step 2: Verificar que compila**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit -p tsconfig.json 2>&1 | grep middleware || echo OK`
Expected: `OK` (sin errores de type en middleware.ts)

### Task 2.4: Agregar guard al dashboard layout

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Verificar estructura actual del layout**

Run: `head -30 app/\\(dashboard\\)/layout.tsx`

- [ ] **Step 2: Agregar llamada a assertSubscriptionActive**

Al inicio del componente `export default async function DashboardLayout(...)`, antes de cualquier otro await, agregar:

```ts
import { assertSubscriptionActive } from "@/lib/billing/guard"

// ...dentro del componente:
await assertSubscriptionActive()
```

Si el layout ya hace `getCurrentUser()` o queries parecidas, mantenerlas — `assertSubscriptionActive` las hace internamente pero el layout puede repetirlas sin issue.

- [ ] **Step 3: Verificar build**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "layout\\|guard" || echo OK`
Expected: `OK`

### Task 2.5: Commit Fase 2

- [ ] **Step 1: Commit**

```bash
git add lib/billing/guard.ts lib/billing/guard.test.ts middleware.ts app/\(dashboard\)/layout.tsx
git commit -m "$(cat <<'EOF'
billing: guard + middleware gate con nuevos estados

Capa A + B del defense-in-depth:
- lib/billing/guard.ts: isAccessAllowed (pura) + assertSubscriptionActive (I/O).
  10 unit tests cubriendo todas las transiciones.
- middleware.ts: lógica de paywall gate alineada con isAccessAllowed.
  Redirige a /onboarding/billing para PENDING_PAYMENT, SUSPENDED y
  CANCELLED+expirado. Whitelist actualizada.
- app/(dashboard)/layout.tsx: assertSubscriptionActive al inicio —
  server-side guard que no es bypasseable vía x-middleware-subrequest.

En este punto PENDING_PAYMENT orgs son redirigidas a /onboarding/billing
que todavía no existe (404). Fase 3 crea la página.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Paywall dedicada + checkout refactor

**Objetivo:** Crear `/onboarding/billing` (paywall full-screen, dos planes), `/onboarding/billing/return` (polling post-MP), `GET /api/billing/status`, actualizar `/api/billing/checkout` con `free_trial` + `has_used_trial`, y hacer que el register form redirija al paywall.

### Task 3.1: Página paywall `/onboarding/billing`

**Files:**
- Create: `app/onboarding/billing/page.tsx`
- Create: `app/onboarding/billing/_components/plan-card.tsx`
- Create: `app/onboarding/billing/layout.tsx`

- [ ] **Step 1: Crear layout full-screen (sin sidebar)**

```tsx
// app/onboarding/billing/layout.tsx
export default function OnboardingBillingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Crear `plan-card.tsx` client component**

```tsx
// app/onboarding/billing/_components/plan-card.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PLANS, SALES_CONTACT_URL, formatArs, type PlanId } from "@/lib/billing/plans"

export function PlanCard({ planId }: { planId: PlanId }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plan = PLANS[planId]

  if (plan.contactSalesOnly) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle>{plan.name}</CardTitle>
          <div className="text-2xl font-bold">{plan.priceLabel || "Consultar"}</div>
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1 mb-4">
            {plan.features.map((f) => <li key={f}>• {f}</li>)}
          </ul>
          <Button asChild className="w-full" variant="outline">
            <a href={SALES_CONTACT_URL} target="_blank" rel="noopener noreferrer">
              Hablar por WhatsApp
            </a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  async function elegir() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      })
      const body = await res.json()
      if (!res.ok || !body.init_point) {
        setError(body.error || "No se pudo iniciar el checkout")
        setLoading(false)
        return
      }
      window.location.href = body.init_point
    } catch (err: any) {
      setError(err.message || "Error inesperado")
      setLoading(false)
    }
  }

  return (
    <Card className="border-2 border-blue-500 relative">
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full">
        Recomendado
      </div>
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <div className="text-3xl font-bold">
          {plan.priceArsMonthly !== null
            ? <>{formatArs(plan.priceArsMonthly)}<span className="text-sm font-normal text-muted-foreground"> /mes</span></>
            : "—"}
        </div>
        {plan.trialDays ? (
          <p className="text-xs text-green-600 font-medium">
            {plan.trialDays} días gratis · sin cobro hasta el día {plan.trialDays + 1}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">{plan.description}</p>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1 mb-4">
          {plan.features.map((f) => <li key={f}>✓ {f}</li>)}
        </ul>
        <Button onClick={elegir} disabled={loading} className="w-full">
          {loading ? "Procesando…" : "Elegir este plan"}
        </Button>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Crear page.tsx del paywall**

```tsx
// app/onboarding/billing/page.tsx
import Image from "next/image"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { PLAN_ORDER } from "@/lib/billing/plans"
import { PlanCard } from "./_components/plan-card"
import { createAdminClient } from "@/lib/supabase/server"
import { isAccessAllowed } from "@/lib/billing/guard"

export default async function OnboardingBillingPage() {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.org_id) redirect("/onboarding")

  // Si ya tiene acceso, no debería estar acá — mandalo al dashboard
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("name, subscription_status, current_period_ends_at, trial_ends_at")
    .eq("id", user.org_id)
    .maybeSingle()

  if (org && isAccessAllowed(org)) redirect("/dashboard")

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-6 max-w-6xl mx-auto w-full">
        <Image src="/vibook-logo.jpeg" alt="Vibook" width={140} height={42} priority />
        <form action="/api/auth/logout" method="POST">
          <button className="text-sm text-muted-foreground hover:underline">
            Cerrar sesión
          </button>
        </form>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">
              Hola {user.name || "👋"}, para activar tu cuenta elegí un plan
            </h1>
            <p className="text-muted-foreground">
              Probá PRO 7 días gratis · No se te cobra hasta el día 8 · Cancelás cuando quieras
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PLAN_ORDER.map((planId) => (
              <PlanCard key={planId} planId={planId} />
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            🔒 Tu tarjeta se guarda en Mercado Pago con cifrado PCI. Nunca vemos los datos completos.
          </p>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Verificar que `/api/auth/logout` existe**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && ls app/api/auth/logout 2>&1 || echo "MISSING — crear endpoint o cambiar el form action"`

Si no existe, crear `app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST() {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"))
}
```

### Task 3.2: Página de retorno `/onboarding/billing/return`

**Files:**
- Create: `app/onboarding/billing/return/page.tsx`

- [ ] **Step 1: Crear la página con polling**

```tsx
// app/onboarding/billing/return/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 30_000

export default function OnboardingBillingReturnPage() {
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const started = Date.now()
    let cancelled = false

    async function check() {
      if (cancelled) return
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          if (data.status === "TRIALING" || data.status === "ACTIVE") {
            router.replace("/dashboard")
            return
          }
        }
      } catch {
        // ignore, retry
      }

      if (Date.now() - started > MAX_POLL_MS) {
        setTimedOut(true)
        return
      }
      setTimeout(check, POLL_INTERVAL_MS)
    }

    check()
    return () => { cancelled = true }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        {!timedOut ? (
          <>
            <div className="mx-auto w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <h1 className="text-xl font-semibold">Procesando tu suscripción…</h1>
            <p className="text-sm text-muted-foreground">
              Mercado Pago está confirmando tu pago. Esto suele tardar unos segundos.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Tardó más de lo esperado</h1>
            <p className="text-sm text-muted-foreground">
              Tu suscripción debería activarse en unos minutos. Si no aparece el dashboard
              al volver, escribinos a <a href="mailto:hola@vibook.ai" className="underline">hola@vibook.ai</a>.
            </p>
            <button
              onClick={() => router.replace("/dashboard")}
              className="text-sm text-blue-600 hover:underline"
            >
              Ir al dashboard →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

### Task 3.3: `GET /api/billing/status`

**Files:**
- Create: `app/api/billing/status/route.ts`

- [ ] **Step 1: Implementar endpoint**

```ts
// app/api/billing/status/route.ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select(
      "subscription_status, current_period_ends_at, trial_ends_at, " +
      "mp_preapproval_id, plan, has_used_trial"
    )
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: "org not found" }, { status: 404 })
  }

  return NextResponse.json({
    status: org.subscription_status,
    current_period_ends_at: org.current_period_ends_at,
    trial_ends_at: org.trial_ends_at,
    has_preapproval: !!org.mp_preapproval_id,
    plan: org.plan,
    has_used_trial: org.has_used_trial,
  })
}
```

### Task 3.4: Actualizar `/api/billing/checkout`

**Files:**
- Modify: `app/api/billing/checkout/route.ts`
- Modify: `lib/billing/mercadopago.ts` (agregar `includeFreeTrial` param)

- [ ] **Step 1: Actualizar `createPreapproval` para soportar free_trial opcional**

En `lib/billing/mercadopago.ts`, ampliar la interfaz:

```ts
export interface CreatePreapprovalParams {
  orgId: string
  plan: PlanId
  payerEmail: string
  backUrl: string
  /** Si true, el preapproval incluye free_trial: {7 días}. Default: true para backward compat. */
  includeFreeTrial?: boolean
  /** Opcional: start_date ISO para reactivaciones. Si se pasa, MP no cobra antes de esta fecha. */
  startDate?: string
}
```

Y actualizar el body de la request:

```ts
export async function createPreapproval(params: CreatePreapprovalParams): Promise<PreapprovalResult> {
  const plan = PLANS[params.plan]
  if (!plan) throw new Error(`Plan inválido: ${params.plan}`)
  if (plan.priceArsMonthly === null || plan.contactSalesOnly) {
    throw new Error(`Plan ${params.plan} es contact-sales-only, no se puede crear preapproval`)
  }

  const includeFreeTrial = params.includeFreeTrial ?? true

  const autoRecurring: any = {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: plan.priceArsMonthly,
    currency_id: "ARS",
  }
  if (includeFreeTrial) {
    autoRecurring.free_trial = { frequency: 7, frequency_type: "days" }
  }
  if (params.startDate) {
    autoRecurring.start_date = params.startDate
  }

  const body = {
    reason: `Vibook — plan ${plan.name}`,
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

- [ ] **Step 2: Actualizar `/api/billing/checkout/route.ts`**

Cambiar el bloque que construye el backUrl + call a createPreapproval:

```ts
// Después del bloque de planDef + org fetch existente
if (org.mp_preapproval_id) {
  // Ya hay un preapproval — bloqueamos doble-checkout. El user debería ir a
  // /settings/subscription a gestionar el existente.
  return NextResponse.json(
    { error: "Ya tenés una suscripción activa. Gestionala desde Settings > Suscripción.", existing_preapproval: true },
    { status: 409 }
  )
}

const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
const appUrl = /^https?:\/\//i.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`
const backUrl = `${appUrl}/onboarding/billing/return`

try {
  new URL(backUrl)
} catch (err: any) {
  return NextResponse.json({ error: `Configuración inválida: ${rawAppUrl}` }, { status: 500 })
}

console.log("[checkout] MP preapproval request", { orgId, plan, payerEmail, backUrl, includeFreeTrial: !org.has_used_trial })

let preapproval
try {
  preapproval = await createPreapproval({
    orgId,
    plan,
    payerEmail,
    backUrl,
    includeFreeTrial: !org.has_used_trial,  // trial one-shot per tenant
  })
} catch (err: any) {
  const mpMsg = err?.message || String(err)
  console.error("checkout: MP createPreapproval failed", mpMsg)
  return NextResponse.json(
    { error: `MercadoPago rechazó el checkout: ${mpMsg}` },
    { status: 502 }
  )
}

// Marcamos has_used_trial=true aunque el user no complete el checkout. Evita
// exploit de cancelar el checkout a mitad y re-crearlo buscando otro trial.
await admin
  .from("organizations")
  .update({
    mp_preapproval_id: preapproval.id,
    has_used_trial: true,
  })
  .eq("id", orgId)

// Log del intento (sin cambios)
await admin.from("billing_events").insert({
  org_id: orgId,
  event_type: "CHECKOUT_INITIATED",
  external_id: preapproval.id,
  amount_cents: (planDef.priceArsMonthly ?? 0) * 100,
  currency: "ARS",
  status: preapproval.status,
  payload: {
    plan,
    init_point: preapproval.init_point,
    payer_email: payerEmail,
    initiated_by_user_id: user.id,
    included_free_trial: !org.has_used_trial,
  },
})

return NextResponse.json({ init_point: preapproval.init_point, preapproval_id: preapproval.id })
```

- [ ] **Step 3: Ampliar el select inicial de org para traer has_used_trial**

En la query `.select("id, name, billing_email, plan, subscription_status, mp_preapproval_id")` agregar `has_used_trial`:

```ts
const { data: org } = await admin
  .from("organizations")
  .select("id, name, billing_email, plan, subscription_status, mp_preapproval_id, has_used_trial")
  .eq("id", orgId)
  .single()
```

### Task 3.5: Register form redirige al paywall

**Files:**
- Modify: `components/register-form.tsx` (lines 89-107, bloque del `if (wantsPro)`)

- [ ] **Step 1: Reemplazar el bloque de checkout directo**

Encontrar el `if (wantsPro) { ... }` en el onSubmit y reemplazarlo con:

```tsx
// Post-signup: siempre al paywall. wantsPro se conserva solo para telemetría
// (saber qué plan quería el user según el CTA). El paywall le muestra los
// planes y lanza el checkout real cuando aprieta "Elegir este plan".
router.refresh()
router.push("/onboarding/billing")
return
```

Eliminar la constante `wantsPro` si queda huérfana o dejar solo un console.log para telemetría futura.

### Task 3.6: Commit Fase 3

- [ ] **Step 1: Commit**

```bash
git add app/onboarding app/api/billing/status \
        app/api/billing/checkout/route.ts \
        lib/billing/mercadopago.ts \
        components/register-form.tsx \
        app/api/auth/logout
git commit -m "$(cat <<'EOF'
paywall: /onboarding/billing + checkout con free_trial + register flow

- /onboarding/billing: paywall full-screen con PlanCard (PRO, Enterprise)
- /onboarding/billing/return: polling a /api/billing/status post-MP
- GET /api/billing/status: datos para el polling
- /api/billing/checkout: agrega free_trial condicional (has_used_trial=false),
  setea has_used_trial=true post-create, 409 si ya hay preapproval activo,
  back_url apunta a /onboarding/billing/return
- lib/billing/mercadopago.ts: createPreapproval acepta includeFreeTrial y startDate
- register-form.tsx: después del signup → /onboarding/billing (en vez de
  llamar checkout directo — ahora lo decide el user en la pantalla)
- Auth /logout route si faltaba

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Webhook hardening + state machine

**Objetivo:** Refactor del webhook MP con state machine explícita, idempotencia, firma estricta en prod, y manejo de `subscription_authorized_payment` (pagos individuales, hoy ignorados).

### Task 4.1: Tests de state machine

**Files:**
- Create: `lib/billing/state-machine.test.ts`

- [ ] **Step 1: Escribir tests de `transitionFromMP`**

```ts
// lib/billing/state-machine.test.ts
import { transitionFromMP, type MPPreapproval, type MPPaymentEvent } from "./state-machine"

function mp(overrides: Partial<MPPreapproval>): MPPreapproval {
  return {
    id: "pa_test",
    status: "authorized",
    external_reference: "org_1",
    last_modified: "2026-04-21T10:00:00Z",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 119000,
      currency_id: "ARS",
    },
    next_payment_date: "2026-05-21T10:00:00Z",
    ...overrides,
  }
}

describe("transitionFromMP", () => {
  it("pending → PENDING_PAYMENT", () => {
    const out = transitionFromMP(mp({ status: "pending" }))
    expect(out.subscription_status).toBe("PENDING_PAYMENT")
    expect(out.current_period_ends_at).toBeNull()
  })

  it("authorized with free_trial → TRIALING with trial_ends_at", () => {
    const out = transitionFromMP(mp({
      status: "authorized",
      auto_recurring: {
        frequency: 1, frequency_type: "months",
        transaction_amount: 119000, currency_id: "ARS",
        free_trial: { frequency: 7, frequency_type: "days" },
      },
      next_payment_date: "2026-04-28T10:00:00Z", // día 8
    }))
    expect(out.subscription_status).toBe("TRIALING")
    expect(out.current_period_ends_at).toBe("2026-04-28T10:00:00Z")
  })

  it("authorized without free_trial + approved payment → ACTIVE", () => {
    const out = transitionFromMP(
      mp({ status: "authorized" }),
      { type: "subscription_authorized_payment", status: "approved" } as MPPaymentEvent
    )
    expect(out.subscription_status).toBe("ACTIVE")
    expect(out.current_period_ends_at).toBe("2026-05-21T10:00:00Z")
  })

  it("authorized + rejected payment → PAST_DUE", () => {
    const out = transitionFromMP(
      mp({ status: "authorized" }),
      { type: "subscription_authorized_payment", status: "rejected" } as MPPaymentEvent
    )
    expect(out.subscription_status).toBe("PAST_DUE")
  })

  it("paused → PAST_DUE", () => {
    const out = transitionFromMP(mp({ status: "paused" }))
    expect(out.subscription_status).toBe("PAST_DUE")
  })

  it("cancelled freezes current_period_ends_at to preserved value", () => {
    const out = transitionFromMP(mp({ status: "cancelled" }), undefined, {
      preserved_current_period_ends_at: "2026-05-21T10:00:00Z",
    })
    expect(out.subscription_status).toBe("CANCELLED")
    expect(out.current_period_ends_at).toBe("2026-05-21T10:00:00Z")
  })

  it("cancelled with no preserved date keeps null", () => {
    const out = transitionFromMP(mp({ status: "cancelled" }))
    expect(out.subscription_status).toBe("CANCELLED")
    expect(out.current_period_ends_at).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx jest lib/billing/state-machine.test.ts`
Expected: FAIL — module not found

### Task 4.2: Implementar state machine

**Files:**
- Create: `lib/billing/state-machine.ts`

- [ ] **Step 1: Escribir la implementación**

```ts
// lib/billing/state-machine.ts
/**
 * State machine MP preapproval → organizations.subscription_status.
 *
 * Función pura. Recibe el estado actual de MP (preapproval + último payment event)
 * y devuelve los valores que hay que escribir en la DB. Idempotente por construcción.
 *
 * Llamada desde el webhook y desde el cron de reconciliación.
 */

export interface MPAutoRecurring {
  frequency: number
  frequency_type: string
  transaction_amount: number
  currency_id: string
  free_trial?: { frequency: number; frequency_type: string }
  start_date?: string
  end_date?: string
}

export interface MPPreapproval {
  id: string
  status: "pending" | "authorized" | "paused" | "cancelled" | "finished" | string
  external_reference: string
  last_modified: string
  auto_recurring: MPAutoRecurring
  next_payment_date?: string | null
}

export interface MPPaymentEvent {
  type: "subscription_authorized_payment"
  status: "approved" | "rejected" | "pending" | string
  transaction_amount?: number
}

export interface TransitionContext {
  /** Si es un cancelled, pasar el current_period_ends_at actual de la DB
   *  para freezearlo (sino queda null). */
  preserved_current_period_ends_at?: string | null
}

export interface TransitionResult {
  subscription_status:
    | "PENDING_PAYMENT" | "TRIALING" | "ACTIVE"
    | "PAST_DUE" | "CANCELLED" | "SUSPENDED"
  current_period_ends_at: string | null
  /** Evento a loggear en billing_events (además del raw webhook). */
  event_type: string | null
}

export function transitionFromMP(
  preapproval: MPPreapproval,
  paymentEvent?: MPPaymentEvent,
  ctx?: TransitionContext
): TransitionResult {
  const mpStatus = preapproval.status

  if (mpStatus === "pending") {
    return {
      subscription_status: "PENDING_PAYMENT",
      current_period_ends_at: null,
      event_type: "SUBSCRIPTION_CREATED",
    }
  }

  if (mpStatus === "authorized") {
    const hasActiveFreeTrial = hasActiveFreeTrialPeriod(preapproval)

    if (paymentEvent?.type === "subscription_authorized_payment") {
      if (paymentEvent.status === "rejected") {
        return {
          subscription_status: "PAST_DUE",
          current_period_ends_at: ctx?.preserved_current_period_ends_at ?? null,
          event_type: "PAYMENT_REJECTED",
        }
      }
      if (paymentEvent.status === "approved") {
        return {
          subscription_status: "ACTIVE",
          current_period_ends_at: preapproval.next_payment_date ?? null,
          event_type: "PAYMENT_APPROVED",
        }
      }
      // pending o desconocido: mantener estado actual (no transicionar)
      return {
        subscription_status: hasActiveFreeTrial ? "TRIALING" : "ACTIVE",
        current_period_ends_at: preapproval.next_payment_date ?? null,
        event_type: null,
      }
    }

    // Sin paymentEvent: solo status del preapproval
    if (hasActiveFreeTrial) {
      return {
        subscription_status: "TRIALING",
        current_period_ends_at: preapproval.next_payment_date ?? null,
        event_type: "SUBSCRIPTION_AUTHORIZED",
      }
    }
    return {
      subscription_status: "ACTIVE",
      current_period_ends_at: preapproval.next_payment_date ?? null,
      event_type: "SUBSCRIPTION_AUTHORIZED",
    }
  }

  if (mpStatus === "paused") {
    return {
      subscription_status: "PAST_DUE",
      current_period_ends_at: ctx?.preserved_current_period_ends_at ?? null,
      event_type: "SUBSCRIPTION_PAUSED",
    }
  }

  if (mpStatus === "cancelled" || mpStatus === "finished") {
    return {
      subscription_status: "CANCELLED",
      current_period_ends_at: ctx?.preserved_current_period_ends_at ?? null,
      event_type: mpStatus === "cancelled" ? "SUBSCRIPTION_CANCELLED" : "SUBSCRIPTION_FINISHED",
    }
  }

  // Estado desconocido: no transicionamos. Logeamos para investigar.
  console.warn("[state-machine] unknown MP status", mpStatus)
  return {
    subscription_status: "PAST_DUE",  // conservador: flag como "algo raro pasó"
    current_period_ends_at: ctx?.preserved_current_period_ends_at ?? null,
    event_type: null,
  }
}

/**
 * Indica si el preapproval todavía está en su período de trial gratis.
 *
 * Heurística: si auto_recurring.free_trial existe y next_payment_date es futuro
 * respecto a "suficientemente cerca del free_trial desde el primer authorized",
 * estamos en trial. En la práctica, confiamos en que si MP todavía no intentó
 * cobrar y free_trial está presente, estamos en trial.
 */
function hasActiveFreeTrialPeriod(p: MPPreapproval): boolean {
  if (!p.auto_recurring.free_trial) return false
  if (!p.next_payment_date) return false
  // Si next_payment_date es futuro Y el preapproval está authorized, asumimos trial.
  // (MP solo devuelve next_payment_date futura cuando está en free trial; una vez
  // que cobró, next_payment_date es el próximo mes).
  // Esta heurística podría necesitar refinamiento con datos reales — ver checklist
  // E2E en Fase 8.
  return new Date(p.next_payment_date).getTime() > Date.now()
}
```

- [ ] **Step 2: Run tests, verify pass**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npx jest lib/billing/state-machine.test.ts`
Expected: PASS (7 tests)

### Task 4.3: Refactor webhook

**Files:**
- Modify: `app/api/billing/mp-webhook/route.ts`

- [ ] **Step 1: Reemplazar el handler con la state machine**

Reemplazar el contenido del archivo con:

```ts
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { fetchPreapproval, verifyWebhookSignature } from "@/lib/billing/mercadopago"
import { transitionFromMP, type MPPaymentEvent, type MPPreapproval } from "@/lib/billing/state-machine"

export async function POST(request: Request) {
  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")
  const url = new URL(request.url)
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id")
  const type = url.searchParams.get("type") || url.searchParams.get("topic")

  const bodyText = await request.text()
  let body: any = {}
  try { body = bodyText ? JSON.parse(bodyText) : {} } catch {}

  const resolvedId = dataId || body?.data?.id || body?.id || null

  // 1. Firma
  const signatureOk = verifyWebhookSignature({
    xSignature,
    xRequestId,
    dataId: resolvedId ? String(resolvedId) : null,
  })
  if (!signatureOk) {
    console.warn("mp-webhook: firma inválida", { dataId: resolvedId, type })
    return NextResponse.json({ error: "invalid signature" }, { status: 401 })
  }

  const admin = createAdminClient() as any

  // 2. Persistir raw event (audit, idempotente por UNIQUE(external_id, event_type))
  const eventType = typeToEventType(type)
  const { error: rawErr, data: rawInsert } = await admin
    .from("billing_events")
    .insert({
      event_type: eventType,
      external_id: resolvedId ? String(resolvedId) : null,
      payload: { type, body, query: Object.fromEntries(url.searchParams) },
    })
    .select("id")
    .single()

  // Si ON CONFLICT por idx_billing_events_idempotency → ya procesado, OK
  if (rawErr?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // 3. Procesar solo tipos relevantes
  if (!resolvedId || !(type === "preapproval" || type === "subscription_preapproval" || type === "subscription_authorized_payment")) {
    return NextResponse.json({ ok: true, event_id: rawInsert?.id })
  }

  // 4. Fetch estado fresco
  let preapproval: any
  let paymentEvent: MPPaymentEvent | undefined
  try {
    if (type === "subscription_authorized_payment") {
      // El dataId es el payment_id, no el preapproval_id. Lo resolvemos desde el body.
      // Alternativa: fetchear el payment de MP para obtener preapproval_id.
      const preapprovalId = body?.preapproval_id || body?.data?.preapproval_id
      if (!preapprovalId) {
        console.warn("mp-webhook: subscription_authorized_payment sin preapproval_id")
        return NextResponse.json({ ok: true, warning: "missing preapproval_id" })
      }
      preapproval = await fetchPreapproval(String(preapprovalId))
      paymentEvent = {
        type: "subscription_authorized_payment",
        status: body?.status || "pending",
      }
    } else {
      preapproval = await fetchPreapproval(String(resolvedId))
    }
  } catch (err: any) {
    console.error("mp-webhook: fetch failed", err?.message || err)
    return NextResponse.json({ ok: true, warning: "fetch failed" })
  }

  const orgId = preapproval.external_reference as string | undefined
  if (!orgId) {
    return NextResponse.json({ ok: true, warning: "no external_reference" })
  }

  // 5. Idempotencia por last_modified
  const { data: org } = await admin
    .from("organizations")
    .select("id, subscription_status, current_period_ends_at, mp_last_synced_at")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ ok: true, warning: "org not found" })

  if (org.mp_last_synced_at && preapproval.last_modified) {
    if (new Date(org.mp_last_synced_at).getTime() >= new Date(preapproval.last_modified).getTime()) {
      return NextResponse.json({ ok: true, stale: true })
    }
  }

  // 6. Aplicar transición
  const transition = transitionFromMP(
    preapproval as MPPreapproval,
    paymentEvent,
    { preserved_current_period_ends_at: org.current_period_ends_at }
  )

  const updates: Record<string, any> = {
    subscription_status: transition.subscription_status,
    mp_last_synced_at: preapproval.last_modified,
  }
  // current_period_ends_at: solo actualizamos si la transición dio un valor
  // (el freeze para CANCELLED ya viene con el valor preserved).
  if (transition.current_period_ends_at !== undefined) {
    updates.current_period_ends_at = transition.current_period_ends_at
  }

  await admin.from("organizations").update(updates).eq("id", orgId)

  if (transition.event_type) {
    await admin.from("billing_events").insert({
      org_id: orgId,
      event_type: transition.event_type,
      external_id: String(resolvedId),
      amount_cents: preapproval.auto_recurring?.transaction_amount
        ? Math.round(preapproval.auto_recurring.transaction_amount * 100)
        : null,
      currency: preapproval.auto_recurring?.currency_id ?? null,
      status: preapproval.status,
      payload: { preapproval, payment_event: paymentEvent },
    })
  }

  return NextResponse.json({
    ok: true,
    event_id: rawInsert?.id,
    applied_status: transition.subscription_status,
  })
}

function typeToEventType(type: string | null): string {
  switch (type) {
    case "subscription_preapproval": return "MP_WEBHOOK_PREAPPROVAL"
    case "subscription_authorized_payment": return "MP_WEBHOOK_PAYMENT"
    case "preapproval": return "MP_WEBHOOK_PREAPPROVAL"
    default: return "MP_WEBHOOK"
  }
}
```

### Task 4.4: Hardening de firma

**Files:**
- Modify: `lib/billing/mercadopago.ts` (función `verifyWebhookSignature`)

- [ ] **Step 1: Rechazar webhooks sin secret en producción**

Reemplazar la función existente:

```ts
export function verifyWebhookSignature(params: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
}): boolean {
  const secret = mpWebhookSecret()
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "MP webhook rejected: MERCADOPAGO_WEBHOOK_SECRET no configurado en producción"
      )
      return false
    }
    console.warn("MP webhook secret no configurado — dev mode, acepta sin verificar")
    return true
  }
  if (!params.xSignature || !params.dataId) return false

  const parts = Object.fromEntries(
    params.xSignature.split(",").map((p) => {
      const [k, v] = p.split("=")
      return [k?.trim(), v?.trim()]
    })
  )
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  const manifest = `id:${params.dataId};request-id:${params.xRequestId ?? ""};ts:${ts};`
  const hmac = createHmac("sha256", secret).update(manifest).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(v1))
  } catch {
    return false
  }
}
```

### Task 4.5: Commit Fase 4

- [ ] **Step 1: Commit**

```bash
git add lib/billing/state-machine.ts lib/billing/state-machine.test.ts \
        app/api/billing/mp-webhook/route.ts lib/billing/mercadopago.ts
git commit -m "$(cat <<'EOF'
billing: state machine idempotente + webhook hardening

- lib/billing/state-machine.ts: transitionFromMP(preapproval, paymentEvent, ctx)
  fuente única de verdad para el mapeo MP → subscription_status.
  7 unit tests cubriendo todas las transiciones.
- app/api/billing/mp-webhook/route.ts: refactor usando state machine.
  Maneja subscription_authorized_payment (antes ignorado). Idempotencia
  por last_modified + UNIQUE de billing_events. Persistencia raw garantizada.
- verifyWebhookSignature: rechaza en producción si MERCADOPAGO_WEBHOOK_SECRET
  no está configurado (antes aceptaba con warning).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Cancel / Reactivate / Update card

**Objetivo:** Endpoints de autogestión. `POST /api/billing/cancel`, `POST /api/billing/reactivate` (usa la alternativa simplificada: redirige al checkout con `start_date` calculado), `GET /api/billing/update-card-link` (resuelve URL de MP).

### Task 5.1: Helper `cancelPreapproval` hardening

**Files:**
- Modify: `lib/billing/mercadopago.ts` (ya existe `cancelPreapproval`)

- [ ] **Step 1: Verificar que la función existente devuelve info útil**

Abrir `lib/billing/mercadopago.ts` y verificar `cancelPreapproval`. Si no devuelve el preapproval post-cancel, modificarlo:

```ts
export async function cancelPreapproval(preapprovalId: string): Promise<any> {
  const res = await fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "cancelled" }),
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`MP cancel preapproval failed (${res.status}): ${text}`)
  }
  if (res.status === 404) return null  // ya no existe, OK
  return await res.json()
}
```

### Task 5.2: `POST /api/billing/cancel`

**Files:**
- Create: `app/api/billing/cancel/route.ts`

- [ ] **Step 1: Implementar endpoint**

```ts
// app/api/billing/cancel/route.ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { cancelPreapproval } from "@/lib/billing/mercadopago"

export async function POST() {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, subscription_status, mp_preapproval_id, current_period_ends_at, trial_ends_at")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 })

  if (org.subscription_status === "CANCELLED") {
    return NextResponse.json({ ok: true, already_cancelled: true })
  }

  if (!org.mp_preapproval_id) {
    // Sin preapproval activo — caso raro (PENDING_PAYMENT). Marcamos CANCELLED.
    await admin.from("organizations")
      .update({ subscription_status: "CANCELLED" })
      .eq("id", user.org_id)
    return NextResponse.json({ ok: true, no_mp_preapproval: true })
  }

  // Cancelar en MP (PUT status=cancelled)
  try {
    await cancelPreapproval(org.mp_preapproval_id)
  } catch (err: any) {
    console.error("cancel: MP failed", err?.message)
    return NextResponse.json(
      { error: `No se pudo cancelar en MercadoPago: ${err?.message}` },
      { status: 502 }
    )
  }

  // Calcular current_period_ends_at para freezear:
  //   TRIALING: usamos trial_ends_at
  //   ACTIVE: ya está en current_period_ends_at (next_payment_date de MP)
  //   PAST_DUE: current_period_ends_at congelado (ya está)
  const frozenPeriodEnd =
    org.subscription_status === "TRIALING" && org.trial_ends_at
      ? org.trial_ends_at
      : org.current_period_ends_at

  await admin
    .from("organizations")
    .update({
      subscription_status: "CANCELLED",
      current_period_ends_at: frozenPeriodEnd,
    })
    .eq("id", user.org_id)

  await admin.from("billing_events").insert({
    org_id: user.org_id,
    event_type: "SUBSCRIPTION_CANCELLED_BY_USER",
    external_id: org.mp_preapproval_id,
    payload: {
      cancelled_by_user_id: user.id,
      previous_status: org.subscription_status,
      frozen_period_end: frozenPeriodEnd,
    },
  })

  return NextResponse.json({
    ok: true,
    current_period_ends_at: frozenPeriodEnd,
  })
}
```

### Task 5.3: `POST /api/billing/reactivate` (alternativa simplificada)

**Decisión tomada:** implementamos la alternativa simplificada del spec 5.5 — el endpoint siempre redirige al checkout. La lógica de `start_date` va dentro de `/api/billing/checkout` (ya tiene has_used_trial, solo le agregamos start_date cuando corresponde).

**Files:**
- Create: `app/api/billing/reactivate/route.ts`
- Modify: `app/api/billing/checkout/route.ts` (para soportar start_date en reactivación)

- [ ] **Step 1: Modificar `/api/billing/checkout` para aceptar `{reactivate: true}`**

Al inicio del handler, después de `const plan = body.plan`:

```ts
const isReactivation = body.reactivate === true
```

Cuando detectemos reactivación, antes del guard de `org.mp_preapproval_id`:

```ts
if (isReactivation) {
  // Permitimos volver a crear preapproval si el anterior está CANCELLED
  if (org.subscription_status !== "CANCELLED") {
    return NextResponse.json(
      { error: "Solo se puede reactivar una suscripción cancelada" },
      { status: 400 }
    )
  }
  // El mp_preapproval_id viejo lo ignoramos — MP ya lo cerró.
} else if (org.mp_preapproval_id) {
  return NextResponse.json(
    { error: "Ya tenés una suscripción activa...", existing_preapproval: true },
    { status: 409 }
  )
}
```

Y calcular `startDate` para la reactivación:

```ts
let startDate: string | undefined = undefined
if (isReactivation && org.current_period_ends_at) {
  const periodEnd = new Date(org.current_period_ends_at)
  if (periodEnd.getTime() > Date.now()) {
    // Usuario todavía tiene período pagado. MP no cobra hasta esa fecha.
    const startDateObj = new Date(periodEnd.getTime() + 86400_000) // +1 día
    startDate = startDateObj.toISOString()
  }
}
```

Pasar `startDate` al `createPreapproval`:

```ts
preapproval = await createPreapproval({
  orgId,
  plan,
  payerEmail,
  backUrl,
  includeFreeTrial: !org.has_used_trial,
  startDate,
})
```

Y en el update post-create, si es reactivación, pasar `subscription_status = PENDING_PAYMENT` (hasta que MP confirme):

```ts
await admin.from("organizations").update({
  mp_preapproval_id: preapproval.id,
  has_used_trial: true,
  ...(isReactivation ? { subscription_status: "PENDING_PAYMENT" } : {}),
}).eq("id", orgId)
```

- [ ] **Step 2: Crear `/api/billing/reactivate/route.ts`**

```ts
// app/api/billing/reactivate/route.ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

export async function POST() {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, subscription_status, plan")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 })
  if (org.subscription_status !== "CANCELLED") {
    return NextResponse.json(
      { error: "Solo podés reactivar una suscripción cancelada" },
      { status: 400 }
    )
  }

  // Redirige al checkout con flag de reactivación. El checkout calcula
  // el start_date correcto y crea un preapproval nuevo.
  // El frontend recibe init_point y redirige a MP como en el checkout normal.
  const checkoutRes = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"}/api/billing/checkout`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // forwarear la cookie de auth para que getCurrentUser funcione en el call
        "Cookie": "", // TODO: resolver forwarding de auth si esto no funciona server-side
      },
      body: JSON.stringify({ plan: org.plan, reactivate: true }),
    }
  )
  const data = await checkoutRes.json()
  if (!checkoutRes.ok) {
    return NextResponse.json({ error: data.error || "reactivation failed" }, { status: checkoutRes.status })
  }

  return NextResponse.json(data)
}
```

**Nota:** el chaining server→server en Next.js es filoso. Alternativa más limpia: el frontend hace directamente POST a `/api/billing/checkout` con `{plan, reactivate: true}` desde el `reactivate-dialog`. En ese caso no hace falta `/api/billing/reactivate/route.ts` en absoluto. Decidir durante implementación: si es fácil forwardear la cookie, dejarlo como wrapper; si no, eliminar este endpoint y hacer el call directo desde el cliente.

### Task 5.4: `GET /api/billing/update-card-link`

**Files:**
- Create: `app/api/billing/update-card-link/route.ts`

- [ ] **Step 1: Implementar — investiga cuál URL de MP usar**

Durante testing sandbox, probar estas URLs para ver cuál abre el update-card de MP sin requerir cancelar:
1. `https://www.mercadopago.com.ar/subscriptions/{preapproval_id}`
2. `https://www.mercadopago.com.ar/subscriptions` (lista general)
3. El `init_point` del preapproval existente

Implementación inicial apunta al preapproval específico; si no funciona, fallback al link general:

```ts
// app/api/billing/update-card-link/route.ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("mp_preapproval_id")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org?.mp_preapproval_id) {
    return NextResponse.json({ error: "no preapproval" }, { status: 404 })
  }

  // URL canónica per docs de MP — abre el panel del user para esa suscripción
  const url = `https://www.mercadopago.com.ar/subscriptions/${org.mp_preapproval_id}`

  return NextResponse.json({ url })
}
```

### Task 5.5: Commit Fase 5

- [ ] **Step 1: Commit**

```bash
git add app/api/billing/cancel app/api/billing/reactivate app/api/billing/update-card-link \
        lib/billing/mercadopago.ts app/api/billing/checkout/route.ts
git commit -m "$(cat <<'EOF'
billing: cancel, reactivate, update-card endpoints

- POST /api/billing/cancel: PUT MP status=cancelled, freeze current_period_ends_at,
  log billing_events SUBSCRIPTION_CANCELLED_BY_USER. OWNER/SUPER_ADMIN only.
- /api/billing/checkout: acepta {reactivate: true} — permite re-checkout para
  orgs CANCELLED. Si current_period_ends_at futuro, pasa start_date a MP para
  no cobrar doble.
- POST /api/billing/reactivate: wrapper que re-llama checkout con reactivate=true.
- GET /api/billing/update-card-link: devuelve URL de MP para gestionar tarjeta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Subscription page refactor

**Objetivo:** `/settings/subscription` se convierte en el panel de autogestión descrito en el spec sección 4.2. Estado grande, método de pago, plan, historial, zona peligrosa. Banner global en `/dashboard`.

### Task 6.1: `<SubscriptionBanner />` en dashboard layout

**Files:**
- Create: `components/billing/subscription-banner.tsx`
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Crear el banner**

```tsx
// components/billing/subscription-banner.tsx
import Link from "next/link"
import { formatDate } from "@/lib/utils"

interface Props {
  subscription_status: string
  current_period_ends_at: string | null
  trial_ends_at: string | null
}

function fmt(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "long", year: "numeric"
  })
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function SubscriptionBanner({ subscription_status, current_period_ends_at, trial_ends_at }: Props) {
  if (subscription_status === "PAST_DUE") {
    return (
      <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-sm flex items-center justify-between">
        <span className="text-red-900">
          ⚠️ No pudimos cobrar tu última cuota. Actualizá tu medio de pago para no perder el acceso.
        </span>
        <Link href="/settings/subscription" className="text-red-700 underline font-medium">
          Actualizar tarjeta
        </Link>
      </div>
    )
  }

  if (subscription_status === "CANCELLED" && current_period_ends_at && new Date(current_period_ends_at).getTime() > Date.now()) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 text-sm flex items-center justify-between">
        <span className="text-blue-900">
          Tu suscripción está cancelada. Mantenés acceso hasta el {fmt(current_period_ends_at)}.
        </span>
        <Link href="/settings/subscription" className="text-blue-700 underline font-medium">
          Reactivar
        </Link>
      </div>
    )
  }

  if (subscription_status === "TRIALING" && trial_ends_at) {
    const days = daysUntil(trial_ends_at)
    if (days !== null && days <= 2) {
      return (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 text-sm">
          Primer cobro el {fmt(trial_ends_at)} — ¡quedan {days} {days === 1 ? "día" : "días"}!
        </div>
      )
    }
    return (
      <div className="bg-green-50 border-b border-green-200 px-6 py-3 text-sm">
        Estás en período de prueba durante 7 días hasta el {fmt(trial_ends_at)}.
      </div>
    )
  }

  return null
}
```

- [ ] **Step 2: Integrarlo en el layout del dashboard**

En `app/(dashboard)/layout.tsx`, tras `assertSubscriptionActive()`, cargar los datos del banner y renderizarlo:

```tsx
import { SubscriptionBanner } from "@/components/billing/subscription-banner"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

// Dentro del layout, después de assertSubscriptionActive:
const { user } = await getCurrentUser()
const admin = createAdminClient() as any
const { data: orgForBanner } = await admin
  .from("organizations")
  .select("subscription_status, current_period_ends_at, trial_ends_at")
  .eq("id", user.org_id)
  .maybeSingle()

// En el JSX, justo después del header y antes del contenido:
{orgForBanner && <SubscriptionBanner {...orgForBanner} />}
```

### Task 6.2: Dialogs (cancel + reactivate)

**Files:**
- Create: `components/billing/cancel-dialog.tsx`
- Create: `components/billing/reactivate-dialog.tsx`

Implementar los dos dialogs primero — la page.tsx de Task 6.4 los importa.

- [ ] **Step 1: Crear `cancel-dialog.tsx`**

Ver el código completo en la sección "Task 6.3 (legacy): Dialog de cancelación" más abajo en este plan — ese código va acá. (Nota: durante una re-ordenación del plan, quedaron secciones `Task 6.3: Dialog de cancelación` y `Task 6.4: Dialog de reactivación` como duplicados más abajo; usar ese código acá y skip esas secciones legacy al ejecutar.)

- [ ] **Step 2: Crear `reactivate-dialog.tsx`**

Ver código en "Task 6.4 (legacy): Dialog de reactivación" más abajo.

- [ ] **Step 3: Verificar compila**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(cancel-dialog|reactivate-dialog)" || echo OK`
Expected: OK

### Task 6.3: Components (payment method + history)

**Files:**
- Create: `components/billing/payment-method-card.tsx`
- Create: `components/billing/billing-history-table.tsx`

- [ ] **Step 1: Crear `payment-method-card.tsx`**

```tsx
// components/billing/payment-method-card.tsx
"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Props {
  paymentMethodId: string | null    // de preapproval MP
  cardLastFour: string | null       // último 4 si lo tenemos (lo fetcheamos server-side si MP lo expone)
  cardHolder: string | null
  hasActivePreapproval: boolean
}

export function PaymentMethodCard({ paymentMethodId, cardLastFour, cardHolder, hasActivePreapproval }: Props) {
  async function openUpdateCard() {
    const res = await fetch("/api/billing/update-card-link")
    if (!res.ok) return alert("No se pudo generar el link de MercadoPago")
    const { url } = await res.json()
    window.open(url, "_blank", "noopener,noreferrer")
  }

  if (!hasActivePreapproval) {
    return (
      <Card>
        <CardHeader><CardTitle>Método de pago</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Todavía no configuraste un método de pago.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle>Método de pago</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl">💳</div>
          <div>
            <div className="font-medium">
              {paymentMethodId || "Tarjeta"} {cardLastFour ? `••••${cardLastFour}` : ""}
            </div>
            {cardHolder && <div className="text-sm text-muted-foreground">{cardHolder}</div>}
          </div>
        </div>
        <Button variant="outline" onClick={openUpdateCard}>Cambiar tarjeta</Button>
        <p className="text-xs text-muted-foreground">
          🔒 Tu tarjeta se guarda en Mercado Pago con cifrado PCI. Nunca vemos los datos completos.
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Crear `billing-history-table.tsx`**

```tsx
// components/billing/billing-history-table.tsx
interface Event {
  id: string
  created_at: string
  event_type: string
  amount_cents: number | null
  currency: string | null
  status: string | null
}

const LABELS: Record<string, string> = {
  CHECKOUT_INITIATED: "Checkout iniciado",
  SUBSCRIPTION_AUTHORIZED: "Suscripción autorizada",
  PAYMENT_APPROVED: "Cobro aprobado",
  PAYMENT_REJECTED: "Cobro rechazado",
  SUBSCRIPTION_CANCELLED: "Suscripción cancelada",
  SUBSCRIPTION_CANCELLED_BY_USER: "Cancelada por vos",
  SUBSCRIPTION_PAUSED: "Suscripción pausada",
}

export function BillingHistoryTable({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay movimientos todavía.</p>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-xs uppercase text-muted-foreground">
          <th className="text-left py-2">Fecha</th>
          <th className="text-left py-2">Evento</th>
          <th className="text-right py-2">Monto</th>
          <th className="text-left py-2 pl-4">Estado</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="border-b last:border-0">
            <td className="py-2">{new Date(e.created_at).toLocaleDateString("es-AR")}</td>
            <td>{LABELS[e.event_type] || e.event_type}</td>
            <td className="text-right">
              {e.amount_cents != null
                ? `$${(e.amount_cents / 100).toLocaleString("es-AR")} ${e.currency || ""}`
                : "—"}
            </td>
            <td className="pl-4">{e.status || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 3: Refactor page.tsx**

Reemplazar `app/(dashboard)/settings/subscription/page.tsx` con:

```tsx
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PLANS, formatArs, type PlanId } from "@/lib/billing/plans"
import { PaymentMethodCard } from "@/components/billing/payment-method-card"
import { BillingHistoryTable } from "@/components/billing/billing-history-table"
import { CancelDialog } from "@/components/billing/cancel-dialog"
import { ReactivateDialog } from "@/components/billing/reactivate-dialog"

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  TRIALING: "En prueba gratis",
  ACTIVE: "Activo",
  PAST_DUE: "Cobro pendiente",
  CANCELLED: "Cancelado",
  SUSPENDED: "Suspendido",
  TRIAL: "En prueba (legacy)",
}

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING_PAYMENT: "outline",
  TRIALING: "secondary",
  ACTIVE: "default",
  PAST_DUE: "destructive",
  CANCELLED: "outline",
  SUSPENDED: "destructive",
  TRIAL: "secondary",
}

function fmt(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>
}) {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")

  const { checkout, error: errorParam } = await searchParams
  const checkoutFailed = checkout === "failed"
  const checkoutError = errorParam ? decodeURIComponent(errorParam) : null

  if (!user.org_id) {
    return <div className="p-6">No tenés organización asociada.</div>
  }

  const supabase = await createServerClient()
  const { data: org } = await (supabase.from("organizations") as any)
    .select("*")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) return <div className="p-6">Org no encontrada.</div>

  const { data: events } = await (supabase.from("billing_events") as any)
    .select("id, created_at, event_type, amount_cents, currency, status")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(20)

  const plan = PLANS[org.plan as PlanId]
  const status = org.subscription_status
  const isCancelledWithAccess =
    status === "CANCELLED" &&
    org.current_period_ends_at &&
    new Date(org.current_period_ends_at).getTime() > Date.now()
  const canCancel = ["TRIALING", "ACTIVE", "PAST_DUE"].includes(status)
  const canReactivate = status === "CANCELLED"
  const hasActivePreapproval = !!org.mp_preapproval_id

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
        <p className="text-sm text-muted-foreground">Gestioná tu plan, método de pago y estado de la cuenta</p>
      </div>

      {checkoutFailed && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-red-900">El checkout con MercadoPago falló</p>
            {checkoutError && <p className="text-xs text-red-700 mt-1">{checkoutError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Estado actual */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Estado actual</CardTitle>
            <Badge variant={STATUS_TONE[status] || "outline"}>{STATUS_LABEL[status] || status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {status === "TRIALING" && (
            <p>Estás en período de prueba durante 7 días hasta el <strong>{fmt(org.trial_ends_at)}</strong>. Primer cobro ese día.</p>
          )}
          {status === "ACTIVE" && (
            <p>Próximo cobro: <strong>{fmt(org.current_period_ends_at)}</strong></p>
          )}
          {status === "PAST_DUE" && (
            <p className="text-red-700">No pudimos cobrar tu última cuota. Actualizá tu medio de pago antes del {fmt(org.current_period_ends_at)}.</p>
          )}
          {isCancelledWithAccess && (
            <p className="text-blue-700">Tu suscripción está cancelada. Acceso hasta el <strong>{fmt(org.current_period_ends_at)}</strong>.</p>
          )}
          {status === "CANCELLED" && !isCancelledWithAccess && (
            <p>Tu suscripción venció. Para volver a acceder, elegí un plan.</p>
          )}
        </CardContent>
      </Card>

      {/* Método de pago */}
      <PaymentMethodCard
        paymentMethodId={null}
        cardLastFour={null}
        cardHolder={null}
        hasActivePreapproval={hasActivePreapproval}
      />

      {/* Plan */}
      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>{plan.name}</CardTitle>
            <div className="text-2xl font-bold">
              {plan.priceArsMonthly !== null ? <>{formatArs(plan.priceArsMonthly)} <span className="text-sm font-normal text-muted-foreground">/mes</span></> : plan.priceLabel}
            </div>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {plan.features.map((f) => <li key={f}>• {f}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Historial */}
      <Card>
        <CardHeader><CardTitle>Historial de pagos</CardTitle></CardHeader>
        <CardContent>
          <BillingHistoryTable events={events || []} />
        </CardContent>
      </Card>

      {/* Zona peligrosa */}
      {(canCancel || canReactivate) && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">{canReactivate ? "Reactivar suscripción" : "Cancelar suscripción"}</CardTitle>
          </CardHeader>
          <CardContent>
            {canCancel && (
              <CancelDialog
                currentPeriodEndsAt={org.current_period_ends_at}
                trialEndsAt={org.trial_ends_at}
                status={status}
              />
            )}
            {canReactivate && (
              <ReactivateDialog
                plan={org.plan}
                currentPeriodEndsAt={org.current_period_ends_at}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

### Task 6.3 (legacy, código referenciado por Task 6.2): Dialog de cancelación

**Nota:** este bloque existe solo para proveer el código que Task 6.2 necesita.
Al ejecutar el plan, **implementar este código como parte de Task 6.2 step 1** y
**skip esta sección** como tarea separada.

**Files:**
- Create: `components/billing/cancel-dialog.tsx`

- [ ] **Step 1: Implementar dialog (código para Task 6.2)**

```tsx
// components/billing/cancel-dialog.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

function fmt(iso: string | null) {
  if (!iso) return "fin del período pagado"
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
}

export function CancelDialog({ currentPeriodEndsAt, trialEndsAt, status }: {
  currentPeriodEndsAt: string | null
  trialEndsAt: string | null
  status: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Para TRIALING, la fecha de corte de acceso es trial_ends_at.
  // Para ACTIVE/PAST_DUE, es current_period_ends_at.
  const cutoff = status === "TRIALING" ? trialEndsAt : currentPeriodEndsAt

  async function handleCancel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al cancelar")
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Cancelar suscripción</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Seguro que querés cancelar tu suscripción?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Mantenés acceso hasta el <strong>{fmt(cutoff)}</strong>.</p>
              <p>Después de esa fecha perderás acceso a:</p>
              <ul className="list-disc list-inside text-muted-foreground">
                <li>Todas tus operaciones y clientes</li>
                <li>CRM y pipeline de ventas</li>
                <li>Reportes y contabilidad</li>
                <li>WhatsApp integrado</li>
              </ul>
              <p className="text-green-700">
                Tu información NO se borra. Si volvés a suscribirte (antes o después),
                recuperás todo tal como lo dejaste.
              </p>
              {error && <p className="text-red-600">{error}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Mantener suscripción</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={handleCancel}
            className="bg-red-600 hover:bg-red-700"
          >
            {loading ? "Cancelando…" : "Sí, cancelar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

### Task 6.4 (legacy, código referenciado por Task 6.2): Dialog de reactivación

**Nota:** este bloque existe solo para proveer el código que Task 6.2 necesita.
Al ejecutar el plan, **implementar este código como parte de Task 6.2 step 2** y
**skip esta sección** como tarea separada.

**Files:**
- Create: `components/billing/reactivate-dialog.tsx`

- [ ] **Step 1: Implementar (código para Task 6.2)**

```tsx
// components/billing/reactivate-dialog.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function ReactivateDialog({ plan, currentPeriodEndsAt }: {
  plan: string
  currentPeriodEndsAt: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReactivate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, reactivate: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.init_point) throw new Error(data.error || "Reactivación falló")
      window.location.href = data.init_point
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const hasAccessRemaining = currentPeriodEndsAt && new Date(currentPeriodEndsAt).getTime() > Date.now()

  return (
    <div className="space-y-2">
      <p className="text-sm">
        {hasAccessRemaining
          ? `Mantenés acceso hasta el ${new Date(currentPeriodEndsAt!).toLocaleDateString("es-AR")}. Al reactivar, MercadoPago no te cobra hasta esa fecha.`
          : "Al reactivar, te pedimos ingresar tarjeta de nuevo y empezás a pagar desde el primer día."}
      </p>
      <Button onClick={handleReactivate} disabled={loading}>
        {loading ? "Procesando…" : "Reactivar suscripción"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
```

### Task 6.5: Commit Fase 6

- [ ] **Step 1: Commit**

```bash
git add components/billing app/\(dashboard\)/settings/subscription app/\(dashboard\)/layout.tsx
git commit -m "$(cat <<'EOF'
billing/settings: subscription panel refactor + banner

- /settings/subscription: refactor completo. Estado grande con fecha relevante,
  método de pago, plan, historial de pagos, zona peligrosa con cancel/reactivate.
- SubscriptionBanner: banner global en dashboard layout — PAST_DUE rojo,
  CANCELLED azul, TRIALING verde/amarillo según días restantes.
- CancelDialog, ReactivateDialog, PaymentMethodCard, BillingHistoryTable
  componentes nuevos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Cron de reconciliación

**Objetivo:** Safety net para webhooks perdidos. Corre 1x/día, fetchea todas las orgs activas, compara con MP, aplica transiciones si hay drift.

### Task 7.1: Endpoint cron

**Files:**
- Create: `app/api/cron/billing-reconcile/route.ts`

- [ ] **Step 1: Implementar**

```ts
// app/api/cron/billing-reconcile/route.ts
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { fetchPreapproval } from "@/lib/billing/mercadopago"
import { transitionFromMP, type MPPreapproval } from "@/lib/billing/state-machine"

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") || ""
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, subscription_status, current_period_ends_at, mp_preapproval_id, mp_last_synced_at")
    .in("subscription_status", ["TRIALING", "ACTIVE", "PAST_DUE"])
    .not("mp_preapproval_id", "is", null)

  const results: any[] = []
  for (const org of orgs || []) {
    try {
      const pa = await fetchPreapproval(org.mp_preapproval_id) as MPPreapproval
      const transition = transitionFromMP(pa, undefined, {
        preserved_current_period_ends_at: org.current_period_ends_at,
      })

      const drifted = transition.subscription_status !== org.subscription_status
      if (drifted) {
        await admin.from("organizations")
          .update({
            subscription_status: transition.subscription_status,
            current_period_ends_at: transition.current_period_ends_at ?? org.current_period_ends_at,
            mp_last_synced_at: pa.last_modified,
          })
          .eq("id", org.id)

        await admin.from("billing_events").insert({
          org_id: org.id,
          event_type: "RECONCILED",
          external_id: org.mp_preapproval_id,
          status: pa.status,
          payload: {
            previous_status: org.subscription_status,
            new_status: transition.subscription_status,
            preapproval: pa,
          },
        })
      }
      results.push({ orgId: org.id, drifted, from: org.subscription_status, to: transition.subscription_status })
    } catch (err: any) {
      console.error("reconcile failed for org", org.id, err?.message)
      results.push({ orgId: org.id, error: err?.message })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
```

### Task 7.2: Railway cron service (manual — pasar a Tomi)

- [ ] **Step 1: Instrucciones para Tomi**

Mensaje al chat:
> Fase 7 requiere setup manual en Railway. Te paso la config cuando lleguemos acá — es un cron service igual a los que ya tenés (ej. `cron-exchange-rates`). Command: `curl -X POST https://app.vibook.ai/api/cron/billing-reconcile -H "Authorization: Bearer $CRON_SECRET"`. Schedule: `0 3 * * *` (03:00 AR = 06:00 UTC). Env var requerida: `CRON_SECRET`.

### Task 7.3: Commit Fase 7

- [ ] **Step 1: Commit**

```bash
git add app/api/cron/billing-reconcile
git commit -m "billing: cron de reconciliación diaria

POST /api/cron/billing-reconcile: fetchea preapprovals de todas las orgs
activas, compara con DB, aplica transiciones si hay drift. Loggea
RECONCILED events. Safety net para webhooks MP perdidos.

Railway cron service a configurar: 0 3 * * * AR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 8: Sandbox + E2E testing

**Objetivo:** Configurar token sandbox de MP, correr checklist E2E del spec sección 9.

### Task 8.1: Soporte sandbox en `mercadopago.ts`

**Files:**
- Modify: `lib/billing/mercadopago.ts`
- Modify: `.env.example`

- [ ] **Step 1: Ampliar `mpAccessToken()`**

```ts
function mpAccessToken(): string {
  const useSandbox = process.env.MP_USE_SANDBOX === "true"
  if (useSandbox) {
    const v = process.env.MERCADOPAGO_ACCESS_TOKEN_SANDBOX
    if (!v) throw new Error("MP_USE_SANDBOX=true pero MERCADOPAGO_ACCESS_TOKEN_SANDBOX no está seteado")
    return v
  }
  const v = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN
  if (!v) {
    throw new Error("Env var MERCADOPAGO_ACCESS_TOKEN (o alias MP_ACCESS_TOKEN) requerida")
  }
  return v
}
```

- [ ] **Step 2: Actualizar `.env.example`**

Agregar al final:

```
# Opcional: sandbox MP para E2E testing sin cobrar tarjetas reales.
# Cuando MP_USE_SANDBOX=true, se usa MERCADOPAGO_ACCESS_TOKEN_SANDBOX en vez
# del token de producción. Test cards: https://www.mercadopago.com.ar/developers/es/docs/checkout-api/integration-test/test-cards
MERCADOPAGO_ACCESS_TOKEN_SANDBOX=
MP_USE_SANDBOX=false
```

- [ ] **Step 3: Commit**

```bash
git add lib/billing/mercadopago.ts .env.example
git commit -m "billing: soporte sandbox token MP para E2E

MP_USE_SANDBOX=true + MERCADOPAGO_ACCESS_TOKEN_SANDBOX permite testear
el flow completo (preapproval, webhook, cobro día 8) con tarjetas test
de MP sin cobrar tarjetas reales."
```

### Task 8.2: Checklist E2E happy path

- [ ] **Step 1: Configurar sandbox en Railway**

Pedir a Tomi que agregue `MERCADOPAGO_ACCESS_TOKEN_SANDBOX` y temporalmente `MP_USE_SANDBOX=true` en Railway. Deploy.

- [ ] **Step 2: Signup de prueba**

Ir a vibook.ai → "Comenzar gratis" → crear cuenta con email ficticio → llegar a `/onboarding/billing`.

- [ ] **Step 3: Elegir PRO**

Click "Elegir este plan" → redirect a MP sandbox → ingresar tarjeta `5031 7557 3453 0604`, CVV 123, cualquier fecha futura → autorizar.

- [ ] **Step 4: Verificar retorno**

MP redirige a `/onboarding/billing/return` → polling muestra "Procesando…" → al llegar el webhook, redirect a `/dashboard` con banner verde "Estás en período de prueba durante 7 días hasta el DD/MM".

- [ ] **Step 5: Verificar estado en `/settings/subscription`**

Badge "En prueba gratis" + fecha correcta + plan PRO + método de pago visible (Visa ••••0604 o lo que MP exponga) + historial con `CHECKOUT_INITIATED` y `SUBSCRIPTION_AUTHORIZED`.

### Task 8.3: Checklist cobro fallido

- [ ] **Step 1: Setup**

Repetir signup con tarjeta rechazo: titular `OTHE` → MP rechaza. El preapproval queda cancelled.

Alternativa para testing del day-8: usar el endpoint de MP `POST /preapproval/{id}/authorized_payments` con amount/status forzado, o esperar la expiración natural en sandbox (si MP lo simula).

- [ ] **Step 2: Verificar PAST_DUE**

Tras el rechazo: banner rojo en dashboard, `/settings/subscription` muestra PAST_DUE, CTA "Actualizar tarjeta".

- [ ] **Step 3: Actualizar tarjeta**

Click "Cambiar tarjeta" → abre MP panel → actualizar a tarjeta que aprueba → verificar que tras próxima retry MP, status vuelve a ACTIVE.

### Task 8.4: Checklist cancelar / reactivar

- [ ] **Step 1: Cancelar durante TRIALING**

Nueva cuenta TRIALING → `/settings/subscription` → "Cancelar suscripción" → confirmar dialog → status=CANCELLED + `current_period_ends_at = trial_ends_at`. Dashboard muestra banner azul.

- [ ] **Step 2: Reactivar antes de expiración**

Desde `/settings/subscription` (aún en CANCELLED con fecha futura) → "Reactivar suscripción" → ingresar tarjeta MP → verificar que el nuevo preapproval tiene `start_date = current_period_ends_at + 1día` (inspeccionar via MP API o billing_events) → status vuelve a TRIALING/ACTIVE.

- [ ] **Step 3: Reactivar después de expiración**

Simular fecha pasada (manualmente UPDATE `current_period_ends_at` vía SQL) → reactivar → MP cobra inmediato (sin trial) → ACTIVE al confirmar.

### Task 8.5: Bypass attempts

- [ ] **Step 1: Intentar acceder a /dashboard con PENDING_PAYMENT**

Como user recién creado: la URL `/dashboard` directa debe redirigir a `/onboarding/billing`.

- [ ] **Step 2: Intentar header bypass**

Request con `x-middleware-subrequest: middleware` a `/dashboard`:

```bash
curl -v "https://app.vibook.ai/dashboard" -H "Cookie: <auth>" -H "x-middleware-subrequest: middleware"
```

El middleware se bypassea, pero el server-side guard (`assertSubscriptionActive` en layout) debe redirigir igualmente. Expected: 302 a `/onboarding/billing`.

- [ ] **Step 3: Idempotencia webhook**

Simular MP reenviando mismo webhook (mismo `x-request-id`, mismo `dataId`):

```bash
curl -X POST 'https://app.vibook.ai/api/billing/mp-webhook?data.id=X&type=subscription_preapproval' \
  -H "x-signature: ..." -H "x-request-id: same-id"
```

Enviar 2x → segundo debe responder `{ok: true, duplicate: true}` sin modificar org.

### Task 8.6: Commit final + revert sandbox

- [ ] **Step 1: Documentar resultados del checklist**

Crear `docs/migration/paywall-e2e-results.md` con el resultado de cada caso (✅/❌ + notas).

- [ ] **Step 2: Revertir `MP_USE_SANDBOX` en Railway**

Pedir a Tomi que ponga `MP_USE_SANDBOX=false` para que producción vuelva a cobrar tarjetas reales.

- [ ] **Step 3: Commit de resultados**

```bash
git add docs/migration/paywall-e2e-results.md
git commit -m "docs: resultados E2E del paywall MP

Checklist ejecutado con MP_USE_SANDBOX=true. Todos los escenarios
del spec sección 9 verificados. Producción vuelta a MP_USE_SANDBOX=false."
```

---

## Notas finales

- Cada fase es un commit independiente que deja producción funcionando
- Fase 1 requiere que Tomi corra SQL en Supabase SQL Editor manualmente (está en chat)
- Fase 7 requiere que Tomi cree un Railway cron service manualmente
- Fase 8 requiere `MERCADOPAGO_ACCESS_TOKEN_SANDBOX` en Railway temporalmente
- El push a producción se hace solo con OK explícito de Tomi por cada fase (memoria `feedback_no_push_until_told.md`)
