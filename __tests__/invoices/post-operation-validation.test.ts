/**
 * @jest-environment node
 */
import { NextRequest } from "next/server"

const mockGetCurrentUser = jest.fn()
const mockCreateServerClient = jest.fn()
const mockGetUserAgencyIds = jest.fn()
const mockCalculateInvoice = jest.fn()

jest.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: (...args: any[]) => mockCreateServerClient(...args),
}))
jest.mock("@/lib/permissions-api", () => ({
  getUserAgencyIds: (...args: any[]) => mockGetUserAgencyIds(...args),
}))
jest.mock("@/lib/permissions", () => ({
  canAccessModule: () => true,
  canPerformAction: () => true,
}))
jest.mock("@/lib/invoices/calculation", () => ({
  calculateInvoice: (...args: any[]) => mockCalculateInvoice(...args),
  normalizeTaxTreatment: (t: string) => t,
  getRecommendedAmountEntryMode: () => "NET",
}))

function makeSupabase(opts: {
  operation?: any
  authorizedInvoices?: any[]
  agency?: any
  agencyOrgId?: string
}) {
  const state: any = { inserts: [] as any[] }
  const mock: any = {
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
              eq: () => ({
                then: (cb: any) => cb({ data: opts.authorizedInvoices ?? [], error: null }),
              }),
            }),
          }),
          insert: (row: any) => {
            state.inserts.push({ table, row })
            return {
              select: () => ({
                single: async () => ({ data: { id: "new-inv-id", ...row }, error: null }),
              }),
            }
          },
        }
      }
      if (table === "agencies") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: opts.agency ?? { id: "ag-1", org_id: opts.agencyOrgId ?? "org-aaa" },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === "invoice_items") {
        return {
          insert: () => Promise.resolve({ error: null }),
        }
      }
      return {}
    },
  }
  return { supabase: mock, state }
}

const AGENCY_ID = "11111111-1111-1111-1111-111111111111"
const OPERATION_ID = "22222222-2222-2222-2222-222222222222"
const CUSTOMER_ID = "33333333-3333-3333-3333-333333333333"

describe("POST /api/invoices — operation_id margin cap validation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } })
    mockGetUserAgencyIds.mockResolvedValue([AGENCY_ID])
    mockCalculateInvoice.mockReturnValue({
      items: [{ subtotal: 8264.46, iva_importe: 1735.54, iva_id: 5, iva_porcentaje: 21, tax_treatment: "GRAVADO", orden: 0 }],
      totals: { imp_neto: 8264.46, imp_iva: 1735.54, imp_total: 10000, imp_tot_conc: 0, imp_op_ex: 0, imp_trib: 0 },
      amount_entry_mode: "NET",
    })
  })

  function validBody(operation_id: string | null = OPERATION_ID) {
    return {
      agency_id: AGENCY_ID,
      operation_id,
      customer_id: CUSTOMER_ID,
      cbte_tipo: 6,
      pto_vta: 1,
      concepto: 2,
      receptor_doc_tipo: 99,
      receptor_doc_nro: "0",
      receptor_nombre: "Juan",
      receptor_condicion_iva: 5,
      amount_entry_mode: "NET",
      moneda: "PES",
      cotizacion: 1,
      items: [{ descripcion: "Comisión", cantidad: 1, precio_unitario: 10000 }],
    }
  }

  async function callPost(body: any, supabaseOpts: any) {
    const { supabase } = makeSupabase(supabaseOpts)
    mockCreateServerClient.mockResolvedValue(supabase)
    const { POST } = await import("@/app/api/invoices/route")
    const req = new NextRequest("http://localhost/api/invoices", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
    return await POST(req)
  }

  it("passes when new total + already <= margin", async () => {
    const res = await callPost(validBody(), {
      operation: { id: OPERATION_ID, org_id: "org-aaa", margin_amount: 20000 },
      authorizedInvoices: [{ imp_total: 5000 }],
    })
    expect(res.status).toBe(200)
  })

  it("returns 400 with max_remaining when new total exceeds remaining", async () => {
    const res = await callPost(validBody(), {
      operation: { id: OPERATION_ID, org_id: "org-aaa", margin_amount: 20000 },
      authorizedInvoices: [{ imp_total: 15000 }],
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/restante/i)
    expect(body.max_remaining).toBe(5000)
  })

  it("returns 403 when operation belongs to another org", async () => {
    const res = await callPost(validBody(), {
      operation: { id: OPERATION_ID, org_id: "org-other", margin_amount: 20000 },
      authorizedInvoices: [],
      agencyOrgId: "org-aaa",
    })
    expect(res.status).toBe(403)
  })

  it("returns 404 when operation not found", async () => {
    const res = await callPost(validBody(), {
      operation: null,
      authorizedInvoices: [],
    })
    expect(res.status).toBe(404)
  })

  it("passes when operation_id is null (standalone invoice)", async () => {
    const res = await callPost(validBody(null), {
      operation: null,
      authorizedInvoices: [],
    })
    expect(res.status).toBe(200)
  })

  it("tolerates 1-cent float imprecision (19999.99 + 0.01 = 20000)", async () => {
    mockCalculateInvoice.mockReturnValue({
      items: [{ subtotal: 0.01, iva_importe: 0, iva_id: 3, iva_porcentaje: 0, tax_treatment: "GRAVADO", orden: 0 }],
      totals: { imp_neto: 0.01, imp_iva: 0, imp_total: 0.01, imp_tot_conc: 0, imp_op_ex: 0, imp_trib: 0 },
      amount_entry_mode: "NET",
    })
    const res = await callPost(validBody(), {
      operation: { id: OPERATION_ID, org_id: "org-aaa", margin_amount: 20000 },
      authorizedInvoices: [{ imp_total: 19999.99 }],
    })
    expect(res.status).toBe(200)
  })
})
