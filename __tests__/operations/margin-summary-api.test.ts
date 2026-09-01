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
// VIB-151: el resumen valúa las facturas en otra moneda con el TC del día.
jest.mock("@/lib/accounting/exchange-rates", () => ({
  getExchangeRateWithFallback: jest.fn(async () => ({ rate: 1350, source: "exact" })),
  buildExchangeRateMap: jest.fn(async () => () => 1350),
}))

function makeMockSupabase(opts: {
  operation?: any
  invoices?: any[]
  customer?: any  // si está set, se devuelve como MAIN en operation_customers
}) {
  return {
    from: (table: string) => {
      if (table === "operations") {
        // El fetch está scopeado por id Y por org (defense-in-depth), así que el
        // mock tiene que aceptar .eq() encadenado.
        const single = async () => ({
          data: opts.operation ?? null,
          error: opts.operation ? null : { message: "not found" },
        })
        const chain: any = { single }
        chain.eq = () => chain
        return { select: () => chain }
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
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", role: "ADMIN", org_id: "org-aaa" } })
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
          sale_currency: "ARS",
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
            moneda: "PES",
            cotizacion: 1,
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
    // VIB-157: la base es la venta total (100.000), no el margen (20.000).
    expect(body.summary.sale_total).toBe(100000)
    expect(body.summary.already_invoiced).toBe(5000)
    expect(body.summary.remaining).toBe(95000)
    expect(body.summary.invoiced_pct).toBe(5)
    expect(body.summary.remaining_pct).toBe(95)
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
          sale_amount_total: 20000,
          margin_amount: 5000,
          sale_currency: "ARS",
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

  // VIB-157: el caso que reportó la agencia — facturan seña y saldo por separado.
  // Con la base vieja (margen) la seña dejaba la operación como "ya facturada
  // completa" y el botón deshabilitado.
  it("con la seña facturada sigue habilitado el saldo", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({
        operation: {
          id: "op-sena",
          file_code: "OP-SENA",
          destination: "Punta Cana",
          sale_amount_total: 5000,
          sale_currency: "USD",
          operator_cost: 4500,
          margin_amount: 500, // la seña (USD 1000) supera el margen
          org_id: "org-aaa",
        },
        invoices: [
          {
            id: "inv-sena",
            cbte_nro: 1,
            pto_vta: 5,
            cbte_tipo: 6,
            imp_total: 1000,
            moneda: "DOL",
            cotizacion: 1350,
            fecha_emision: "2026-08-20",
            status: "authorized",
            verification_status: "verified",
            cae: "999",
          },
        ],
        customer: { id: "cus-1", first_name: "Ana", last_name: "Gómez" },
      })
    )
    const { GET } = await import("@/app/api/operations/[id]/margin-summary/route")
    const req = new NextRequest("http://localhost/api/operations/op-sena/margin-summary")
    const res = await GET(req, { params: Promise.resolve({ id: "op-sena" }) })
    const body = await res.json()

    expect(body.summary.already_invoiced).toBe(1000)
    expect(body.summary.remaining).toBe(4000)
    expect(body.summary.invoiced_pct).toBe(20)
    expect(body.summary.remaining_pct).toBe(80)
    expect(body.summary.can_invoice).toBe(true)
    expect(body.summary.reason_disabled).toBeNull()
  })

  // VIB-151: antes se sumaba imp_total crudo, así que una factura en pesos sobre
  // una venta en dólares consumía todo el margen y la UI bloqueaba la siguiente.
  it("valúa en la moneda de la venta una factura en pesos sobre una operación en USD", async () => {
    mockCreateServerClient.mockResolvedValue(
      makeMockSupabase({
        operation: {
          id: "op-usd",
          file_code: "OP-USD",
          destination: "Miami",
          sale_amount_total: 8050,
          sale_currency: "USD",
          operator_cost: 6050,
          margin_amount: 2000,
          org_id: "org-aaa",
        },
        invoices: [
          {
            id: "inv-pes",
            cbte_nro: 1,
            pto_vta: 5,
            cbte_tipo: 6,
            imp_total: 1_350_000, // ARS = USD 1000 al TC 1350
            moneda: "PES",
            cotizacion: 1,
            fecha_emision: "2026-08-20",
            status: "authorized",
            verification_status: "verified",
            cae: "123",
          },
        ],
        customer: { id: "cus-1", first_name: "Juan", last_name: "Pérez" },
      })
    )
    const { GET } = await import("@/app/api/operations/[id]/margin-summary/route")
    const req = new NextRequest("http://localhost/api/operations/op-usd/margin-summary")
    const res = await GET(req, { params: Promise.resolve({ id: "op-usd" }) })
    const body = await res.json()

    expect(body.operation.sale_currency).toBe("USD")
    expect(body.summary.already_invoiced).toBe(1000)
    // VIB-157: contra la venta (USD 8050), no contra el margen (USD 2000).
    expect(body.summary.remaining).toBe(7050)
    expect(body.summary.can_invoice).toBe(true)
    // El front usa este campo para calcular el restante sin mezclar monedas.
    expect(body.invoices[0].imp_total_sale_currency).toBe(1000)
    expect(body.invoices[0].imp_total).toBe(1_350_000)
  })
})
