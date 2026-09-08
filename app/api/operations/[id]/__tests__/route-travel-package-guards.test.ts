// app/api/operations/[id]/__tests__/route-travel-package-guards.test.ts
/**
 * @jest-environment node
 *
 * Guards de cupo al EDITAR una operación vendida sobre un paquete (VIB-183).
 *
 * Cancelar libera el cupo solo, porque el conteo del paquete excluye las
 * operaciones CANCELLED. Pero hay dos caminos por los que el consumo puede
 * CRECER sin pasar por la toma del alta, y son los únicos:
 *
 *   a) subir los pasajeros de una venta que ya tiene reserva;
 *   b) sacar de CANCELLED una operación cuyo lugar ya se revendió.
 *
 * Sin estos guards el paquete termina con más plazas vendidas que su cupo.
 *
 * Se protege además que `travel_package_id` NO llegue a la tabla `operations`:
 * no es una columna suya (el vínculo es la fila de travel_package_bookings), y
 * un campo que no es columna rompe la escritura ENTERA con un 500 genérico —
 * exactamente lo que pasó con `legs_replace` el 2026-07-21.
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
jest.mock("@/lib/documents/operation-documents", () => ({
  getOperationVisibleDocuments: jest.fn(async () => []),
}))
jest.mock("@/lib/operations/operation-financials", () => ({
  sumOperationOperatorCosts: (rows: any[]) => rows.reduce((s, r) => s + Number(r.cost || 0), 0),
}))

import { PATCH } from "../route"

const { getCurrentUser } = require("@/lib/auth")
const { createServerClient } = require("@/lib/supabase/server")

const OPERATION_ID = "op-1"
const ORG_ID = "org-1"

/** Columnas reales de `operations`: cualquier otra cosa rompe el update. */
const OPERATION_COLUMNS = new Set([
  "id", "org_id", "agency_id", "seller_id", "seller_secondary_id", "file_code",
  "destination", "origin", "type", "status", "departure_date", "return_date",
  "operation_date", "currency", "sale_currency", "operator_cost_currency",
  "sale_amount_total", "operator_cost", "margin_amount", "margin_percentage",
  "commission_split", "commission_pct_primary", "commission_pct_secondary",
  "commission_split_mode", "operator_id", "adults", "children", "infants",
  "airline_name", "hotel_name", "reservation_code_air", "reservation_code_hotel",
  "itr_localizador", "customer_payment_deadline", "passenger_notes",
  "checkout_date", "public_token", "updated_at",
])

const baseOperation = {
  id: OPERATION_ID,
  org_id: ORG_ID,
  agency_id: "agency-1",
  seller_id: "seller-1",
  seller_secondary_id: null,
  status: "RESERVED",
  destination: "Cancún",
  currency: "USD",
  sale_currency: "USD",
  operator_cost_currency: "USD",
  sale_amount_total: 1000,
  operator_cost: 700,
  operation_date: "2026-01-01",
  departure_date: "2027-01-10",
  adults: 2,
  children: 0,
  infants: 0,
}

interface MockState {
  operation: any
  rpcCalls: { fn: string; args: any }[]
  /** Error que devuelve revalidate_travel_package_booking, si se fuerza uno. */
  cupoError: { code: string; message: string; details?: string } | null
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
  for (const m of ["select", "eq", "in", "is", "not", "order", "limit", "gte", "lte"]) {
    builder[m] = () => builder
  }
  return builder
}

function mockSupabase(state: MockState) {
  return {
    rpc: jest.fn(async (fn: string, args: any) => {
      state.rpcCalls.push({ fn, args })
      if (fn === "revalidate_travel_package_booking" && state.cupoError) {
        return { data: null, error: state.cupoError }
      }
      return { data: { has_booking: true }, error: null }
    }),
    from: (table: string) => {
      if (table === "operations") {
        return {
          select: () => chain({ data: state.operation, error: null }),
          update: (payload: any) => {
            state.updateSpy(payload)
            const unknown = Object.keys(payload).find((k) => !OPERATION_COLUMNS.has(k))
            if (unknown) {
              return chain({
                data: null,
                error: { message: `Could not find the '${unknown}' column` },
              })
            }
            return chain({ data: { ...state.operation, ...payload }, error: null })
          },
        }
      }
      if (table === "operation_operators") {
        return { select: () => chain({ data: [], error: null }) }
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

const ctx = { params: Promise.resolve({ id: OPERATION_ID }) }
const revalidaciones = (state: MockState) =>
  state.rpcCalls.filter((c) => c.fn === "revalidate_travel_package_booking")

describe("PATCH /api/operations/[id] — guards de cupo (VIB-183)", () => {
  let state: MockState

  beforeEach(() => {
    jest.clearAllMocks()
    state = {
      operation: { ...baseOperation },
      rpcCalls: [],
      cupoError: null,
      updateSpy: jest.fn(),
    }
    getCurrentUser.mockResolvedValue({
      user: { id: "admin-1", email: "a@test.com", org_id: ORG_ID, role: "ADMIN", roles: ["ADMIN"] },
    })
    createServerClient.mockResolvedValue(mockSupabase(state))
  })

  it("travel_package_id no llega a la tabla operations", async () => {
    // Si se filtrara, PostgREST rechazaría el UPDATE entero con "column does not
    // exist" y la edición fallaría con un 500 sin explicación.
    const res: any = await PATCH(
      makeRequest({ destination: "Cancún centro", travel_package_id: "pkg-1" }),
      ctx
    )

    expect(res.status).toBe(200)
    const payload = state.updateSpy.mock.calls[0]?.[0] ?? {}
    expect(payload.travel_package_id).toBeUndefined()
  })

  it("subir los pasajeros revalida el cupo con las plazas nuevas", async () => {
    await PATCH(makeRequest({ adults: 4, children: 1 }), ctx)

    const llamada = revalidaciones(state)[0]
    expect(llamada?.args.p_seats).toBe(5)
    expect(llamada?.args.p_will_be_active).toBe(true)
    // El org sale de la sesión, nunca del body.
    expect(llamada?.args.p_org_id).toBe(ORG_ID)
  })

  it("si las plazas nuevas no entran, devuelve 409 y NO aplica la edición", async () => {
    state.cupoError = {
      code: "P4301",
      message: "travel package quota exhausted",
      details: JSON.stringify({
        code: "TRAVEL_PACKAGE_QUOTA_EXHAUSTED",
        total_quota: 10,
        consumed: 8,
        requested: 5,
        remaining: 2,
      }),
    }

    const res: any = await PATCH(makeRequest({ adults: 5 }), ctx)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/quedan 2 plaza/)
    expect(state.updateSpy).not.toHaveBeenCalled()
  })

  it("des-cancelar revalida el cupo: el lugar pudo haberse revendido", async () => {
    state.operation = { ...baseOperation, status: "CANCELLED" }

    await PATCH(makeRequest({ status: "CONFIRMED" }), ctx)

    const llamada = revalidaciones(state)[0]
    expect(llamada).toBeDefined()
    expect(llamada?.args.p_will_be_active).toBe(true)
  })

  it("cancelar no necesita cupo: la revalidación va con will_be_active en false", async () => {
    await PATCH(makeRequest({ status: "CANCELLED" }), ctx)

    const llamada = revalidaciones(state)[0]
    expect(llamada?.args.p_will_be_active).toBe(false)
  })

  it("una edición que no toca pasajeros ni estado no consulta el cupo", async () => {
    await PATCH(makeRequest({ destination: "Punta Cana" }), ctx)

    expect(revalidaciones(state)).toHaveLength(0)
  })
})
