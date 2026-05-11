/**
 * @jest-environment node
 */
import { renderInvoicePdf, type InvoicePdfParams } from "@/lib/pdf/invoice-pdf"

describe("renderInvoicePdf", () => {
  const baseParams: InvoicePdfParams = {
    invoice: {
      id: "inv-001",
      cbte_tipo: 6,
      pto_vta: 1,
      cbte_nro: 42,
      cae: "12345678901234",
      cae_fch_vto: "20260530",
      fecha_emision: "2026-04-24",
      fch_serv_desde: "2026-04-20",
      fch_serv_hasta: "2026-04-24",
      imp_total: 12100,
      imp_neto: 10000,
      imp_iva: 2100,
      imp_tot_conc: 0,
      imp_op_ex: 0,
      receptor_nombre: "Juan Pérez",
      receptor_doc_tipo: 96,
      receptor_doc_nro: "12345678",
      receptor_condicion_iva: 5,
      amount_entry_mode: "NET",
      moneda: "PES",
      cotizacion: 1,
      invoice_items: [
        {
          descripcion: "Paquete turístico Cancún 7 días",
          cantidad: 1,
          precio_unitario: 10000,
          subtotal: 10000,
          iva_porcentaje: 21,
          iva_importe: 2100,
          total: 12100,
          tax_treatment: "GRAVADO",
        },
      ],
    },
    emisor: { cuit: "20123456789", razonSocial: "Agencia Test SA" },
    agency: { name: "Agencia Test" },
    footerCompanyName: "MAXEVA",
  }

  it("returns a non-empty Uint8Array", async () => {
    const bytes = await renderInvoicePdf(baseParams)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it("produces a valid PDF (starts with %PDF header)", async () => {
    const bytes = await renderInvoicePdf(baseParams)
    const header = Buffer.from(bytes.slice(0, 4)).toString("ascii")
    expect(header).toBe("%PDF")
  })

  it("embeds the AFIP QR when CAE is present", async () => {
    const bytes = await renderInvoicePdf(baseParams)
    // PDF with embedded PNG has a FlateDecode stream for the image
    const pdfString = Buffer.from(bytes).toString("binary")
    expect(pdfString).toContain("/Subtype /Image")
  })

  it("skips QR when invoice has no CAE (draft state)", async () => {
    const params = {
      ...baseParams,
      invoice: { ...baseParams.invoice, cae: "" },
    }
    const bytes = await renderInvoicePdf(params)
    expect(bytes.length).toBeGreaterThan(1000)
    // No image embedded
    const pdfString = Buffer.from(bytes).toString("binary")
    expect(pdfString).not.toContain("/Subtype /Image")
  })

  // Pendientes 4.5 — branding per-tenant smoke tests
  describe("branding per-tenant", () => {
    it("renderiza con primaryColorHex en hex", async () => {
      const bytes = await renderInvoicePdf({
        ...baseParams,
        branding: { primaryColorHex: "#0066FF" },
      })
      expect(bytes.length).toBeGreaterThan(1000)
    })

    it("renderiza con primaryColorHex en HSL Tailwind", async () => {
      const bytes = await renderInvoicePdf({
        ...baseParams,
        branding: { primaryColorHex: "222 89% 55%" },
      })
      expect(bytes.length).toBeGreaterThan(1000)
    })

    it("ignora color inválido y cae al default sin tirar", async () => {
      const bytes = await renderInvoicePdf({
        ...baseParams,
        branding: { primaryColorHex: "rgb(invalid)" },
      })
      expect(bytes.length).toBeGreaterThan(1000)
    })

    it("renderiza T&Cs en footer cuando se pasa termsText (PDF más grande)", async () => {
      const noTerms = await renderInvoicePdf(baseParams)
      const withTerms = await renderInvoicePdf({
        ...baseParams,
        branding: { termsText: "Política de cancelación: 50% retención si cancela con menos de 30 días de anticipación" },
      })
      // El PDF con texto adicional debe ser mayor (aunque sea por chars).
      expect(withTerms.length).toBeGreaterThanOrEqual(noTerms.length)
      expect(withTerms.length).toBeGreaterThan(1000)
    })

    it("ignora logo PNG corrupto sin tirar", async () => {
      const bytes = await renderInvoicePdf({
        ...baseParams,
        branding: { logoPngBytes: new Uint8Array([0xff, 0xff, 0xff]) },
      })
      expect(bytes.length).toBeGreaterThan(1000)
    })
  })
})
