/**
 * @jest-environment node
 */
import { diffVoucher } from "@/lib/afip/diff"

describe("diffVoucher", () => {
  const base = {
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
  }

  it("returns null when sent === received", () => {
    expect(diffVoucher(base, { ...base })).toBeNull()
  })

  it("detects ImpTotal difference greater than 1 cent", () => {
    const received = { ...base, ImpTotal: 12100.02 }
    expect(diffVoucher(base, received)).toEqual({
      ImpTotal: { sent: 12100, received: 12100.02 },
    })
  })

  it("tolerates ImpTotal difference of 1 cent (AFIP rounds oddly)", () => {
    const received = { ...base, ImpTotal: 12100.01 }
    expect(diffVoucher(base, received)).toBeNull()
  })

  it("detects CbteFch mismatch as string", () => {
    const received = { ...base, CbteFch: "20260425" }
    expect(diffVoucher(base, received)).toEqual({
      CbteFch: { sent: "20260424", received: "20260425" },
    })
  })

  it("detects DocNro mismatch", () => {
    const received = { ...base, DocNro: 20999999999 }
    expect(diffVoucher(base, received)).toHaveProperty("DocNro")
  })

  it("returns multiple field diff", () => {
    const received = { ...base, ImpTotal: 99999, CbteFch: "20260425" }
    const result = diffVoucher(base, received)
    expect(result).toHaveProperty("ImpTotal")
    expect(result).toHaveProperty("CbteFch")
  })

  it("handles null received (voucher not found in AFIP)", () => {
    expect(diffVoucher(base, null)).toEqual({ _not_found: true })
  })
})
