import { shouldSkipOperatorModelRecalc } from "../recalc-guard"

describe("shouldSkipOperatorModelRecalc", () => {
  it("skip cuando la op usa el modelo operador (tiene operadores), aunque tenga servicios", () => {
    // Incidente OP-20260518-3C89DA03: op operador + 1 servicio no debe pisar totales.
    expect(shouldSkipOperatorModelRecalc(2, 1)).toBe(true)
    expect(shouldSkipOperatorModelRecalc(1, 5)).toBe(true)
    expect(shouldSkipOperatorModelRecalc(2, 0)).toBe(true)
  })

  it("skip cuando no quedan servicios (evita zeroing al borrar el último)", () => {
    // Incidente a3bb84e1: recalc sobre set vacío ponía todo en 0.
    expect(shouldSkipOperatorModelRecalc(0, 0)).toBe(true)
  })

  it("recalcula cuando la op es puramente por servicio (sin operadores, con servicios)", () => {
    expect(shouldSkipOperatorModelRecalc(0, 1)).toBe(false)
    expect(shouldSkipOperatorModelRecalc(0, 3)).toBe(false)
  })
})
