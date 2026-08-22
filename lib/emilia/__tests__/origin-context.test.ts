import { hasExplicitOrigin, withDefaultOrigin } from "../origin-context"

describe("Emilia origin context", () => {
  it("agrega la ciudad geolocalizada cuando el prompt no tiene origen", () => {
    expect(
      withDefaultOrigin("Cotizar viaje a Cancún para 2 adultos.", {
        city: "Buenos Aires",
        country: "Argentina",
      })
    ).toBe(
      "Cotizar viaje a Cancún para 2 adultos. Saliendo desde Buenos Aires, Argentina."
    )
  })

  it("no pisa un origen explícito", () => {
    const message = "Cotizar viaje a Cancún saliendo desde Córdoba para 2 adultos."
    expect(
      withDefaultOrigin(message, { city: "Buenos Aires", country: "Argentina" })
    ).toBe(message)
    expect(hasExplicitOrigin(message)).toBe(true)
  })

  it("deja el prompt intacto cuando la localización fue rechazada", () => {
    const message = "Cotizar viaje a Cancún para 2 adultos."
    expect(withDefaultOrigin(message, null)).toBe(message)
  })
})
