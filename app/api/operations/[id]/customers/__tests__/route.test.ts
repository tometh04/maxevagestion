// app/api/operations/[id]/customers/__tests__/route.test.ts
/**
 * @jest-environment node
 *
 * POST /api/operations/[id]/customers.
 *
 * El caso central es cross-tenant: la ruta validaba que la OPERACIÓN fuera de
 * la org del usuario, pero nunca que el CLIENTE lo fuera. Y la RLS no tapa el
 * agujero, porque el trigger de auto org_id rellena
 * `operation_customers.org_id` con la org del que inserta, así que la fila pasa
 * el WITH CHECK y queda un cliente ajeno linkeado a la operación.
 *
 * Además cubre el modo bulk (VIB-106) sin romper el shape del modo de a uno,
 * que es el que consume `passengers-section.tsx`.
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
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/permissions-api", () => ({ canPerformAction: jest.fn(() => true) }))

import { POST } from "../route"

const { getCurrentUser } = require("@/lib/auth")
const { createServerClient } = require("@/lib/supabase/server")

const OPERATION_ID = "op-1"
const ORG_ID = "org-1"
const PROPIO = "cust-propio"
const OTRO = "cust-de-otra-org"

interface MockState {
  orgCustomers: Set<string>
  existing: Array<{ customer_id: string; role: string }>
  inserted: any[][]
}

function makeRequest(body: any) {
  return { json: async () => body } as unknown as Request
}

const params = { params: Promise.resolve({ id: OPERATION_ID }) }

function mockSupabase(state: MockState) {
  return {
    from: (table: string) => {
      if (table === "operations") {
        const b: any = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () => ({ data: { id: OPERATION_ID }, error: null }),
        }
        return b
      }

      if (table === "customers") {
        let inIds: string[] = []
        const b: any = {
          select: () => b,
          in: (_c: string, ids: string[]) => {
            inIds = ids
            return b
          },
          eq: () => b,
          then: (resolve: any) =>
            Promise.resolve({
              data: inIds.filter((id) => state.orgCustomers.has(id)).map((id) => ({ id })),
              error: null,
            }).then(resolve),
        }
        return b
      }

      if (table === "operation_customers") {
        const b: any = {
          select: () => b,
          eq: () => b,
          insert: (rows: any) => {
            state.inserted.push(rows)
            return {
              select: async () => ({
                data: (rows as any[]).map((r, i) => ({ id: `oc-${i}`, ...r })),
                error: null,
              }),
            }
          },
          then: (resolve: any) => Promise.resolve({ data: state.existing, error: null }).then(resolve),
        }
        return b
      }

      return {}
    },
  }
}

describe("POST /api/operations/[id]/customers", () => {
  let state: MockState

  beforeEach(() => {
    jest.clearAllMocks()
    state = { orgCustomers: new Set([PROPIO, "cust-2", "cust-3"]), existing: [], inserted: [] }
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: ORG_ID, role: "ADMIN" } })
    createServerClient.mockResolvedValue(mockSupabase(state))
  })

  it("rechaza un cliente de otra organización", async () => {
    const response: any = await POST(makeRequest({ customer_id: OTRO }), params)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "Uno o más clientes no pertenecen a tu organización",
    })
    expect(state.inserted).toHaveLength(0)
  })

  it("modo de a uno: mantiene el shape { operationCustomer }", async () => {
    const response: any = await POST(makeRequest({ customer_id: PROPIO }), params)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.operationCustomer).toMatchObject({ customer_id: PROPIO, role: "COMPANION" })
    expect(body.operationCustomers).toBeUndefined()
    expect(state.inserted[0]).toEqual([
      { operation_id: OPERATION_ID, customer_id: PROPIO, role: "COMPANION" },
    ])
  })

  it("modo bulk: inserta todos de una y devuelve la lista", async () => {
    const response: any = await POST(
      makeRequest({ passengers: [{ customer_id: PROPIO }, { customer_id: "cust-2" }] }),
      params
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.operationCustomers).toHaveLength(2)
    // Un solo insert con array.
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toHaveLength(2)
  })

  it("no permite un segundo titular", async () => {
    state.existing = [{ customer_id: "cust-3", role: "MAIN" }]

    const response: any = await POST(makeRequest({ customer_id: PROPIO, role: "MAIN" }), params)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: "Ya existe un pasajero principal" })
    expect(state.inserted).toHaveLength(0)
  })

  it("no permite agregar un cliente que ya está en la operación", async () => {
    state.existing = [{ customer_id: PROPIO, role: "COMPANION" }]

    const response: any = await POST(makeRequest({ customer_id: PROPIO }), params)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "El cliente ya está en esta operación",
    })
  })

  it("deduplica el payload bulk antes de insertar", async () => {
    const response: any = await POST(
      makeRequest({ passengers: [{ customer_id: PROPIO }, { customer_id: PROPIO }] }),
      params
    )

    expect(response.status).toBe(201)
    expect(state.inserted[0]).toHaveLength(1)
  })
})
