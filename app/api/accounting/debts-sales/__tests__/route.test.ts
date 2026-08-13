/**
 * @jest-environment node
 *
 * Route test para GET /api/accounting/debts-sales.
 *
 * Foco: modo "saldo al" (fecha de corte). Reconstruye la deuda del cliente
 * COMO ESTABA a una fecha (ej: cierre de Ganancias al 31/12), incluyendo solo
 * operaciones con operation_date <= corte y restando solo cobros con
 * date_paid <= corte.
 */
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/permissions-agency", () => ({
  resolveUserPermissions: jest.fn().mockResolvedValue({}),
  assertPermission: jest.fn().mockReturnValue(true),
}))
jest.mock("@/lib/permissions-api", () => ({
  getUserAgencyIds: jest.fn().mockResolvedValue([]),
  applyCustomersFilters: jest.fn((query: any) => Promise.resolve({ query })),
}))
jest.mock("@/lib/accounting/exchange-rates", () => ({
  buildExchangeRateMap: jest.fn().mockResolvedValue((_d: any) => 1000),
  getLatestExchangeRate: jest.fn().mockResolvedValue(1000),
  DEFAULT_USD_ARS_FALLBACK_RATE: 1000,
}))
jest.mock("@/lib/settings/org-features", () => ({
  getOrgFeatureFlag: jest.fn().mockResolvedValue(false),
}))
jest.mock("@/lib/accounting/operation-services-debt", () => ({
  getServiceExtrasByOperation: jest.fn().mockResolvedValue({}),
}))
jest.mock("@/lib/feature-flags", () => ({
  FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL: "include_services_in_sale_total",
}))

// Query builder awaitable: métodos encadenables devuelven el mismo builder,
// y el builder resuelve el dataset configurado por tabla al await.
function makeSupabaseMock(dataByTable: Record<string, { data: any; error: any }>) {
  return {
    from: jest.fn((table: string) => {
      const result = dataByTable[table] ?? { data: [], error: null }
      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        in: jest.fn(() => builder),
        order: jest.fn(() => builder),
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      }
      return builder
    }),
  }
}

function buildData() {
  return {
    customers: {
      data: [
        {
          id: "cust-1",
          first_name: "Ana",
          last_name: "P",
          email: null,
          phone: null,
          document_number: null,
          document_type: null,
          operation_customers: [
            {
              operation_id: "opA",
              operations: {
                id: "opA",
                file_code: "A1",
                destination: "Miami",
                sale_amount_total: 1000,
                sale_currency: "USD",
                currency: "USD",
                status: "CONFIRMED",
                departure_date: "2026-01-10",
                operation_date: "2025-12-15",
                created_at: "2025-12-15T00:00:00Z",
                seller_id: null,
                agency_id: null,
              },
            },
            {
              operation_id: "opB",
              operations: {
                id: "opB",
                file_code: "B1",
                destination: "Roma",
                sale_amount_total: 500,
                sale_currency: "USD",
                currency: "USD",
                status: "CONFIRMED",
                departure_date: "2026-04-01",
                operation_date: "2026-03-01", // posterior al corte 31/12
                created_at: "2026-03-01T00:00:00Z",
                seller_id: null,
                agency_id: null,
              },
            },
          ],
        },
      ],
      error: null,
    },
    payments: {
      data: [
        // Cobro previo al corte
        { operation_id: "opA", amount: 400, amount_usd: 400, currency: "USD", exchange_rate: null, status: "PAID", direction: "INCOME", date_paid: "2025-12-20" },
        // Cobro POSTERIOR al corte (no debe contar al 31/12)
        { operation_id: "opA", amount: 300, amount_usd: 300, currency: "USD", exchange_rate: null, status: "PAID", direction: "INCOME", date_paid: "2026-02-10" },
      ],
      error: null,
    },
    operation_customers: {
      data: [
        { operation_id: "opA", customer_id: "cust-1", role: "MAIN" },
        { operation_id: "opB", customer_id: "cust-1", role: "MAIN" },
      ],
      error: null,
    },
    users: { data: [], error: null },
  }
}

async function callGET(query: string) {
  const { GET } = require("../route")
  return GET(new Request(`http://localhost/api/accounting/debts-sales?${query}`))
}

describe("GET /api/accounting/debts-sales — modo saldo al (fecha de corte)", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    const { TextDecoder, TextEncoder } = require("util")
    ;(global as any).TextDecoder = TextDecoder
    ;(global as any).TextEncoder = TextEncoder
    const { Request, Response, Headers } = require("undici")
    ;(global as any).Request = Request
    ;(global as any).Response = Response
    ;(global as any).Headers = Headers

    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: "user-1", role: "ADMIN", org_id: "org-1" },
    })
    ;(createServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock(buildData()))
  })

  it("sin corte: usa todos los cobros y todas las operaciones (saldo actual)", async () => {
    const res = await callGET("")
    expect(res.status).toBe(200)
    const { debtors } = await res.json()

    expect(debtors).toHaveLength(1)
    // opA: 1000 - (400+300) = 300 ; opB: 500 - 0 = 500
    expect(Math.round(debtors[0].totalDebt)).toBe(800)
    expect(debtors[0].operationsWithDebt).toHaveLength(2)
  })

  it("con corte 31/12: excluye la op posterior y el cobro posterior", async () => {
    const res = await callGET("asOf=2025-12-31")
    expect(res.status).toBe(200)
    const { debtors } = await res.json()

    expect(debtors).toHaveLength(1)
    // opA: 1000 - 400 (solo el cobro <= 31/12) = 600 ; opB excluida (venta 01/03)
    expect(Math.round(debtors[0].totalDebt)).toBe(600)
    expect(debtors[0].operationsWithDebt).toHaveLength(1)
    expect(debtors[0].operationsWithDebt[0].file_code).toBe("A1")
    expect(Math.round(debtors[0].operationsWithDebt[0].debt)).toBe(600)
  })
})
