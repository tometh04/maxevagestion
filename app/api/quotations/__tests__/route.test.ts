/** @jest-environment node */

import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { createQuotationWithStructure } from "@/lib/quotations/persistence"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
  createServerClient: jest.fn(),
}))
jest.mock("@/lib/permissions-api", () => ({
  getUserAgencyIds: jest.fn().mockResolvedValue(["agency-1"]),
  canPerformAction: jest.fn().mockReturnValue(true),
  isOwnDataOnlyResolved: jest.fn().mockReturnValue(true),
}))
jest.mock("@/lib/permissions-agency", () => ({
  resolveUserPermissions: jest.fn().mockResolvedValue({}),
}))
jest.mock("@/lib/quotations/persistence", () => ({
  ...jest.requireActual("@/lib/quotations/persistence"),
  createQuotationWithStructure: jest.fn(),
}))

function queryWith(result: { data?: unknown; error?: unknown }) {
  const query: any = {}
  query.select = jest.fn(() => query)
  query.eq = jest.fn(() => query)
  query.in = jest.fn(() => query)
  query.maybeSingle = jest.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  query.single = jest.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  return query
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    lead_id: "lead-1",
    agency_id: "agency-1",
    destination: "Cancún",
    region: "CARIBE",
    departure_date: "2026-12-01",
    currency: "USD",
    options: [{
      title: "Opción 1",
      total_amount: 1200,
      items: [{
        item_type: "HOTEL",
        description: "Hotel prueba",
        quantity: 1,
        sale_amount: 1200,
        cost_amount: 900,
        cost_currency: "USD",
        operator_id: "operator-1",
      }],
    }],
    ...overrides,
  }
}

describe("POST /api/quotations", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: {
        id: "seller-1",
        email: "seller@example.com",
        role: "SELLER",
        roles: ["SELLER"],
        org_id: "org-1",
      },
    })
  })

  it("crea encabezado y estructura en un único writer después del scope", async () => {
    const agencyQuery = queryWith({ data: { id: "agency-1" } })
    const leadQuery = queryWith({ data: { id: "lead-1" } })
    const fullQuery = queryWith({ data: { id: "quotation-1", quotation_options: [], quotation_items: [] } })
    const from = jest.fn((table: string) => {
      if (table === "agencies") return agencyQuery
      if (table === "leads") return leadQuery
      return fullQuery
    })
    const admin = {
      rpc: jest.fn().mockResolvedValue({
        data: { configured: false, at_limit: false, enforcement_enabled: false, agencies: [] },
        error: null,
      }),
      from: jest.fn(() => fullQuery),
    }
    ;(createServerClient as jest.Mock).mockResolvedValue({ from })
    ;(createAdminClient as jest.Mock).mockReturnValue(admin)
    ;(createQuotationWithStructure as jest.Mock).mockResolvedValue({
      id: "quotation-1",
      updated_at: "2026-08-24T12:00:00.000Z",
    })

    const { Request, Response, Headers } = require("undici")
    global.Request = Request
    global.Response = Response
    global.Headers = Headers
    const { POST } = require("../route")
    const response = await POST(new Request("http://localhost/api/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    }))

    expect(response.status).toBe(201)
    expect(leadQuery.eq).toHaveBeenCalledWith("org_id", "org-1")
    expect(leadQuery.eq).toHaveBeenCalledWith("agency_id", "agency-1")
    expect(leadQuery.eq).toHaveBeenCalledWith("assigned_seller_id", "seller-1")
    expect(createQuotationWithStructure).toHaveBeenCalledTimes(1)
    expect(admin.rpc).toHaveBeenCalledWith("get_quotation_quota_usage", {
      p_org_id: "org-1",
      p_agency_ids: ["agency-1"],
    })
    expect(createQuotationWithStructure).toHaveBeenCalledWith(expect.objectContaining({
      supabase: admin,
      orgId: "org-1",
      agencyId: "agency-1",
      actorId: "seller-1",
      preparedOptions: [expect.objectContaining({ total_amount: 1200 })],
      header: expect.objectContaining({
        lead_id: "lead-1",
        subtotal: 1200,
        total_amount: 1200,
      }),
    }))
  })

  it("rechaza una agencia fuera del scope antes de crear el admin client", async () => {
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn() })
    const { Request, Response, Headers } = require("undici")
    global.Request = Request
    global.Response = Response
    global.Headers = Headers
    const { POST } = require("../route")
    const response = await POST(new Request("http://localhost/api/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody({ agency_id: "agency-2" })),
    }))

    expect(response.status).toBe(404)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(createQuotationWithStructure).not.toHaveBeenCalled()
  })

  it("rechaza una nueva cotización cuando el cupo organizacional está agotado", async () => {
    const agencyQuery = queryWith({ data: { id: "agency-1" } })
    const leadQuery = queryWith({ data: { id: "lead-1" } })
    ;(createServerClient as jest.Mock).mockResolvedValue({
      from: jest.fn((table: string) => table === "agencies" ? agencyQuery : leadQuery),
    })
    ;(createAdminClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({
        data: {
          configured: true,
          period_id: "period-1",
          included: 10,
          limit: 10,
          used: 10,
          remaining: 0,
          at_limit: true,
          enforcement_enabled: true,
          agencies: [],
        },
        error: null,
      }),
    })

    const { Request, Response, Headers } = require("undici")
    global.Request = Request
    global.Response = Response
    global.Headers = Headers
    const { POST } = require("../route")
    const response = await POST(new Request("http://localhost/api/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: "QUOTATION_QUOTA_EXHAUSTED" })
    expect(createQuotationWithStructure).not.toHaveBeenCalled()
  })

  it("rechaza una opción debajo del costo antes del writer", async () => {
    const agencyQuery = queryWith({ data: { id: "agency-1" } })
    const leadQuery = queryWith({ data: { id: "lead-1" } })
    ;(createServerClient as jest.Mock).mockResolvedValue({
      from: jest.fn((table: string) => table === "agencies" ? agencyQuery : leadQuery),
    })
    const body = validBody({
      options: [{
        title: "Sin margen",
        total_amount: 100,
        items: [{
          item_type: "HOTEL",
          description: "Hotel",
          quantity: 1,
          sale_amount: 100,
          cost_amount: 200,
          cost_currency: "USD",
        }],
      }],
    })
    const { Request, Response, Headers } = require("undici")
    global.Request = Request
    global.Response = Response
    global.Headers = Headers
    const { POST } = require("../route")
    const response = await POST(new Request("http://localhost/api/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }))

    expect(response.status).toBe(400)
    expect(createQuotationWithStructure).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
