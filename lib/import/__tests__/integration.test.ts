import { PIPELINES } from "../index"

describe("PIPELINES registry", () => {
  it("expone los 5 pipelines", () => {
    expect(Object.keys(PIPELINES).sort()).toEqual([
      "cash-movements",
      "customers",
      "operations-master",
      "operators",
      "payments-suelto",
    ])
  })

  it("cada pipeline es una función async", () => {
    Object.values(PIPELINES).forEach(pipeline => {
      expect(typeof pipeline).toBe("function")
    })
  })
})
