// app/api/operations/__tests__/route-passengers.test.ts
/**
 * @jest-environment node
 *
 * Tests del POST de operaciones alrededor de los pasajeros (VIB-106).
 *
 * Lo que protegen:
 *
 * 1. Un solo INSERT con array — nada de un insert por pasajero. La atomicidad
 *    de la lista depende de que sea una sola sentencia.
 * 2. Una sola notificación, al titular. Con N acompañantes, reusar el bloque
 *    viejo tal cual mandaría N mails/WhatsApps la primera vez que se use.
 * 3. Cross-tenant: la RLS no alcanza (el trigger de auto org_id rellena
 *    `operation_customers.org_id` con la org del que inserta), así que un
 *    customer de otra org tiene que rebotar ANTES de crear la operación.
 * 4. Si el insert de pasajeros falla, la operación NO se revierte (ya se
 *    escribieron ledger, IVA y operator_payments) pero tampoco se traga el
 *    error: vuelve en `warnings`.
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => {
      const body = JSON.stringify(data)
      return {
        status: init?.status ?? 200,
        json: async () => JSON.parse(body),
      }
    },
  },
}))

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
  createAdminClient: jest.fn(),
}))
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(), getClientIP: () => null }))
jest.mock("@/lib/rate-limit", () => ({ enforceUserRateLimit: jest.fn(() => null) }))
jest.mock("@/lib/cache", () => ({ revalidateTag: jest.fn(), CACHE_TAGS: { DASHBOARD: "dashboard" } }))
jest.mock("@/lib/billing/limits", () => ({ checkLimit: jest.fn(async () => ({ ok: true })) }))
jest.mock("@/lib/accounting/file-code", () => ({ generateFileCode: () => "OP-TEST-0001" }))
jest.mock("@/lib/accounting/ledger", () => ({
  transferLeadToOperation: jest.fn(),
  getOrCreateDefaultAccount: jest.fn(async () => ({ id: "acc-1" })),
  createLedgerMovement: jest.fn(async () => ({ id: "led-1" })),
  calculateARSEquivalent: jest.fn(async () => 0),
}))
jest.mock("@/lib/accounting/iva", () => ({ createSaleIVA: jest.fn(), createPurchaseIVA: jest.fn() }))
jest.mock("@/lib/accounting/operator-payments", () => ({
  createOperatorPayment: jest.fn(),
  calculateDueDate: jest.fn(() => null),
  sanitizeDueDate: (v: any) => v ?? null,
}))
jest.mock("@/lib/accounting/exchange-rates", () => ({
  getExchangeRate: jest.fn(async () => 1),
  getLatestExchangeRate: jest.fn(async () => 1),
  getExchangeRateWithFallback: jest.fn(async () => 1),
}))
jest.mock("@/lib/customers/customer-service", () => ({ sendCustomerNotifications: jest.fn() }))
jest.mock("@/lib/whatsapp/alert-messages", () => ({ generateMessagesFromAlerts: jest.fn() }))
jest.mock("@/lib/permissions-agency", () => ({ resolveUserPermissions: jest.fn(async () => null) }))
jest.mock("@/lib/commissions/seller-commission-profile", () => ({
  resolveSellerCommissionProfiles: jest.fn(async () => ({})),
}))
jest.mock("@/lib/commissions/split-mode", () => ({ splitModeForCreate: jest.fn(() => "AUTO") }))
jest.mock("@/lib/commissions/validate-shared-split", () => ({
  validateManualSplit: jest.fn(() => ({ ok: true })),
}))
jest.mock("@/lib/settings/org-features", () => ({ getOrgFeatureFlag: jest.fn(async () => false) }))
jest.mock("@/lib/accounting/operation-services-debt", () => ({
  getServiceExtrasByOperation: jest.fn(async () => ({})),
}))
jest.mock("@/lib/permissions-api", () => ({
  ...jest.requireActual("@/lib/permissions-api"),
  canPerformAction: jest.fn(() => true),
  getUserAgencyIds: jest.fn(async () => ["agency-1"]),
}))

import { POST } from "../route"

const { getCurrentUser } = require("@/lib/auth")
const { createServerClient } = require("@/lib/supabase/server")
const { sendCustomerNotifications } = require("@/lib/customers/customer-service")

const ORG_ID = "org-1"
const AGENCY_ID = "agency-1"
const TITULAR = "cust-titular"
const ACOMP_1 = "cust-a1"
const ACOMP_2 = "cust-a2"
const ACOMP_3 = "cust-a3"
const OTRA_ORG = "cust-de-otra-org"

interface MockState {
  /** Clientes que SÍ son de la org del usuario. */
  orgCustomers: Set<string>
  /** Filas insertadas en operation_customers, una entrada por llamada. */
  passengerInserts: any[][]
  /** Si es true, el insert de pasajeros devuelve error. */
  failPassengerInsert: boolean
  operationsInserted: jest.Mock
}

function makeRequest(body: any) {
  return { json: async () => body, headers: { get: () => null }, url: "http://localhost/api/operations" } as unknown as Request
}

function chain(result: any, onAwait?: () => void) {
  const builder: any = {
    then: (resolve: any) => {
      onAwait?.()
      return Promise.resolve(result).then(resolve)
    },
    single: async () => {
      onAwait?.()
      return result
    },
    maybeSingle: async () => {
      onAwait?.()
      return result
    },
  }
  for (const method of ["select", "eq", "in", "is", "not", "order", "limit", "gte", "lte", "or"]) {
    builder[method] = () => builder
  }
  return builder
}

/** `customers` necesita responder distinto según cómo se la consulte. */
function customersBuilder(state: MockState) {
  let inIds: string[] | null = null
  let eqId: string | null = null
  const b: any = {
    select: () => b,
    in: (_col: string, ids: string[]) => {
      inIds = ids
      return b
    },
    eq: (col: string, value: string) => {
      if (col === "id") eqId = value
      return b
    },
    insert: () => chain({ data: null, error: null }),
    // findCustomersOutsideOrg: .select().in().eq() y await
    then: (resolve: any) => {
      const ids = inIds ?? []
      const data = ids.filter((id) => state.orgCustomers.has(id)).map((id) => ({ id }))
      return Promise.resolve({ data, error: null }).then(resolve)
    },
    // Lookup del titular para la notificación
    single: async () => ({
      data: eqId && state.orgCustomers.has(eqId)
        ? { id: eqId, first_name: "Ana", last_name: "Pérez", email: "a@test.com", phone: "1" }
        : null,
      error: null,
    }),
    maybeSingle: async () => ({ data: null, error: null }),
  }
  return b
}

function mockSupabase(state: MockState) {
  return {
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from: (table: string) => {
      if (table === "operations") {
        return {
          insert: (payload: any) => {
            state.operationsInserted(payload)
            return chain({
              data: { id: "op-1", created_at: "2026-08-10T00:00:00Z", org_id: ORG_ID, agency_id: AGENCY_ID, ...payload },
              error: null,
            })
          },
          select: () => chain({ data: null, error: null }),
          update: () => chain({ data: null, error: null }),
        }
      }

      if (table === "customers") return customersBuilder(state)

      if (table === "operation_customers") {
        return {
          insert: (rows: any) =>
            chain(
              state.failPassengerInsert
                ? { data: null, error: { message: "insert failed" } }
                : { data: rows, error: null },
              () => state.passengerInserts.push(Array.isArray(rows) ? rows : [rows])
            ),
          select: () => chain({ data: [], error: null }),
        }
      }

      if (table === "customer_settings") {
        return { select: () => chain({ data: { notifications: { email: true } }, error: null }) }
      }

      return {
        select: () => chain({ data: [], error: null }),
        insert: () => chain({ data: null, error: null }),
        update: () => chain({ data: null, error: null }),
        delete: () => chain({ data: null, error: null }),
      }
    },
  }
}

const baseBody = {
  agency_id: AGENCY_ID,
  seller_id: "seller-1",
  type: "PACKAGE",
  destination: "Punta Cana",
  operation_date: "2026-08-01",
  departure_date: "2026-12-01",
  sale_amount_total: 1000,
  currency: "USD",
  sale_currency: "USD",
  operator_cost_currency: "USD",
  operator_cost: 0,
  adults: 4,
}

describe("POST /api/operations — pasajeros (VIB-106)", () => {
  let state: MockState

  beforeEach(() => {
    jest.clearAllMocks()
    state = {
      orgCustomers: new Set([TITULAR, ACOMP_1, ACOMP_2, ACOMP_3]),
      passengerInserts: [],
      failPassengerInsert: false,
      operationsInserted: jest.fn(),
    }
    getCurrentUser.mockResolvedValue({
      user: { id: "seller-1", email: "v@test.com", org_id: ORG_ID, role: "ADMIN", roles: ["ADMIN"] },
    })
    createServerClient.mockResolvedValue(mockSupabase(state))
  })

  it("inserta titular + acompañantes en UNA sola sentencia, con los roles correctos", async () => {
    const response: any = await POST(
      makeRequest({ ...baseBody, customer_id: TITULAR, companions: [ACOMP_1, ACOMP_2, ACOMP_3] })
    )

    expect(response.status).toBe(200)
    // Un solo insert (no un insert por pasajero).
    expect(state.passengerInserts).toHaveLength(1)
    expect(state.passengerInserts[0]).toEqual([
      { operation_id: "op-1", customer_id: TITULAR, role: "MAIN" },
      { operation_id: "op-1", customer_id: ACOMP_1, role: "COMPANION" },
      { operation_id: "op-1", customer_id: ACOMP_2, role: "COMPANION" },
      { operation_id: "op-1", customer_id: ACOMP_3, role: "COMPANION" },
    ])
  })

  it("notifica UNA sola vez y solo al titular", async () => {
    await POST(makeRequest({ ...baseBody, customer_id: TITULAR, companions: [ACOMP_1, ACOMP_2, ACOMP_3] }))

    expect(sendCustomerNotifications).toHaveBeenCalledTimes(1)
    expect(sendCustomerNotifications.mock.calls[0][2]).toMatchObject({ id: TITULAR })
  })

  it("sin acompañantes se comporta igual que antes (una fila MAIN)", async () => {
    const response: any = await POST(makeRequest({ ...baseBody, customer_id: TITULAR }))

    expect(response.status).toBe(200)
    expect(state.passengerInserts).toEqual([
      [{ operation_id: "op-1", customer_id: TITULAR, role: "MAIN" }],
    ])
    expect(sendCustomerNotifications).toHaveBeenCalledTimes(1)
  })

  it("rechaza un acompañante de otra org ANTES de crear la operación", async () => {
    const response: any = await POST(
      makeRequest({ ...baseBody, customer_id: TITULAR, companions: [OTRA_ORG] })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "Uno o más pasajeros no pertenecen a tu organización",
    })
    expect(state.operationsInserted).not.toHaveBeenCalled()
    expect(state.passengerInserts).toHaveLength(0)
  })

  it("rechaza dos titulares antes de crear nada", async () => {
    const response: any = await POST(
      makeRequest({
        ...baseBody,
        customer_id: TITULAR,
        companions: [{ customer_id: ACOMP_1, role: "MAIN" }],
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "Solo puede haber un pasajero principal",
    })
    expect(state.operationsInserted).not.toHaveBeenCalled()
  })

  it("si el insert de pasajeros falla, la operación se crea igual y avisa (no se traga el error)", async () => {
    state.failPassengerInsert = true

    const response: any = await POST(
      makeRequest({ ...baseBody, customer_id: TITULAR, companions: [ACOMP_1] })
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.operation).toBeTruthy()
    expect(body.warnings).toHaveLength(1)
    expect(body.warnings[0]).toMatch(/no se pudieron asociar/i)
    // Y no se notifica a nadie: no hay pasajero asociado.
    expect(sendCustomerNotifications).not.toHaveBeenCalled()
  })
})
