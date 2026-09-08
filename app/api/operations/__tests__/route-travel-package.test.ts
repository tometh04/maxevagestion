/**
 * @jest-environment node
 *
 * Toma de cupo de un paquete cerrado al crear una operación (VIB-183).
 *
 * Que el cupo no se sobrevenda lo garantiza la base: `book_travel_package_seats`
 * lockea el paquete y cuenta las reservas activas dentro de la misma
 * transacción, y eso está probado contra el esquema real (no se puede probar una
 * carrera con la RPC mockeada: se estaría probando el mock).
 *
 * Lo que se fija acá es el contrato de la ruta alrededor de esa llamada:
 *
 * 1. Una operación sin paquete no toca ninguna de las funciones nuevas. Es la
 *    garantía de que el alta de siempre no cambió.
 * 2. El cupo se mide en PLAZAS: 4 pasajeros piden 4.
 * 3. Si ya no hay lugar, se rechaza ANTES de crear nada.
 * 4. Si el lugar se agota en la carrera (la RPC devuelve P4301 después del
 *    insert), la operación recién creada se BORRA, el lead vuelve a su estado
 *    anterior, y no se escribió ni IVA, ni deuda al operador, ni ledger.
 * 5. Un reintento del alta sobre la misma operación no consume dos veces.
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
const { createSaleIVA, createPurchaseIVA } = require("@/lib/accounting/iva")
const { createOperatorPayment } = require("@/lib/accounting/operator-payments")
const { createLedgerMovement } = require("@/lib/accounting/ledger")

const ORG_ID = "org-1"
const AGENCY_ID = "agency-1"
const PAQUETE = "pkg-1"
const LEAD = "lead-1"

interface MockState {
  /** Plazas libres que devuelve el pre-chequeo. */
  remaining: number
  /** Error que devuelve `book_travel_package_seats`, si se quiere forzar uno. */
  bookError: { code: string; message: string; details?: string } | null
  /** Respuesta de la toma cuando no hay error. */
  bookResult: any
  rpcCalls: { fn: string; args: any }[]
  operationsInserted: jest.Mock
  operationsDeleted: jest.Mock
  leadUpdates: any[]
}

function makeRequest(body: any) {
  return {
    json: async () => body,
    headers: { get: () => null },
    url: "http://localhost/api/operations",
  } as unknown as Request
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
  for (const m of ["select", "eq", "in", "is", "not", "order", "limit", "gte", "lte", "or"]) {
    builder[m] = () => builder
  }
  return builder
}

function mockSupabase(state: MockState) {
  return {
    rpc: jest.fn(async (fn: string, args: any) => {
      state.rpcCalls.push({ fn, args })

      if (fn === "get_travel_package_availability") {
        return {
          data: [
            {
              package_id: PAQUETE,
              total_quota: 10,
              consumed: 10 - state.remaining,
              remaining: state.remaining,
              active_bookings: 1,
              cancelled_bookings: 0,
            },
          ],
          error: null,
        }
      }

      if (fn === "book_travel_package_seats") {
        return state.bookError
          ? { data: null, error: state.bookError }
          : { data: state.bookResult, error: null }
      }

      return { data: null, error: null }
    }),
    from: (table: string) => {
      if (table === "operations") {
        return {
          insert: (payload: any) => {
            state.operationsInserted(payload)
            return chain({
              data: {
                id: "op-1",
                created_at: "2026-09-08T00:00:00Z",
                org_id: ORG_ID,
                agency_id: AGENCY_ID,
                ...payload,
              },
              error: null,
            })
          },
          select: () => chain({ data: null, error: null }),
          update: () => chain({ data: null, error: null }),
          delete: () => chain({ data: null, error: null }, () => state.operationsDeleted()),
        }
      }

      if (table === "leads") {
        return {
          select: () => chain({ data: { status: "QUOTED" }, error: null }),
          update: (values: any) => {
            state.leadUpdates.push(values)
            return chain({ data: { id: LEAD }, error: null })
          },
        }
      }

      if (table === "agencies") {
        return { select: () => chain({ data: { id: AGENCY_ID }, error: null }) }
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
  destination: "Cancún",
  operation_date: "2026-09-01",
  departure_date: "2026-12-01",
  sale_amount_total: 1000,
  currency: "USD",
  sale_currency: "USD",
  operator_cost_currency: "USD",
  operator_cost: 0,
  adults: 4,
}

const llamadasDePaquete = (state: MockState) =>
  state.rpcCalls.filter((c) => c.fn.includes("travel_package"))

describe("POST /api/operations — cupo de paquete (VIB-183)", () => {
  let state: MockState

  beforeEach(() => {
    jest.clearAllMocks()
    state = {
      remaining: 10,
      bookError: null,
      bookResult: { booking_id: "bk-1", seats: 4, remaining: 6, already_booked: false },
      rpcCalls: [],
      operationsInserted: jest.fn(),
      operationsDeleted: jest.fn(),
      leadUpdates: [],
    }
    getCurrentUser.mockResolvedValue({
      user: { id: "seller-1", email: "v@test.com", org_id: ORG_ID, role: "ADMIN", roles: ["ADMIN"] },
    })
    createServerClient.mockResolvedValue(mockSupabase(state))
  })

  it("una operación SIN paquete no toca ninguna función de cupo", async () => {
    const res: any = await POST(makeRequest({ ...baseBody }))

    expect(res.status).toBe(200)
    expect(llamadasDePaquete(state)).toHaveLength(0)
    expect(state.operationsInserted).toHaveBeenCalled()
  })

  it("el cupo se mide en plazas: 4 pasajeros piden 4", async () => {
    await POST(makeRequest({ ...baseBody, adults: 2, children: 1, infants: 1, travel_package_id: PAQUETE }))

    const toma = state.rpcCalls.find((c) => c.fn === "book_travel_package_seats")
    expect(toma?.args.p_seats).toBe(4)
    expect(toma?.args.p_package_id).toBe(PAQUETE)
    // El org sale de la sesión, nunca del body.
    expect(toma?.args.p_org_id).toBe(ORG_ID)
  })

  it("si ya no hay lugar, rechaza ANTES de crear la operación", async () => {
    state.remaining = 2

    const res: any = await POST(makeRequest({ ...baseBody, adults: 4, travel_package_id: PAQUETE }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/quedan 2 plaza/)
    expect(state.operationsInserted).not.toHaveBeenCalled()
    expect(state.rpcCalls.some((c) => c.fn === "book_travel_package_seats")).toBe(false)
  })

  it("si el lugar se agota en la carrera, borra la operación y no deja nada contable", async () => {
    state.bookError = {
      code: "P4301",
      message: "travel package quota exhausted",
      details: JSON.stringify({
        code: "TRAVEL_PACKAGE_QUOTA_EXHAUSTED",
        total_quota: 10,
        consumed: 10,
        requested: 4,
        remaining: 0,
      }),
    }

    const res: any = await POST(
      makeRequest({ ...baseBody, travel_package_id: PAQUETE, lead_id: LEAD })
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/cupo/i)

    // La operación se creó y se deshizo.
    expect(state.operationsInserted).toHaveBeenCalled()
    expect(state.operationsDeleted).toHaveBeenCalled()

    // El lead vuelve a su estado anterior: WON primero (CAS lock), QUOTED después.
    expect(state.leadUpdates).toEqual([{ status: "WON" }, { status: "QUOTED" }])

    // Y nada de lo contable llegó a escribirse.
    expect(createSaleIVA).not.toHaveBeenCalled()
    expect(createPurchaseIVA).not.toHaveBeenCalled()
    expect(createOperatorPayment).not.toHaveBeenCalled()
    expect(createLedgerMovement).not.toHaveBeenCalled()
  })

  it("un paquete inexistente devuelve 404 sin crear nada", async () => {
    state.bookError = { code: "P0002", message: "El paquete seleccionado no existe" }
    // El pre-chequeo pasa (devuelve cupo) pero la toma no encuentra el paquete.
    const res: any = await POST(makeRequest({ ...baseBody, travel_package_id: PAQUETE }))

    expect(res.status).toBe(404)
    expect(state.operationsDeleted).toHaveBeenCalled()
  })

  it("un reintento del alta no consume el cupo dos veces", async () => {
    state.bookResult = { booking_id: "bk-1", seats: 4, remaining: 6, already_booked: true }

    const res: any = await POST(makeRequest({ ...baseBody, travel_package_id: PAQUETE }))

    expect(res.status).toBe(200)
    expect(state.operationsDeleted).not.toHaveBeenCalled()
  })
})
