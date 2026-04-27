import { classifyByFilename } from "../classify-quotation"

describe("classifyByFilename", () => {
  describe("positive cases (cotización)", () => {
    it.each([
      "Cotizacion_Maragogi.pdf",
      "presupuesto Familia Lopez.pdf",
      "PROPUESTA viaje Bariloche.pdf",
      "quotation_Q4_2026.pdf",
      "COT-2026-0042.pdf",
      "Cotización a Punta Cana - 4 pax.pdf",
    ])("should classify '%s' as quotation", (filename) => {
      const result = classifyByFilename(filename)
      expect(result?.is_quotation).toBe(true)
      expect(result?.source).toBe("heuristic_positive")
    })
  })

  describe("negative cases (otros docs)", () => {
    it.each([
      "Factura_AR_001.pdf",
      "invoice_2026-04.pdf",
      "Voucher_Hotel_Confirm.pdf",
      "asistencia_seguro.pdf",
      "Itinerario_final.pdf",
      "boleto_aerolinea.pdf",
      "ticket_AA1234.pdf",
      "Recibo_pago.pdf",
      "DNI_Lopez.pdf",
      "Pasaporte_titular.pdf",
      "comprobante_transferencia.pdf",
      "cartilla_medica.pdf",
    ])("should classify '%s' as NOT a quotation", (filename) => {
      const result = classifyByFilename(filename)
      expect(result?.is_quotation).toBe(false)
      expect(result?.source).toBe("heuristic_negative")
    })
  })

  describe("ambiguous cases", () => {
    it.each([
      "documento.pdf",
      "scan_001.pdf",
      "image-123456.pdf",
      "PDF_2026.pdf",
    ])("should return null for ambiguous '%s'", (filename) => {
      expect(classifyByFilename(filename)).toBeNull()
    })

    it("returns null for empty filename", () => {
      expect(classifyByFilename("")).toBeNull()
    })

    it("returns null for null", () => {
      expect(classifyByFilename(null)).toBeNull()
    })
  })

  describe("priority: positive wins if both regex match", () => {
    it("'Cotizacion factura.pdf' is treated as quotation (positive priority)", () => {
      const result = classifyByFilename("Cotizacion factura.pdf")
      expect(result?.is_quotation).toBe(true)
    })
  })
})
