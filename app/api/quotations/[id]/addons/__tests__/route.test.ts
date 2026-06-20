// app/api/quotations/[id]/addons/__tests__/route.test.ts
/**
 * @jest-environment node
 *
 * Tests del PATCH que actualiza los adicionales globales de la cotización
 * (seguro / traslado) del flujo "Generar PDF".
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
const USER_ORG = "org-1"
const AGENCY = "agency-1"

function makeRequest(body: any) {
  return { json: async () => body } as unknown as Request
}

interface MockConfig {
  quotation?: { id: string; agency_id: string; seller_id: string } | null
  updateSpy?: jest.Mock
}

function mockSupabase(config: MockConfig) {
  const {
    quotation = { id: QUOTATION_ID, agency_id: AGENCY, seller_id: "seller-1" },
    updateSpy = jest.fn(),
  } = config

  return {
    from: jest.fn((table: string) => {
      if (table === "quotations") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: quotation }) }) }),
          update: (payload: any) => {
            updateSpy(payload)
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      throw new Error(`Tabla inesperada en mock: ${table}`)
    }),
  }
}

describe("PATCH /api/quotations/[id]/addons", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getOrgAgencyIds.mockResolvedValue([AGENCY])
  })

  const params = { params: Promise.resolve({ id: QUOTATION_ID }) }

  it("400 si user sin org_id", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: null } })
    createServerClient.mockResolvedValue({})
    const res = await PATCH(makeRequest({ insurance_amount: 100, transfer_amount: 50 }), params)
    expect(res.status).toBe(400)
  })

  it("400 si un adicional es negativo o no numérico", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    createServerClient.mockResolvedValue(mockSupabase({}))
    for (const bad of ["abc", -5]) {
      const res = await PATCH(makeRequest({ insurance_amount: bad, transfer_amount: 0 }), params)
      expect(res.status).toBe(400)
    }
    const res = await PATCH(makeRequest({ insurance_amount: 0, transfer_amount: -1 }), params)
    expect(res.status).toBe(400)
  })

  it("404 si la cotización no existe", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    createServerClient.mockResolvedValue(mockSupabase({ quotation: null }))
    const res = await PATCH(makeRequest({ insurance_amount: 100, transfer_amount: 50 }), params)
    expect(res.status).toBe(404)
  })

  it("404 enmascarado si la agencia de la cotización no pertenece al org", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    getOrgAgencyIds.mockResolvedValue(["otra-agencia"])
    createServerClient.mockResolvedValue(mockSupabase({}))
    const res = await PATCH(makeRequest({ insurance_amount: 100, transfer_amount: 50 }), params)
    expect(res.status).toBe(404)
  })

  it("403 si SELLER no es dueño de la cotización", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "otro-seller", org_id: USER_ORG, role: "SELLER" } })
    createServerClient.mockResolvedValue(mockSupabase({}))
    const res = await PATCH(makeRequest({ insurance_amount: 100, transfer_amount: 50 }), params)
    expect(res.status).toBe(403)
  })

  it("200 guarda seguro y traslado redondeados", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    const updateSpy = jest.fn()
    createServerClient.mockResolvedValue(mockSupabase({ updateSpy }))

    const res = await PATCH(makeRequest({ insurance_amount: 120.005, transfer_amount: 80 }), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.insurance_amount).toBe(120.01)
    expect(body.data.transfer_amount).toBe(80)
    expect(updateSpy).toHaveBeenCalledWith({ insurance_amount: 120.01, transfer_amount: 80 })
  })

  it("200 con adicionales vacíos/ausentes los guarda como 0", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG, role: "ADMIN" } })
    const updateSpy = jest.fn()
    createServerClient.mockResolvedValue(mockSupabase({ updateSpy }))

    const res = await PATCH(makeRequest({ insurance_amount: "", transfer_amount: undefined }), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.insurance_amount).toBe(0)
    expect(body.data.transfer_amount).toBe(0)
    expect(updateSpy).toHaveBeenCalledWith({ insurance_amount: 0, transfer_amount: 0 })
  })
})
