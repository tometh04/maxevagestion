# SP-6 Facturas de Compra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el módulo de carga de facturas recibidas de operadores con datos AFIP completos, asignación N:M a operaciones, OCR opcional y asiento contable automático.

**Architecture:** 3 tablas nuevas (`purchase_invoices`, `purchase_invoice_operations`, `purchase_invoice_perceptions`) + 8 API endpoints + 1 página listado + 1 form de carga + atajo en operación. Reusa `lib/accounting/journal-entries.ts` para asiento y `lib/ai/openai-vision` para OCR. Multi-tenant vía RLS estándar SaaS.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres + Storage), shadcn/ui, OpenAI GPT-4o Vision, Jest, Zod.

**Spec:** [`docs/superpowers/specs/2026-04-25-purchase-invoices-design.md`](../specs/2026-04-25-purchase-invoices-design.md)

---

## File Structure

**New files:**
```
supabase/migrations/20260425120000_purchase_invoices.sql

lib/accounting/purchase-invoices/
├── index.ts                    # public exports
├── types.ts                    # PurchaseInvoiceInput, PurchaseInvoiceWithRelations
├── calculations.ts             # validateTotals, prorateAmounts, computeArs
├── journal-entry.ts            # buildJournalLines, createJournalForInvoice, cancelJournalForInvoice
├── ocr.ts                      # extractInvoiceFieldsFromPdf
└── __tests__/
    ├── calculations.test.ts
    ├── journal-entry.test.ts
    └── ocr.test.ts

app/api/purchase-invoices/
├── route.ts                    # GET list, POST create
├── [id]/
│   ├── route.ts                # GET, PATCH
│   ├── confirm/route.ts        # POST confirm
│   ├── cancel/route.ts         # POST cancel
│   └── operations/route.ts     # PATCH split
└── ocr/route.ts                # POST OCR upload

app/api/operators/[id]/purchase-invoices/route.ts
app/api/operations/[id]/purchase-invoices/route.ts

app/(dashboard)/accounting/purchase-invoices/
├── page.tsx                    # listado
├── new/page.tsx                # form crear
└── [id]/page.tsx               # detalle/edit

components/accounting/purchase-invoices/
├── purchase-invoice-form.tsx
├── operations-split-table.tsx
├── journal-preview.tsx
└── purchase-invoices-table.tsx

components/operations/operation-purchase-invoices-section.tsx

__tests__/isolation/purchase-invoices.test.ts

docs/superpowers/plans/2026-04-25-purchase-invoices-e2e.md
```

**Modified files:**
- `lib/permissions.ts` — agregar matrix entry `purchase-invoices`
- `lib/supabase/types.ts` — auto-regen via `npm run db:generate`
- `components/operations/operation-facturacion-section.tsx` — montar `<OperationPurchaseInvoicesSection />`

---

## Phase 1 — Foundation

### Task 1: Migración SQL — 3 tablas + RLS + alter operator_payments + Storage bucket

**Files:**
- Create: `supabase/migrations/20260425120000_purchase_invoices.sql`

- [ ] **Step 1: Crear el archivo SQL completo**

Crear `supabase/migrations/20260425120000_purchase_invoices.sql`:

```sql
-- ============================================================
-- SP-6: Purchase Invoices (Facturas de Compra de Operadores)
-- ============================================================

-- ---------- TABLA: purchase_invoices ----------
CREATE TABLE purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,

  -- AFIP fields
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('A', 'B', 'C', 'M', 'OTHER')),
  cuit_emitter TEXT NOT NULL,
  point_of_sale TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE,

  -- Currency
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  exchange_rate NUMERIC(18,6),

  -- Amounts (currency original)
  net_amount_21 NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount_105 NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_amount_exempt NUMERIC(18,2) NOT NULL DEFAULT 0,
  iva_amount_21 NUMERIC(18,2) NOT NULL DEFAULT 0,
  iva_amount_105 NUMERIC(18,2) NOT NULL DEFAULT 0,
  perception_iva NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_taxes NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL,

  -- Amounts ARS (cached)
  total_amount_ars NUMERIC(18,2) NOT NULL,
  iva_amount_ars NUMERIC(18,2) NOT NULL,
  perception_iva_ars NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- State
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
  journal_entry_id UUID REFERENCES journal_entries(id),
  cancel_journal_entry_id UUID REFERENCES journal_entries(id),

  -- OCR / PDF
  pdf_storage_path TEXT,
  ocr_metadata JSONB,

  -- Audit
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,

  CONSTRAINT purchase_invoices_total_check CHECK (
    ABS(total_amount - (
      net_amount_21 + net_amount_105 + net_amount_exempt
      + iva_amount_21 + iva_amount_105
      + perception_iva + other_taxes
    )) < 0.01
  ),
  CONSTRAINT purchase_invoices_fx_required CHECK (
    currency = 'ARS' OR exchange_rate IS NOT NULL
  ),
  CONSTRAINT purchase_invoices_unique UNIQUE (org_id, cuit_emitter, point_of_sale, invoice_number)
);

CREATE INDEX idx_purchase_invoices_org_date ON purchase_invoices(org_id, issue_date DESC);
CREATE INDEX idx_purchase_invoices_operator ON purchase_invoices(operator_id);
CREATE INDEX idx_purchase_invoices_status ON purchase_invoices(org_id, status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION purchase_invoices_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchase_invoices_updated_at
  BEFORE UPDATE ON purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION purchase_invoices_set_updated_at();

-- ---------- TABLA: purchase_invoice_operations ----------
CREATE TABLE purchase_invoice_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE RESTRICT,
  amount_original NUMERIC(18,2) NOT NULL,
  amount_ars NUMERIC(18,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pio_unique UNIQUE (purchase_invoice_id, operation_id),
  CONSTRAINT pio_amount_positive CHECK (amount_original > 0)
);

CREATE INDEX idx_pio_invoice ON purchase_invoice_operations(purchase_invoice_id);
CREATE INDEX idx_pio_operation ON purchase_invoice_operations(operation_id);

-- ---------- TABLA: purchase_invoice_perceptions ----------
CREATE TABLE purchase_invoice_perceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  perception_type TEXT NOT NULL CHECK (perception_type IN (
    'IVA_RG_2408', 'IVA_RG_5329',
    'IIBB_CABA', 'IIBB_BSAS', 'IIBB_CORDOBA', 'IIBB_OTHER'
  )),
  amount NUMERIC(18,2) NOT NULL,
  jurisdiction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pip_invoice ON purchase_invoice_perceptions(purchase_invoice_id);

-- ---------- ALTER: operator_payments ----------
ALTER TABLE operator_payments
  ADD COLUMN purchase_invoice_id UUID NULL REFERENCES purchase_invoices(id);

CREATE INDEX idx_operator_payments_purchase_invoice
  ON operator_payments(purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL;

-- ---------- RLS ----------
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_perceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_invoices_tenant_isolation ON purchase_invoices
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    OR EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.auth_id = auth.uid()
      WHERE pa.user_id = u.id
    )
  )
  WITH CHECK (org_id IN (SELECT user_org_ids()));

CREATE POLICY purchase_invoice_operations_tenant_isolation ON purchase_invoice_operations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_invoices pi
      WHERE pi.id = purchase_invoice_operations.purchase_invoice_id
        AND (pi.org_id IN (SELECT user_org_ids())
             OR EXISTS (SELECT 1 FROM platform_admins pa INNER JOIN users u ON u.auth_id = auth.uid() WHERE pa.user_id = u.id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_invoices pi
      WHERE pi.id = purchase_invoice_operations.purchase_invoice_id
        AND pi.org_id IN (SELECT user_org_ids())
    )
  );

CREATE POLICY purchase_invoice_perceptions_tenant_isolation ON purchase_invoice_perceptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_invoices pi
      WHERE pi.id = purchase_invoice_perceptions.purchase_invoice_id
        AND (pi.org_id IN (SELECT user_org_ids())
             OR EXISTS (SELECT 1 FROM platform_admins pa INNER JOIN users u ON u.auth_id = auth.uid() WHERE pa.user_id = u.id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_invoices pi
      WHERE pi.id = purchase_invoice_perceptions.purchase_invoice_id
        AND pi.org_id IN (SELECT user_org_ids())
    )
  );

-- ---------- STORAGE BUCKET ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-invoices', 'purchase-invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — path scheme: <org_id>/<invoice_id>.pdf
CREATE POLICY "Authenticated users can upload purchase invoice PDFs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'purchase-invoices'
    AND (storage.foldername(name))[1] IN (SELECT user_org_ids()::text)
  );

CREATE POLICY "Authenticated users can read their org's purchase invoice PDFs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'purchase-invoices'
    AND (
      (storage.foldername(name))[1] IN (SELECT user_org_ids()::text)
      OR EXISTS (SELECT 1 FROM platform_admins pa INNER JOIN users u ON u.auth_id = auth.uid() WHERE pa.user_id = u.id)
    )
  );

COMMENT ON TABLE purchase_invoices IS 'Facturas recibidas de operadores con datos AFIP completos. SP-6.';
COMMENT ON TABLE purchase_invoice_operations IS 'Split N:M factura ↔ operación. Suma de amount_original = total_amount al confirmar.';
COMMENT ON TABLE purchase_invoice_perceptions IS 'Detalle de percepciones sufridas. v1 solo IVA_RG_2408/5329. IIBB para SP-6.5.';
```

- [ ] **Step 2: Imprimir el SQL en consola para que el user lo corra en Supabase SQL Editor**

Run: `cat supabase/migrations/20260425120000_purchase_invoices.sql`
Expected: SQL output. Copy-paste al user para correr en Supabase SQL Editor del proyecto `pmqvplyyxiobkllapgjp` (regla del repo: pegar SQL en chat, no `supabase db push`).

- [ ] **Step 3: Esperar confirmación del user que la migration corrió OK**

El user dirá "corrió" o pegará el output. Verificar que no hay errores antes de seguir.

- [ ] **Step 4: Commit la migration**

```bash
git add supabase/migrations/20260425120000_purchase_invoices.sql
git commit -m "feat(sp-6): migration purchase_invoices + operations + perceptions

Crea 3 tablas con RLS multi-tenant, FK opcional desde operator_payments,
y bucket de storage purchase-invoices con RLS por org_id."
```

---

### Task 2: Regenerar tipos + actualizar permission matrix

**Files:**
- Modify: `lib/supabase/types.ts` (auto-generated)
- Modify: `lib/permissions.ts:?` (agregar entry para purchase-invoices)

- [ ] **Step 1: Regenerar tipos TypeScript**

Run: `npx supabase gen types typescript --project-id pmqvplyyxiobkllapgjp > lib/supabase/types.ts`
Expected: archivo sobreescrito con las nuevas tablas. Confirmar:

```bash
grep "purchase_invoices:" lib/supabase/types.ts | head -5
```
Expected: muestra entries para `purchase_invoices`, `purchase_invoice_operations`, `purchase_invoice_perceptions`.

- [ ] **Step 2: Leer el archivo `lib/permissions.ts` para encontrar el lugar correcto donde agregar la entry**

Run: `grep -n "accounting" lib/permissions.ts | head`
Expected: muestra líneas donde está la matrix de "accounting". Localizar el bloque PERMISSIONS para agregar la nueva entry.

- [ ] **Step 3: Agregar entry `purchase-invoices` al PERMISSIONS matrix**

Editar `lib/permissions.ts`. Agregar dentro del object PERMISSIONS, junto con las otras entries de `accounting`:

```ts
"accounting.purchase-invoices": {
  SUPER_ADMIN: ["read", "write", "confirm", "cancel"],
  ADMIN: ["read", "write", "confirm", "cancel"],
  CONTABLE: ["read", "write", "confirm", "cancel"],
  SELLER: [],
  VIEWER: ["read"],
},
```

Si la estructura del file usa keys distintas (ej. anidado bajo `accounting`), seguir el patrón existente y mapear `read | write | confirm | cancel` a la convención del repo (ej. si usan `view | create | update | delete`, mapear: read→view, write→create+update, confirm→update, cancel→update).

- [ ] **Step 4: Verificar lint y types**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 errors. Si types fallan, suele ser que algún campo en types.ts cambió — revisar diffs.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/types.ts lib/permissions.ts
git commit -m "feat(sp-6): regen types + permission matrix purchase-invoices"
```

---

## Phase 2 — Pure logic (TDD)

### Task 3: `lib/accounting/purchase-invoices/calculations.ts` — TDD

**Files:**
- Create: `lib/accounting/purchase-invoices/types.ts`
- Create: `lib/accounting/purchase-invoices/calculations.ts`
- Create: `lib/accounting/purchase-invoices/__tests__/calculations.test.ts`
- Create: `lib/accounting/purchase-invoices/index.ts`

- [ ] **Step 1: Escribir test que falla — `calculations.test.ts`**

Crear `lib/accounting/purchase-invoices/__tests__/calculations.test.ts`:

```ts
import {
  validateTotal,
  prorateAmounts,
  computeArs,
} from "../calculations"

describe("validateTotal", () => {
  it("acepta total que coincide con la suma de campos", () => {
    const ok = validateTotal({
      net_amount_21: 100,
      net_amount_105: 0,
      net_amount_exempt: 0,
      iva_amount_21: 21,
      iva_amount_105: 0,
      perception_iva: 5,
      other_taxes: 0,
      total_amount: 126,
    })
    expect(ok.valid).toBe(true)
  })

  it("acepta diferencia menor a $0.01 (redondeo)", () => {
    const ok = validateTotal({
      net_amount_21: 100,
      net_amount_105: 0, net_amount_exempt: 0,
      iva_amount_21: 21,
      iva_amount_105: 0,
      perception_iva: 0, other_taxes: 0,
      total_amount: 121.005,
    })
    expect(ok.valid).toBe(true)
  })

  it("rechaza diferencia mayor a $0.01", () => {
    const bad = validateTotal({
      net_amount_21: 100,
      net_amount_105: 0, net_amount_exempt: 0,
      iva_amount_21: 21,
      iva_amount_105: 0, perception_iva: 0, other_taxes: 0,
      total_amount: 125, // debería ser 121
    })
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe(121)
    expect(bad.actual).toBe(125)
  })
})

describe("prorateAmounts", () => {
  it("proratea por operator_cost_total con redondeo a primera op", () => {
    const result = prorateAmounts({
      total: 1500,
      operations: [
        { id: "op-1", operator_cost_total: 800 },
        { id: "op-2", operator_cost_total: 500 },
      ],
    })

    // pesos: 800/1300 = 0.615..., 500/1300 = 0.384...
    // assigned: 1500 * 0.615 = 923.08, 1500 * 0.384 = 576.92
    // round to 2 decimals; first op gets diff
    expect(result.length).toBe(2)
    const sum = result.reduce((s, r) => s + r.amount_original, 0)
    expect(sum).toBeCloseTo(1500, 2)
    expect(result[0].operation_id).toBe("op-1")
    expect(result[1].operation_id).toBe("op-2")
  })

  it("equal-split cuando todas las operaciones tienen costo 0", () => {
    const result = prorateAmounts({
      total: 100,
      operations: [
        { id: "op-1", operator_cost_total: 0 },
        { id: "op-2", operator_cost_total: 0 },
      ],
    })
    expect(result[0].amount_original).toBeCloseTo(50, 2)
    expect(result[1].amount_original).toBeCloseTo(50, 2)
  })

  it("redondeo: diferencia de centavos va a la primera op", () => {
    // total 100, 3 operaciones equal split → 33.33 + 33.33 + 33.34
    const result = prorateAmounts({
      total: 100,
      operations: [
        { id: "op-1", operator_cost_total: 1 },
        { id: "op-2", operator_cost_total: 1 },
        { id: "op-3", operator_cost_total: 1 },
      ],
    })
    const sum = result.reduce((s, r) => s + r.amount_original, 0)
    expect(sum).toBeCloseTo(100, 2)
    // primera op recibe la diferencia
    expect(result[0].amount_original).toBeGreaterThanOrEqual(33.33)
  })
})

describe("computeArs", () => {
  it("ARS pasa-through (1:1)", () => {
    const out = computeArs({
      currency: "ARS",
      exchange_rate: null,
      total_amount: 100,
      iva_amount_21: 21,
      iva_amount_105: 0,
      perception_iva: 5,
    })
    expect(out.total_amount_ars).toBe(100)
    expect(out.iva_amount_ars).toBe(21)
    expect(out.perception_iva_ars).toBe(5)
  })

  it("USD multiplica por exchange_rate", () => {
    const out = computeArs({
      currency: "USD",
      exchange_rate: 1000,
      total_amount: 100,
      iva_amount_21: 21,
      iva_amount_105: 0,
      perception_iva: 5,
    })
    expect(out.total_amount_ars).toBe(100_000)
    expect(out.iva_amount_ars).toBe(21_000)
    expect(out.perception_iva_ars).toBe(5_000)
  })

  it("USD sin exchange_rate tira error", () => {
    expect(() =>
      computeArs({
        currency: "USD",
        exchange_rate: null,
        total_amount: 100,
        iva_amount_21: 21,
        iva_amount_105: 0,
        perception_iva: 0,
      })
    ).toThrow(/exchange_rate/)
  })
})
```

- [ ] **Step 2: Run test — verificar que falla**

Run: `npm run test -- lib/accounting/purchase-invoices/__tests__/calculations.test.ts`
Expected: FAIL — "Cannot find module '../calculations'".

- [ ] **Step 3: Crear `types.ts`**

Crear `lib/accounting/purchase-invoices/types.ts`:

```ts
export interface InvoiceAmounts {
  net_amount_21: number
  net_amount_105: number
  net_amount_exempt: number
  iva_amount_21: number
  iva_amount_105: number
  perception_iva: number
  other_taxes: number
  total_amount: number
}

export interface ProrateInput {
  total: number
  operations: Array<{ id: string; operator_cost_total: number }>
}

export interface ProrateResult {
  operation_id: string
  amount_original: number
}

export interface ComputeArsInput {
  currency: "ARS" | "USD"
  exchange_rate: number | null
  total_amount: number
  iva_amount_21: number
  iva_amount_105: number
  perception_iva: number
}

export interface ComputeArsResult {
  total_amount_ars: number
  iva_amount_ars: number
  perception_iva_ars: number
}
```

- [ ] **Step 4: Crear `calculations.ts` con implementación mínima**

Crear `lib/accounting/purchase-invoices/calculations.ts`:

```ts
import type {
  InvoiceAmounts,
  ProrateInput,
  ProrateResult,
  ComputeArsInput,
  ComputeArsResult,
} from "./types"

const TOLERANCE = 0.01

const round2 = (n: number) => Math.round(n * 100) / 100

export function validateTotal(amounts: InvoiceAmounts): {
  valid: boolean
  expected: number
  actual: number
  difference: number
} {
  const expected = round2(
    amounts.net_amount_21 +
      amounts.net_amount_105 +
      amounts.net_amount_exempt +
      amounts.iva_amount_21 +
      amounts.iva_amount_105 +
      amounts.perception_iva +
      amounts.other_taxes
  )
  const difference = Math.abs(expected - amounts.total_amount)
  return {
    valid: difference < TOLERANCE,
    expected,
    actual: amounts.total_amount,
    difference,
  }
}

export function prorateAmounts(input: ProrateInput): ProrateResult[] {
  const { total, operations } = input
  if (operations.length === 0) return []

  const weights = operations.map((op) => op.operator_cost_total)
  const totalWeight = weights.reduce((s, w) => s + w, 0)

  // Si todos los costos son 0 → equal split
  let amounts: number[]
  if (totalWeight === 0) {
    const equal = round2(total / operations.length)
    amounts = operations.map(() => equal)
  } else {
    amounts = weights.map((w) => round2((total * w) / totalWeight))
  }

  // Redondeo: diferencia va a primera op
  const sum = amounts.reduce((s, a) => s + a, 0)
  const diff = round2(total - sum)
  if (Math.abs(diff) >= 0.01) {
    amounts[0] = round2(amounts[0] + diff)
  }

  return operations.map((op, i) => ({
    operation_id: op.id,
    amount_original: amounts[i],
  }))
}

export function computeArs(input: ComputeArsInput): ComputeArsResult {
  if (input.currency === "USD" && !input.exchange_rate) {
    throw new Error("exchange_rate es requerido cuando currency=USD")
  }
  const rate = input.currency === "USD" ? input.exchange_rate! : 1
  return {
    total_amount_ars: round2(input.total_amount * rate),
    iva_amount_ars: round2((input.iva_amount_21 + input.iva_amount_105) * rate),
    perception_iva_ars: round2(input.perception_iva * rate),
  }
}
```

- [ ] **Step 5: Crear `index.ts` con exports públicos**

Crear `lib/accounting/purchase-invoices/index.ts`:

```ts
export * from "./types"
export { validateTotal, prorateAmounts, computeArs } from "./calculations"
```

- [ ] **Step 6: Run test — verificar que pasa**

Run: `npm run test -- lib/accounting/purchase-invoices/__tests__/calculations.test.ts`
Expected: PASS — all 8 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/accounting/purchase-invoices/
git commit -m "feat(sp-6): pure logic — validateTotal, prorateAmounts, computeArs

TDD con 8 tests: validación de totales (con tolerancia $0.01),
prorateo por operator_cost_total con fallback equal-split, y conversión
ARS para USD."
```

---

### Task 4: `lib/accounting/purchase-invoices/journal-entry.ts` — TDD

**Files:**
- Create: `lib/accounting/purchase-invoices/journal-entry.ts`
- Create: `lib/accounting/purchase-invoices/__tests__/journal-entry.test.ts`

- [ ] **Step 1: Escribir test que falla**

Crear `lib/accounting/purchase-invoices/__tests__/journal-entry.test.ts`:

```ts
import { buildJournalLines } from "../journal-entry"

describe("buildJournalLines", () => {
  const chartAccounts = {
    "4.2.01": "uuid-costo-operadores",
    "1.1.07": "uuid-iva-credito",
    "2.1.04": "uuid-percepciones-afip",
    "2.1.01": "uuid-cuentas-pagar",
  }

  it("genera 4 líneas balanceadas para factura simple", () => {
    const lines = buildJournalLines({
      net_total_ars: 1000,
      iva_amount_ars: 210,
      perception_iva_ars: 30,
      total_amount_ars: 1240,
      operator_id: "op-uuid",
      chartAccounts,
    })

    expect(lines).toHaveLength(4)

    // Costo operadores
    expect(lines[0].chart_account_id).toBe("uuid-costo-operadores")
    expect(lines[0].debit_amount).toBe(1000)
    expect(lines[0].credit_amount).toBeFalsy()

    // IVA crédito
    expect(lines[1].chart_account_id).toBe("uuid-iva-credito")
    expect(lines[1].debit_amount).toBe(210)

    // Percepción
    expect(lines[2].chart_account_id).toBe("uuid-percepciones-afip")
    expect(lines[2].debit_amount).toBe(30)

    // Cuentas a pagar
    expect(lines[3].chart_account_id).toBe("uuid-cuentas-pagar")
    expect(lines[3].credit_amount).toBe(1240)
    expect(lines[3].operator_id).toBe("op-uuid")

    // Balance: 1000+210+30 = 1240
    const totalDebit = lines.reduce((s, l) => s + (l.debit_amount || 0), 0)
    const totalCredit = lines.reduce((s, l) => s + (l.credit_amount || 0), 0)
    expect(totalDebit).toBe(totalCredit)
  })

  it("omite líneas con monto 0 (sin IVA, sin percepción)", () => {
    const lines = buildJournalLines({
      net_total_ars: 1000,
      iva_amount_ars: 0,
      perception_iva_ars: 0,
      total_amount_ars: 1000,
      operator_id: "op-uuid",
      chartAccounts,
    })

    expect(lines).toHaveLength(2)
    expect(lines[0].debit_amount).toBe(1000)
    expect(lines[1].credit_amount).toBe(1000)
  })

  it("tira error si chartAccounts no tiene un código requerido", () => {
    expect(() =>
      buildJournalLines({
        net_total_ars: 1000,
        iva_amount_ars: 210,
        perception_iva_ars: 0,
        total_amount_ars: 1210,
        operator_id: "op-uuid",
        chartAccounts: { "4.2.01": "x" }, // falta IVA, PERCEP, PAGAR
      })
    ).toThrow(/chart account/i)
  })
})
```

- [ ] **Step 2: Run test — verifica que falla**

Run: `npm run test -- lib/accounting/purchase-invoices/__tests__/journal-entry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `journal-entry.ts`**

Crear `lib/accounting/purchase-invoices/journal-entry.ts`:

```ts
import { ACCOUNT_CODES } from "@/lib/accounting/account-codes"
import type { JournalEntryLine } from "@/lib/accounting/journal-entries"

export interface BuildJournalLinesParams {
  net_total_ars: number
  iva_amount_ars: number
  perception_iva_ars: number
  total_amount_ars: number
  operator_id: string
  /** Map de account_code → chart_account.id (UUID). Ver lookupChartAccountIds. */
  chartAccounts: Record<string, string>
}

const REQUIRED_CODES = [
  ACCOUNT_CODES.COSTO_OPERADORES,
  ACCOUNT_CODES.IVA_CREDITO,
  ACCOUNT_CODES.PERCEPCIONES_AFIP,
  ACCOUNT_CODES.CUENTAS_POR_PAGAR,
]

export function buildJournalLines(params: BuildJournalLinesParams): JournalEntryLine[] {
  const { net_total_ars, iva_amount_ars, perception_iva_ars, total_amount_ars, operator_id, chartAccounts } = params

  for (const code of REQUIRED_CODES) {
    if (!chartAccounts[code]) {
      throw new Error(`Falta chart account para código ${code}`)
    }
  }

  const lines: JournalEntryLine[] = []

  if (net_total_ars > 0) {
    lines.push({
      chart_account_id: chartAccounts[ACCOUNT_CODES.COSTO_OPERADORES],
      debit_amount: net_total_ars,
      legacy_type: "EXPENSE",
      operator_id,
    })
  }

  if (iva_amount_ars > 0) {
    lines.push({
      chart_account_id: chartAccounts[ACCOUNT_CODES.IVA_CREDITO],
      debit_amount: iva_amount_ars,
      legacy_type: "EXPENSE",
    })
  }

  if (perception_iva_ars > 0) {
    lines.push({
      chart_account_id: chartAccounts[ACCOUNT_CODES.PERCEPCIONES_AFIP],
      debit_amount: perception_iva_ars,
      legacy_type: "EXPENSE",
    })
  }

  // Crédito final
  lines.push({
    chart_account_id: chartAccounts[ACCOUNT_CODES.CUENTAS_POR_PAGAR],
    credit_amount: total_amount_ars,
    legacy_type: "OPERATOR_PAYMENT",
    operator_id,
  })

  return lines
}

/**
 * Lookup helper. Devuelve un map account_code → chart_account.id
 * Tira error si falta cualquier código de la lista REQUIRED_CODES.
 */
export async function lookupChartAccountIds(
  supabase: any,
  codes: string[]
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("chart_accounts")
    .select("id, code")
    .in("code", codes)

  if (error) throw new Error(`Error buscando chart_accounts: ${error.message}`)

  const map: Record<string, string> = {}
  for (const row of data || []) {
    map[row.code] = row.id
  }

  for (const code of codes) {
    if (!map[code]) {
      throw new Error(`No existe chart_account con código ${code} en el plan de cuentas`)
    }
  }

  return map
}
```

- [ ] **Step 4: Update `index.ts` para exportar el helper**

Editar `lib/accounting/purchase-invoices/index.ts`:

```ts
export * from "./types"
export { validateTotal, prorateAmounts, computeArs } from "./calculations"
export { buildJournalLines, lookupChartAccountIds } from "./journal-entry"
```

- [ ] **Step 5: Run test — verifica que pasa**

Run: `npm run test -- lib/accounting/purchase-invoices/__tests__/journal-entry.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/accounting/purchase-invoices/journal-entry.ts \
        lib/accounting/purchase-invoices/__tests__/journal-entry.test.ts \
        lib/accounting/purchase-invoices/index.ts
git commit -m "feat(sp-6): buildJournalLines + lookupChartAccountIds

Genera líneas balanceadas para asiento de factura de compra:
COSTO_OPERADORES + IVA_CREDITO + PERCEPCIONES_AFIP en debe, CUENTAS_POR_PAGAR en haber.
Omite líneas con monto 0."
```

---

### Task 5: `lib/accounting/purchase-invoices/ocr.ts` — TDD con mock

**Files:**
- Create: `lib/accounting/purchase-invoices/ocr.ts`
- Create: `lib/accounting/purchase-invoices/__tests__/ocr.test.ts`

- [ ] **Step 1: Escribir test que falla con mock de OpenAI**

Crear `lib/accounting/purchase-invoices/__tests__/ocr.test.ts`:

```ts
import { extractInvoiceFieldsFromPdf } from "../ocr"

// Mock del cliente OpenAI
const mockChatCompletionsCreate = jest.fn()
jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockChatCompletionsCreate } },
    })),
  }
})

describe("extractInvoiceFieldsFromPdf", () => {
  beforeEach(() => {
    mockChatCompletionsCreate.mockReset()
  })

  it("parsea respuesta JSON de Vision con campos esperados", async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              invoice_type: "A",
              cuit_emitter: "30712345678",
              point_of_sale: "0001",
              invoice_number: "00000045",
              issue_date: "2026-04-22",
              net_amount_21: 1000,
              iva_amount_21: 210,
              net_amount_105: 0,
              iva_amount_105: 0,
              net_amount_exempt: 0,
              perception_iva: 30,
              other_taxes: 0,
              total_amount: 1240,
              confidence: 0.95,
            }),
          },
        },
      ],
    })

    const result = await extractInvoiceFieldsFromPdf({
      pdfDataUrl: "data:application/pdf;base64,...",
    })

    expect(result.fields.invoice_type).toBe("A")
    expect(result.fields.cuit_emitter).toBe("30712345678")
    expect(result.fields.total_amount).toBe(1240)
    expect(result.confidence).toBe(0.95)
    expect(result.raw_response).toBeTruthy()
  })

  it("tira error si confidence < 0.7", async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              invoice_type: "A",
              cuit_emitter: "",
              point_of_sale: "",
              invoice_number: "",
              issue_date: "",
              net_amount_21: 0,
              iva_amount_21: 0,
              net_amount_105: 0,
              iva_amount_105: 0,
              net_amount_exempt: 0,
              perception_iva: 0,
              other_taxes: 0,
              total_amount: 0,
              confidence: 0.4,
            }),
          },
        },
      ],
    })

    await expect(
      extractInvoiceFieldsFromPdf({ pdfDataUrl: "data:application/pdf;base64,..." })
    ).rejects.toThrow(/confidence/i)
  })

  it("tira error si la respuesta no es JSON válido", async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "este no es json" } }],
    })

    await expect(
      extractInvoiceFieldsFromPdf({ pdfDataUrl: "data:application/pdf;base64,..." })
    ).rejects.toThrow(/JSON/)
  })
})
```

- [ ] **Step 2: Run test — verifica que falla**

Run: `npm run test -- lib/accounting/purchase-invoices/__tests__/ocr.test.ts`
Expected: FAIL — "Cannot find module '../ocr'".

- [ ] **Step 3: Implementar `ocr.ts`**

Crear `lib/accounting/purchase-invoices/ocr.ts`:

```ts
import OpenAI from "openai"
import { z } from "zod"

const InvoiceFieldsSchema = z.object({
  invoice_type: z.enum(["A", "B", "C", "M", "OTHER"]),
  cuit_emitter: z.string(),
  point_of_sale: z.string(),
  invoice_number: z.string(),
  issue_date: z.string(),
  net_amount_21: z.number(),
  iva_amount_21: z.number(),
  net_amount_105: z.number(),
  iva_amount_105: z.number(),
  net_amount_exempt: z.number(),
  perception_iva: z.number(),
  other_taxes: z.number(),
  total_amount: z.number(),
  confidence: z.number().min(0).max(1),
})

export type InvoiceFields = z.infer<typeof InvoiceFieldsSchema>

export interface OcrResult {
  fields: InvoiceFields
  confidence: number
  raw_response: string
}

const PROMPT = `Extraé los siguientes campos de esta factura argentina (tipo A, B, C o M):

- invoice_type: tipo de comprobante (A, B, C, M, o OTHER)
- cuit_emitter: CUIT del emisor (sin guiones, 11 dígitos)
- point_of_sale: punto de venta (4 dígitos zero-padded)
- invoice_number: número del comprobante (8 dígitos zero-padded)
- issue_date: fecha de emisión en formato YYYY-MM-DD
- net_amount_21: importe neto gravado al 21% (número, 0 si no aplica)
- iva_amount_21: IVA al 21% (número, 0 si no aplica)
- net_amount_105: importe neto gravado al 10.5% (número, 0 si no aplica)
- iva_amount_105: IVA al 10.5% (número, 0 si no aplica)
- net_amount_exempt: importe exento (número, 0 si no aplica)
- perception_iva: percepción IVA (número, 0 si no aplica)
- other_taxes: otros impuestos / impuestos internos (número, 0 si no aplica)
- total_amount: total final
- confidence: tu confianza en la extracción (0.0 a 1.0)

Devolvé EXCLUSIVAMENTE un JSON válido con esos campos. Si un campo no aparece o no se puede leer, ponelo en 0 / cadena vacía y bajá la confidence.`

const MIN_CONFIDENCE = 0.7

export async function extractInvoiceFieldsFromPdf(input: {
  pdfDataUrl: string
}): Promise<OcrResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY no configurada")

  const client = new OpenAI({ apiKey })

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: input.pdfDataUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error("OpenAI no devolvió contenido")

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error(`OpenAI no devolvió JSON válido: ${content.slice(0, 200)}`)
  }

  const validation = InvoiceFieldsSchema.safeParse(parsed)
  if (!validation.success) {
    throw new Error(`OCR JSON no matchea schema: ${validation.error.message}`)
  }

  if (validation.data.confidence < MIN_CONFIDENCE) {
    throw new Error(
      `OCR confidence ${validation.data.confidence} < mínimo ${MIN_CONFIDENCE}. Cargá manualmente.`
    )
  }

  return {
    fields: validation.data,
    confidence: validation.data.confidence,
    raw_response: content,
  }
}
```

- [ ] **Step 4: Update `index.ts`**

Editar `lib/accounting/purchase-invoices/index.ts`:

```ts
export * from "./types"
export { validateTotal, prorateAmounts, computeArs } from "./calculations"
export { buildJournalLines, lookupChartAccountIds } from "./journal-entry"
export { extractInvoiceFieldsFromPdf } from "./ocr"
export type { InvoiceFields, OcrResult } from "./ocr"
```

- [ ] **Step 5: Run test — verifica que pasa**

Run: `npm run test -- lib/accounting/purchase-invoices/__tests__/ocr.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/accounting/purchase-invoices/ocr.ts \
        lib/accounting/purchase-invoices/__tests__/ocr.test.ts \
        lib/accounting/purchase-invoices/index.ts
git commit -m "feat(sp-6): OCR de facturas con OpenAI Vision

Wrapper sobre GPT-4o vision con prompt específico de facturas AFIP,
schema Zod-validado, threshold de confidence 0.7."
```

---

## Phase 3 — API endpoints

### Task 6: POST + GET single + PATCH `/api/purchase-invoices`

**Files:**
- Create: `app/api/purchase-invoices/route.ts` (POST)
- Create: `app/api/purchase-invoices/[id]/route.ts` (GET, PATCH)

- [ ] **Step 1: Crear `app/api/purchase-invoices/route.ts` con POST**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import {
  validateTotal,
  computeArs,
} from "@/lib/accounting/purchase-invoices"

const CreateInputSchema = z.object({
  operator_id: z.string().uuid(),
  agency_id: z.string().uuid().optional().nullable(),
  invoice_type: z.enum(["A", "B", "C", "M", "OTHER"]),
  cuit_emitter: z.string().min(11).max(13),
  point_of_sale: z.string(),
  invoice_number: z.string(),
  issue_date: z.string(),
  due_date: z.string().optional().nullable(),
  currency: z.enum(["ARS", "USD"]),
  exchange_rate: z.number().positive().optional().nullable(),
  net_amount_21: z.number().nonnegative().default(0),
  net_amount_105: z.number().nonnegative().default(0),
  net_amount_exempt: z.number().nonnegative().default(0),
  iva_amount_21: z.number().nonnegative().default(0),
  iva_amount_105: z.number().nonnegative().default(0),
  perception_iva: z.number().nonnegative().default(0),
  other_taxes: z.number().nonnegative().default(0),
  total_amount: z.number().positive(),
  notes: z.string().optional().nullable(),
  pdf_storage_path: z.string().optional().nullable(),
  ocr_metadata: z.any().optional().nullable(),
})

export async function POST(req: Request) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!canPerformAction(user.role, "accounting.purchase-invoices", "write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation", issues: parsed.error.issues }, { status: 400 })
  }
  const input = parsed.data

  // Validar total
  const tv = validateTotal(input)
  if (!tv.valid) {
    return NextResponse.json(
      { error: "Total no cuadra con suma de campos", expected: tv.expected, actual: tv.actual },
      { status: 400 }
    )
  }

  // FX
  let ars
  try {
    ars = computeArs({
      currency: input.currency,
      exchange_rate: input.exchange_rate ?? null,
      total_amount: input.total_amount,
      iva_amount_21: input.iva_amount_21,
      iva_amount_105: input.iva_amount_105,
      perception_iva: input.perception_iva,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }

  const supabase = await createServerClient()

  const { data, error } = await (supabase.from("purchase_invoices") as any)
    .insert({
      org_id: user.org_id,
      agency_id: input.agency_id || null,
      operator_id: input.operator_id,
      invoice_type: input.invoice_type,
      cuit_emitter: input.cuit_emitter,
      point_of_sale: input.point_of_sale,
      invoice_number: input.invoice_number,
      issue_date: input.issue_date,
      due_date: input.due_date || null,
      currency: input.currency,
      exchange_rate: input.exchange_rate ?? null,
      net_amount_21: input.net_amount_21,
      net_amount_105: input.net_amount_105,
      net_amount_exempt: input.net_amount_exempt,
      iva_amount_21: input.iva_amount_21,
      iva_amount_105: input.iva_amount_105,
      perception_iva: input.perception_iva,
      other_taxes: input.other_taxes,
      total_amount: input.total_amount,
      total_amount_ars: ars.total_amount_ars,
      iva_amount_ars: ars.iva_amount_ars,
      perception_iva_ars: ars.perception_iva_ars,
      status: "DRAFT",
      notes: input.notes || null,
      pdf_storage_path: input.pdf_storage_path || null,
      ocr_metadata: input.ocr_metadata || null,
      created_by: user.id,
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Factura duplicada (ya existe con mismo CUIT+pto+nro en esta org)" },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
```

- [ ] **Step 2: Crear `app/api/purchase-invoices/[id]/route.ts` con GET y PATCH**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { validateTotal, computeArs } from "@/lib/accounting/purchase-invoices"

const PatchSchema = z.object({
  invoice_type: z.enum(["A", "B", "C", "M", "OTHER"]).optional(),
  cuit_emitter: z.string().optional(),
  point_of_sale: z.string().optional(),
  invoice_number: z.string().optional(),
  issue_date: z.string().optional(),
  due_date: z.string().nullable().optional(),
  currency: z.enum(["ARS", "USD"]).optional(),
  exchange_rate: z.number().positive().nullable().optional(),
  net_amount_21: z.number().nonnegative().optional(),
  net_amount_105: z.number().nonnegative().optional(),
  net_amount_exempt: z.number().nonnegative().optional(),
  iva_amount_21: z.number().nonnegative().optional(),
  iva_amount_105: z.number().nonnegative().optional(),
  perception_iva: z.number().nonnegative().optional(),
  other_taxes: z.number().nonnegative().optional(),
  total_amount: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
})

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canPerformAction(user.role, "accounting.purchase-invoices", "read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  const supabase = await createServerClient()

  const { data, error } = await (supabase.from("purchase_invoices") as any)
    .select(`
      *,
      operator:operators(id, name, cuit),
      operations:purchase_invoice_operations(
        id, operation_id, amount_original, amount_ars, notes,
        operation:operations(id, customer_name, operator_cost_total, currency)
      ),
      perceptions:purchase_invoice_perceptions(*)
    `)
    .eq("id", id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ data })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canPerformAction(user.role, "accounting.purchase-invoices", "write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation", issues: parsed.error.issues }, { status: 400 })
  }

  const supabase = await createServerClient()

  // Solo permitir editar DRAFT
  const { data: current } = await (supabase.from("purchase_invoices") as any)
    .select("status")
    .eq("id", id)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (current.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Solo se puede editar facturas en estado DRAFT (actual: ${current.status})` },
      { status: 409 }
    )
  }

  // Si vienen amounts, recalcular ars
  const updates: Record<string, any> = { ...parsed.data }
  const hasAmountChanges =
    parsed.data.total_amount !== undefined ||
    parsed.data.net_amount_21 !== undefined ||
    parsed.data.iva_amount_21 !== undefined ||
    parsed.data.iva_amount_105 !== undefined ||
    parsed.data.perception_iva !== undefined ||
    parsed.data.currency !== undefined ||
    parsed.data.exchange_rate !== undefined

  if (hasAmountChanges) {
    // Cargar la factura completa para mergear
    const { data: full } = await (supabase.from("purchase_invoices") as any)
      .select("*")
      .eq("id", id)
      .single()
    const merged = { ...full, ...parsed.data }

    const tv = validateTotal(merged)
    if (!tv.valid) {
      return NextResponse.json(
        { error: "Total no cuadra", expected: tv.expected, actual: tv.actual },
        { status: 400 }
      )
    }

    try {
      const ars = computeArs({
        currency: merged.currency,
        exchange_rate: merged.exchange_rate,
        total_amount: merged.total_amount,
        iva_amount_21: merged.iva_amount_21,
        iva_amount_105: merged.iva_amount_105,
        perception_iva: merged.perception_iva,
      })
      updates.total_amount_ars = ars.total_amount_ars
      updates.iva_amount_ars = ars.iva_amount_ars
      updates.perception_iva_ars = ars.perception_iva_ars
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
  }

  const { data, error } = await (supabase.from("purchase_invoices") as any)
    .update(updates)
    .eq("id", id)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

- [ ] **Step 3: Smoke test rápido con curl (servidor dev arriba en :3044)**

Run en otra terminal: `npm run dev`. Después:

```bash
# crear factura DRAFT — esperá 201 con data
curl -sX POST http://localhost:3044/api/purchase-invoices \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"operator_id":"<uuid-real>","invoice_type":"A","cuit_emitter":"30712345678","point_of_sale":"0001","invoice_number":"00000099","issue_date":"2026-04-25","currency":"ARS","net_amount_21":1000,"iva_amount_21":210,"total_amount":1210}'
```

Si auth bloquea, usar `DISABLE_AUTH=true` en `.env.local` y refrescar dev server. **Importante**: con DISABLE_AUTH el mock user tiene `org_id=null`, así que el RLS rechaza. Para test real, loguearse como Maxi o Tomi en el browser y copiar la cookie. Si no, saltar smoke y testear desde UI más adelante.

- [ ] **Step 4: Commit**

```bash
git add app/api/purchase-invoices/route.ts app/api/purchase-invoices/\[id\]/route.ts
git commit -m "feat(sp-6): API POST/GET/PATCH purchase-invoices

Crear como DRAFT con validación de total y FX.
Editar solo DRAFT. Detalle con relations (operator, operations, perceptions)."
```

---

### Task 7: GET list `/api/purchase-invoices` con filtros

**Files:**
- Modify: `app/api/purchase-invoices/route.ts` (agregar GET)

- [ ] **Step 1: Agregar handler GET al `app/api/purchase-invoices/route.ts`**

Apendear al archivo existente:

```ts
export async function GET(req: Request) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canPerformAction(user.role, "accounting.purchase-invoices", "read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const operatorId = url.searchParams.get("operator_id")
  const month = url.searchParams.get("month") // YYYY-MM
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200)
  const offset = Number(url.searchParams.get("offset") ?? 0)

  const supabase = await createServerClient()
  let query = (supabase.from("purchase_invoices") as any)
    .select(`
      id, issue_date, invoice_type, point_of_sale, invoice_number,
      currency, total_amount, total_amount_ars, status, created_at,
      operator:operators(id, name)
    `, { count: "exact" })
    .order("issue_date", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq("status", status)
  if (operatorId) query = query.eq("operator_id", operatorId)
  if (month) {
    const [y, m] = month.split("-").map(Number)
    const start = `${y}-${String(m).padStart(2, "0")}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    query = query.gte("issue_date", start).lte("issue_date", end)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, count })
}
```

- [ ] **Step 2: Smoke test**

```bash
curl -s "http://localhost:3044/api/purchase-invoices?status=DRAFT&limit=10" -b cookies.txt
```
Expected: `{ "data": [...], "count": N }`

- [ ] **Step 3: Commit**

```bash
git add app/api/purchase-invoices/route.ts
git commit -m "feat(sp-6): GET /api/purchase-invoices listado con filtros

Filtros: status, operator_id, month (YYYY-MM). Pagination via limit/offset.
Order por issue_date desc."
```

---

### Task 8: POST `/api/purchase-invoices/[id]/confirm` — DRAFT → CONFIRMED + journal

**Files:**
- Create: `app/api/purchase-invoices/[id]/confirm/route.ts`

- [ ] **Step 1: Crear el endpoint**

```ts
import { NextResponse } from "next/server"
import { ACCOUNT_CODES } from "@/lib/accounting/account-codes"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import {
  buildJournalLines,
  lookupChartAccountIds,
} from "@/lib/accounting/purchase-invoices"
import { createJournalEntry } from "@/lib/accounting/journal-entries"

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canPerformAction(user.role, "accounting.purchase-invoices", "confirm")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  const supabase = await createServerClient()

  // Cargar la factura + split
  const { data: invoice, error: invErr } = await (supabase.from("purchase_invoices") as any)
    .select(`
      *,
      operations:purchase_invoice_operations(amount_original)
    `)
    .eq("id", id)
    .maybeSingle()

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (invoice.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Solo se puede confirmar DRAFT (actual: ${invoice.status})` },
      { status: 409 }
    )
  }

  // Validar split: suma debe matchear total_amount
  const splitSum = (invoice.operations || []).reduce(
    (s: number, op: any) => s + Number(op.amount_original),
    0
  )
  const splitDiff = Math.abs(splitSum - Number(invoice.total_amount))
  if (invoice.operations.length === 0) {
    return NextResponse.json(
      { error: "No hay operaciones asignadas. Asigná al menos una antes de confirmar." },
      { status: 400 }
    )
  }
  if (splitDiff >= 0.01) {
    return NextResponse.json(
      { error: "Suma del split no cuadra con total", split_sum: splitSum, total: invoice.total_amount },
      { status: 400 }
    )
  }

  // Calcular net_total_ars (sum de los netos en ARS)
  const netTotalArs =
    (Number(invoice.net_amount_21) +
      Number(invoice.net_amount_105) +
      Number(invoice.net_amount_exempt)) *
    (invoice.currency === "USD" ? Number(invoice.exchange_rate) : 1)

  // Lookup chart accounts
  const codes = [
    ACCOUNT_CODES.COSTO_OPERADORES,
    ACCOUNT_CODES.IVA_CREDITO,
    ACCOUNT_CODES.PERCEPCIONES_AFIP,
    ACCOUNT_CODES.CUENTAS_POR_PAGAR,
  ]
  let chartAccounts: Record<string, string>
  try {
    chartAccounts = await lookupChartAccountIds(supabase, codes)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  // Build lines
  const lines = buildJournalLines({
    net_total_ars: Math.round(netTotalArs * 100) / 100,
    iva_amount_ars: Number(invoice.iva_amount_ars),
    perception_iva_ars: Number(invoice.perception_iva_ars),
    total_amount_ars: Number(invoice.total_amount_ars),
    operator_id: invoice.operator_id,
    chartAccounts,
  })

  // Crear asiento
  let journalEntry
  try {
    journalEntry = await createJournalEntry(
      {
        entry_date: invoice.issue_date,
        description: `Factura compra ${invoice.invoice_type} ${invoice.point_of_sale}-${invoice.invoice_number}`,
        source: "MANUAL",
        lines,
        currency: "ARS",
        created_by: user.id,
        notes: `purchase_invoice_id: ${invoice.id}`,
      },
      supabase
    )
  } catch (e: any) {
    return NextResponse.json({ error: `Error creando asiento: ${e.message}` }, { status: 500 })
  }

  // Update factura → CONFIRMED + linkear journal_entry_id
  const { data: updated, error: updErr } = await (supabase.from("purchase_invoices") as any)
    .update({
      status: "CONFIRMED",
      confirmed_at: new Date().toISOString(),
      journal_entry_id: journalEntry.id,
    })
    .eq("id", id)
    .select("*")
    .single()

  if (updErr) {
    // Best-effort cleanup: borrar journal entry para no dejar inconsistencia
    await (supabase.from("journal_entries") as any).delete().eq("id", journalEntry.id)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated, journal_entry: journalEntry })
}
```

- [ ] **Step 2: Smoke test (factura DRAFT con split asignado en DB)**

```bash
curl -sX POST http://localhost:3044/api/purchase-invoices/<id>/confirm -b cookies.txt
```
Expected: `{ "data": { ..., status: "CONFIRMED", journal_entry_id: "..." }, "journal_entry": {...} }`.

- [ ] **Step 3: Commit**

```bash
git add app/api/purchase-invoices/\[id\]/confirm/route.ts
git commit -m "feat(sp-6): POST /confirm — DRAFT a CONFIRMED + asiento contable

Valida split sum = total. Lookups chart_accounts. Crea journal_entry
con líneas balanceadas via lib/accounting/journal-entries.
Cleanup best-effort si update falla."
```

---

### Task 9: POST `/api/purchase-invoices/[id]/cancel` — CONFIRMED → CANCELLED + counter-journal

**Files:**
- Create: `app/api/purchase-invoices/[id]/cancel/route.ts`

- [ ] **Step 1: Crear el endpoint**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { createJournalEntry } from "@/lib/accounting/journal-entries"

const CancelSchema = z.object({
  reason: z.string().min(1).max(500),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canPerformAction(user.role, "accounting.purchase-invoices", "cancel")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json()
  const parsed = CancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation", issues: parsed.error.issues }, { status: 400 })
  }

  const supabase = await createServerClient()

  // Cargar factura + journal_entry actual
  const { data: invoice } = await (supabase.from("purchase_invoices") as any)
    .select("*, journal_entry:journal_entries(*, lines:ledger_movements(*))")
    .eq("id", id)
    .maybeSingle()

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (invoice.status === "CANCELLED") {
    return NextResponse.json({ error: "Ya está CANCELLED" }, { status: 409 })
  }

  // Si no estaba confirmada, simplemente marcar como CANCELLED sin asiento
  if (invoice.status === "DRAFT") {
    const { data: updated, error } = await (supabase.from("purchase_invoices") as any)
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancelled_reason: parsed.data.reason,
      })
      .eq("id", id)
      .select("*").single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: updated })
  }

  // CONFIRMED → crear contra-asiento (debit ↔ credit invertidos)
  if (!invoice.journal_entry) {
    return NextResponse.json({ error: "Factura CONFIRMED sin journal_entry — inconsistencia" }, { status: 500 })
  }

  const reverseLines = (invoice.journal_entry.lines || []).map((line: any) => ({
    chart_account_id: line.chart_account_id,
    financial_account_id: line.account_id,
    // Invertir
    debit_amount: line.credit_amount && line.credit_amount > 0 ? line.credit_amount : null,
    credit_amount: line.debit_amount && line.debit_amount > 0 ? line.debit_amount : null,
    legacy_type: line.type,
    legacy_method: line.method,
    operator_id: line.operator_id,
  }))

  let counterEntry
  try {
    counterEntry = await createJournalEntry(
      {
        entry_date: new Date().toISOString().slice(0, 10),
        description: `ANULACIÓN factura compra ${invoice.invoice_type} ${invoice.point_of_sale}-${invoice.invoice_number}`,
        source: "MANUAL",
        lines: reverseLines,
        currency: invoice.journal_entry.currency,
        created_by: user.id,
        notes: `Reverse of journal_entry ${invoice.journal_entry.id} — purchase_invoice ${invoice.id} — reason: ${parsed.data.reason}`,
      },
      supabase
    )
  } catch (e: any) {
    return NextResponse.json({ error: `Error creando contra-asiento: ${e.message}` }, { status: 500 })
  }

  const { data: updated, error: updErr } = await (supabase.from("purchase_invoices") as any)
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: parsed.data.reason,
      cancel_journal_entry_id: counterEntry.id,
    })
    .eq("id", id)
    .select("*").single()

  if (updErr) {
    await (supabase.from("journal_entries") as any).delete().eq("id", counterEntry.id)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated, cancel_journal_entry: counterEntry })
}
```

- [ ] **Step 2: Smoke test (factura CONFIRMED)**

```bash
curl -sX POST http://localhost:3044/api/purchase-invoices/<id>/cancel \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"reason":"factura mal cargada"}'
```
Expected: `{ "data": { status: "CANCELLED", cancel_journal_entry_id: "..." }, "cancel_journal_entry": {...} }`

- [ ] **Step 3: Commit**

```bash
git add app/api/purchase-invoices/\[id\]/cancel/route.ts
git commit -m "feat(sp-6): POST /cancel — anula con contra-asiento

DRAFT pasa directo a CANCELLED. CONFIRMED genera contra-asiento
(debit↔credit invertidos) y queda linkeado en cancel_journal_entry_id."
```

---

### Task 10: PATCH `/api/purchase-invoices/[id]/operations` — split update con prorate

**Files:**
- Create: `app/api/purchase-invoices/[id]/operations/route.ts`

- [ ] **Step 1: Crear el endpoint**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { prorateAmounts } from "@/lib/accounting/purchase-invoices"

const InputSchema = z.object({
  /** Modo: "auto" usa prorate por operator_cost_total. "manual" usa los amounts del cliente. */
  mode: z.enum(["auto", "manual"]),
  operations: z.array(
    z.object({
      operation_id: z.string().uuid(),
      amount_original: z.number().positive().optional(),
    })
  ).min(1),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canPerformAction(user.role, "accounting.purchase-invoices", "write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json()
  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation", issues: parsed.error.issues }, { status: 400 })
  }

  const supabase = await createServerClient()

  // Cargar factura
  const { data: invoice } = await (supabase.from("purchase_invoices") as any)
    .select("id, status, total_amount, exchange_rate, currency")
    .eq("id", id).maybeSingle()

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (invoice.status === "CANCELLED") {
    return NextResponse.json({ error: "No se puede editar split de CANCELLED" }, { status: 409 })
  }
  if (invoice.status === "CONFIRMED") {
    return NextResponse.json({ error: "No se puede editar split de CONFIRMED — anular y rehacer" }, { status: 409 })
  }

  // Cargar operaciones para prorate
  const opIds = parsed.data.operations.map((o) => o.operation_id)
  const { data: ops, error: opsErr } = await (supabase.from("operations") as any)
    .select("id, operator_cost_total")
    .in("id", opIds)
  if (opsErr) return NextResponse.json({ error: opsErr.message }, { status: 500 })

  if ((ops || []).length !== opIds.length) {
    return NextResponse.json({ error: "Una o más operaciones no existen / sin acceso" }, { status: 400 })
  }

  // Calcular amounts
  let assignments: Array<{ operation_id: string; amount_original: number }>
  if (parsed.data.mode === "auto") {
    assignments = prorateAmounts({
      total: Number(invoice.total_amount),
      operations: (ops as any[]).map((op) => ({
        id: op.id,
        operator_cost_total: Number(op.operator_cost_total ?? 0),
      })),
    })
  } else {
    // manual: usar los amounts del cliente, validar suma
    const sum = parsed.data.operations.reduce(
      (s, o) => s + (o.amount_original ?? 0),
      0
    )
    const diff = Math.abs(sum - Number(invoice.total_amount))
    if (diff >= 0.01) {
      return NextResponse.json(
        { error: "Suma del split no cuadra con total", sum, total: invoice.total_amount },
        { status: 400 }
      )
    }
    assignments = parsed.data.operations.map((o) => ({
      operation_id: o.operation_id,
      amount_original: o.amount_original!,
    }))
  }

  // Reemplazar split: borrar todo y reinsertar
  const { error: delErr } = await (supabase.from("purchase_invoice_operations") as any)
    .delete().eq("purchase_invoice_id", id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const fxRate = invoice.currency === "USD" ? Number(invoice.exchange_rate) : 1
  const inserts = assignments.map((a) => ({
    purchase_invoice_id: id,
    operation_id: a.operation_id,
    amount_original: a.amount_original,
    amount_ars: Math.round(a.amount_original * fxRate * 100) / 100,
  }))

  const { data, error } = await (supabase.from("purchase_invoice_operations") as any)
    .insert(inserts).select("*")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
```

- [ ] **Step 2: Smoke test (modo auto)**

```bash
curl -sX PATCH http://localhost:3044/api/purchase-invoices/<id>/operations \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"mode":"auto","operations":[{"operation_id":"<op-uuid-1>"},{"operation_id":"<op-uuid-2>"}]}'
```
Expected: `{ "data": [{ amount_original, amount_ars, ... }, ...] }` con suma = total.

- [ ] **Step 3: Commit**

```bash
git add app/api/purchase-invoices/\[id\]/operations/route.ts
git commit -m "feat(sp-6): PATCH /operations — split N:M con auto-prorate

Modo 'auto' usa prorateAmounts por operator_cost_total.
Modo 'manual' valida suma = total. Replace-all (borra y reinserta).
Bloqueado en CONFIRMED/CANCELLED."
```

---

### Task 11: POST `/api/purchase-invoices/ocr` — PDF upload + OpenAI Vision + DRAFT

**Files:**
- Create: `app/api/purchase-invoices/ocr/route.ts`

- [ ] **Step 1: Crear el endpoint**

```ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import {
  extractInvoiceFieldsFromPdf,
  validateTotal,
  computeArs,
} from "@/lib/accounting/purchase-invoices"

const InputSchema = z.object({
  operator_id: z.string().uuid(),
  pdf_storage_path: z.string(), // path en bucket purchase-invoices
  fallback_currency: z.enum(["ARS", "USD"]).optional().default("ARS"),
  fallback_exchange_rate: z.number().positive().optional().nullable(),
})

const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10MB

export async function POST(req: Request) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canPerformAction(user.role, "accounting.purchase-invoices", "write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation", issues: parsed.error.issues }, { status: 400 })
  }

  const supabase = await createServerClient()

  // Validar que el path empieza con org_id (RLS-safe)
  const expectedPrefix = `${user.org_id}/`
  if (!parsed.data.pdf_storage_path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "PDF path no pertenece a tu org" }, { status: 403 })
  }

  // Descargar PDF como base64
  const { data: pdfBlob, error: dlErr } = await supabase.storage
    .from("purchase-invoices")
    .download(parsed.data.pdf_storage_path)

  if (dlErr || !pdfBlob) {
    return NextResponse.json({ error: `No se pudo descargar PDF: ${dlErr?.message}` }, { status: 500 })
  }

  const buffer = Buffer.from(await pdfBlob.arrayBuffer())
  if (buffer.byteLength > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF excede 10MB" }, { status: 400 })
  }
  const dataUrl = `data:application/pdf;base64,${buffer.toString("base64")}`

  // Llamar OCR
  let ocr
  try {
    ocr = await extractInvoiceFieldsFromPdf({ pdfDataUrl: dataUrl })
  } catch (e: any) {
    return NextResponse.json({ error: `OCR falló: ${e.message}` }, { status: 422 })
  }

  // Validar totales
  const tv = validateTotal(ocr.fields)
  if (!tv.valid) {
    // No fallamos: dejamos que el user corrija manualmente
    // pero anotamos en ocr_metadata
  }

  // Compute ARS (puede fallar si USD sin FX)
  const currency = parsed.data.fallback_currency
  const fxRate = parsed.data.fallback_exchange_rate ?? null
  let ars: { total_amount_ars: number; iva_amount_ars: number; perception_iva_ars: number }
  try {
    ars = computeArs({
      currency,
      exchange_rate: fxRate,
      total_amount: ocr.fields.total_amount,
      iva_amount_21: ocr.fields.iva_amount_21,
      iva_amount_105: ocr.fields.iva_amount_105,
      perception_iva: ocr.fields.perception_iva,
    })
  } catch (e: any) {
    // USD sin FX: usar 1 como placeholder, el usuario completará
    ars = {
      total_amount_ars: ocr.fields.total_amount,
      iva_amount_ars: ocr.fields.iva_amount_21 + ocr.fields.iva_amount_105,
      perception_iva_ars: ocr.fields.perception_iva,
    }
  }

  // Insertar como DRAFT
  const { data, error } = await (supabase.from("purchase_invoices") as any)
    .insert({
      org_id: user.org_id,
      operator_id: parsed.data.operator_id,
      invoice_type: ocr.fields.invoice_type,
      cuit_emitter: ocr.fields.cuit_emitter,
      point_of_sale: ocr.fields.point_of_sale,
      invoice_number: ocr.fields.invoice_number,
      issue_date: ocr.fields.issue_date,
      currency,
      exchange_rate: fxRate,
      net_amount_21: ocr.fields.net_amount_21,
      net_amount_105: ocr.fields.net_amount_105,
      net_amount_exempt: ocr.fields.net_amount_exempt,
      iva_amount_21: ocr.fields.iva_amount_21,
      iva_amount_105: ocr.fields.iva_amount_105,
      perception_iva: ocr.fields.perception_iva,
      other_taxes: ocr.fields.other_taxes,
      total_amount: ocr.fields.total_amount,
      total_amount_ars: ars.total_amount_ars,
      iva_amount_ars: ars.iva_amount_ars,
      perception_iva_ars: ars.perception_iva_ars,
      status: "DRAFT",
      pdf_storage_path: parsed.data.pdf_storage_path,
      ocr_metadata: {
        confidence: ocr.confidence,
        raw_response: ocr.raw_response,
        total_validation: tv,
      },
      created_by: user.id,
    })
    .select("*").single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Factura duplicada (ya existe con mismo CUIT+pto+nro)", ocr_fields: ocr.fields },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message, ocr_fields: ocr.fields }, { status: 500 })
  }

  return NextResponse.json({ data, ocr_confidence: ocr.confidence }, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/purchase-invoices/ocr/route.ts
git commit -m "feat(sp-6): POST /ocr — sube PDF, extrae con OpenAI Vision, crea DRAFT

Path bajo bucket purchase-invoices/<org_id>/<...>.pdf con RLS por path.
Falla 422 si OCR low-confidence. Crea DRAFT con ocr_metadata cacheado."
```

---

### Task 12: GET endpoints por operador y por operación

**Files:**
- Create: `app/api/operators/[id]/purchase-invoices/route.ts`
- Create: `app/api/operations/[id]/purchase-invoices/route.ts`

- [ ] **Step 1: Crear `app/api/operators/[id]/purchase-invoices/route.ts`**

```ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canPerformAction(user.role, "accounting.purchase-invoices", "read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  const url = new URL(req.url)
  const onlyConfirmed = url.searchParams.get("only_confirmed") === "true"

  const supabase = await createServerClient()

  let query = (supabase.from("purchase_invoices") as any)
    .select(`
      id, issue_date, invoice_type, point_of_sale, invoice_number,
      currency, total_amount, total_amount_ars, status,
      operations:purchase_invoice_operations(operation_id, amount_original)
    `)
    .eq("operator_id", id)
    .order("issue_date", { ascending: false })

  if (onlyConfirmed) query = query.eq("status", "CONFIRMED")

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
```

- [ ] **Step 2: Crear `app/api/operations/[id]/purchase-invoices/route.ts`**

```ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user } = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!canPerformAction(user.role, "accounting.purchase-invoices", "read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  const supabase = await createServerClient()

  const { data, error } = await (supabase.from("purchase_invoice_operations") as any)
    .select(`
      id, amount_original, amount_ars, notes,
      invoice:purchase_invoices(
        id, issue_date, invoice_type, point_of_sale, invoice_number,
        currency, total_amount, status, operator:operators(id, name)
      )
    `)
    .eq("operation_id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/operators/\[id\]/purchase-invoices/route.ts \
        app/api/operations/\[id\]/purchase-invoices/route.ts
git commit -m "feat(sp-6): GET endpoints scoped por operador y por operación

GET /api/operators/[id]/purchase-invoices con filter only_confirmed=true
para 'linkear factura existente'. GET /api/operations/[id]/purchase-invoices
devuelve los splits para mostrar en tab Facturación."
```

---

## Phase 4 — UI

### Task 13: Listado page `/accounting/purchase-invoices`

**Files:**
- Create: `app/(dashboard)/accounting/purchase-invoices/page.tsx`
- Create: `components/accounting/purchase-invoices/purchase-invoices-table.tsx`

- [ ] **Step 1: Crear el componente tabla**

Crear `components/accounting/purchase-invoices/purchase-invoices-table.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, FileText } from "lucide-react"

interface InvoiceRow {
  id: string
  issue_date: string
  invoice_type: string
  point_of_sale: string
  invoice_number: string
  currency: string
  total_amount: number
  total_amount_ars: number
  status: "DRAFT" | "CONFIRMED" | "CANCELLED"
  operator: { id: string; name: string }
}

export function PurchaseInvoicesTable() {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== "all") params.set("status", statusFilter)
    fetch(`/api/purchase-invoices?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .finally(() => setLoading(false))
  }, [statusFilter])

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-lg font-semibold">Facturas Recibidas</h2>
        <div className="flex gap-2 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="DRAFT">Borrador</SelectItem>
              <SelectItem value="CONFIRMED">Confirmada</SelectItem>
              <SelectItem value="CANCELLED">Anulada</SelectItem>
            </SelectContent>
          </Select>
          <Link href="/accounting/purchase-invoices/new">
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Nueva</Button>
          </Link>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No hay facturas {statusFilter !== "all" && `en estado ${statusFilter.toLowerCase()}`}
        </p>
      )}

      {!loading && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b">
            <tr>
              <th className="py-2">Fecha</th>
              <th>Operador</th>
              <th>Tipo</th>
              <th>Pto-Nro</th>
              <th>Total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2">{r.issue_date}</td>
                <td>{r.operator?.name ?? "—"}</td>
                <td>{r.invoice_type}</td>
                <td>{r.point_of_sale}-{r.invoice_number}</td>
                <td>
                  {r.currency} {Number(r.total_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td>
                  <Badge variant={r.status === "CONFIRMED" ? "default" : r.status === "DRAFT" ? "secondary" : "outline"}>
                    {r.status}
                  </Badge>
                </td>
                <td>
                  <Link href={`/accounting/purchase-invoices/${r.id}`}>
                    <Button variant="ghost" size="sm"><FileText className="h-4 w-4" /></Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Crear el page**

Crear `app/(dashboard)/accounting/purchase-invoices/page.tsx`:

```tsx
import { PurchaseInvoicesTable } from "@/components/accounting/purchase-invoices/purchase-invoices-table"

export default function PurchaseInvoicesPage() {
  return (
    <div className="container py-6">
      <PurchaseInvoicesTable />
    </div>
  )
}
```

- [ ] **Step 3: Levantar dev server y verificar visualmente**

Run: `npm run dev`
Browse: `http://localhost:3044/accounting/purchase-invoices`
Expected: tabla vacía con filtro, botón "Nueva".

- [ ] **Step 4: Commit**

```bash
git add components/accounting/purchase-invoices/purchase-invoices-table.tsx \
        app/\(dashboard\)/accounting/purchase-invoices/page.tsx
git commit -m "feat(sp-6): UI listado /accounting/purchase-invoices"
```

---

### Task 14: Form (cabecera AFIP) — `purchase-invoice-form.tsx`

**Files:**
- Create: `components/accounting/purchase-invoices/purchase-invoice-form.tsx`

- [ ] **Step 1: Crear el componente form (sección 1: cabecera)**

Crear `components/accounting/purchase-invoices/purchase-invoice-form.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"

export interface PurchaseInvoiceFormValues {
  operator_id: string
  invoice_type: "A" | "B" | "C" | "M" | "OTHER"
  cuit_emitter: string
  point_of_sale: string
  invoice_number: string
  issue_date: string
  due_date?: string
  currency: "ARS" | "USD"
  exchange_rate?: number
  net_amount_21: number
  net_amount_105: number
  net_amount_exempt: number
  iva_amount_21: number
  iva_amount_105: number
  perception_iva: number
  other_taxes: number
  total_amount: number
  notes?: string
}

interface Operator {
  id: string
  name: string
  cuit: string | null
}

interface Props {
  initial?: Partial<PurchaseInvoiceFormValues>
  onChange: (values: PurchaseInvoiceFormValues) => void
}

export function PurchaseInvoiceCabeceraForm({ initial, onChange }: Props) {
  const [operators, setOperators] = useState<Operator[]>([])
  const [loadingOps, setLoadingOps] = useState(true)
  const [values, setValues] = useState<PurchaseInvoiceFormValues>({
    operator_id: initial?.operator_id ?? "",
    invoice_type: initial?.invoice_type ?? "A",
    cuit_emitter: initial?.cuit_emitter ?? "",
    point_of_sale: initial?.point_of_sale ?? "",
    invoice_number: initial?.invoice_number ?? "",
    issue_date: initial?.issue_date ?? new Date().toISOString().slice(0, 10),
    due_date: initial?.due_date,
    currency: initial?.currency ?? "ARS",
    exchange_rate: initial?.exchange_rate,
    net_amount_21: initial?.net_amount_21 ?? 0,
    net_amount_105: initial?.net_amount_105 ?? 0,
    net_amount_exempt: initial?.net_amount_exempt ?? 0,
    iva_amount_21: initial?.iva_amount_21 ?? 0,
    iva_amount_105: initial?.iva_amount_105 ?? 0,
    perception_iva: initial?.perception_iva ?? 0,
    other_taxes: initial?.other_taxes ?? 0,
    total_amount: initial?.total_amount ?? 0,
    notes: initial?.notes,
  })

  useEffect(() => {
    fetch("/api/operators?limit=200")
      .then((r) => r.json())
      .then((j) => setOperators(j.data || []))
      .finally(() => setLoadingOps(false))
  }, [])

  // Cuando se elige operador, snapshot CUIT
  useEffect(() => {
    if (!values.operator_id) return
    const op = operators.find((o) => o.id === values.operator_id)
    if (op?.cuit && !values.cuit_emitter) {
      setValues((v) => ({ ...v, cuit_emitter: op.cuit! }))
    }
  }, [values.operator_id, operators])

  // Calc total automático
  const expectedTotal =
    values.net_amount_21 + values.net_amount_105 + values.net_amount_exempt +
    values.iva_amount_21 + values.iva_amount_105 +
    values.perception_iva + values.other_taxes

  const totalDiff = Math.abs(values.total_amount - expectedTotal)
  const totalOk = totalDiff < 0.01

  useEffect(() => { onChange(values) }, [values, onChange])

  const setField = <K extends keyof PurchaseInvoiceFormValues>(k: K, v: PurchaseInvoiceFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }))

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-semibold text-sm">1. Cabecera AFIP</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Operador</Label>
          {loadingOps ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <Select value={values.operator_id} onValueChange={(v) => setField("operator_id", v)}>
              <SelectTrigger><SelectValue placeholder="Elegir operador" /></SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={values.invoice_type} onValueChange={(v: any) => setField("invoice_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
              <SelectItem value="C">C</SelectItem>
              <SelectItem value="M">M</SelectItem>
              <SelectItem value="OTHER">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>CUIT emisor</Label>
          <Input value={values.cuit_emitter} onChange={(e) => setField("cuit_emitter", e.target.value)} placeholder="11 dígitos" />
        </div>
        <div>
          <Label>Pto. Vta - Nro</Label>
          <div className="flex gap-1">
            <Input value={values.point_of_sale} onChange={(e) => setField("point_of_sale", e.target.value)} placeholder="0001" className="w-20" />
            <Input value={values.invoice_number} onChange={(e) => setField("invoice_number", e.target.value)} placeholder="00000045" />
          </div>
        </div>

        <div>
          <Label>Fecha emisión</Label>
          <Input type="date" value={values.issue_date} onChange={(e) => setField("issue_date", e.target.value)} />
        </div>
        <div>
          <Label>Fecha vto (opcional)</Label>
          <Input type="date" value={values.due_date ?? ""} onChange={(e) => setField("due_date", e.target.value || undefined)} />
        </div>

        <div>
          <Label>Moneda</Label>
          <Select value={values.currency} onValueChange={(v: any) => setField("currency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {values.currency === "USD" && (
          <div>
            <Label>Tipo de cambio (a ARS)</Label>
            <Input type="number" step="0.01" value={values.exchange_rate ?? ""} onChange={(e) => setField("exchange_rate", e.target.value ? Number(e.target.value) : undefined)} />
          </div>
        )}
      </div>

      <div className="border-t pt-4 space-y-3">
        <h4 className="text-sm font-medium">Importes ({values.currency})</h4>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Neto 21%</Label>
            <Input type="number" step="0.01" value={values.net_amount_21} onChange={(e) => setField("net_amount_21", Number(e.target.value))} />
          </div>
          <div>
            <Label>IVA 21%</Label>
            <Input type="number" step="0.01" value={values.iva_amount_21} onChange={(e) => setField("iva_amount_21", Number(e.target.value))} />
          </div>
          <div>
            <Label>Neto 10.5%</Label>
            <Input type="number" step="0.01" value={values.net_amount_105} onChange={(e) => setField("net_amount_105", Number(e.target.value))} />
          </div>
          <div>
            <Label>IVA 10.5%</Label>
            <Input type="number" step="0.01" value={values.iva_amount_105} onChange={(e) => setField("iva_amount_105", Number(e.target.value))} />
          </div>
          <div>
            <Label>Neto exento</Label>
            <Input type="number" step="0.01" value={values.net_amount_exempt} onChange={(e) => setField("net_amount_exempt", Number(e.target.value))} />
          </div>
          <div>
            <Label>Percepción IVA</Label>
            <Input type="number" step="0.01" value={values.perception_iva} onChange={(e) => setField("perception_iva", Number(e.target.value))} />
          </div>
          <div>
            <Label>Otros impuestos</Label>
            <Input type="number" step="0.01" value={values.other_taxes} onChange={(e) => setField("other_taxes", Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <Label>Total <span className="text-xs text-muted-foreground">(esperado: {expectedTotal.toFixed(2)})</span></Label>
            <Input
              type="number" step="0.01" value={values.total_amount}
              onChange={(e) => setField("total_amount", Number(e.target.value))}
              className={!totalOk ? "border-destructive" : ""}
            />
            {!totalOk && <p className="text-xs text-destructive mt-1">Total no cuadra (diferencia: ${totalDiff.toFixed(2)})</p>}
          </div>
        </div>
      </div>

      <div>
        <Label>Notas (opcional)</Label>
        <Textarea value={values.notes ?? ""} onChange={(e) => setField("notes", e.target.value || undefined)} rows={2} />
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Verificar visualmente que renderiza (mounting standalone en una page de prueba o usando lo siguiente en task 16)**

Skip render verification hasta task 16.

- [ ] **Step 3: Commit**

```bash
git add components/accounting/purchase-invoices/purchase-invoice-form.tsx
git commit -m "feat(sp-6): form cabecera AFIP con validación de total live"
```

---

### Task 15: Operations split table

**Files:**
- Create: `components/accounting/purchase-invoices/operations-split-table.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { X } from "lucide-react"

interface Operation {
  id: string
  customer_name: string
  operator_cost_total: number
  currency: string
}

export interface SplitItem {
  operation_id: string
  amount_original: number
}

interface Props {
  operatorId: string | null
  total: number
  currency: string
  initialAssignments?: SplitItem[]
  onChange: (assignments: SplitItem[]) => void
}

export function OperationsSplitTable({ operatorId, total, currency, initialAssignments = [], onChange }: Props) {
  const [allOps, setAllOps] = useState<Operation[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialAssignments.map((a) => a.operation_id)))
  const [amounts, setAmounts] = useState<Map<string, number>>(new Map(initialAssignments.map((a) => [a.operation_id, a.amount_original])))

  useEffect(() => {
    if (!operatorId) return
    fetch(`/api/operations?operator_id=${operatorId}&limit=200`)
      .then((r) => r.json())
      .then((j) => setAllOps(j.data || []))
  }, [operatorId])

  // Auto-prorate cuando cambian selecciones o total
  useEffect(() => {
    if (selectedIds.size === 0) return
    const selected = allOps.filter((op) => selectedIds.has(op.id))
    const weights = selected.map((op) => Number(op.operator_cost_total) || 0)
    const totalWeight = weights.reduce((s, w) => s + w, 0)

    const newAmounts = new Map<string, number>()
    if (totalWeight === 0) {
      const eq = Math.round((total / selected.length) * 100) / 100
      selected.forEach((op) => newAmounts.set(op.id, eq))
    } else {
      selected.forEach((op, i) => {
        const a = Math.round((total * (Number(op.operator_cost_total) / totalWeight)) * 100) / 100
        newAmounts.set(op.id, a)
      })
    }

    // Diff a primera op
    const sum = Array.from(newAmounts.values()).reduce((s, a) => s + a, 0)
    const diff = Math.round((total - sum) * 100) / 100
    if (Math.abs(diff) >= 0.01 && selected[0]) {
      newAmounts.set(selected[0].id, Math.round((newAmounts.get(selected[0].id)! + diff) * 100) / 100)
    }
    setAmounts(newAmounts)
  }, [selectedIds, total, allOps])

  // Notify parent
  useEffect(() => {
    const arr: SplitItem[] = Array.from(selectedIds).map((id) => ({
      operation_id: id,
      amount_original: amounts.get(id) ?? 0,
    }))
    onChange(arr)
  }, [selectedIds, amounts, onChange])

  const toggleOp = (id: string) => {
    setSelectedIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setManualAmount = (id: string, v: number) => {
    setAmounts((m) => {
      const next = new Map(m)
      next.set(id, v)
      return next
    })
  }

  const sumAssigned = Array.from(amounts.entries())
    .filter(([id]) => selectedIds.has(id))
    .reduce((s, [, a]) => s + a, 0)
  const diff = Math.abs(total - sumAssigned)
  const ok = diff < 0.01

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold text-sm">2. Asignación a operaciones</h3>

      {!operatorId && <p className="text-sm text-muted-foreground">Elegí un operador en cabecera para listar operaciones.</p>}

      {operatorId && allOps.length === 0 && <p className="text-sm text-muted-foreground">Este operador no tiene operaciones cargadas.</p>}

      {allOps.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b text-left">
            <tr>
              <th className="py-2"></th>
              <th>Operación</th>
              <th>Cliente</th>
              <th className="text-right">Costo orig.</th>
              <th className="text-right">Asignar ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {allOps.map((op) => (
              <tr key={op.id} className="border-b last:border-0">
                <td className="py-2">
                  <Checkbox checked={selectedIds.has(op.id)} onCheckedChange={() => toggleOp(op.id)} />
                </td>
                <td>{op.id.slice(0, 8)}…</td>
                <td>{op.customer_name}</td>
                <td className="text-right">{op.currency} {Number(op.operator_cost_total).toLocaleString("es-AR")}</td>
                <td>
                  <Input
                    type="number" step="0.01"
                    disabled={!selectedIds.has(op.id)}
                    value={amounts.get(op.id) ?? 0}
                    onChange={(e) => setManualAmount(op.id, Number(e.target.value))}
                    className="w-32 text-right"
                  />
                </td>
              </tr>
            ))}
            <tr className="font-medium">
              <td colSpan={4} className="text-right py-2">Total asignado:</td>
              <td className={ok ? "text-right" : "text-right text-destructive"}>
                {currency} {sumAssigned.toFixed(2)} {ok ? "✓" : `(diff ${diff.toFixed(2)})`}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/accounting/purchase-invoices/operations-split-table.tsx
git commit -m "feat(sp-6): operations split table con auto-prorate por costo"
```

---

### Task 16: New page integrando todo + journal preview + submit

**Files:**
- Create: `components/accounting/purchase-invoices/journal-preview.tsx`
- Create: `app/(dashboard)/accounting/purchase-invoices/new/page.tsx`

- [ ] **Step 1: Crear journal preview**

```tsx
"use client"

import { Card } from "@/components/ui/card"

interface Props {
  netTotalArs: number
  ivaArs: number
  perceptionArs: number
  totalArs: number
  operatorName: string
}

export function JournalPreview({ netTotalArs, ivaArs, perceptionArs, totalArs, operatorName }: Props) {
  const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2 })
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-sm mb-3">3. Asiento contable (preview)</h3>
      <table className="w-full text-sm font-mono">
        <thead className="text-xs text-muted-foreground border-b">
          <tr><th className="text-left py-1">Cuenta</th><th className="text-right">Debe</th><th className="text-right">Haber</th></tr>
        </thead>
        <tbody>
          {netTotalArs > 0 && (
            <tr><td>Costo Operadores (4.2.01)</td><td className="text-right">${fmt(netTotalArs)}</td><td></td></tr>
          )}
          {ivaArs > 0 && (
            <tr><td>IVA Crédito Fiscal (1.1.07)</td><td className="text-right">${fmt(ivaArs)}</td><td></td></tr>
          )}
          {perceptionArs > 0 && (
            <tr><td>Percepciones AFIP (2.1.04)</td><td className="text-right">${fmt(perceptionArs)}</td><td></td></tr>
          )}
          <tr className="border-t">
            <td>Cuentas a Pagar — {operatorName} (2.1.01)</td>
            <td></td><td className="text-right">${fmt(totalArs)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  )
}
```

- [ ] **Step 2: Crear el page completo**

Crear `app/(dashboard)/accounting/purchase-invoices/new/page.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PurchaseInvoiceCabeceraForm, PurchaseInvoiceFormValues } from "@/components/accounting/purchase-invoices/purchase-invoice-form"
import { OperationsSplitTable, SplitItem } from "@/components/accounting/purchase-invoices/operations-split-table"
import { JournalPreview } from "@/components/accounting/purchase-invoices/journal-preview"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function NewPurchaseInvoicePage() {
  const router = useRouter()
  const [header, setHeader] = useState<PurchaseInvoiceFormValues | null>(null)
  const [split, setSplit] = useState<SplitItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  const fxRate = header?.currency === "USD" ? (header.exchange_rate ?? 0) : 1
  const netTotal = header
    ? (header.net_amount_21 + header.net_amount_105 + header.net_amount_exempt) * fxRate
    : 0
  const ivaArs = header ? (header.iva_amount_21 + header.iva_amount_105) * fxRate : 0
  const percArs = header ? header.perception_iva * fxRate : 0
  const totalArs = header ? header.total_amount * fxRate : 0

  const operatorName = "—"  // TODO: lookup desde header.operator_id si querés mejor UX

  const submit = async (action: "draft" | "confirm") => {
    if (!header) return
    setSubmitting(true)
    try {
      // 1. Crear DRAFT
      const r1 = await fetch("/api/purchase-invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(header),
      })
      const j1 = await r1.json()
      if (!r1.ok) throw new Error(j1.error || "Error creando factura")
      const invoiceId = j1.data.id

      // 2. Asignar split
      if (split.length > 0) {
        const r2 = await fetch(`/api/purchase-invoices/${invoiceId}/operations`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "manual", operations: split }),
        })
        const j2 = await r2.json()
        if (!r2.ok) throw new Error(j2.error || "Error asignando split")
      }

      // 3. Confirm si elegido
      if (action === "confirm") {
        const r3 = await fetch(`/api/purchase-invoices/${invoiceId}/confirm`, { method: "POST" })
        const j3 = await r3.json()
        if (!r3.ok) throw new Error(j3.error || "Error confirmando")
      }

      toast.success(action === "confirm" ? "Factura confirmada" : "Borrador guardado")
      router.push(`/accounting/purchase-invoices/${invoiceId}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-semibold">Nueva factura recibida</h1>

      <PurchaseInvoiceCabeceraForm onChange={setHeader} />

      {header?.operator_id && header.total_amount > 0 && (
        <OperationsSplitTable
          operatorId={header.operator_id}
          total={header.total_amount}
          currency={header.currency}
          onChange={setSplit}
        />
      )}

      {header && (
        <JournalPreview
          netTotalArs={netTotal}
          ivaArs={ivaArs}
          perceptionArs={percArs}
          totalArs={totalArs}
          operatorName={operatorName}
        />
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" disabled={submitting} onClick={() => submit("draft")}>
          Guardar borrador
        </Button>
        <Button disabled={submitting} onClick={() => submit("confirm")}>
          {submitting ? "Procesando…" : "Confirmar y generar asiento"}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar en browser end-to-end**

Run: `npm run dev`
Browse: `http://localhost:3044/accounting/purchase-invoices/new`
Test flow:
1. Elegir operador → CUIT autocompleta.
2. Cargar tipo A, pto 0001 nro 00000099, fecha hoy, currency ARS.
3. Importes: net 1000 IVA 210 percep 30 total 1240 → banner verde.
4. Marcar 1-2 operaciones del operador → split auto.
5. Click "Guardar borrador" → toast OK + redirige a detalle.
6. Después click "Confirmar y generar asiento" desde detalle → status CONFIRMED.

Si falla por permission/auth, verificar `lib/permissions.ts` y `DISABLE_AUTH`.

- [ ] **Step 4: Commit**

```bash
git add components/accounting/purchase-invoices/journal-preview.tsx \
        app/\(dashboard\)/accounting/purchase-invoices/new/page.tsx
git commit -m "feat(sp-6): página /new — form completo con cabecera + split + preview"
```

---

### Task 17: Atajo desde tab Facturación de operación

**Files:**
- Create: `components/operations/operation-purchase-invoices-section.tsx`
- Modify: `components/operations/operation-facturacion-section.tsx` (montar el nuevo)

- [ ] **Step 1: Crear el componente**

```tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, FileText } from "lucide-react"

interface Item {
  id: string
  amount_original: number
  amount_ars: number
  invoice: {
    id: string
    issue_date: string
    invoice_type: string
    point_of_sale: string
    invoice_number: string
    currency: string
    total_amount: number
    status: string
    operator: { id: string; name: string }
  }
}

export function OperationPurchaseInvoicesSection({ operationId }: { operationId: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/operations/${operationId}/purchase-invoices`)
      .then((r) => r.json())
      .then((j) => setItems(j.data || []))
      .finally(() => setLoading(false))
  }, [operationId])

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Facturas de Compra recibidas</h3>
        <div className="flex gap-2">
          <Link href={`/accounting/purchase-invoices/new?operation_id=${operationId}`}>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Nueva</Button>
          </Link>
        </div>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Cargando…</p>}

      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground">No hay facturas de compra asignadas a esta operación.</p>
      )}

      {!loading && items.length > 0 && (
        <ul className="space-y-1 text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between border-b py-2 last:border-0">
              <span>
                {it.invoice.issue_date} · {it.invoice.operator?.name} · {it.invoice.invoice_type} {it.invoice.point_of_sale}-{it.invoice.invoice_number}
                <span className="text-muted-foreground ml-2">
                  asignado: {it.invoice.currency} {Number(it.amount_original).toLocaleString("es-AR")} ({it.invoice.status})
                </span>
              </span>
              <Link href={`/accounting/purchase-invoices/${it.invoice.id}`}>
                <Button variant="ghost" size="sm"><FileText className="h-4 w-4" /></Button>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Localizar el archivo de la sección Facturación de operación**

Run: `grep -rn "OperationFacturacionSection\|FacturacionSection" components/operations/ | head -5`
Esto te muestra el path real (puede ser `components/operations/operation-facturacion-section.tsx` o similar).

- [ ] **Step 3: Montar el nuevo bloque arriba del listado de facturas emitidas**

Editar el archivo identificado. Buscar dónde renderiza el listado de invoices al cliente y agregar arriba:

```tsx
import { OperationPurchaseInvoicesSection } from "./operation-purchase-invoices-section"

// ...dentro del JSX, antes del bloque "Facturas emitidas":
<OperationPurchaseInvoicesSection operationId={operation.id} />
```

- [ ] **Step 4: Verificar en browser**

Run: `npm run dev`
Browse a `http://localhost:3044/operations/<id-operacion-real>` → tab Facturación.
Expected: ver el bloque "Facturas de Compra recibidas" arriba del listado de emitidas.

- [ ] **Step 5: Commit**

```bash
git add components/operations/operation-purchase-invoices-section.tsx \
        components/operations/operation-facturacion-section.tsx
git commit -m "feat(sp-6): atajo facturas de compra en tab Facturación de operación"
```

---

## Phase 5 — Verification

### Task 18: Tenant isolation test

**Files:**
- Create: `__tests__/isolation/purchase-invoices.test.ts`

- [ ] **Step 1: Leer un isolation test existente para imitar el setup**

Run: `ls __tests__/isolation/ && head -80 __tests__/isolation/tenant-segregation.test.ts`

Identificar:
- Cómo se crean 2 orgs de prueba.
- Cómo se autentican como users de cada org.
- Cómo se cleanup.

- [ ] **Step 2: Escribir el test**

Crear `__tests__/isolation/purchase-invoices.test.ts`. **Adaptar el shape del setup al patrón existente**. Ejemplo conceptual:

```ts
import { createServerClient } from "@/lib/supabase/server"
import {
  setupTwoOrgsWithUsers,  // helper del archivo existente o equivalente
  cleanupTestData,
} from "./helpers"  // si no existe, ver tenant-segregation.test.ts

describe("Tenant isolation: purchase_invoices", () => {
  let orgA: any, orgB: any, userA: any, userB: any, operatorA: any

  beforeAll(async () => {
    ;({ orgA, orgB, userA, userB, operatorA } = await setupTwoOrgsWithUsers())
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  it("user de org A no ve facturas de org B", async () => {
    const supabaseB = await createServerClient()
    // crear factura en org B (impersonando userB)
    // ...
    const supabaseA = await createServerClient()
    // listar facturas de org A
    const { data } = await supabaseA.from("purchase_invoices").select("*")
    expect(data?.find((d: any) => d.org_id === orgB.id)).toBeUndefined()
  })

  it("user de org A no puede crear factura para org B", async () => {
    const supabaseA = await createServerClient()
    const { error } = await (supabaseA.from("purchase_invoices") as any).insert({
      org_id: orgB.id,  // intento atacar
      operator_id: operatorA.id,
      invoice_type: "A",
      cuit_emitter: "30000000007",
      point_of_sale: "0001",
      invoice_number: "00000001",
      issue_date: "2026-04-25",
      currency: "ARS",
      total_amount: 100,
      total_amount_ars: 100,
      iva_amount_ars: 0,
      perception_iva_ars: 0,
    })
    expect(error).toBeTruthy()
  })

  it("split (purchase_invoice_operations) hereda RLS via JOIN", async () => {
    // crear factura en B con split a operación de B
    // luego, como user A, intentar leer ese split
    // expect: vacío
  })
})
```

**Si no existe `setupTwoOrgsWithUsers`** en `__tests__/isolation/helpers`, mirar cómo el test existente arma los test orgs y replicar el patrón inline (típicamente: crear orgs vía service_role, crear users con magic link, crear operators).

- [ ] **Step 3: Run el test**

Run: `npm run test -- __tests__/isolation/purchase-invoices.test.ts`
Expected: PASS — 3 tests.

Si falla por setup helper, ajustar al patrón del repo.

- [ ] **Step 4: Commit**

```bash
git add __tests__/isolation/purchase-invoices.test.ts
git commit -m "test(sp-6): tenant isolation purchase_invoices

3 escenarios: read cross-org, write cross-org, split inherita RLS via JOIN."
```

---

### Task 19: E2E manual checklist + final commit

**Files:**
- Create: `docs/superpowers/plans/2026-04-25-purchase-invoices-e2e.md`

- [ ] **Step 1: Crear el checklist E2E**

```markdown
# SP-6 Purchase Invoices — E2E Smoke Checklist

Validación manual previo a merge. Correr en `app.vibook.ai` como user Maxi (Lozada).

## Setup
- [ ] Migration 163 corrió OK en Supabase Editor.
- [ ] Bucket `purchase-invoices` existe en Storage.
- [ ] Permission matrix incluye `accounting.purchase-invoices`.
- [ ] User Maxi tiene rol que permite write+confirm.

## Form manual (sin OCR)
- [ ] Browse `/accounting/purchase-invoices` → tabla vacía o lista.
- [ ] Click "Nueva" → form abre.
- [ ] Elegir operador real → CUIT autocompleta.
- [ ] Tipo A, pto 0001 nro 00099999, fecha hoy, currency ARS.
- [ ] Net 21=1000 IVA 21=210 perc=30 total=1240 → banner verde.
- [ ] Asignar a 2 operaciones del operador → split auto correcto (suma=1240).
- [ ] Override 1 monto manual → diff cero queda OK.
- [ ] Click "Guardar borrador" → redirect a detalle, status DRAFT.
- [ ] Click "Confirmar y generar asiento" → status CONFIRMED + journal_entry_id seteado.
- [ ] Verificar asiento en `/accounting/ledger` → aparece con descripción "Factura compra A 0001-00099999".

## Anular
- [ ] Click "Anular factura" en detalle → modal pide reason.
- [ ] Submit → status CANCELLED + cancel_journal_entry_id seteado.
- [ ] Verificar contra-asiento en ledger.

## Atajo desde operación
- [ ] Browse `/operations/<id>` → tab Facturación.
- [ ] Bloque "Facturas de Compra recibidas" muestra la factura asignada.
- [ ] Click "Nueva" desde tab → URL pre-llena `operation_id`.

## OCR
- [ ] Subir un PDF real de factura A de un operador (preferentemente uno chico, baja consecuencia).
- [ ] Sistema extrae campos.
- [ ] Form se abre pre-llenado con banner amarillo.
- [ ] Verificar manualmente todos los campos.
- [ ] Confirmar → asiento generado correctamente.

## Edge cases
- [ ] Cargar misma factura 2 veces (mismo CUIT+pto+nro) → error 409 claro.
- [ ] Cargar factura USD sin exchange_rate → form bloquea.
- [ ] Cargar factura con total mal calculado → banner rojo, no deja confirmar.
- [ ] Editar factura CONFIRMED → endpoint rechaza con 409.

## Multi-tenant
- [ ] Loguearse como otro user de otra org → no ver las facturas de Lozada.
- [ ] Intento manual de UPDATE cross-org via curl → RLS rechaza.

## Pendientes para SP-3
- [ ] El total de IVA crédito de las facturas CONFIRMED del mes coincide con `iva_amount_ars` sumado.
- [ ] La función `getMonthlyIVAToPay` aún usa `iva_purchases` (legacy) — esperado en v1.

---

**Status**: en progreso / completado
**Validó**: Maxi / Tomi
**Fecha**: ___
**Notas**: ___
```

- [ ] **Step 2: Commit final**

```bash
git add docs/superpowers/plans/2026-04-25-purchase-invoices-e2e.md
git commit -m "docs(sp-6): E2E smoke checklist + plan completo

Cierra SP-6 — pendiente run E2E con Maxi en prod."
```

---

## Done criteria

- [ ] Migration corrió en Supabase prod (`pmqvplyyxiobkllapgjp`).
- [ ] Tipos regenerados, lint + tsc pass.
- [ ] 14 unit tests pass (calculations: 8, journal-entry: 3, ocr: 3).
- [ ] Tenant isolation tests pass (3 escenarios).
- [ ] UI accesible en `/accounting/purchase-invoices` desde sidebar.
- [ ] Atajo en tab Facturación operación visible.
- [ ] E2E manual checklist completado por Maxi.
- [ ] Decisión sobre cuenta de percepción (`2.1.04` actual vs nueva) resuelta con Gabi pre-deploy.

## Risks tracked

- **Account code mapping** — `2.1.04 PERCEPCIONES_AFIP` se usa con saldo deudor (debit). Si Gabi prefiere cuenta dedicada, agregar migration extra antes del rollout.
- **OCR confidence < 0.7** falla — Maxi puede frustrarse. Mitigar con UX claro: si falla, dar form vacío con un toast informativo.
- **Operadores sin CUIT** en DB legacy — bloquea confirmación. Hacer un pre-flight script para identificar y avisar.
- **Rate limit OpenAI** si Maxi sube 50 PDFs en batch — agregar throttle UI (un upload a la vez por ahora).
