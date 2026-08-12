// app/api/operations/[id]/__tests__/route-operator-sale.test.ts
/**
 * @jest-environment node
 *
 * PATCH de operaciones alrededor del precio de venta por servicio (VIB-112).
 *
 * Protege tres cosas:
 * 1. El payload que va a la RPC replace_operation_operators incluye sale_amount
 *    por pata (los 3 eslabones — UI, normalizador, RPC — sólo se pueden ejercer
 *    juntos desde acá en Jest).
 * 2. Si el caller manda `operators` SIN sale_amount, el payload conserva el
 *    valor guardado (preservación: un bundle viejo no debe borrar el dato).
 * 3. sale_amount NO se filtra a la tabla operations: el update de la operación
 *    no lleva sale_amount ni pisa margin_amount / sale_amount_total (de eso
 *    dependen comisiones, IVA y ledger).
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => JSON.parse(JSON.stringify(data)),
    }),
  },
}))

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn(), createAdminClient: jest.fn() }))
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(), getClientIP: () => null }))
jest.mock("@/lib/rate-limit", () => ({ enforceUserRateLimit: jest.fn(async () => null) }))
jest.mock("@/lib/cache", () => ({ revalidateTag: jest.fn(), CACHE_TAGS: { DASHBOARD: "dashboard" } }))
jest.mock("@/lib/accounting/iva", () => ({
  updateSaleIVA: jest.fn(),
  updatePurchaseIVA: jest.fn(),
  deleteSaleIVA: jest.fn(),
  deletePurchaseIVA: jest.fn(),
  createPurchaseIVA: jest.fn(),
}))
jest.mock("@/lib/accounting/ledger", () => ({ invalidateBalanceCache: jest.fn() }))
jest.mock("@/lib/accounting/operator-payments", () => ({
  createOperatorPayment: jest.fn(),
  calculateDueDate: jest.fn(),
  sanitizeDueDate: (v: any) => v ?? null,
}))
jest.mock("@/lib/accounting/operator-payment-settlement", () => ({
  getOpenOperatorPaymentStatus: jest.fn(async () => null),
}))
jest.mock("@/lib/documents/operation-documents", () => ({ getOperationVisibleDocuments: jest.fn(async () => []) }))
jest.mock("@/lib/operations/operation-financials", () => ({
  sumOperationOperatorCosts: (rows: any[]) => rows.reduce((s, r) => s + Number(r.cost || 0), 0),
}))

import { PATCH } from "../route"

const { getCurrentUser } = require("@/lib/auth")
const { createServerClient } = require("@/lib/supabase/server")

const OPERATION_ID = "op-1"
const ORG_ID = "org-1"
const OP_A = "operator-a"
const OP_B = "operator-b"

const OPERATION_COLUMNS = new Set([
  "id", "org_id", "agency_id", "seller_id", "seller_secondary_id", "file_code",
  "destination", "origin", "type", "status", "departure_date", "return_date",
  "operation_date", "currency", "sale_currency", "operator_cost_currency",
  "sale_amount_total", "operator_cost", "margin_amount", "margin_percentage",
  "commission_split", "commission_pct_primary", "commission_pct_secondary",
  "operator_id", "adults", "children", "infants", "airline_name", "hotel_name",
  "reservation_code_air", "reservation_code_hotel", "itr_localizador",
  "customer_payment_deadline", "passenger_notes", "checkout_date",
  "public_token", "updated_at",
])

const baseOperation = {
  id: OPERATION_ID,
  org_id: ORG_ID,
  agency_id: "agency-1",
  seller_id: "seller-1",
  seller_secondary_id: null,
  status: "RESERVED",
  destination: "Punta Cana",
  currency: "USD",
  sale_currency: "USD",
  operator_cost_currency: "USD",
  sale_amount_total: 1000,
  operator_cost: 700,
  operation_date: "2026-01-01",
  departure_date: "2027-01-10",
}

interface MockState {
  existingOperators: any[]
  rpcPayload: any[] | null
  updateSpy: jest.Mock
}

function makeRequest(body: any) {
  return { json: async () => body, headers: { get: () => null } } as unknown as Request
}

function chain(result: any) {
  const builder: any = {
    then: (resolve: any) => Promise.resolve(result).then(resolve),
    single: async () => result,
    maybeSingle: async () => result,
  }
  for (const m of ["select", "eq", "in", "is", "not", "order", "limit", "gte", "lte"]) builder[m] = () => builder
  return builder
}

function mockSupabase(state: MockState) {
  return {
    rpc: jest.fn(async (fn: string, args: any) => {
      if (fn === "replace_operation_operators") state.rpcPayload = args.p_operators
      return { error: null }
    }),
    from: (table: string) => {
      if (table === "operations") {
        return {
          select: () => chain({ data: baseOperation, error: null }),
          update: (payload: any) => {
            state.updateSpy(payload)
            const unknown = Object.keys(payload).find((k) => !OPERATION_COLUMNS.has(k))
            if (unknown) {
              return chain({ data: null, error: { message: `Could not find the '${unknown}' column` } })
            }
            return chain({ data: { ...baseOperation, ...payload }, error: null })
          },
        }
      }
      if (table === "operation_operators") {
        return { select: () => chain({ data: state.existingOperators, error: null }) }
      }
      // operator_payments / purchase_invoices / iva_purchases / legs / etc.
      return {
        select: () => chain({ data: [], error: null }),
        insert: () => chain({ data: null, error: null }),
        update: () => chain({ data: null, error: null }),
        delete: () => chain({ data: null, error: null }),
      }
    },
  }
}

describe("PATCH /api/operations/[id] — precio de venta por servicio (VIB-112)", () => {
  const params = { params: Promise.resolve({ id: OPERATION_ID }) }
  let state: MockState

  beforeEach(() => {
    jest.clearAllMocks()
    state = {
      existingOperators: [
        { operator_id: OP_A, cost: 500, cost_currency: "USD", product_type: "FLIGHT", sale_amount: 700 },
        { operator_id: OP_B, cost: 200, cost_currency: "USD", product_type: "HOTEL", sale_amount: 300 },
      ],
      rpcPayload: null,
      updateSpy: jest.fn(),
    }
    getCurrentUser.mockResolvedValue({
      user: { id: "seller-1", email: "v@test.com", org_id: ORG_ID, role: "ADMIN" },
    })
    createServerClient.mockResolvedValue(mockSupabase(state))
  })

  it("manda sale_amount por pata a la RPC", async () => {
    const response: any = await PATCH(
      makeRequest({
        operators: [
          { operator_id: OP_A, cost: 500, cost_currency: "USD", product_type: "FLIGHT", sale_amount: 650 },
          { operator_id: OP_B, cost: 200, cost_currency: "USD", product_type: "HOTEL", sale_amount: 350 },
        ],
      }),
      params
    )

    expect(response.status).toBe(200)
    expect(state.rpcPayload).not.toBeNull()
    expect(state.rpcPayload!.map((p) => p.sale_amount)).toEqual([650, 350])
  })

  it("preserva el sale_amount guardado cuando el caller no lo manda", async () => {
    const response: any = await PATCH(
      makeRequest({
        // Bundle viejo: manda operators SIN sale_amount.
        operators: [
          { operator_id: OP_A, cost: 500, cost_currency: "USD", product_type: "FLIGHT" },
          { operator_id: OP_B, cost: 200, cost_currency: "USD", product_type: "HOTEL" },
        ],
      }),
      params
    )

    expect(response.status).toBe(200)
    // Conserva los valores guardados (700 / 300), no los pone en 0.
    expect(state.rpcPayload!.map((p) => p.sale_amount)).toEqual([700, 300])
  })

  it("permite poner sale_amount en 0 explícitamente (no lo confunde con undefined)", async () => {
    const response: any = await PATCH(
      makeRequest({
        operators: [
          { operator_id: OP_A, cost: 500, cost_currency: "USD", product_type: "FLIGHT", sale_amount: 0 },
          { operator_id: OP_B, cost: 200, cost_currency: "USD", product_type: "HOTEL", sale_amount: 1000 },
        ],
      }),
      params
    )

    expect(response.status).toBe(200)
    expect(state.rpcPayload!.map((p) => p.sale_amount)).toEqual([0, 1000])
  })

  it("NO filtra sale_amount a la tabla operations", async () => {
    // Se cambia la venta por pata Y el costo (para forzar el recálculo de margen).
    await PATCH(
      makeRequest({
        sale_amount_total: 1200,
        operators: [
          { operator_id: OP_A, cost: 600, cost_currency: "USD", product_type: "FLIGHT", sale_amount: 900 },
          { operator_id: OP_B, cost: 200, cost_currency: "USD", product_type: "HOTEL", sale_amount: 100 },
        ],
      }),
      params
    )

    const updatePayload = state.updateSpy.mock.calls[0][0]
    // sale_amount por pata nunca llega a la tabla operations.
    expect(updatePayload).not.toHaveProperty("sale_amount")
    // El margen se deriva del total y el costo agregado (1200 - 800 = 400),
    // NUNCA de la suma de las ventas por pata (900 + 100 = 1000).
    expect(updatePayload.margin_amount).toBe(400)
  })
})
