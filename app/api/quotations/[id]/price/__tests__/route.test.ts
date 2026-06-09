// app/api/quotations/[id]/price/__tests__/route.test.ts
/**
 * @jest-environment node
 *
 * Tests del PATCH que actualiza el precio final manual de una opción
 * (flujo "Generar PDF → Cambiar precio").
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => {
      const body = JSON.stringify(data)
      const status = init?.status ?? 200
      return {
        status,
        json: async () => JSON.parse(body),
      }
    },
  },
}))

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
}))
jest.mock("@/lib/organizations", () => ({
  getOrgAgencyIds: jest.fn(),
}))

import { PATCH } from "../route"

const { getCurrentUser } = require("@/lib/auth")
const { createServerClient } = require("@/lib/supabase/server")
const { getOrgAgencyIds } = require("@/lib/organizations")

const QUOTATION_ID = "quot-1"
const OPTION_ID = "opt-1"
const USER_ORG = "org-1"
const AGENCY = "agency-1"

function makeRequest(body: any) {
  return { json: async () => body } as unknown as Request
}

interface MockConfig {
  quotation?: { id: string; agency_id: string; seller_id: string } | null
  option?: { id: string; calculated_total_amount: number | null } | null
  items?: Array<{ quantity: number; unit_price?: number; sale_amount?: number; cost_amount?: number }>
  firstOptionId?: string | null
  optionUpdateSpy?: jest.Mock
  quotationUpdateSpy?: jest.Mock
}

function mockSupabase(config: MockConfig) {
  const {
    quotation = { id: QUOTATION_ID, agency_id: AGENCY, seller_id: "seller-1" },
    option = { id: OPTION_ID, calculated_total_amount: 1000 },
    items = [],
    firstOptionId = OPTION_ID,
    optionUpdateSpy = jest.fn(),
    quotationUpdateSpy = jest.fn(),
  } = config

  return {
    from: jest.fn((table: string) => {
      if (table === "quotations") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: quotation }) }) }),
          update: (payload: any) => {
            quotationUpdateSpy(payload)
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      if (table === "quotation_options") {
        return {
          select: (cols: string) => {
            if (cols.includes("calculated_total_amount")) {
              // query de la opción a editar
              return { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: option }) }) }) }
            }
            // query de la primera opción (sync del header)
            return {
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: firstOptionId ? { id: firstOptionId } : null }),
                  }),
                }),
              }),
            }
          },
          update: (payload: any) => {
            optionUpdateSpy(payload)
            return { eq: () => ({ eq: async () => ({ error: null }) }) }
          },
        }
      }
      if (table === "quotation_items") {
        return { select: () => ({ eq: async () => ({ data: items }) }) }
      }
      throw new Error(`Tabla inesperada en mock: ${table}`)
    }),
  }
}

describe("PATCH /api/quotations/[id]/price", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getOrgAgencyIds.mockResolvedValue([AGENCY])
  })

  const params = { params: Promise.resolve({ id: QUOTATION_ID }) }

  it("400 si user sin org_id", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: null } })
    createServerClient.mockResolvedValue({})
    const res = await PATCH(makeRequest({ option_id: OPTION_ID, manual_total_amount: 1200 }), params)
    expect(res.status).toBe(400)
  })

  it("400 si falta option_id", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    createServerClient.mockResolvedValue(mockSupabase({}))
    const res = await PATCH(makeRequest({ manual_total_amount: 1200 }), params)
    expect(res.status).toBe(400)
  })

  it("400 si el precio no es un número válido o es <= 0", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    createServerClient.mockResolvedValue(mockSupabase({}))
    for (const bad of ["abc", -5, 0]) {
      const res = await PATCH(makeRequest({ option_id: OPTION_ID, manual_total_amount: bad }), params)
      expect(res.status).toBe(400)
    }
  })

  it("404 si la cotización no existe", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    createServerClient.mockResolvedValue(mockSupabase({ quotation: null }))
    const res = await PATCH(makeRequest({ option_id: OPTION_ID, manual_total_amount: 1200 }), params)
    expect(res.status).toBe(404)
  })

  it("404 enmascarado si la agencia de la cotización no pertenece al org", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    getOrgAgencyIds.mockResolvedValue(["otra-agencia"])
    createServerClient.mockResolvedValue(mockSupabase({}))
    const res = await PATCH(makeRequest({ option_id: OPTION_ID, manual_total_amount: 1200 }), params)
    expect(res.status).toBe(404)
  })

  it("403 si SELLER no es dueño de la cotización", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "otro-seller", org_id: USER_ORG, role: "SELLER" } })
    createServerClient.mockResolvedValue(mockSupabase({}))
    const res = await PATCH(makeRequest({ option_id: OPTION_ID, manual_total_amount: 1200 }), params)
    expect(res.status).toBe(403)
  })

  it("400 si el precio manual queda por debajo del costo de la opción", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    createServerClient.mockResolvedValue(mockSupabase({
      items: [{ quantity: 1, cost_amount: 900 }],
    }))
    const res = await PATCH(makeRequest({ option_id: OPTION_ID, manual_total_amount: 800 }), params)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/costo/i)
  })

  it("200 setea el precio manual y sincroniza header cuando es la primera opción", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    const optionUpdateSpy = jest.fn()
    const quotationUpdateSpy = jest.fn()
    createServerClient.mockResolvedValue(mockSupabase({ optionUpdateSpy, quotationUpdateSpy }))

    const res = await PATCH(makeRequest({ option_id: OPTION_ID, manual_total_amount: 1250 }), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.manual_total_amount).toBe(1250)
    expect(body.data.total_amount).toBe(1250)
    expect(optionUpdateSpy).toHaveBeenCalledWith({ manual_total_amount: 1250, total_amount: 1250 })
    expect(quotationUpdateSpy).toHaveBeenCalledWith({ subtotal: 1250, total_amount: 1250 })
  })

  it("200 con null restablece el precio calculado y NO sincroniza header si no es la primera opción", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    const optionUpdateSpy = jest.fn()
    const quotationUpdateSpy = jest.fn()
    createServerClient.mockResolvedValue(mockSupabase({
      optionUpdateSpy,
      quotationUpdateSpy,
      firstOptionId: "otra-opcion",
    }))

    const res = await PATCH(makeRequest({ option_id: OPTION_ID, manual_total_amount: null }), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.manual_total_amount).toBeNull()
    expect(body.data.total_amount).toBe(1000) // calculated_total_amount
    expect(optionUpdateSpy).toHaveBeenCalledWith({ manual_total_amount: null, total_amount: 1000 })
    expect(quotationUpdateSpy).not.toHaveBeenCalled()
  })

  it("200 con calculated_total_amount null recalcula desde los ítems al restablecer", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    const optionUpdateSpy = jest.fn()
    createServerClient.mockResolvedValue(mockSupabase({
      option: { id: OPTION_ID, calculated_total_amount: null },
      items: [
        { quantity: 2, unit_price: 300 },
        { quantity: 1, sale_amount: 150 },
      ],
      optionUpdateSpy,
    }))

    const res = await PATCH(makeRequest({ option_id: OPTION_ID, manual_total_amount: null }), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.total_amount).toBe(750) // 2*300 + 150
    expect(optionUpdateSpy).toHaveBeenCalledWith({ manual_total_amount: null, total_amount: 750 })
  })

  it("404 si la opción no pertenece a la cotización", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    createServerClient.mockResolvedValue(mockSupabase({ option: null }))
    const res = await PATCH(makeRequest({ option_id: "opt-ajena", manual_total_amount: 1200 }), params)
    expect(res.status).toBe(404)
  })
})
