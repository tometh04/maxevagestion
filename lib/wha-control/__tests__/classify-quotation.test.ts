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

// Mock OpenAI before import
const mockCreate = jest.fn()

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  }
})

import { classifyByLLM, classifyPdf } from "../classify-quotation"

describe("classifyByLLM", () => {
  beforeEach(() => mockCreate.mockReset())

  it("returns is_quotation=true when LLM responds with quotation + high confidence", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ is_quotation: true, confidence: 0.92 }) } }],
    })
    const result = await classifyByLLM("propuesta viaje.pdf", "test-api-key")
    expect(result.is_quotation).toBe(true)
    expect(result.source).toBe("llm")
    expect(result.confidence).toBe(0.92)
  })

  it("returns is_quotation=false when LLM responds with confidence < 0.7", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ is_quotation: true, confidence: 0.5 }) } }],
    })
    const result = await classifyByLLM("documento.pdf", "test-api-key")
    expect(result.is_quotation).toBe(false)
    expect(result.source).toBe("llm_low_confidence")
  })

  it("returns is_quotation=false on malformed LLM response", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: "not json" } }] })
    const result = await classifyByLLM("documento.pdf", "test-api-key")
    expect(result.is_quotation).toBe(false)
    expect(result.source).toBe("llm_low_confidence")
  })

  it("propagates LLM API errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("rate limit"))
    await expect(classifyByLLM("doc.pdf", "test-api-key")).rejects.toThrow("rate limit")
  })
})

describe("classifyPdf (orchestrator)", () => {
  beforeEach(() => mockCreate.mockReset())

  it("returns heuristic positive without calling LLM", async () => {
    const result = await classifyPdf("Cotizacion_Maragogi.pdf", "test-key")
    expect(result.is_quotation).toBe(true)
    expect(result.source).toBe("heuristic_positive")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("returns heuristic negative without calling LLM", async () => {
    const result = await classifyPdf("factura_001.pdf", "test-key")
    expect(result.is_quotation).toBe(false)
    expect(result.source).toBe("heuristic_negative")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("falls back to LLM for ambiguous filename", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ is_quotation: true, confidence: 0.85 }) } }],
    })
    const result = await classifyPdf("documento.pdf", "test-key")
    expect(result.is_quotation).toBe(true)
    expect(result.source).toBe("llm")
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it("returns false (without calling LLM) when filename is null", async () => {
    const result = await classifyPdf(null, "test-key")
    expect(result.is_quotation).toBe(false)
    expect(result.source).toBe("llm_low_confidence")
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
