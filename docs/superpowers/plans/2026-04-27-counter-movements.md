# Counter-Movements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` syntax.

**Goal:** Reemplazar el flow "borrar movement" con "reversar" en `cash_movements` y `ledger_movements`. Genera contra-movimiento, marca el original con audit trail, mantiene ambos visibles.

**Architecture:** 4 columnas nuevas (`reverses_movement_id`, `reversed_at`, `reversed_by_movement_id`, `reversal_reason`) en ambas tablas. Lib pura para `oppositeMovementType`/`canReverse`/`buildReversalPayload`. Endpoints `POST /api/<table>/[id]/reverse`. UI: dropdown action por row + modal motivo + badges visuales. Cascade cash → ledger automático.

**Tech Stack:** Next.js 15, Supabase, TypeScript, Jest, shadcn/ui.

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `supabase/migrations/20260427000007_counter_movements.sql` | 4 cols × 2 tablas + indexes | new |
| `lib/accounting/reversal.ts` | Pure: oppositeMovementType, canReverse, buildReversalPayload | new |
| `lib/accounting/__tests__/reversal.test.ts` | Unit tests | new |
| `app/api/cash-movements/[id]/reverse/route.ts` | Endpoint reverse cash + cascade ledger | new |
| `app/api/ledger-movements/[id]/reverse/route.ts` | Endpoint reverse ledger | new |
| `components/cash/cash-movement-reverse-button.tsx` | Reusable button + modal | new |
| `components/cash/cash-movements-table.tsx` | Modify: integrar reverse action + badges | modify |
| `components/accounting/ledger-table.tsx` | Modify: integrar reverse action + badges | modify |

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/20260427000007_counter_movements.sql`

- [ ] **Step 1: Write migration**

```sql
-- Sistema de contra-movimientos (#17 reunión Gabi)
-- Reemplaza "borrar movement" con "reversar": genera movimiento opuesto + audit trail.

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_cash_movements_reverses
  ON cash_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_movements_reverses
  ON ledger_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

COMMENT ON COLUMN cash_movements.reverses_movement_id IS
  'Si este row es una reversión, apunta al cash_movement original que reversó';
COMMENT ON COLUMN cash_movements.reversed_at IS
  'Si este row fue reversado, cuándo. NULL si no fue reversado.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260427000007_counter_movements.sql
git commit -m "feat(accounting): #17 add reversal columns to cash_movements + ledger_movements"
```

---

## Task 2: Lib pura reversal.ts (TDD)

**Files:**
- Create: `lib/accounting/__tests__/reversal.test.ts`
- Create: `lib/accounting/reversal.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/accounting/__tests__/reversal.test.ts
import { oppositeMovementType, canReverse, buildReversalPayload } from "../reversal"

describe("oppositeMovementType", () => {
  it("INCOME → EXPENSE", () => {
    expect(oppositeMovementType("INCOME")).toBe("EXPENSE")
  })
  it("EXPENSE → INCOME", () => {
    expect(oppositeMovementType("EXPENSE")).toBe("INCOME")
  })
})

describe("canReverse", () => {
  it("ok=true cuando no fue reversado y no es reversión", () => {
    expect(canReverse({ reversed_at: null, reverses_movement_id: null })).toEqual({ ok: true })
  })
  it("ok=false cuando ya fue reversado", () => {
    expect(canReverse({ reversed_at: "2026-04-27T10:00:00Z", reverses_movement_id: null }))
      .toEqual({ ok: false, error: "Este movimiento ya fue reversado" })
  })
  it("ok=false cuando es una reversión", () => {
    expect(canReverse({ reversed_at: null, reverses_movement_id: "abc-123" }))
      .toEqual({ ok: false, error: "No se puede reversar una reversión" })
  })
  it("ok=false cuando ambos: ya reversado tiene precedencia sobre is-reversal", () => {
    expect(canReverse({ reversed_at: "2026-04-27T10:00:00Z", reverses_movement_id: "abc" }))
      .toEqual({ ok: false, error: "Este movimiento ya fue reversado" })
  })
  it("trata undefined como null", () => {
    expect(canReverse({})).toEqual({ ok: true })
  })
})

describe("buildReversalPayload", () => {
  const baseOriginal = {
    type: "INCOME",
    amount: 1000,
    currency: "ARS",
    financial_account_id: "acc-1",
    agency_id: "ag-1",
    org_id: "org-1",
    operation_id: "op-1",
    user_id: "u-1",
  }

  it("flips type", () => {
    const payload = buildReversalPayload(baseOriginal, "test reason", "orig-id", "2026-04-27")
    expect(payload.type).toBe("EXPENSE")
  })

  it("preserves amount + currency + financial_account + agency + org + operation + user", () => {
    const p = buildReversalPayload(baseOriginal, "test", "orig-id", "2026-04-27")
    expect(p.amount).toBe(1000)
    expect(p.currency).toBe("ARS")
    expect(p.financial_account_id).toBe("acc-1")
    expect(p.agency_id).toBe("ag-1")
    expect(p.org_id).toBe("org-1")
    expect(p.operation_id).toBe("op-1")
    expect(p.user_id).toBe("u-1")
  })

  it("sets category, notes con reason + original id, movement_date, reverses_movement_id", () => {
    const p = buildReversalPayload(baseOriginal, "monto erróneo", "orig-id-xyz", "2026-04-27")
    expect(p.category).toBe("Contra-movimiento")
    expect(p.notes).toBe("Reversión de orig-id-xyz: monto erróneo")
    expect(p.movement_date).toBe("2026-04-27")
    expect(p.reverses_movement_id).toBe("orig-id-xyz")
  })

  it("EXPENSE original → INCOME reversal", () => {
    const p = buildReversalPayload({ ...baseOriginal, type: "EXPENSE" }, "x", "id", "d")
    expect(p.type).toBe("INCOME")
  })

  it("optional cols default to null when missing", () => {
    const minimal = { type: "INCOME", amount: 500, currency: "USD", financial_account_id: null }
    const p = buildReversalPayload(minimal, "x", "id", "d")
    expect(p.agency_id).toBeNull()
    expect(p.org_id).toBeNull()
    expect(p.operation_id).toBeNull()
    expect(p.user_id).toBeNull()
    expect(p.financial_account_id).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- lib/accounting/__tests__/reversal.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/accounting/reversal.ts

export type MovementType = "INCOME" | "EXPENSE"

export function oppositeMovementType(type: MovementType): MovementType {
  return type === "INCOME" ? "EXPENSE" : "INCOME"
}

export type ReversalCheckResult = { ok: true } | { ok: false; error: string }

export function canReverse(movement: {
  reversed_at?: string | null
  reverses_movement_id?: string | null
}): ReversalCheckResult {
  if (movement.reversed_at) {
    return { ok: false, error: "Este movimiento ya fue reversado" }
  }
  if (movement.reverses_movement_id) {
    return { ok: false, error: "No se puede reversar una reversión" }
  }
  return { ok: true }
}

export function buildReversalPayload<M extends {
  type: string
  amount: number
  currency: string
  financial_account_id: string | null
  agency_id?: string | null
  org_id?: string | null
  operation_id?: string | null
  user_id?: string | null
}>(original: M, reason: string, originalId: string, todayIso: string): Record<string, any> {
  return {
    type: oppositeMovementType(original.type as MovementType),
    amount: original.amount,
    currency: original.currency,
    financial_account_id: original.financial_account_id,
    agency_id: original.agency_id ?? null,
    org_id: original.org_id ?? null,
    operation_id: original.operation_id ?? null,
    user_id: original.user_id ?? null,
    category: "Contra-movimiento",
    notes: `Reversión de ${originalId}: ${reason}`,
    movement_date: todayIso,
    reverses_movement_id: originalId,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- lib/accounting/__tests__/reversal.test.ts
```

Expected: 13/13 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/accounting/reversal.ts lib/accounting/__tests__/reversal.test.ts
git commit -m "feat(accounting): #17 pure reversal helpers + tests"
```

---

## Task 3: Endpoint reverse cash_movement

**Files:**
- Create: `app/api/cash-movements/[id]/reverse/route.ts`

- [ ] **Step 1: Implement**

```typescript
// app/api/cash-movements/[id]/reverse/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canReverse, buildReversalPayload } from "@/lib/accounting/reversal"
import { logSecurityEvent } from "@/lib/security/audit"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role)) {
    return NextResponse.json({ error: "Sin permiso para reversar" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const reason = (body.reason || "").trim()
  if (!reason) return NextResponse.json({ error: "Motivo requerido" }, { status: 400 })

  const { data: original } = await (supabase.from("cash_movements") as any)
    .select("*")
    .eq("id", id)
    .single()

  if (!original) return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })

  const check = canReverse(original)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  const today = new Date().toISOString().split("T")[0]
  const reversalPayload = buildReversalPayload(original, reason, id, today)

  // Insert reversal
  const { data: reversal, error: insertError } = await (supabase.from("cash_movements") as any)
    .insert(reversalPayload)
    .select()
    .single()

  if (insertError || !reversal) {
    return NextResponse.json({ error: insertError?.message || "Error creando reversal" }, { status: 500 })
  }

  // Update original with race-safe guard
  const { error: updError } = await (supabase.from("cash_movements") as any)
    .update({
      reversed_at: new Date().toISOString(),
      reversed_by_movement_id: reversal.id,
      reversal_reason: reason,
    })
    .eq("id", id)
    .is("reversed_at", null)

  if (updError) {
    console.warn("[cash-movement reverse] update original failed:", updError.message)
  }

  // Cascade a ledger_movement si existe
  if (original.ledger_movement_id) {
    try {
      const { data: ledger } = await (supabase.from("ledger_movements") as any)
        .select("*")
        .eq("id", original.ledger_movement_id)
        .single()

      if (ledger && canReverse(ledger).ok) {
        const ledgerReversalPayload = buildReversalPayload(
          ledger,
          `Cascade desde reversión de cash_movement ${id}: ${reason}`,
          ledger.id,
          today,
        )
        const { data: ledgerReversal } = await (supabase.from("ledger_movements") as any)
          .insert(ledgerReversalPayload)
          .select()
          .single()

        if (ledgerReversal) {
          await (supabase.from("ledger_movements") as any)
            .update({
              reversed_at: new Date().toISOString(),
              reversed_by_movement_id: ledgerReversal.id,
              reversal_reason: `Cascade: ${reason}`,
            })
            .eq("id", ledger.id)
            .is("reversed_at", null)
        }
      }
    } catch (cascadeErr: any) {
      console.warn("[cash-movement reverse] cascade ledger failed:", cascadeErr?.message)
    }
  }

  logSecurityEvent({
    eventType: "CASH_MOVEMENT_REVERSED",
    severity: "INFO",
    actorUserId: user.id,
    targetEntity: "cash_movements",
    targetEntityId: id,
    requestPath: `/api/cash-movements/${id}/reverse`,
    details: { reason, amount: original.amount, currency: original.currency, reversal_id: reversal.id },
  })

  return NextResponse.json({ original_id: id, reversal })
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "cash-movements.*reverse"
git add app/api/cash-movements/\[id\]/reverse
git commit -m "feat(accounting): #17 endpoint POST /api/cash-movements/[id]/reverse + cascade ledger"
```

---

## Task 4: Endpoint reverse ledger_movement

**Files:**
- Create: `app/api/ledger-movements/[id]/reverse/route.ts`

- [ ] **Step 1: Implement**

Mismo patrón que Task 3, sin cascade. `from("ledger_movements")` en vez de `from("cash_movements")`. Sin el bloque de cascade. Cambiar `eventType` a `LEDGER_MOVEMENT_REVERSED`.

- [ ] **Step 2: Typecheck + commit**

```bash
git add app/api/ledger-movements/\[id\]/reverse
git commit -m "feat(accounting): #17 endpoint POST /api/ledger-movements/[id]/reverse"
```

---

## Task 5: UI button + modal

**Files:**
- Create: `components/cash/cash-movement-reverse-button.tsx`

- [ ] **Step 1: Implement reusable button**

```typescript
// components/cash/cash-movement-reverse-button.tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Undo2, Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

type Props = {
  movementId: string
  endpoint: "cash-movements" | "ledger-movements"
  /** "INCOME" | "EXPENSE" — texto descriptivo opcional */
  movementLabel?: string
  /** Si true, ya fue reversado o es reversión: deshabilita */
  disabled?: boolean
  size?: "sm" | "default"
  variant?: "ghost" | "outline"
}

export function CashMovementReverseButton({
  movementId,
  endpoint,
  movementLabel,
  disabled,
  size = "sm",
  variant = "ghost",
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!reason.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/${endpoint}/${movementId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Movimiento reversado")
      setOpen(false)
      setReason("")
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Reversar movimiento"
      >
        <Undo2 className="h-3 w-3 mr-1" /> Reversar
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Reversar movimiento
            </DialogTitle>
            <DialogDescription>
              Vas a generar un contra-movimiento que neutraliza este {movementLabel || "movimiento"}.
              El movimiento original queda en historial. <strong>Esto no se puede deshacer.</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Motivo del contra-movimiento *</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: monto erróneo, pago duplicado, error de cuenta..."
              rows={3}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button variant="destructive" onClick={confirm} disabled={!reason.trim() || busy}>
              {busy && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
              Confirmar reversión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add components/cash/cash-movement-reverse-button.tsx
git commit -m "feat(accounting): #17 reusable reverse button + confirmation modal"
```

---

## Task 6: Integrar button en cash + ledger tables

**Files:**
- Modify: `components/cash/cash-movements-table.tsx` (o donde sea la tabla principal de cash)
- Modify: `components/accounting/ledger-table.tsx`

- [ ] **Step 1: cash table**

Encontrar la tabla principal en cash (puede estar en `cash-summary-client.tsx`, `cash-expenses-client.tsx`, `cash-income-client.tsx` o similar). En cada row, después de las columnas existentes, agregar:

```tsx
<TableCell>
  {row.reversed_at ? (
    <Badge variant="secondary" className="text-[10px]">REVERSADO</Badge>
  ) : row.reverses_movement_id ? (
    <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
      <Undo2 className="h-2.5 w-2.5 mr-1" /> Reverso
    </Badge>
  ) : (
    <CashMovementReverseButton
      movementId={row.id}
      endpoint="cash-movements"
      movementLabel={row.type === "INCOME" ? "ingreso" : "egreso"}
      disabled={!canReverseInUI}
    />
  )}
</TableCell>
```

`canReverseInUI` se calcula con el role del user (visible solo para ADMIN/SUPER_ADMIN/CONTABLE).

Para mostrar el monto tachado cuando `row.reversed_at`, modificar la celda de amount:

```tsx
<TableCell className={row.reversed_at ? "line-through text-muted-foreground" : ""}>
  {formatMoney(row.amount, row.currency)}
</TableCell>
```

Asegurate de que la query SELECT incluya `reversed_at, reverses_movement_id`. Si no, agregalos.

- [ ] **Step 2: ledger table**

Mismo patrón pero `endpoint="ledger-movements"`.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "(cash-movements-table|ledger-table)"
git add <touched files>
git commit -m "feat(accounting): #17 integrar reverse button + badges en cash/ledger tables"
```

---

## Task 7: Final verify + push

- [ ] **Step 1: Tests + tsc**

```bash
npm test -- lib/accounting/__tests__/reversal.test.ts
npx tsc --noEmit 2>&1 | grep -E "(reversal|reverse|cash-movement|ledger)" | head -10
```

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Smoke checklist (handed to user)**

```
[ ] Pasar migration en Supabase
[ ] Como contador: ir a /cash/summary o /cash/income → seleccionar un movimiento → click "↩ Reversar"
[ ] Modal abre → ingresar motivo "test reverse" → confirmar
[ ] Tabla refresh: original con badge REVERSADO + monto tachado, nuevo row con badge ↩ Reverso
[ ] Verificar /accounting/ledger: si el cash tenía ledger asociado, también está reversado
[ ] Re-intentar reversar el mismo row → toast error "ya fue reversado"
[ ] Reversar la reversión → toast error "no se puede reversar una reversión"
```

---

## Self-review checklist

- **Spec coverage:** Schema (T1), lib (T2), endpoints cash + cascade (T3), endpoint ledger (T4), UI button (T5), integration en tables (T6), verify (T7). All spec sections covered.
- **Placeholder scan:** No TBDs. Single intentional generic instruction in T6 ("encontrar la tabla principal") porque la estructura UI cash actual no es estándar — el implementer adapta. Resto del código es verbatim.
- **Type consistency:** `MovementType`, `ReversalCheckResult` exportados. `reverses_movement_id` UUID across cols. Endpoint paths consistent (`cash-movements` vs `ledger-movements`).
