import { shouldSkipMissingStep, MAX_SKIP_CHAIN } from "../skip-chain"

describe("shouldSkipMissingStep", () => {
  it("saltea un paso opcional aislado", () => {
    // El caso normal: un campo condicional que hoy no está montado.
    expect(shouldSkipMissingStep({ onMissing: "skip", consecutiveSkips: 0 })).toBe(true)
  })

  it("saltea también sin onMissing declarado", () => {
    // El default histórico es saltear; solo "center" pide quedarse.
    expect(shouldSkipMissingStep({ consecutiveSkips: 0 })).toBe(true)
  })

  it("nunca saltea un paso que pide caer al centro", () => {
    expect(shouldSkipMissingStep({ onMissing: "center", consecutiveSkips: 0 })).toBe(false)
    expect(shouldSkipMissingStep({ onMissing: "center", consecutiveSkips: 99 })).toBe(false)
  })

  it("tolera una cadena corta de condicionales", () => {
    // En el alta de operación hay tres condicionales seguidos alrededor de la
    // comisión compartida: esa cadena legítima tiene que pasar.
    for (let i = 0; i < MAX_SKIP_CHAIN; i++) {
      expect([i, shouldSkipMissingStep({ onMissing: "skip", consecutiveSkips: i })]).toEqual([
        i,
        true,
      ])
    }
  })

  it("corta la cadena cuando se pasa del límite", () => {
    // Es lo que pasa al cerrar el diálogo a mitad de una guía de formulario:
    // todos los pasos que quedan pierden su ancla a la vez.
    expect(shouldSkipMissingStep({ onMissing: "skip", consecutiveSkips: MAX_SKIP_CHAIN })).toBe(
      false
    )
    expect(
      shouldSkipMissingStep({ onMissing: "skip", consecutiveSkips: MAX_SKIP_CHAIN + 5 })
    ).toBe(false)
  })
})
