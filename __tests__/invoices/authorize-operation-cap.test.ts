/**
 * @jest-environment node
 *
 * VIB-151 — el re-check del tope al autorizar tampoco puede mezclar monedas.
 *
 * Es el paso que realmente emite: si acá el tope compara $10.867.500 contra
 * "USD 8050" sin convertir, la factura en pesos de una venta en dólares vuelve a
 * draft y la agencia nunca puede emitirla.
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
jest.mock("@/lib/permissions", () => ({
  canAccessModule: () => true,
}))
jest.mock("@/lib/afip/afip-service", () => ({
  // Sin AFIP configurado el handler corta JUSTO después del tope: alcanza para
  // distinguir "el tope lo dejó pasar" de "el tope lo frenó".
  getAfipServiceForOrg: (...args: any[]) => mockGetAfipServiceForOrg(...args),
}))
jest.mock("@/lib/security/audit", () => ({ logSecurityEvent: jest.fn() }))
jest.mock("@/lib/supabase/admin-scope", () => ({ createOrgAdminScope: jest.fn() }))
jest.mock("@/lib/accounting/exchange-rates", () => ({
  getExchangeRateWithFallback: jest.fn(async () => ({ rate: 1350, source: "exact" })),
  buildExchangeRateMap: jest.fn(async () => () => 1350),
}))

const INVOICE_ID = "44444444-4444-4444-4444-444444444444"
const OPERATION_ID = "22222222-2222-2222-2222-222222222222"

function makeSupabase(opts: { invoice: any; operation: any; peers?: any[] }) {
  const state = { updates: [] as any[] }

  const supabase: any = {
    from: (table: string) => {
      if (table === "invoices") {
        const chain: any = {
          single: async () => ({
            data: opts.invoice,
            error: opts.invoice ? null : { message: "not found" },
          }),
          neq: async () => ({ data: opts.peers ?? [], error: null }),
        }
        chain.eq = () => chain
        return {
          select: () => chain,
          update: (row: any) => {
            state.updates.push(row)
            const upd: any = { then: (cb: any) => cb({ error: null }) }
            upd.eq = () => upd
            return upd
          },
        }
      }
      if (table === "operations") {
        const chain: any = {
          single: async () => ({ data: opts.operation, error: null }),
        }
        chain.eq = () => chain
        return { select: () => chain }
      }
      return {}
    },
  }

  return { supabase, state }
}

async function callAuthorize(opts: { invoice: any; operation: any; peers?: any[] }) {
  const { supabase, state } = makeSupabase(opts)
  mockCreateServerClient.mockResolvedValue(supabase)
  const { POST } = await import("@/app/api/invoices/[id]/authorize/route")
  const req = new NextRequest(`http://localhost/api/invoices/${INVOICE_ID}/authorize`, {
    method: "POST",
  })
  const res = await POST(req, { params: Promise.resolve({ id: INVOICE_ID }) })
  return { res, state }
}

describe("POST /api/invoices/[id]/authorize — tope contra el total vendido", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue({ user: { id: "u1", role: "ADMIN", org_id: "org-aaa" } })
    // Sin AFIP: el handler corta después del tope.
    mockGetAfipServiceForOrg.mockResolvedValue(null)
  })

  const usdOperation = { sale_amount_total: 8050, sale_currency: "USD", currency: "USD" }

  function pesInvoice(overrides: any = {}) {
    return {
      id: INVOICE_ID,
      org_id: "org-aaa",
      operation_id: OPERATION_ID,
      cbte_tipo: 6,
      status: "draft",
      imp_total: 10_867_500,
      moneda: "PES",
      cotizacion: 1350,
      fecha_emision: "2026-08-24",
      concepto: 1,
      receptor_doc_tipo: 99,
      receptor_doc_nro: "0",
      invoice_items: [],
      ...overrides,
    }
  }

  it("deja pasar una factura en pesos por el equivalente de una venta en USD", async () => {
    const { res, state } = await callAuthorize({
      invoice: pesInvoice(),
      operation: usdOperation,
      peers: [],
    })

    const body = await res.json()
    // Frena por AFIP, no por el tope: el tope la dejó pasar.
    expect(body.error).toMatch(/AFIP no configurado/i)
    expect(state.updates).not.toContainEqual({ status: "draft" })
  })

  it("frena y vuelve a draft si otra factura ya consumió el total vendido", async () => {
    const { res, state } = await callAuthorize({
      invoice: pesInvoice(),
      operation: usdOperation,
      // USD 7.000 ya facturados en dólares.
      peers: [{ imp_total: 7000, cbte_tipo: 6, moneda: "DOL", cotizacion: 1350 }],
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/total vendido/i)
    expect(body.max_remaining).toBe(1050)
    expect(body.max_remaining_currency).toBe("USD")
    expect(state.updates).toContainEqual({ status: "draft" })
  })

  it("una factura en pesos previa se descuenta convertida, no cruda", async () => {
    const { res } = await callAuthorize({
      // Esta factura pide USD 1.000 (al TC 1350).
      invoice: pesInvoice({ imp_total: 1_350_000 }),
      operation: usdOperation,
      // Y ya había USD 8.000 facturados en pesos → solo quedan USD 50.
      peers: [
        {
          imp_total: 10_800_000,
          cbte_tipo: 6,
          moneda: "PES",
          cotizacion: 1,
          fecha_emision: "2026-08-20",
        },
      ],
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.max_remaining).toBe(50)
  })

  it("una operación en pesos sigue funcionando igual que antes", async () => {
    const { res } = await callAuthorize({
      invoice: pesInvoice({ imp_total: 5000, cotizacion: 1 }),
      operation: { sale_amount_total: 20000, sale_currency: "ARS", currency: "ARS" },
      peers: [{ imp_total: 16000, cbte_tipo: 6, moneda: "PES", cotizacion: 1 }],
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.max_remaining).toBe(4000)
    expect(body.max_remaining_currency).toBe("ARS")
  })
})
