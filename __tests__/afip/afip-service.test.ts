/**
 * @jest-environment node
 */
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"

// Mock @afipsdk/afip.js para evitar hitear AFIP real
jest.mock("@afipsdk/afip.js", () => {
  return jest.fn().mockImplementation(() => ({
    ElectronicBilling: {
      createNextVoucher: jest.fn(),
      getLastVoucher: jest.fn(),
      getVoucherInfo: jest.fn(),
      getSalesPoints: jest.fn(),
      getExchangeRate: jest.fn(),
    },
    GetServiceTA: jest.fn(),
  }))
})

describe("getAfipServiceForOrg", () => {
  it("returns null when no AFIP config exists for org", async () => {
    const supabase = makeMockSupabase({ integrations: [] })
    const svc = await getAfipServiceForOrg(supabase as any, "org-aaa")
    expect(svc).toBeNull()
  })

  it("returns AfipService instance when config exists", async () => {
    const supabase = makeMockSupabase({
      integrations: [
        {
          org_id: "org-aaa",
          integration_type: "afip",
          status: "active",
          config: {
            api_key: "TEST_KEY",
            cuit: "20123456789",
            point_of_sale: 1,
            environment: "sandbox",
            cert: "-----BEGIN CERT-----",
            key: "-----BEGIN KEY-----",
          },
        },
      ],
    })
    const svc = await getAfipServiceForOrg(supabase as any, "org-aaa")
    expect(svc).not.toBeNull()
    expect(svc?.orgId).toBe("org-aaa")
  })
})

describe("AfipService.issueVoucher — happy path", () => {
  it("creates voucher, verifies via getVoucherInfo, logs request, updates invoice", async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      CAE: "12345678901234",
      CAEFchVto: "20260530",
      voucherNumber: 42,
    })
    const mockGetInfo = jest.fn().mockResolvedValue({
      CodAutorizacion: "12345678901234",
      CAE: "12345678901234",
      CAEFchVto: "20260530",
      ImpTotal: 12100,
      ImpNeto: 10000,
      ImpIVA: 2100,
      DocNro: 20123456789,
      DocTipo: 80,
      CbteFch: "20260424",
      CbteDesde: 42,
      CbteHasta: 42,
    })

    const inserts: any[] = []
    const updates: any[] = []
    const supabase = makeInvoiceRequestsSupabase({ inserts, updates })

    const svc = new (await import("@/lib/afip/afip-service")).AfipService(
      sandboxConfig(),
      supabase as any,
      "org-aaa"
    )
    ;(svc as any).afip = makeMockSdk({ createNext: mockCreate, getInfo: mockGetInfo })

    const result = await svc.issueVoucher(sampleDraft())

    expect(result.success).toBe(true)
    expect(result.cae).toBe("12345678901234")
    expect(result.verification_status).toBe("verified")
    expect(result.diff).toBeNull()

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ CbteTipo: 6, PtoVta: 1 }),
      { returnFullResponse: true }
    )
    expect(mockGetInfo).toHaveBeenCalledWith(42, 1, 6)

    // Expect 2 inserts into afip_voucher_requests: one 'create', one 'verify'
    const voucherRequestInserts = inserts.filter(
      (i) => i.table === "afip_voucher_requests"
    )
    expect(voucherRequestInserts.length).toBe(2)
    const ops = voucherRequestInserts.map((i) => i.row.operation)
    expect(ops).toEqual(expect.arrayContaining(["create", "verify"]))

    // Expect update on invoices: cae + verification_status + status
    const invUpdate = updates.find((u) => u.table === "invoices")
    expect(invUpdate).toBeDefined()
    expect(invUpdate!.row.cae).toBe("12345678901234")
    expect(invUpdate!.row.verification_status).toBe("verified")
    expect(invUpdate!.row.status).toBe("authorized")
  })
})

// Helpers ---------------------------------------------

function sandboxConfig() {
  return {
    api_key: "TEST_KEY",
    cuit: "20123456789",
    point_of_sale: 1,
    environment: "sandbox" as const,
    cert: "-----BEGIN CERT-----",
    key: "-----BEGIN KEY-----",
  }
}

function sampleDraft() {
  return {
    id: "inv-001",
    org_id: "org-aaa",
    agency_id: "ag-aaa",
    pto_vta: 1,
    cbte_tipo: 6,
    concepto: 2,
    receptor_doc_tipo: 80,
    receptor_doc_nro: "20123456789",
    receptor_condicion_iva: 5,
    imp_total: 12100,
    imp_neto: 10000,
    imp_iva: 2100,
    imp_tot_conc: 0,
    imp_op_ex: 0,
    imp_trib: 0,
    moneda: "PES",
    cotizacion: 1,
    fch_serv_desde: "2026-04-24",
    fch_serv_hasta: "2026-04-24",
    fecha_emision: "2026-04-24",
    invoice_items: [
      {
        subtotal: 10000,
        iva_importe: 2100,
        iva_id: 5,
        iva_porcentaje: 21,
        tax_treatment: "GRAVADO",
      },
    ],
  }
}

function makeMockSdk(opts: { createNext: jest.Mock; getInfo: jest.Mock }) {
  return {
    ElectronicBilling: {
      createNextVoucher: opts.createNext,
      getLastVoucher: jest.fn(),
      getVoucherInfo: opts.getInfo,
      getSalesPoints: jest.fn(),
      getExchangeRate: jest.fn(),
    },
    GetServiceTA: jest.fn(),
  }
}

function makeInvoiceRequestsSupabase(capture: {
  inserts: any[]
  updates: any[]
}) {
  const builder = (table: string) => ({
    insert: (row: any) => {
      capture.inserts.push({ table, row })
      return {
        select: () => ({
          single: async () => ({ data: { id: `${table}-row-id` }, error: null }),
        }),
      }
    },
    update: (row: any) => ({
      eq: () => {
        capture.updates.push({ table, row })
        return Promise.resolve({ data: null, error: null })
      },
    }),
  })
  return { from: builder }
}

function makeMockSupabase(data: { integrations: any[] }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          eq: (c2: string, v2: string) => ({
            eq: (c3: string, v3: string) => ({
              maybeSingle: async () => {
                const match = data.integrations.find(
                  (i) =>
                    i.org_id === val &&
                    i.integration_type === v2 &&
                    i.status === v3
                )
                return { data: match || null, error: null }
              },
            }),
          }),
        }),
      }),
    }),
  }
}
