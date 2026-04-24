# Ganancia Facturación Implementation Plan (SP-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir facturar el margen de una operación desde un botón en el detalle, con tracking del monto ya facturado y validación backend de no exceder el margen. Reemplaza el flow existente de `/new?operationId=X` (que precargaba venta+costo como 2 items) por un flow enfocado al margen con 1 ítem único.

**Architecture:** Nuevo endpoint `GET /api/operations/[id]/margin-summary` devuelve stats + lista de facturas asociadas. Pure function `calculateMarginSummary(op, invoices, hasAfip)` centraliza la lógica. Nuevo componente `OperationFacturacionSection` consume el endpoint y muestra stats + botón que redirige al form. Form refactor: 1 ítem único con margen restante, validación hard backend en POST + re-check en authorize.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase RLS + `org_id` (de SP-1), pdf-lib + qrcode (de SP-1c), Jest, shadcn/ui.

**Ref spec:** `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-24-ganancia-facturacion-design.md`

**Git policy:** Commits locales frecuentes OK. Push final con OK explícito del user.

**No migration SQL.** Cero schema changes — reusa `invoices.operation_id` + `operations.margin_amount` existentes.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `lib/accounting/margin-summary.ts` | `calculateMarginSummary(op, invoices, hasAfipConfig)` — pure function con todas las reglas de facturabilidad |
| `app/api/operations/[id]/margin-summary/route.ts` | `GET` endpoint que devuelve stats + lista de facturas de una operación |
| `components/operations/operation-facturacion-section.tsx` | Box UI en detalle de operación: stats, lista de facturas, botón "Facturar ganancia" |
| `__tests__/accounting/margin-summary.test.ts` | 9 casos unit del helper |
| `__tests__/operations/margin-summary-api.test.ts` | Integration del endpoint con supabase mockeada |
| `__tests__/invoices/post-operation-validation.test.ts` | Tests de validación de cap en POST /api/invoices |

### Modified files

| Path | Change |
|---|---|
| `app/api/invoices/route.ts` | POST: si `body.operation_id` presente, validar cross-org + sum authorized + remaining >= new. Si excede, 400 con `max_remaining` |
| `app/api/invoices/[id]/authorize/route.ts` | Re-check margin cap antes de llamar AfipService.issueVoucher (race safety) |
| `app/(dashboard)/operations/billing/new/page.tsx` | Si `operationId` presente → fetch `margin-summary`, precargar 1 ítem único con remaining. Eliminar la precarga de venta+costo (2 items) |
| `components/operations/operation-detail-client.tsx` | Montar `<OperationFacturacionSection operationId={...} />` en la sección accounting/financial del detalle |

### No deleted files

### No new npm dependencies

---

## Phase 1 — Pure Logic

### Task 1: `calculateMarginSummary` pure function (TDD)

**Files:**
- Create: `lib/accounting/margin-summary.ts`
- Test: `__tests__/accounting/margin-summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/accounting/margin-summary.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { calculateMarginSummary } from "@/lib/accounting/margin-summary"

describe("calculateMarginSummary", () => {
  const baseOp = { margin_amount: 20000, customer_id: "cus-1" }

  it("returns full margin as remaining when no invoices exist", () => {
    const r = calculateMarginSummary(baseOp, [], true)
    expect(r.margin_total).toBe(20000)
    expect(r.already_invoiced).toBe(0)
    expect(r.remaining).toBe(20000)
    expect(r.can_invoice).toBe(true)
    expect(r.reason_disabled).toBeNull()
  })

  it("subtracts authorized invoice totals from margin", () => {
    const r = calculateMarginSummary(
      baseOp,
      [
        { imp_total: 5000, status: "authorized" },
        { imp_total: 7000, status: "authorized" },
      ],
      true
    )
    expect(r.already_invoiced).toBe(12000)
    expect(r.remaining).toBe(8000)
    expect(r.can_invoice).toBe(true)
  })

  it("ignores non-authorized invoices (draft/pending/rejected)", () => {
    const r = calculateMarginSummary(
      baseOp,
      [
        { imp_total: 5000, status: "authorized" },
        { imp_total: 3000, status: "rejected" },
        { imp_total: 2000, status: "draft" },
        { imp_total: 1000, status: "pending" },
      ],
      true
    )
    expect(r.already_invoiced).toBe(5000)
    expect(r.remaining).toBe(15000)
  })

  it("flags already_fully_invoiced when remaining reaches 0", () => {
    const r = calculateMarginSummary(
      baseOp,
      [{ imp_total: 20000, status: "authorized" }],
      true
    )
    expect(r.remaining).toBe(0)
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("already_fully_invoiced")
  })

  it("flags no_margin when margin is 0", () => {
    const r = calculateMarginSummary(
      { margin_amount: 0, customer_id: "cus-1" },
      [],
      true
    )
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("no_margin")
  })

  it("flags no_margin for negative margin (loss) and clamps remaining to 0", () => {
    const r = calculateMarginSummary(
      { margin_amount: -5000, customer_id: "cus-1" },
      [],
      true
    )
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("no_margin")
    expect(r.remaining).toBe(0)
  })

  it("flags no_customer when operation has no customer assigned", () => {
    const r = calculateMarginSummary(
      { margin_amount: 20000, customer_id: null },
      [],
      true
    )
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("no_customer")
  })

  it("flags no_afip when hasAfipConfig is false", () => {
    const r = calculateMarginSummary(baseOp, [], false)
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("no_afip")
  })

  it("handles float precision: 20000 - 19999.99 = 0.01 (can_invoice still true)", () => {
    const r = calculateMarginSummary(
      baseOp,
      [{ imp_total: 19999.99, status: "authorized" }],
      true
    )
    expect(r.remaining).toBeCloseTo(0.01, 2)
    expect(r.can_invoice).toBe(true)
    expect(r.reason_disabled).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/accounting/margin-summary.test.ts`
Expected: FAIL with "Cannot find module '@/lib/accounting/margin-summary'".

- [ ] **Step 3: Implement margin-summary.ts**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/accounting/margin-summary.ts`:

```typescript
/**
 * Calculadora pura del estado de facturación de una operación.
 *
 * Dado el margen total y las facturas asociadas, determina cuánto
 * queda por facturar y qué razones bloquean la emisión (sin customer,
 * sin AFIP config, ya facturada full, sin margen).
 *
 * Spec: docs/superpowers/specs/2026-04-24-ganancia-facturacion-design.md
 */

export type ReasonDisabled =
  | "no_margin"
  | "no_customer"
  | "no_afip"
  | "already_fully_invoiced"

export interface MarginSummary {
  margin_total: number
  already_invoiced: number
  remaining: number
  can_invoice: boolean
  reason_disabled: ReasonDisabled | null
}

interface OperationForMargin {
  margin_amount: number
  customer_id: string | null
}

interface InvoiceForMargin {
  imp_total: number
  status: string
}

export function calculateMarginSummary(
  operation: OperationForMargin,
  invoices: InvoiceForMargin[],
  hasAfipConfig: boolean
): MarginSummary {
  const margin = Number(operation.margin_amount)

  const already = invoices
    .filter((i) => i.status === "authorized")
    .reduce((acc, i) => acc + Number(i.imp_total), 0)

  // Redondeo a 2 decimales para evitar falsos "remaining" negativos
  // por ruido de IEEE 754 (20000 - 19999.99 = 0.01000000000218...)
  const remainingRaw = margin - already
  const remaining = Math.max(0, Math.round(remainingRaw * 100) / 100)

  let reason: ReasonDisabled | null = null
  if (margin <= 0) {
    reason = "no_margin"
  } else if (!operation.customer_id) {
    reason = "no_customer"
  } else if (!hasAfipConfig) {
    reason = "no_afip"
  } else if (remaining <= 0) {
    reason = "already_fully_invoiced"
  }

  return {
    margin_total: margin,
    already_invoiced: already,
    remaining,
    can_invoice: reason === null,
    reason_disabled: reason,
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/accounting/margin-summary.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add lib/accounting/margin-summary.ts __tests__/accounting/margin-summary.test.ts && git commit -m "$(cat <<'EOF'
feat(accounting): calculateMarginSummary pure function (SP-2)

Centraliza lógica de "cuánto queda por facturar" de una operación.
Input: operation + invoices + hasAfipConfig. Output: margin_total,
already_invoiced, remaining, can_invoice, reason_disabled.

9 casos unit: sin facturas, parcial, full, rechazadas ignoradas,
margen 0, negativo, sin cliente, sin AFIP, float precision.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — API

### Task 2: `GET /api/operations/[id]/margin-summary` endpoint

**Files:**
- Create: `app/api/operations/[id]/margin-summary/route.ts`
- Test: `__tests__/operations/margin-summary-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/operations/margin-summary-api.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

const mockGetCurrentUser = jest.fn()
const mockCreateServerClient = jest.fn()
const mockGetAfipServiceForOrg = jest.fn()

jest.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: (...args: any[]) => mockCreateServerClient(...args),
}))
jest.mock("@/lib/afip/afip-service", () => ({
  getAfipServiceForOrg: (...args: any[]) => mockGetAfipServiceForOrg(...args),
}))
jest.mock("@/lib/permissions", () => ({
  canAccessModule: () => true,
}))

function makeMockSupabase(opts: {
  operation?: any
  invoices?: any[]
  customer?: any
}) {
  return {
    from: (table: string) => {
      if (table === "operations") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: opts.operation ?? null,
                error: opts.operation ? null : { message: "not found" },
              }),
            }),
          }),
        }
      }
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                then: (cb: any) => cb({ data: opts.invoices ?? [], error: null }),
              }),
            }),
          }),
        }
      }
      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.customer ?? null,
                error: null,
              }),
            }),
          }),
        }
      }
      return {}
    },
  }
}

describe("GET /api/operations/[id]/margin-summary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } })
    mockGetAfipServiceForOrg.mockResolvedValue({ config: { cuit: "20123456789" } })
  })

  it("returns summary + invoices when operation exists", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({
        operation: {
          id: "op-1",
          file_code: "OP-001",
          destination: "Cancún",
          sale_amount_total: 100000,
          operator_cost: 80000,
          margin_amount: 20000,
          customer_id: "cus-1",
          org_id: "org-aaa",
        },
        invoices: [
          {
            id: "inv-1",
            cbte_nro: 42,
            pto_vta: 5,
            cbte_tipo: 6,
            imp_total: 5000,
            fecha_emision: "2026-04-20",
            status: "authorized",
            verification_status: "verified",
            cae: "86139389743826",
          },
        ],
        customer: { id: "cus-1", first_name: "Juan", last_name: "Pérez" },
      })
    )
    const { GET } = await import("@/app/api/operations/[id]/margin-summary/route")
    const req = new NextRequest("http://localhost/api/operations/op-1/margin-summary")
    const res = await GET(req, { params: Promise.resolve({ id: "op-1" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.operation.id).toBe("op-1")
    expect(body.operation.customer.name).toBe("Juan Pérez")
    expect(body.summary.margin_total).toBe(20000)
    expect(body.summary.already_invoiced).toBe(5000)
    expect(body.summary.remaining).toBe(15000)
    expect(body.summary.can_invoice).toBe(true)
    expect(body.invoices).toHaveLength(1)
    expect(body.invoices[0].cae).toBe("86139389743826")
  })

  it("returns 404 when operation not found (RLS)", async () => {
    mockCreateServerClient.mockResolvedValue(makeMockSupabase({ operation: null }))
    const { GET } = await import("@/app/api/operations/[id]/margin-summary/route")
    const req = new NextRequest("http://localhost/api/operations/op-x/margin-summary")
    const res = await GET(req, { params: Promise.resolve({ id: "op-x" }) })
    expect(res.status).toBe(404)
  })

  it("reports can_invoice=false + reason when no afip", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({
        operation: {
          id: "op-1",
          margin_amount: 20000,
          customer_id: "cus-1",
          org_id: "org-aaa",
        },
        invoices: [],
        customer: { id: "cus-1", first_name: "A", last_name: "B" },
      })
    )
    mockGetAfipServiceForOrg.mockResolvedValue(null)
    const { GET } = await import("@/app/api/operations/[id]/margin-summary/route")
    const req = new NextRequest("http://localhost/api/operations/op-1/margin-summary")
    const res = await GET(req, { params: Promise.resolve({ id: "op-1" }) })
    const body = await res.json()
    expect(body.summary.can_invoice).toBe(false)
    expect(body.summary.reason_disabled).toBe("no_afip")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/operations/margin-summary-api.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the endpoint**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/operations/[id]/margin-summary/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"
import { calculateMarginSummary } from "@/lib/accounting/margin-summary"

export const dynamic = "force-dynamic"

/**
 * GET /api/operations/:id/margin-summary
 *
 * Devuelve el estado de facturación de una operación:
 *   - margen total, ya facturado, restante
 *   - si se puede facturar y por qué no si bloqueado
 *   - lista de facturas emitidas (con CAE, status, verification_status)
 *
 * RLS: si el user no pertenece al org de la operación, 404.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    if (!canAccessModule(user.role as any, "operations")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 })
    }

    // Fetch operation via RLS (404 si no accesible)
    const { data: operation, error: opErr } = await (supabase
      .from("operations") as any)
      .select("id, file_code, destination, sale_amount_total, operator_cost, margin_amount, customer_id, org_id")
      .eq("id", id)
      .single()

    if (opErr || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    // Fetch invoices asociadas
    const { data: invoices } = await (supabase.from("invoices") as any)
      .select("id, cbte_nro, pto_vta, cbte_tipo, imp_total, fecha_emision, status, verification_status, cae")
      .eq("operation_id", id)
      .order("fecha_emision", { ascending: false })

    const invoicesList = (invoices ?? []) as any[]

    // Fetch customer name (opcional)
    let customer: { id: string; name: string } | null = null
    if (operation.customer_id) {
      const { data: cus } = await (supabase.from("customers") as any)
        .select("id, first_name, last_name")
        .eq("id", operation.customer_id)
        .maybeSingle()
      if (cus) {
        customer = {
          id: cus.id,
          name: `${cus.first_name || ""} ${cus.last_name || ""}`.trim(),
        }
      }
    }

    // Check AFIP config
    const afipSvc = await getAfipServiceForOrg(supabase, operation.org_id)
    const hasAfipConfig = !!afipSvc

    const summary = calculateMarginSummary(operation, invoicesList, hasAfipConfig)

    return NextResponse.json({
      operation: {
        id: operation.id,
        file_code: operation.file_code,
        destination: operation.destination,
        sale_amount_total: Number(operation.sale_amount_total),
        operator_cost: Number(operation.operator_cost),
        margin_amount: Number(operation.margin_amount),
        customer,
        has_afip_emisor: hasAfipConfig,
      },
      summary,
      invoices: invoicesList.map((i) => ({
        id: i.id,
        cbte_nro: i.cbte_nro,
        pto_vta: i.pto_vta,
        cbte_tipo: i.cbte_tipo,
        imp_total: Number(i.imp_total),
        fecha_emision: i.fecha_emision,
        status: i.status,
        verification_status: i.verification_status,
        cae: i.cae,
      })),
    })
  } catch (error: any) {
    console.error("Error in GET /api/operations/[id]/margin-summary:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/operations/margin-summary-api.test.ts`
Expected: 3 PASS.

Si alguno falla, el mock de supabase puede necesitar ajuste según el orden de chaining. Leer error cuidadosamente.

- [ ] **Step 5: Build check**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10`
Expected: build succeeds, new route aparece.

- [ ] **Step 6: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add app/api/operations/\[id\]/margin-summary/route.ts __tests__/operations/margin-summary-api.test.ts && git commit -m "$(cat <<'EOF'
feat(operations): GET /api/operations/[id]/margin-summary

Devuelve stats del margen + lista de facturas asociadas.
RLS automático por org_id. Consume calculateMarginSummary pure fn.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Backend validation — POST /api/invoices margin cap

**Files:**
- Modify: `app/api/invoices/route.ts`
- Modify: `app/api/invoices/[id]/authorize/route.ts` (re-check race safety)
- Create: `__tests__/invoices/post-operation-validation.test.ts`

- [ ] **Step 1: Write tests**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/__tests__/invoices/post-operation-validation.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

const mockGetCurrentUser = jest.fn()
const mockCreateServerClient = jest.fn()
const mockGetUserAgencyIds = jest.fn()
const mockCalculateInvoice = jest.fn()

jest.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: (...args: any[]) => mockCreateServerClient(...args),
}))
jest.mock("@/lib/permissions-api", () => ({
  getUserAgencyIds: (...args: any[]) => mockGetUserAgencyIds(...args),
}))
jest.mock("@/lib/permissions", () => ({
  canAccessModule: () => true,
  canPerformAction: () => true,
}))
jest.mock("@/lib/invoices/calculation", () => ({
  calculateInvoice: (...args: any[]) => mockCalculateInvoice(...args),
  normalizeTaxTreatment: (t: string) => t,
  getRecommendedAmountEntryMode: () => "NET",
}))

function makeSupabase(opts: {
  operation?: any
  authorizedInvoices?: any[]
  agency?: any
  agencyOrgId?: string
}) {
  const state: any = { inserts: [] as any[] }
  const mock: any = {
    from: (table: string) => {
      if (table === "operations") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: opts.operation ?? null,
                error: opts.operation ? null : { message: "not found" },
              }),
            }),
          }),
        }
      }
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                then: (cb: any) => cb({ data: opts.authorizedInvoices ?? [], error: null }),
              }),
            }),
          }),
          insert: (row: any) => {
            state.inserts.push({ table, row })
            return {
              select: () => ({
                single: async () => ({ data: { id: "new-inv-id", ...row }, error: null }),
              }),
            }
          },
        }
      }
      if (table === "agencies") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: opts.agency ?? { id: "ag-1", org_id: opts.agencyOrgId ?? "org-aaa" },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === "invoice_items") {
        return {
          insert: () => Promise.resolve({ error: null }),
        }
      }
      return {}
    },
  }
  return { supabase: mock, state }
}

describe("POST /api/invoices — operation_id margin cap validation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } })
    mockGetUserAgencyIds.mockResolvedValue(["ag-1"])
    mockCalculateInvoice.mockReturnValue({
      items: [{ subtotal: 8264.46, iva_importe: 1735.54, iva_id: 5, iva_porcentaje: 21, tax_treatment: "GRAVADO", orden: 0 }],
      totals: { imp_neto: 8264.46, imp_iva: 1735.54, imp_total: 10000, imp_tot_conc: 0, imp_op_ex: 0, imp_trib: 0 },
      amount_entry_mode: "NET",
    })
  })

  function validBody(operation_id: string | null = "op-1") {
    return {
      agency_id: "ag-1",
      operation_id,
      customer_id: "cus-1",
      cbte_tipo: 6,
      pto_vta: 1,
      concepto: 2,
      receptor_doc_tipo: 99,
      receptor_doc_nro: "0",
      receptor_nombre: "Juan",
      receptor_condicion_iva: 5,
      amount_entry_mode: "NET",
      moneda: "PES",
      cotizacion: 1,
      items: [{ descripcion: "Comisión", cantidad: 1, precio_unitario: 10000 }],
    }
  }

  async function callPost(body: any, supabaseOpts: any) {
    const { supabase } = makeSupabase(supabaseOpts)
    mockCreateServerClient.mockResolvedValue(supabase)
    const { POST } = await import("@/app/api/invoices/route")
    const req = new NextRequest("http://localhost/api/invoices", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
    return await POST(req)
  }

  it("passes when new total + already <= margin", async () => {
    const res = await callPost(validBody(), {
      operation: { id: "op-1", org_id: "org-aaa", margin_amount: 20000 },
      authorizedInvoices: [{ imp_total: 5000 }],
    })
    expect(res.status).toBe(200)
  })

  it("returns 400 with max_remaining when new total exceeds remaining", async () => {
    const res = await callPost(validBody(), {
      operation: { id: "op-1", org_id: "org-aaa", margin_amount: 20000 },
      authorizedInvoices: [{ imp_total: 15000 }],
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/restante/i)
    expect(body.max_remaining).toBe(5000)
  })

  it("returns 403 when operation belongs to another org", async () => {
    const res = await callPost(validBody(), {
      operation: { id: "op-1", org_id: "org-other", margin_amount: 20000 },
      authorizedInvoices: [],
      agencyOrgId: "org-aaa",
    })
    expect(res.status).toBe(403)
  })

  it("returns 404 when operation not found", async () => {
    const res = await callPost(validBody(), {
      operation: null,
      authorizedInvoices: [],
    })
    expect(res.status).toBe(404)
  })

  it("passes when operation_id is null (standalone invoice)", async () => {
    const res = await callPost(validBody(null), {
      operation: null,
      authorizedInvoices: [],
    })
    expect(res.status).toBe(200)
  })

  it("tolerates 1-cent float imprecision (19999.99 + 0.01 = 20000)", async () => {
    mockCalculateInvoice.mockReturnValue({
      items: [{ subtotal: 0.01, iva_importe: 0, iva_id: 3, iva_porcentaje: 0, tax_treatment: "GRAVADO", orden: 0 }],
      totals: { imp_neto: 0.01, imp_iva: 0, imp_total: 0.01, imp_tot_conc: 0, imp_op_ex: 0, imp_trib: 0 },
      amount_entry_mode: "NET",
    })
    const res = await callPost(validBody(), {
      operation: { id: "op-1", org_id: "org-aaa", margin_amount: 20000 },
      authorizedInvoices: [{ imp_total: 19999.99 }],
    })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests, expect FAIL (validation not implemented yet)**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/invoices/post-operation-validation.test.ts`
Expected: some FAIL (the margin-cap test should fail — implementation not yet present).

- [ ] **Step 3: Read current `/api/invoices/route.ts` POST to understand insertion point**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && grep -n 'operation_id\|agency_id\|org_id' app/api/invoices/route.ts | head -15`

Find the point AFTER `calculatedInvoice = calculateInvoice(...)` and BEFORE `supabase.from("invoices").insert(...)`. The agency+org_id fetch is likely already there (from SP-1 Task 13). We add margin validation BETWEEN the agency fetch and the insert.

- [ ] **Step 4: Add margin validation in POST**

In `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/invoices/route.ts`, find the section after `validatedData.operation_id || null` usage and after the agency org_id resolution. ADD this block BEFORE the `.insert({...})`:

```typescript
    // Si la factura está atada a una operación, validar que no se exceda
    // el margen restante (suma de authorized + new <= margin_amount)
    if (validatedData.operation_id) {
      const { data: operation, error: opErr } = await (supabase.from("operations") as any)
        .select("id, org_id, margin_amount")
        .eq("id", validatedData.operation_id)
        .single()

      if (opErr || !operation) {
        return NextResponse.json(
          { error: "Operación no encontrada" },
          { status: 404 }
        )
      }

      // Cross-tenant check: la operación debe pertenecer al mismo org que la agencia
      if (operation.org_id !== agency.org_id) {
        return NextResponse.json(
          { error: "La operación no pertenece a tu organización" },
          { status: 403 }
        )
      }

      // Sum authorized invoices de esta operación
      const { data: existingInvoices } = await (supabase.from("invoices") as any)
        .select("imp_total")
        .eq("operation_id", validatedData.operation_id)
        .eq("status", "authorized")

      const alreadyInvoiced = (existingInvoices ?? []).reduce(
        (acc: number, i: any) => acc + Number(i.imp_total),
        0
      )
      const margin = Number(operation.margin_amount)
      const remaining = Math.round((margin - alreadyInvoiced) * 100) / 100
      const newTotal = Number(calculatedInvoice.totals.imp_total)

      // Tolerancia 1 cent para float precision
      if (newTotal > remaining + 0.01) {
        return NextResponse.json(
          {
            error: `No se puede facturar $${newTotal.toFixed(2)}: el margen restante de la operación es $${remaining.toFixed(2)}`,
            max_remaining: remaining,
          },
          { status: 400 }
        )
      }
    }
```

Asegurá que este bloque va DESPUÉS del `const { data: agency } = ...` y ANTES del `supabase.from("invoices").insert(...)`.

- [ ] **Step 5: Run tests, expect PASS**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test -- __tests__/invoices/post-operation-validation.test.ts`
Expected: 6 PASS.

- [ ] **Step 6: Add re-check in authorize endpoint (race safety)**

Modify `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/invoices/[id]/authorize/route.ts`. After the `invoice` fetch and BEFORE calling `afipService.issueVoucher`, add:

```typescript
    // Re-check margin cap (race-safe: otro POST podría haber completado mientras
    // esta factura estaba en draft/pending)
    if (invoice.operation_id) {
      const { data: operation } = await (supabase.from("operations") as any)
        .select("margin_amount")
        .eq("id", invoice.operation_id)
        .single()

      if (operation) {
        const { data: peers } = await (supabase.from("invoices") as any)
          .select("imp_total")
          .eq("operation_id", invoice.operation_id)
          .eq("status", "authorized")
          .neq("id", invoice.id)

        const already = (peers ?? []).reduce(
          (acc: number, i: any) => acc + Number(i.imp_total),
          0
        )
        const margin = Number(operation.margin_amount)
        const projected = already + Number(invoice.imp_total)

        if (projected > margin + 0.01) {
          await (supabase.from("invoices") as any)
            .update({ status: "rejected" })
            .eq("id", invoice.id)
          return NextResponse.json(
            {
              error: `No se puede autorizar: otra factura completó el margen mientras este draft esperaba. Restante actual: $${(margin - already).toFixed(2)}`,
              max_remaining: margin - already,
            },
            { status: 400 }
          )
        }
      }
    }
```

Insertar ANTES del `await afipService.issueVoucher(invoice)`.

- [ ] **Step 7: Full tests run**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test 2>&1 | tail -8`
Expected: all tests PASS. The existing SP-1a authorize tests should still pass (they don't use operation_id → the new code path is skipped).

- [ ] **Step 8: Build**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add app/api/invoices/route.ts app/api/invoices/\[id\]/authorize/route.ts __tests__/invoices/post-operation-validation.test.ts && git commit -m "$(cat <<'EOF'
feat(invoices): backend validation de margin cap cuando operation_id (SP-2)

- POST /api/invoices: si operation_id presente → check cross-org +
  sum(authorized) + new <= margin. 400 con max_remaining si excede.
- POST /api/invoices/[id]/authorize: re-check pre-AFIP por race condition.
  Si otra factura completó el margen mientras esta draft esperaba,
  reject + return 400.
- Tolerancia 1ct float precision.
- 6 tests unit cubriendo happy path, exceed, cross-org, not found,
  standalone (null), float edge.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — UI

### Task 4: `OperationFacturacionSection` component

**Files:**
- Create: `components/operations/operation-facturacion-section.tsx`

- [ ] **Step 1: Create the component**

Create `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/operations/operation-facturacion-section.tsx`:

```typescript
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Receipt, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface MarginSummaryResponse {
  operation: {
    id: string
    file_code: string
    destination: string
    margin_amount: number
    customer: { id: string; name: string } | null
    has_afip_emisor: boolean
  }
  summary: {
    margin_total: number
    already_invoiced: number
    remaining: number
    can_invoice: boolean
    reason_disabled: "no_margin" | "no_customer" | "no_afip" | "already_fully_invoiced" | null
  }
  invoices: Array<{
    id: string
    cbte_nro: number | null
    pto_vta: number
    cbte_tipo: number
    imp_total: number
    fecha_emision: string | null
    status: string
    verification_status: string | null
    cae: string | null
  }>
}

const REASON_TEXT: Record<string, string> = {
  no_margin: "Esta operación no tiene margen (costo ≥ venta)",
  no_customer: "Asigná un cliente a la operación primero",
  no_afip: "Configurá AFIP en Integraciones primero",
  already_fully_invoiced: "Ya facturada completa",
}

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n)

const fmtDate = (s: string | null) => {
  if (!s) return "-"
  try {
    return new Date(s).toLocaleDateString("es-AR")
  } catch {
    return s
  }
}

export function OperationFacturacionSection({ operationId }: { operationId: string }) {
  const router = useRouter()
  const [data, setData] = useState<MarginSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/operations/${operationId}/margin-summary`)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
          throw new Error(err.error || "Error al cargar")
        }
        return r.json()
      })
      .then((d: MarginSummaryResponse) => {
        if (!cancelled) setData(d)
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message || "Error de red")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [operationId])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const { summary, invoices } = data
  const pct = summary.margin_total > 0
    ? Math.min(100, (summary.already_invoiced / summary.margin_total) * 100)
    : 0

  const disabledReasonText = summary.reason_disabled
    ? REASON_TEXT[summary.reason_disabled]
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Facturación de ganancia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Margen total</div>
            <div className="font-semibold">{fmtARS(summary.margin_total)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Ya facturado</div>
            <div className="font-semibold">{fmtARS(summary.already_invoiced)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Restante</div>
            <div className="font-semibold text-emerald-600">{fmtARS(summary.remaining)}</div>
          </div>
        </div>

        {/* Progress */}
        {summary.margin_total > 0 && (
          <Progress value={pct} className="h-2" />
        )}

        {/* Action button */}
        <div>
          <Button
            onClick={() => router.push(`/operations/billing/new?operationId=${operationId}`)}
            disabled={!summary.can_invoice}
            className="w-full sm:w-auto"
          >
            <Receipt className="h-4 w-4 mr-2" />
            Facturar ganancia
          </Button>
          {disabledReasonText && (
            <p className="text-xs text-muted-foreground mt-2">{disabledReasonText}</p>
          )}
        </div>

        {/* Invoices list */}
        {invoices.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Facturas emitidas
            </div>
            {invoices.map((inv) => {
              const nroStr = inv.cbte_nro
                ? `${String(inv.pto_vta).padStart(4, "0")}-${String(inv.cbte_nro).padStart(8, "0")}`
                : "(draft)"
              const tipoLabel = inv.cbte_tipo === 1 ? "A" : inv.cbte_tipo === 6 ? "B" : inv.cbte_tipo === 11 ? "C" : inv.cbte_tipo === 19 ? "E" : `T${inv.cbte_tipo}`
              const isAuthorized = inv.status === "authorized"
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{tipoLabel} {nroStr}</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span>{fmtARS(inv.imp_total)}</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(inv.fecha_emision)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isAuthorized && (
                      <Badge variant="secondary" className="text-xs">{inv.status}</Badge>
                    )}
                    {isAuthorized && inv.verification_status === "verified" && (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Verificada
                      </Badge>
                    )}
                    {isAuthorized && inv.verification_status === "discrepancy" && (
                      <Badge variant="destructive" className="text-xs">Discrepancia</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => router.push(`/operations/billing?id=${inv.id}`)}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify Progress component exists**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && ls components/ui/progress.tsx 2>&1`

Expected: file exists. If it doesn't, run `npx shadcn@latest add progress` and regenerate.

- [ ] **Step 3: Build check**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add components/operations/operation-facturacion-section.tsx && git commit -m "$(cat <<'EOF'
feat(operations): OperationFacturacionSection component

Box en el detalle de operación con:
- Stats (margen, ya facturado, restante) + barra de progreso
- Botón 'Facturar ganancia' que redirige a /operations/billing/new?operationId=X
- Lista de facturas emitidas con badges de verification_status
- Estados disabled con tooltip explicativo (no_margin, no_customer, no_afip, already_fully_invoiced)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Montar section en detalle de operación

**Files:**
- Modify: `components/operations/operation-detail-client.tsx`

- [ ] **Step 1: Leer el archivo y ubicar donde montar**

Run:
```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && wc -l components/operations/operation-detail-client.tsx
grep -n 'TabsContent\|AccordionItem\|accounting\|finan\|Ganancia\|margen\|Section' components/operations/operation-detail-client.tsx | head -20
```

Busca una sección "Accounting" / "Datos financieros" / tab "Facturación" o similar donde encajar el nuevo box.

- [ ] **Step 2: Importar y montar el componente**

En `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/operations/operation-detail-client.tsx`:

1. Agregar import al top:
```tsx
import { OperationFacturacionSection } from "@/components/operations/operation-facturacion-section"
```

2. En el JSX, ubicar un lugar apropiado (idealmente cerca de datos financieros / dentro de un tab "Facturación" si existe, o al final del detalle). Agregar:
```tsx
<OperationFacturacionSection operationId={operation.id} />
```

Si el componente tiene múltiples tabs (Datos generales / Pasajeros / Contabilidad / etc), encaja en el tab que tenga sentido contable. Si no hay estructura de tabs, agregalo al final del stack vertical.

- [ ] **Step 3: Build + visual sanity**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add components/operations/operation-detail-client.tsx && git commit -m "$(cat <<'EOF'
feat(operations): mount OperationFacturacionSection en detalle

Muestra el box de facturación de ganancia en el detalle de cada operación,
cerca de los datos financieros/contables.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Refactor form `/operations/billing/new?operationId=X`

**Files:**
- Modify: `app/(dashboard)/operations/billing/new/page.tsx`

Esta task cambia el comportamiento cuando el form se abre con `operationId` en query: en lugar de precargar venta+costo como 2 items separados, precarga UN único item con margen restante.

- [ ] **Step 1: Leer la función existente `handleOperationChange`**

Run:
```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && grep -n 'handleOperationChange\|precioOriginalUSD\|costoTotal\|newItems\|operation_id' 'app/(dashboard)/operations/billing/new/page.tsx' | head -20
```

Expected: encuentra la función que actualmente hace la precarga de 2 items. Típicamente usa `fullOperation.sale_amount_total`, `fullOperation.operator_cost`, etc.

- [ ] **Step 2: Reemplazar la lógica de precarga de items**

Dentro de `handleOperationChange` (o la función que se llama cuando se selecciona operation o en el `preloadOperationBillingData` useEffect del `preselectedOperationId`), encontrar el bloque que construye `newItems` con 2 entries (venta + costo operador) y **reemplazarlo** por:

```typescript
          // Fetch margin summary desde la API (reemplaza la precarga vieja de 2 items)
          const summaryRes = await fetch(`/api/operations/${operationId}/margin-summary`)
          if (!summaryRes.ok) {
            const err = await summaryRes.json().catch(() => ({ error: "Error al cargar margen" }))
            toast({
              title: "No se puede facturar esta operación",
              description: err.error || "Error al cargar",
              variant: "destructive",
            })
            router.back()
            return
          }
          const summary = await summaryRes.json()

          if (!summary.summary.can_invoice) {
            const reasonText: Record<string, string> = {
              no_margin: "La operación no tiene margen facturable",
              no_customer: "La operación no tiene cliente asignado",
              no_afip: "AFIP no está configurado para esta organización",
              already_fully_invoiced: "La operación ya está facturada completa",
            }
            toast({
              title: "No se puede facturar",
              description: reasonText[summary.summary.reason_disabled] || "Operación no facturable",
              variant: "destructive",
            })
            router.back()
            return
          }

          // Precargar 1 item único con el margen restante
          const taxTreatment = getDefaultTaxTreatment(formData.cbte_tipo)
          const newItems: InvoiceItem[] = [
            {
              descripcion: `Comisión por intermediación turística - ${summary.operation.destination} (${summary.operation.file_code})`,
              cantidad: 1,
              precio_unitario: summary.summary.remaining,
              iva_porcentaje: taxTreatment === "GRAVADO" ? 21 : 0,
              tax_treatment: taxTreatment,
            },
          ]
          setItems(newItems)

          // Guardar el max permitido en state para validación
          setMarginRemaining(summary.summary.remaining)

          setFormData((prev) => ({
            ...prev,
            operation_id: operationId,
          }))
```

IMPORTANT: si existe una referencia a `fullOperation.sale_currency` / USD cotización, mantenela (el margen ya viene en ARS desde el backend). Si hay lógica de currency que aplicaba solo al flow viejo, remueve las llamadas a exchange-rate que no aplican al margen (el margen ya está en ARS).

- [ ] **Step 3: Agregar state `marginRemaining` + validación visual**

En el componente, cerca de los otros useState:

```typescript
const [marginRemaining, setMarginRemaining] = useState<number | null>(null)
```

Debajo del input de precio unitario del primer item (en el JSX), agregar warning visual si el precio excede el remaining:

```tsx
{marginRemaining !== null && items[0]?.precio_unitario > marginRemaining && (
  <p className="text-xs text-orange-500 mt-1">
    ⚠️ Excede el margen restante ({new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(marginRemaining)}). El backend va a rechazar.
  </p>
)}
```

- [ ] **Step 4: Agregar validación en handleSubmit**

En `handleSubmit`, antes del fetch POST `/api/invoices`, agregar:

```typescript
if (marginRemaining !== null) {
  const totalFinal = items.reduce((acc, i) => acc + (i.precio_unitario * i.cantidad), 0)
  if (totalFinal > marginRemaining + 0.01) {
    toast({
      title: "No se puede facturar",
      description: `Excede el margen restante (${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(marginRemaining)})`,
      variant: "destructive",
    })
    setSaving(false)
    return
  }
}
```

- [ ] **Step 5: Build**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10`
Expected: succeeds. Puede haber TS errors si el código anterior referenciaba variables eliminadas (como `costoTotal`). Leer errores y limpiar.

- [ ] **Step 6: Tests**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git add app/\(dashboard\)/operations/billing/new/page.tsx && git commit -m "$(cat <<'EOF'
refactor(invoices/new): modo margen cuando operationId presente (SP-2)

- Elimina la precarga de 2 items (venta + costo operador) que nunca fue
  útil para facturación real.
- Reemplazo: fetch /api/operations/[id]/margin-summary y precargar 1 ítem
  único 'Comisión por intermediación turística' con precio = margen restante.
- Si can_invoice=false en summary → toast + router.back().
- Validación client-side: warning visual + block submit si precio excede
  remaining. Backend también valida (defense in depth).
- Descripción con destino + file_code para identificación clara.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Final Verification

### Task 7: Full test + build + lint + smoke + push

- [ ] **Step 1: Full jest run**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm test 2>&1 | tail -8`
Expected: all PASS. Count ~600+ tests (583 baseline post-SP-1c + 9 margin-summary + 3 margin-summary-api + 6 post-operation-validation = 601).

- [ ] **Step 2: Build**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run build 2>&1 | tail -10`
Expected: clean, `/api/operations/[id]/margin-summary` route en output.

- [ ] **Step 3: Lint**

Run: `cd /Users/tomiisanchezz/Desktop/Repos/erplozada && npm run lint 2>&1 | tail -3; echo 'exit:' $?`
Expected: exit 0.

- [ ] **Step 4: Smoke manual E2E**

Documentar al user los pasos:

1. Arrancar dev (o usar dev server ya corriendo)
2. Ir al detalle de una operación REAL de Lozada con margen > 0 y cliente asignado
3. Ver el box "Facturación de ganancia" con stats correctas (margen, facturado, restante)
4. Click "Facturar ganancia" → form abre con 1 ítem precargado "Comisión por intermediación turística - {destino} ({file_code})" y precio = restante
5. Cambiar a un monto PARCIAL (ej. la mitad del restante), submit
6. AFIP devuelve CAE → vuelta al listado o detalle
7. Volver al detalle de la operación → el box ahora muestra stats actualizadas (ya facturado += monto, restante -= monto), lista de facturas tiene la nueva
8. Intentar facturar de nuevo por MÁS del restante → warning UI + backend 400
9. Intentar facturar otra operación del mismo user cross-agency (si corresponde al test setup) → debería funcionar
10. Intentar acceder via URL directa a una operation de otra org → 404 por RLS

Verificar visualmente que el flow entero funciona end-to-end.

- [ ] **Step 5: Pedir OK al user para push**

Mensaje:
> "Tests pasan (X count), build ok, lint ok. Smoke manual E2E hecho (o pendiente de tu verificación). Tengo N commits locales. ¿Pusheo a main?"

Esperar OK explícito.

- [ ] **Step 6: Push tras OK**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada && git push origin main
```

---

## Post-deploy monitoring

Queries en Supabase SQL Editor para trackear adoption:

**1. Adoption de facturas linkeadas a operación:**
```sql
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) FILTER (WHERE operation_id IS NOT NULL) as linked,
  COUNT(*) FILTER (WHERE operation_id IS NULL) as standalone,
  COUNT(*) as total
FROM invoices
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY day
ORDER BY day DESC;
```

Target: más del 70% de las facturas emitidas queden linked a operation.

**2. Margen restante por operación activa:**
```sql
SELECT o.id, o.file_code, o.margin_amount,
  COALESCE(SUM(i.imp_total) FILTER (WHERE i.status = 'authorized'), 0) as facturado,
  o.margin_amount - COALESCE(SUM(i.imp_total) FILTER (WHERE i.status = 'authorized'), 0) as remaining
FROM operations o
LEFT JOIN invoices i ON i.operation_id = o.id
WHERE o.margin_amount > 0 AND o.status NOT IN ('CANCELLED')
GROUP BY o.id, o.file_code, o.margin_amount
ORDER BY remaining DESC
LIMIT 20;
```

**3. Rechazos por margin cap:** buscar logs Railway "el margen restante de la operación es" → count esperado bajo (UI previene la mayoría).

---

## Next steps (fuera de este plan)

1. **SP-1b** — Onboarding wizard (CUIT + clave fiscal + auto-detect WS).
2. **SP-3** — Libro IVA Digital (TXT mensual para contador).
3. **SP-4** — Factura T turismo extranjeros (RG 3971).
4. **SP-5** — Cert lifecycle (alertas de expiración + auto-rotación).
5. **SP-6** — Facturas de compra + percepciones.
6. Follow-up menor: date pickers en listado de facturas (para mejorar rango de bulk ZIP).
