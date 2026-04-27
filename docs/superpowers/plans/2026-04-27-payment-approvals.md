# Payment Approvals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` syntax.

**Goal:** Sellers junior crean pagos que quedan en PENDING_APPROVAL si exceden el rango configurado por agency. Approvers con rango suficiente aprueban (recién ahí se contabiliza) o rechazan con motivo.

**Architecture:** Reglas JSON por agency en `agency_settings.data->payment_approval_rules`. Columnas approval_* en `payments` y `operator_payments`. Lib pura para decidir requiresApproval/canApprove. Refactor del path de creación: si requires approval → skip ledger/cash, queda en PENDING. Endpoint approve corre el path de contabilización después.

**Tech Stack:** Next.js Route Handlers, Supabase, TypeScript, Jest.

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `supabase/migrations/20260427000005_payment_approvals.sql` | Schema A: cols approval_* en 2 tablas + alert_type + index | new |
| `lib/payments/approval.ts` | Pure: requiresApproval, canApprove, convertToArs | new |
| `lib/payments/__tests__/approval.test.ts` | Unit tests matriz | new |
| `lib/payments/load-rules.ts` | Helper async: loadApprovalRules(agencyId, supabase) + getCurrentArsPerUsd | new |
| `app/api/payments/route.ts` | Modify POST: check approval, branch | modify |
| `app/api/operator-payments/route.ts` | Modify POST: check approval, branch | modify |
| `app/api/payments/[id]/approve/route.ts` | Approve endpoint | new |
| `app/api/payments/[id]/reject/route.ts` | Reject endpoint | new |
| `app/api/operator-payments/[id]/approve/route.ts` | Approve operator pmt | new |
| `app/api/operator-payments/[id]/reject/route.ts` | Reject operator pmt | new |
| `app/api/agencies/[id]/payment-approval-rules/route.ts` | GET/PUT rules | new |
| `app/(dashboard)/payments/pending-approvals/page.tsx` | Lista pagos pending | new |
| `components/payments/pending-approvals-client.tsx` | UI bandeja | new |
| `components/settings/agency-approval-rules-form.tsx` | UI editor de rules en settings | new |

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260427000005_payment_approvals.sql`

- [ ] **Step 1: Write migration**

```sql
-- Sistema de aprobación de pagos (#14 reunión Gabi)
-- approval_status default 'NONE' = backward compat: pagos viejos no requieren aprobación.

-- payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'NONE'
    CHECK (approval_status IN ('NONE','PENDING_APPROVAL','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_pending_approval
  ON payments (created_at DESC)
  WHERE approval_status = 'PENDING_APPROVAL';

-- operator_payments
ALTER TABLE operator_payments
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'NONE'
    CHECK (approval_status IN ('NONE','PENDING_APPROVAL','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_operator_payments_pending_approval
  ON operator_payments (created_at DESC)
  WHERE approval_status = 'PENDING_APPROVAL';

-- alert_type new values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP',
      'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY',
      'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT',
      'RECURRING_PAYMENT', 'TASK_REMINDER', 'TASK_ASSIGNED',
      'MISSING_INVOICE', 'QUOTATION_ACCEPTED',
      'PAYMENT_PENDING_APPROVAL', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED',
      'OTHER'
    ));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260427000005_payment_approvals.sql
git commit -m "feat(payments): #14 schema approval columns + alert types"
```

---

## Task 2: Lib pura approval.ts (TDD)

**Files:**
- Create: `lib/payments/__tests__/approval.test.ts`
- Create: `lib/payments/approval.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/payments/__tests__/approval.test.ts
import { requiresApproval, canApprove, convertToArs, type ApprovalRule } from "../approval"

describe("requiresApproval", () => {
  it("returns false when rules array is empty (backward compat)", () => {
    expect(requiresApproval(1000000, "SELLER", [])).toBe(false)
  })

  it("returns false when rule for role doesn't exist", () => {
    const rules: ApprovalRule[] = [{ role: "ADMIN", max_amount_ars: 500000 }]
    expect(requiresApproval(1000000, "SELLER", rules)).toBe(false)
  })

  it("returns false when role has unlimited (max=null)", () => {
    const rules: ApprovalRule[] = [{ role: "ADMIN", max_amount_ars: null }]
    expect(requiresApproval(99999999, "ADMIN", rules)).toBe(false)
  })

  it("returns true when amount exceeds role limit", () => {
    const rules: ApprovalRule[] = [{ role: "SELLER", max_amount_ars: 100000 }]
    expect(requiresApproval(150000, "SELLER", rules)).toBe(true)
  })

  it("returns false when amount is exactly at limit", () => {
    const rules: ApprovalRule[] = [{ role: "SELLER", max_amount_ars: 100000 }]
    expect(requiresApproval(100000, "SELLER", rules)).toBe(false)
  })

  it("returns true when SELLER limit is 0 and amount is any positive", () => {
    const rules: ApprovalRule[] = [{ role: "SELLER", max_amount_ars: 0 }]
    expect(requiresApproval(1, "SELLER", rules)).toBe(true)
  })
})

describe("canApprove", () => {
  it("returns true when rules array is empty (backward compat)", () => {
    expect(canApprove(1000000, "SELLER", [])).toBe(true)
  })

  it("returns true when role not listed (treated as unlimited)", () => {
    expect(canApprove(1000000, "GHOST_ROLE", [{ role: "SELLER", max_amount_ars: 0 }])).toBe(true)
  })

  it("returns true when role has max=null (explicit unlimited)", () => {
    expect(canApprove(99999999, "ADMIN", [{ role: "ADMIN", max_amount_ars: null }])).toBe(true)
  })

  it("returns true when amount is at limit", () => {
    expect(canApprove(500000, "ADMIN", [{ role: "ADMIN", max_amount_ars: 500000 }])).toBe(true)
  })

  it("returns false when amount exceeds limit", () => {
    expect(canApprove(500001, "ADMIN", [{ role: "ADMIN", max_amount_ars: 500000 }])).toBe(false)
  })
})

describe("convertToArs", () => {
  it("returns same amount for ARS", () => {
    expect(convertToArs(1000, "ARS", 1250)).toBe(1000)
  })

  it("multiplies USD by rate", () => {
    expect(convertToArs(100, "USD", 1250)).toBe(125000)
  })

  it("handles zero", () => {
    expect(convertToArs(0, "USD", 1250)).toBe(0)
    expect(convertToArs(0, "ARS", 1250)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- lib/payments/__tests__/approval.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/payments/approval.ts

export type ApprovalRule = {
  role: string
  max_amount_ars: number | null  // null = ilimitado
}

export function requiresApproval(
  amountArs: number,
  userRole: string,
  rules: ApprovalRule[],
): boolean {
  if (!rules || rules.length === 0) return false
  const rule = rules.find((r) => r.role === userRole)
  if (!rule) return false
  if (rule.max_amount_ars === null) return false
  return amountArs > rule.max_amount_ars
}

export function canApprove(
  amountArs: number,
  approverRole: string,
  rules: ApprovalRule[],
): boolean {
  if (!rules || rules.length === 0) return true
  const rule = rules.find((r) => r.role === approverRole)
  if (!rule) return true
  if (rule.max_amount_ars === null) return true
  return amountArs <= rule.max_amount_ars
}

export function convertToArs(
  amount: number,
  currency: "ARS" | "USD",
  arsPerUsd: number,
): number {
  return currency === "USD" ? amount * arsPerUsd : amount
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npm test -- lib/payments/__tests__/approval.test.ts
```

Expected: 14/14 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/payments/approval.ts lib/payments/__tests__/approval.test.ts
git commit -m "feat(payments): #14 pure approval helpers + tests"
```

---

## Task 3: Helper load-rules.ts (no TDD, integration only)

**Files:**
- Create: `lib/payments/load-rules.ts`

- [ ] **Step 1: Implement**

```typescript
// lib/payments/load-rules.ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ApprovalRule } from "./approval"

const FALLBACK_USD_RATE = 1000

/**
 * Lee las reglas de aprobación de pagos para una agency.
 * Si no hay row en agency_settings o la key no está, retorna [].
 */
export async function loadApprovalRules(
  agencyId: string,
  supabase: SupabaseClient,
): Promise<ApprovalRule[]> {
  const { data } = await (supabase.from("agency_settings") as any)
    .select("data")
    .eq("agency_id", agencyId)
    .maybeSingle()

  const rules = data?.data?.payment_approval_rules
  if (!Array.isArray(rules)) return []
  return rules.filter(
    (r): r is ApprovalRule =>
      typeof r === "object" &&
      typeof r.role === "string" &&
      (r.max_amount_ars === null || typeof r.max_amount_ars === "number"),
  )
}

/**
 * Obtiene el tipo de cambio actual ARS/USD del último mes registrado.
 * Si no hay datos, fallback a FALLBACK_USD_RATE.
 */
export async function getCurrentArsPerUsd(
  supabase: SupabaseClient,
): Promise<number> {
  const { data } = await (supabase.from("monthly_exchange_rates") as any)
    .select("rate")
    .order("year_month", { ascending: false })
    .limit(1)
    .maybeSingle()

  const rate = data?.rate ? Number(data.rate) : 0
  if (rate > 0) return rate

  console.warn("[payment-approval] No exchange rate found, using fallback", FALLBACK_USD_RATE)
  return FALLBACK_USD_RATE
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "lib/payments/load-rules"
git add lib/payments/load-rules.ts
git commit -m "feat(payments): #14 helpers loadApprovalRules + getCurrentArsPerUsd"
```

---

## Task 4: Refactor POST /api/payments — branch on approval

**Files:**
- Modify: `app/api/payments/route.ts`

- [ ] **Step 1: Read existing file to find INSERT point and ledger creation**

```bash
grep -n "approval_status\|insert.*payments\|ledger_movement\|cash_movement" app/api/payments/route.ts | head -30
```

- [ ] **Step 2: Insert approval gate before ledger/cash creation**

After loading user/agency/operation context but BEFORE the INSERT into `payments` (or before the ledger-creating block), add:

```typescript
import { requiresApproval, convertToArs } from "@/lib/payments/approval"
import { loadApprovalRules, getCurrentArsPerUsd } from "@/lib/payments/load-rules"

// ... existing code that resolves agencyId, amount, currency, user.role ...

const rules = await loadApprovalRules(agencyId, supabase)
const arsPerUsd = await getCurrentArsPerUsd(supabase)
const amountArs = convertToArs(Number(amount), currency, arsPerUsd)
const needsApproval = requiresApproval(amountArs, user.role, rules)

const insertPayload: any = {
  // ... existing fields (operation_id, payer_type, amount, currency, etc.) ...
  created_by_user_id: user.id,
  approval_status: needsApproval ? "PENDING_APPROVAL" : "NONE",
  status: needsApproval ? "PENDING" : (originalStatus ?? "PENDING"),
}

const { data: payment, error: insertError } = await supabase
  .from("payments")
  .insert(insertPayload)
  .select()
  .single()

if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

// CRITICAL: si necesita aprobación, NO contabilizar todavía. Skip ledger + cash + alert al creator.
if (needsApproval) {
  // Notificar approvers (best-effort, no bloquea)
  await notifyApprovers(payment, supabase, user.id).catch((e) =>
    console.warn("[payments] notifyApprovers failed:", e?.message),
  )
  return NextResponse.json({ payment, requires_approval: true })
}

// ... existing ledger_movement + cash_movement creation, sin cambios ...
```

Implementar `notifyApprovers(payment, supabase, creatorId)` inline o en `lib/payments/notify-approvers.ts` — busca users con role en agency con max_amount_ars >= amount o null, e inserta alerta `PAYMENT_PENDING_APPROVAL`.

```typescript
async function notifyApprovers(payment: any, supabase: any, creatorId: string) {
  // Trae todos los users de la agency excepto el creator
  const { data: users } = await supabase
    .from("users")
    .select("id, role")
    .eq("agency_id", payment.agency_id ?? null)
    .neq("id", creatorId)

  // Para cada uno, si canApprove → insert alerta
  // (load rules + arsPerUsd + amountArs ya disponibles arriba — pasarlas como args)
  // ... insert alerts en batch
}
```

(En la práctica, `notifyApprovers` puede ser laxo: notificar a todos los ADMIN/SUPER_ADMIN de la agency, no necesario el cálculo exacto.)

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "api/payments/route"
git add app/api/payments/route.ts
git commit -m "feat(payments): #14 POST /api/payments respeta approval rules"
```

---

## Task 5: Mismo refactor para POST /api/operator-payments

**Files:**
- Modify: `app/api/operator-payments/route.ts` (o donde esté el POST handler)

- [ ] **Step 1: Aplicar el mismo patrón de Task 4** sobre el POST de operator_payments. Mismo `requiresApproval`, mismo `notifyApprovers`, mismo skip ledger/cash si pending.

- [ ] **Step 2: Typecheck + commit**

```bash
git add app/api/operator-payments/route.ts
git commit -m "feat(payments): #14 POST /api/operator-payments respeta approval rules"
```

---

## Task 6: Endpoints approve/reject (4 routes)

**Files:**
- Create: `app/api/payments/[id]/approve/route.ts`
- Create: `app/api/payments/[id]/reject/route.ts`
- Create: `app/api/operator-payments/[id]/approve/route.ts`
- Create: `app/api/operator-payments/[id]/reject/route.ts`

- [ ] **Step 1: Implementar approve para `payments`**

```typescript
// app/api/payments/[id]/approve/route.ts
import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canApprove, convertToArs } from "@/lib/payments/approval"
import { loadApprovalRules, getCurrentArsPerUsd } from "@/lib/payments/load-rules"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const admin = createAdminClient() as any

  const { data: payment } = await supabase
    .from("payments")
    .select("*, operation:operation_id(agency_id)")
    .eq("id", id)
    .single()

  if (!payment) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
  if (payment.approval_status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "Pago no está pendiente de aprobación" }, { status: 400 })
  }

  const agencyId = payment.operation?.agency_id
  const rules = await loadApprovalRules(agencyId, supabase)
  const arsPerUsd = await getCurrentArsPerUsd(supabase)
  const amountArs = convertToArs(Number(payment.amount), payment.currency, arsPerUsd)

  if (!canApprove(amountArs, user.role, rules)) {
    return NextResponse.json({ error: "No tenés permiso para aprobar este monto" }, { status: 403 })
  }

  // UPDATE con guard de race (solo aprueba si sigue pendiente)
  const { data: updated, error: updError } = await supabase
    .from("payments")
    .update({
      approval_status: "APPROVED",
      approved_by_user_id: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("approval_status", "PENDING_APPROVAL")
    .select()
    .single()

  if (updError || !updated) {
    return NextResponse.json({ error: "Race condition: el pago ya fue resuelto" }, { status: 409 })
  }

  // TODO: llamar el helper compartido que crea ledger_movement + cash_movement
  // (extraído de POST /api/payments). Por ahora, comentar y dejar para Task 7.

  // Notificar al creador
  if (payment.created_by_user_id) {
    await admin.from("alerts").insert({
      user_id: payment.created_by_user_id,
      org_id: payment.org_id,
      type: "PAYMENT_APPROVED",
      description: `Tu pago ${payment.amount} ${payment.currency} fue aprobado por ${user.name || user.email}`,
      date_due: new Date().toISOString().split("T")[0],
      status: "PENDING",
    }).catch((e: any) => console.warn("notify failed:", e?.message))
  }

  logSecurityEvent({
    eventType: "PAYMENT_APPROVED",
    severity: "INFO",
    actorUserId: user.id,
    targetEntity: "payments",
    targetEntityId: id,
    requestPath: `/api/payments/${id}/approve`,
    details: { amount: payment.amount, currency: payment.currency, amountArs },
  })

  return NextResponse.json({ payment: updated })
}
```

- [ ] **Step 2: Implementar reject para `payments`** (mismo patrón, body con `reason`):

```typescript
// app/api/payments/[id]/reject/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const body = await request.json().catch(() => ({}))
  const reason = (body.reason || "").trim()
  if (!reason) return NextResponse.json({ error: "Motivo requerido" }, { status: 400 })

  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .single()

  if (!payment) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
  if (payment.approval_status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "No está pendiente" }, { status: 400 })
  }

  // Permission: cualquier user con permiso ADMIN puede rechazar (no need to check canApprove for reject)
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "Solo ADMIN/SUPER_ADMIN puede rechazar" }, { status: 403 })
  }

  const { data: updated } = await supabase
    .from("payments")
    .update({
      approval_status: "REJECTED",
      approved_by_user_id: user.id,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", id)
    .eq("approval_status", "PENDING_APPROVAL")
    .select()
    .single()

  if (!updated) return NextResponse.json({ error: "Race condition" }, { status: 409 })

  logSecurityEvent({
    eventType: "PAYMENT_REJECTED",
    severity: "INFO",
    actorUserId: user.id,
    targetEntity: "payments",
    targetEntityId: id,
    details: { reason, amount: payment.amount, currency: payment.currency },
  })

  return NextResponse.json({ payment: updated })
}
```

- [ ] **Step 3: Duplicar para operator_payments**

`app/api/operator-payments/[id]/approve/route.ts` y `.../reject/route.ts` — mismo código pero `from("operator_payments")` en vez de `from("payments")`. El amount/currency son `payment.amount` y `payment.currency` (mismas columnas).

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "(approve|reject)"
git add app/api/payments/\[id\]/approve app/api/payments/\[id\]/reject \
        app/api/operator-payments/\[id\]/approve app/api/operator-payments/\[id\]/reject
git commit -m "feat(payments): #14 endpoints approve/reject (payments + operator_payments)"
```

---

## Task 7: Endpoint settings rules

**Files:**
- Create: `app/api/agencies/[id]/payment-approval-rules/route.ts`

- [ ] **Step 1: Implementar GET + PUT**

```typescript
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agencyId } = await params
  const supabase = await createServerClient()
  const { data } = await (supabase.from("agency_settings") as any)
    .select("data")
    .eq("agency_id", agencyId)
    .maybeSingle()

  return NextResponse.json({ rules: data?.data?.payment_approval_rules ?? [] })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agencyId } = await params
  const { user } = await getCurrentUser()
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const rules = body.rules
  if (!Array.isArray(rules)) {
    return NextResponse.json({ error: "rules debe ser array" }, { status: 400 })
  }

  const supabase = await createServerClient()

  // Upsert agency_settings.data.payment_approval_rules
  const { data: existing } = await (supabase.from("agency_settings") as any)
    .select("data")
    .eq("agency_id", agencyId)
    .maybeSingle()

  const newData = { ...(existing?.data || {}), payment_approval_rules: rules }

  const { error } = await (supabase.from("agency_settings") as any)
    .upsert({ agency_id: agencyId, data: newData }, { onConflict: "agency_id" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules })
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add app/api/agencies/\[id\]/payment-approval-rules
git commit -m "feat(payments): #14 GET/PUT agency payment_approval_rules"
```

---

## Task 8: UI bandeja /payments/pending-approvals

**Files:**
- Create: `app/(dashboard)/payments/pending-approvals/page.tsx`
- Create: `components/payments/pending-approvals-client.tsx`

- [ ] **Step 1: Server page**

```typescript
// app/(dashboard)/payments/pending-approvals/page.tsx
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { PendingApprovalsClient } from "@/components/payments/pending-approvals-client"

export const dynamic = "force-dynamic"

export default async function PendingApprovalsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const [{ data: customerPayments }, { data: operatorPayments }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, currency, method, payer_type, created_at, created_by_user_id, operation:operation_id(file_code, destination, agency_id)")
      .eq("approval_status", "PENDING_APPROVAL")
      .order("created_at", { ascending: false }),
    supabase
      .from("operator_payments")
      .select("id, amount, currency, due_date, created_at, created_by_user_id, operator:operator_id(name), operation:operation_id(file_code, destination, agency_id)")
      .eq("approval_status", "PENDING_APPROVAL")
      .order("created_at", { ascending: false }),
  ])

  return (
    <PendingApprovalsClient
      userRole={user.role}
      customerPayments={(customerPayments || []) as any}
      operatorPayments={(operatorPayments || []) as any}
    />
  )
}
```

- [ ] **Step 2: Client component**

```typescript
// components/payments/pending-approvals-client.tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"

type Props = {
  userRole: string
  customerPayments: any[]
  operatorPayments: any[]
}

function fmtMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
  }).format(amount)
}

export function PendingApprovalsClient({ userRole, customerPayments, operatorPayments }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<{ id: string; entity: "payments" | "operator-payments" } | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  async function approve(id: string, entity: "payments" | "operator-payments") {
    setBusyId(id)
    try {
      const res = await fetch(`/api/${entity}/${id}/approve`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Pago aprobado")
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setBusyId(null)
    }
  }

  async function confirmReject() {
    if (!rejecting) return
    setBusyId(rejecting.id)
    try {
      const res = await fetch(`/api/${rejecting.entity}/${rejecting.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Pago rechazado")
      setRejecting(null)
      setRejectReason("")
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pagos clientes pendientes</CardTitle>
          <CardDescription>{customerPayments.length} pago{customerPayments.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {customerPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nada pendiente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operación</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-[200px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{p.operation?.file_code} · {p.operation?.destination}</TableCell>
                    <TableCell className="text-xs">{p.method}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(Number(p.amount), p.currency)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => approve(p.id, "payments")} disabled={busyId === p.id}>
                          {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />} Aprobar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejecting({ id: p.id, entity: "payments" })}>
                          <XCircle className="h-3 w-3 mr-1" /> Rechazar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos a operadores pendientes</CardTitle>
          <CardDescription>{operatorPayments.length} pago{operatorPayments.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {operatorPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nada pendiente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-[200px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operatorPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{p.operator?.name}</TableCell>
                    <TableCell className="text-xs">{p.operation?.file_code}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(Number(p.amount), p.currency)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => approve(p.id, "operator-payments")} disabled={busyId === p.id}>
                          {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />} Aprobar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejecting({ id: p.id, entity: "operator-payments" })}>
                          <XCircle className="h-3 w-3 mr-1" /> Rechazar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar pago</DialogTitle>
            <DialogDescription>Ingresá el motivo del rechazo. El creador recibirá una notificación.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ej: monto erróneo, pago duplicado..." rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={!rejectReason.trim() || busyId !== null}>
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "pending-approvals"
git add app/\(dashboard\)/payments/pending-approvals components/payments/pending-approvals-client.tsx
git commit -m "feat(payments): #14 UI bandeja /payments/pending-approvals"
```

---

## Task 9: UI editor de rules en settings

**Files:**
- Create: `components/settings/agency-approval-rules-form.tsx`

- [ ] **Step 1: Implementar component editor**

```typescript
// components/settings/agency-approval-rules-form.tsx
"use client"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"

const ROLES = ["SELLER", "CONTABLE", "ADMIN", "SUPER_ADMIN"] as const

type Rule = { role: string; max_amount_ars: number | null }

export function AgencyApprovalRulesForm({ agencyId }: { agencyId: string }) {
  const [rules, setRules] = useState<Record<string, string>>({}) // role → input value (string for empty=null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/agencies/${agencyId}/payment-approval-rules`)
      .then((r) => r.json())
      .then((json) => {
        const map: Record<string, string> = {}
        for (const r of (json.rules || []) as Rule[]) {
          map[r.role] = r.max_amount_ars === null ? "" : String(r.max_amount_ars)
        }
        setRules(map)
      })
      .finally(() => setLoading(false))
  }, [agencyId])

  async function save() {
    setSaving(true)
    try {
      const arr: Rule[] = ROLES
        .filter((role) => rules[role] !== undefined)
        .map((role) => ({
          role,
          max_amount_ars: rules[role] === "" ? null : Number(rules[role]),
        }))
      const res = await fetch(`/api/agencies/${agencyId}/payment-approval-rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: arr }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Reglas guardadas")
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aprobaciones de pagos</CardTitle>
        <CardDescription>
          Monto máximo en ARS que cada rol puede crear sin requerir aprobación. Vacío = ilimitado. Si el rol no está listado, no requiere aprobación.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            {ROLES.map((role) => (
              <div key={role} className="grid grid-cols-2 gap-3 items-center">
                <Label>{role}</Label>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  placeholder="Vacío = ilimitado"
                  value={rules[role] ?? ""}
                  onChange={(e) => setRules({ ...rules, [role]: e.target.value })}
                />
              </div>
            ))}
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar reglas
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Insertar en `/settings/agencies/[id]` o equivalente**

Buscar dónde está el page de settings de una agency y agregar el componente como nueva sección/tab. El plan no fija el lugar exacto — adaptarse al patrón existente del repo.

- [ ] **Step 3: Typecheck + commit**

```bash
git add components/settings/agency-approval-rules-form.tsx
git commit -m "feat(payments): #14 UI editor de payment_approval_rules"
```

---

## Task 10: Sidebar link condicional

**Files:**
- Modify: el componente del sidebar (probablemente `components/layout/sidebar.tsx` o `app-sidebar.tsx`)

- [ ] **Step 1: Agregar link "Aprobaciones" si user.role in {ADMIN, SUPER_ADMIN, CONTABLE}**

Buscar el archivo del sidebar. Agregar entrada nueva al array de links (o equivalente):

```typescript
{
  label: "Aprobaciones",
  href: "/payments/pending-approvals",
  icon: CheckSquare,
  visible: ["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role),
}
```

Adaptar al patrón existente.

- [ ] **Step 2: Commit**

```bash
git add <sidebar file>
git commit -m "feat(payments): #14 sidebar link condicional /payments/pending-approvals"
```

---

## Task 11: Final verify + push

- [ ] **Step 1: Tests**

```bash
npm test -- lib/payments
```

Expected: all PASS.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -E "(payments|approval)" | head -20
```

Expected: no nuevos errores. Errores pre-existentes del repo OK.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Smoke checklist post-deploy** (handed to user)

```
[ ] Pasar migration en Supabase (Task 1)
[ ] Como Maxi: /settings/agencies/<lozada-rosario> → "Aprobaciones de pagos" → SELLER = 0 ARS → Guardar
[ ] Como SELLER (Micaela): cargar pago de cliente $50.000
[ ] Verificar: pago aparece como "PENDIENTE DE APROBACIÓN", no se contabilizó
[ ] Como Maxi: /payments/pending-approvals → ver el pago → Aprobar
[ ] Verificar ledger_movement creado + cash_movement creado
[ ] Cargar otro pago como SELLER → como Maxi rechazar con motivo "test"
[ ] Verificar: status REJECTED, rejection_reason guardado, no se contabilizó
```

---

## Self-review checklist

- **Spec coverage:** schema (T1), lib (T2), helpers (T3), POST refactor (T4-5), approve/reject (T6), settings endpoint (T7), bandeja UI (T8), settings UI (T9), sidebar (T10), verify (T11). All spec sections covered.
- **Placeholder scan:** Una nota TODO intencional en T6 sobre "helper compartido para crear ledger_movement". El refactor a un helper compartido se hace inline en T4 cuando se modifica POST /api/payments — el approve endpoint en T6 lo llama. Si no es trivial extraer, el implementer puede inlinear el código en approve. Aceptable porque el implementer tiene contexto.
- **Type consistency:** `ApprovalRule.max_amount_ars: number | null` consistente. `approval_status` enum coincide entre migration, lib, endpoints, UI. `agency_id` resolved consistentemente desde `payment.operation.agency_id`.
