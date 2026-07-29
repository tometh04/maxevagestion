import {
  isLeadOutcome,
  parseLeadOutcomeInput,
  resolveLeadResolution,
} from "../outcome"

describe("isLeadOutcome", () => {
  it("acepta SALE y DISCARDED", () => {
    expect(isLeadOutcome("SALE")).toBe(true)
    expect(isLeadOutcome("DISCARDED")).toBe(true)
  })
  it("rechaza cualquier otro valor", () => {
    expect(isLeadOutcome("WON")).toBe(false)
    expect(isLeadOutcome(null)).toBe(false)
    expect(isLeadOutcome(undefined)).toBe(false)
    expect(isLeadOutcome("")).toBe(false)
  })
})

describe("parseLeadOutcomeInput", () => {
  it("acepta outcomes válidos", () => {
    expect(parseLeadOutcomeInput("SALE")).toEqual({ ok: true, value: "SALE" })
    expect(parseLeadOutcomeInput("DISCARDED")).toEqual({ ok: true, value: "DISCARDED" })
  })
  it("acepta null como reabrir", () => {
    expect(parseLeadOutcomeInput(null)).toEqual({ ok: true, value: null })
  })
  it("rechaza basura", () => {
    expect(parseLeadOutcomeInput("nope")).toEqual({ ok: false })
    expect(parseLeadOutcomeInput(undefined)).toEqual({ ok: false })
    expect(parseLeadOutcomeInput(5)).toEqual({ ok: false })
  })
})

describe("resolveLeadResolution", () => {
  it("venta real: tiene operación", () => {
    const r = resolveLeadResolution({ outcome: "SALE", status: "WON", hasOperation: true })
    expect(r.isRealSale).toBe(true)
    expect(r.isManualSale).toBe(false)
    expect(r.isSale).toBe(true)
    expect(r.isDiscarded).toBe(false)
    expect(r.isActive).toBe(false)
    expect(r.label).toBe("Venta")
  })

  it("venta real aunque no tenga outcome marcado (solo operación)", () => {
    const r = resolveLeadResolution({ outcome: null, status: "IN_PROGRESS", hasOperation: true })
    expect(r.isRealSale).toBe(true)
    expect(r.label).toBe("Venta")
  })

  it("venta manual: outcome SALE sin operación", () => {
    const r = resolveLeadResolution({ outcome: "SALE", status: "IN_PROGRESS", hasOperation: false })
    expect(r.isRealSale).toBe(false)
    expect(r.isManualSale).toBe(true)
    expect(r.isSale).toBe(true)
    expect(r.label).toBe("Venta sin operación")
  })

  it("descartado por marca explícita", () => {
    const r = resolveLeadResolution({ outcome: "DISCARDED", status: "IN_PROGRESS", hasOperation: false })
    expect(r.isDiscarded).toBe(true)
    expect(r.isSale).toBe(false)
    expect(r.isActive).toBe(false)
    expect(r.label).toBe("Descartado")
  })

  it("descartado legacy: status LOST sin outcome", () => {
    const r = resolveLeadResolution({ outcome: null, status: "LOST", hasOperation: false })
    expect(r.isDiscarded).toBe(true)
    expect(r.label).toBe("Descartado")
  })

  it("la venta gana sobre un descarte inconsistente (tiene operación + DISCARDED)", () => {
    const r = resolveLeadResolution({ outcome: "DISCARDED", status: "LOST", hasOperation: true })
    expect(r.isRealSale).toBe(true)
    expect(r.isDiscarded).toBe(false)
    expect(r.label).toBe("Venta")
  })

  it("abierto: sin outcome, sin operación, status activo", () => {
    const r = resolveLeadResolution({ outcome: null, status: "IN_PROGRESS", hasOperation: false })
    expect(r.isActive).toBe(true)
    expect(r.isSale).toBe(false)
    expect(r.isDiscarded).toBe(false)
    expect(r.label).toBeNull()
  })
})
