/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

// Mocks
const mockGetCurrentUser = jest.fn()
const mockCreateServerClient = jest.fn()
const mockRenderInvoicePdf = jest.fn()
const mockGetAfipServiceForOrg = jest.fn()

jest.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: (...args: any[]) => mockCreateServerClient(...args),
}))
jest.mock("@/lib/pdf/invoice-pdf", () => ({
  renderInvoicePdf: (...args: any[]) => mockRenderInvoicePdf(...args),
}))
jest.mock("@/lib/afip/afip-service", () => ({
  getAfipServiceForOrg: (...args: any[]) => mockGetAfipServiceForOrg(...args),
}))
jest.mock("@/lib/permissions", () => ({
  canAccessModule: () => true,
}))

function makeMockInvoice(id: string, cbte_nro: number, agency_id: string) {
  return {
    id,
    org_id: "org-aaa",
    agency_id,
    cbte_nro,
    pto_vta: 1,
    cbte_tipo: 6,
    status: "authorized",
    cae: "12345678901234",
    fecha_emision: "2026-04-15",
    invoice_items: [],
  }
}

function makeMockSupabase(opts: {
  invoices: any[]
  count?: number
  agencies?: any[]
}) {
  return {
    from: (table: string) => {
      if (table === "invoices") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          lte: () => chain,
          order: () => chain,
          limit: () => chain,
          then: (cb: any) =>
            cb({
              data: opts.invoices,
              error: null,
              count: opts.count ?? opts.invoices.length,
            }),
        }
        return chain
      }
      if (table === "agencies") {
        const chain: any = {
          select: () => chain,
          in: () => ({
            then: (cb: any) =>
              cb({
                data: opts.agencies ?? [{ id: "ag-1", name: "Agencia 1", org_id: "org-aaa" }],
                error: null,
              }),
          }),
        }
        return chain
      }
      if (table === "organization_settings") {
        const chain: any = {
          select: () => ({
            then: (cb: any) => cb({ data: [], error: null }),
          }),
        }
        return chain
      }
      return {}
    },
  }
}

describe("GET /api/invoices/export", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } })
    mockGetAfipServiceForOrg.mockResolvedValue({ config: { cuit: "20123456789" } })
    mockRenderInvoicePdf.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))
  })

  it("returns a ZIP with one entry per invoice", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({
        invoices: [
          makeMockInvoice("inv-1", 42, "ag-1"),
          makeMockInvoice("inv-2", 43, "ag-1"),
        ],
      })
    )
    const { GET } = await import("@/app/api/invoices/export/route")
    const req = new NextRequest(
      "http://localhost/api/invoices/export?from=2026-04-01&to=2026-04-30"
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    const blob = await res.arrayBuffer()
    expect(blob.byteLength).toBeGreaterThan(0)
    expect(mockRenderInvoicePdf).toHaveBeenCalledTimes(2)
  })

  it("returns 400 when more than 500 invoices match the filter", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({
        invoices: Array.from({ length: 501 }, (_, i) => makeMockInvoice(`inv-${i}`, i, "ag-1")),
        count: 501,
      })
    )
    const { GET } = await import("@/app/api/invoices/export/route")
    const req = new NextRequest(
      "http://localhost/api/invoices/export?from=2026-01-01&to=2026-12-31"
    )
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/reduce|demasiadas/i)
  })

  it("returns 400 when no invoices match", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({ invoices: [], count: 0 })
    )
    const { GET } = await import("@/app/api/invoices/export/route")
    const req = new NextRequest(
      "http://localhost/api/invoices/export?from=2026-04-01&to=2026-04-30"
    )
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no hay facturas/i)
  })

  it("returns 400 when from/to params are missing", async () => {
    mockCreateServerClient.mockResolvedValue(makeMockSupabase({ invoices: [] }))
    const { GET } = await import("@/app/api/invoices/export/route")
    const req = new NextRequest("http://localhost/api/invoices/export")
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})
