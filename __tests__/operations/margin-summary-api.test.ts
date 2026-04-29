/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

const mockGetCurrentUser = jest.fn()
const mockCreateServerClient = jest.fn()
const mockGetAfipServiceForOrg = jest.fn()

jest.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: (...args: any[]) => mockCreateServerClient(...args),
}))
jest.mock("@/lib/afip/afip-service", () => ({
  getAfipServiceForOrg: (...args: any[]) => mockGetAfipServiceForOrg(...args),
}))
jest.mock("@/lib/permissions", () => ({
  canAccessModule: () => true,
}))

function makeMockSupabase(opts: {
  operation?: any
  invoices?: any[]
  customer?: any  // si está set, se devuelve como MAIN en operation_customers
}) {
  return {
    from: (table: string) => {
      if (table === "operations") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: opts.operation ?? null,
                error: opts.operation ? null : { message: "not found" },
              }),
            }),
          }),
        }
      }
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                then: (cb: any) => cb({ data: opts.invoices ?? [], error: null }),
              }),
            }),
          }),
        }
      }
      if (table === "operation_customers") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                then: (cb: any) => cb({
                  data: opts.customer
                    ? [{ customer_id: opts.customer.id, role: "MAIN", customers: opts.customer }]
                    : [],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      return {}
    },
  }
}

describe("GET /api/operations/[id]/margin-summary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } })
    mockGetAfipServiceForOrg.mockResolvedValue({ config: { cuit: "20123456789" } })
  })

  it("returns summary + invoices when operation exists", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({
        operation: {
          id: "op-1",
          file_code: "OP-001",
          destination: "Cancún",
          sale_amount_total: 100000,
          operator_cost: 80000,
          margin_amount: 20000,
          customer_id: "cus-1",
          org_id: "org-aaa",
        },
        invoices: [
          {
            id: "inv-1",
            cbte_nro: 42,
            pto_vta: 5,
            cbte_tipo: 6,
            imp_total: 5000,
            fecha_emision: "2026-04-20",
            status: "authorized",
            verification_status: "verified",
            cae: "86139389743826",
          },
        ],
        customer: { id: "cus-1", first_name: "Juan", last_name: "Pérez" },
      })
    )
    const { GET } = await import("@/app/api/operations/[id]/margin-summary/route")
    const req = new NextRequest("http://localhost/api/operations/op-1/margin-summary")
    const res = await GET(req, { params: Promise.resolve({ id: "op-1" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.operation.id).toBe("op-1")
    expect(body.operation.customer.name).toBe("Juan Pérez")
    expect(body.summary.margin_total).toBe(20000)
    expect(body.summary.already_invoiced).toBe(5000)
    expect(body.summary.remaining).toBe(15000)
    expect(body.summary.can_invoice).toBe(true)
    expect(body.invoices).toHaveLength(1)
    expect(body.invoices[0].cae).toBe("86139389743826")
  })

  it("returns 404 when operation not found (RLS)", async () => {
    mockCreateServerClient.mockResolvedValue(makeMockSupabase({ operation: null }))
    const { GET } = await import("@/app/api/operations/[id]/margin-summary/route")
    const req = new NextRequest("http://localhost/api/operations/op-x/margin-summary")
    const res = await GET(req, { params: Promise.resolve({ id: "op-x" }) })
    expect(res.status).toBe(404)
  })

  it("reports can_invoice=false + reason when no afip", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({
        operation: {
          id: "op-1",
          margin_amount: 20000,
          customer_id: "cus-1",
          org_id: "org-aaa",
        },
        invoices: [],
        customer: { id: "cus-1", first_name: "A", last_name: "B" },
      })
    )
    mockGetAfipServiceForOrg.mockResolvedValue(null)
    const { GET } = await import("@/app/api/operations/[id]/margin-summary/route")
    const req = new NextRequest("http://localhost/api/operations/op-1/margin-summary")
    const res = await GET(req, { params: Promise.resolve({ id: "op-1" }) })
    const body = await res.json()
    expect(body.summary.can_invoice).toBe(false)
    expect(body.summary.reason_disabled).toBe("no_afip")
  })
})
