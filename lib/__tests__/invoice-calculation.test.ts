import {
  calculateInvoice,
  getRecommendedAmountEntryMode,
  normalizeTaxTreatment,
  shouldHideInvoiceTaxBreakdown,
} from "@/lib/invoices/calculation"

describe("invoice calculation", () => {
  it("keeps net mode for regular gravado items", () => {
    const result = calculateInvoice(
      [
        {
          descripcion: "Servicio",
          cantidad: 1,
          precio_unitario: 100,
          iva_porcentaje: 21,
          tax_treatment: "GRAVADO",
        },
      ],
      "NET"
    )

    expect(result.totals).toEqual({
      imp_neto: 100,
      imp_iva: 21,
      imp_total: 121,
      imp_tot_conc: 0,
      imp_op_ex: 0,
      imp_trib: 0,
    })
  })

  it("derives net and iva from final amount mode", () => {
    const result = calculateInvoice(
      [
        {
          descripcion: "Factura B CF",
          cantidad: 1,
          precio_unitario: 2460,
          iva_porcentaje: 21,
          tax_treatment: "GRAVADO",
        },
      ],
      "FINAL"
    )

    expect(result.items[0]).toMatchObject({
      subtotal: 2033.06,
      iva_importe: 426.94,
      total: 2460,
    })
    expect(result.totals.imp_total).toBe(2460)
  })

  it("routes exento and no gravado to their AFIP buckets", () => {
    const result = calculateInvoice(
      [
        {
          descripcion: "Exento",
          cantidad: 1,
          precio_unitario: 100,
          iva_porcentaje: 0,
          tax_treatment: "EXENTO",
        },
        {
          descripcion: "No gravado",
          cantidad: 1,
          precio_unitario: 50,
          iva_porcentaje: 0,
          tax_treatment: "NO_GRAVADO",
        },
      ],
      "NET"
    )

    expect(result.totals).toEqual({
      imp_neto: 0,
      imp_iva: 0,
      imp_total: 150,
      imp_tot_conc: 50,
      imp_op_ex: 100,
      imp_trib: 0,
    })
  })

  it("uses explicit treatment when provided and falls back to exento for legacy 0%", () => {
    expect(normalizeTaxTreatment("NO_GRAVADO", 0)).toBe("NO_GRAVADO")
    expect(normalizeTaxTreatment(undefined, 0)).toBe("EXENTO")
    expect(normalizeTaxTreatment(undefined, 21)).toBe("GRAVADO")
  })

  it("recommends final mode only for factura B to consumidor final", () => {
    expect(getRecommendedAmountEntryMode(6, 5)).toBe("FINAL")
    expect(getRecommendedAmountEntryMode(1, 1)).toBe("NET")
    expect(shouldHideInvoiceTaxBreakdown({ amountEntryMode: "FINAL", cbteTipo: 6, receptorCondicionIva: 5 })).toBe(true)
    expect(shouldHideInvoiceTaxBreakdown({ amountEntryMode: "NET", cbteTipo: 6, receptorCondicionIva: 5 })).toBe(false)
  })
})
