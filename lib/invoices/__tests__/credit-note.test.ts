import {
  deriveCreditNoteType,
  isCreditNote,
  isDebitNote,
  isCreditOrDebitNote,
  ledgerSign,
} from "../credit-note"

describe("deriveCreditNoteType", () => {
  it("deriva NC/ND por letra de la factura origen", () => {
    expect(deriveCreditNoteType(1, "NC")).toBe(3) // Factura A → NC A
    expect(deriveCreditNoteType(1, "ND")).toBe(2) // Factura A → ND A
    expect(deriveCreditNoteType(6, "NC")).toBe(8) // Factura B → NC B
    expect(deriveCreditNoteType(6, "ND")).toBe(7) // Factura B → ND B
    expect(deriveCreditNoteType(11, "NC")).toBe(13) // Factura C → NC C
    expect(deriveCreditNoteType(11, "ND")).toBe(12) // Factura C → ND C
    expect(deriveCreditNoteType(19, "NC")).toBe(21) // Factura E → NC E
    expect(deriveCreditNoteType(19, "ND")).toBe(20) // Factura E → ND E
  })

  it("soporta facturas MiPyME (FCE)", () => {
    expect(deriveCreditNoteType(201, "NC")).toBe(203)
    expect(deriveCreditNoteType(206, "ND")).toBe(207)
  })

  it("lanza para comprobantes no soportados", () => {
    expect(() => deriveCreditNoteType(3, "NC")).toThrow()
    expect(() => deriveCreditNoteType(999, "ND")).toThrow()
  })
})

describe("clasificadores de comprobante", () => {
  it("isCreditNote reconoce NC A/B/C/E", () => {
    for (const t of [3, 8, 13, 21]) expect(isCreditNote(t)).toBe(true)
    for (const t of [1, 6, 11, 19, 2, 7]) expect(isCreditNote(t)).toBe(false)
  })

  it("isDebitNote reconoce ND A/B/C/E", () => {
    for (const t of [2, 7, 12, 20]) expect(isDebitNote(t)).toBe(true)
    for (const t of [1, 6, 11, 19, 3, 8]) expect(isDebitNote(t)).toBe(false)
  })

  it("isCreditOrDebitNote es true solo para NC/ND", () => {
    expect(isCreditOrDebitNote(8)).toBe(true)
    expect(isCreditOrDebitNote(7)).toBe(true)
    expect(isCreditOrDebitNote(6)).toBe(false)
  })
})

describe("ledgerSign", () => {
  it("NC resta, facturas y ND suman", () => {
    expect(ledgerSign(8)).toBe(-1) // NC B
    expect(ledgerSign(3)).toBe(-1) // NC A
    expect(ledgerSign(6)).toBe(1) // Factura B
    expect(ledgerSign(7)).toBe(1) // ND B
  })
})
