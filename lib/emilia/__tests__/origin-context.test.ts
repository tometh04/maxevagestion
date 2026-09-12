import { hasExplicitOrigin, withDefaultOrigin } from "../origin-context"

describe("Emilia origin context", () => {
  it.each([" vuelo directo", ""])("respeta Buenos Aires en el primer pedido%s", (restriction) => {
    const message = `Cotiza un vuelo + hotel a rio de jeneiro desde buenos aires saliendo el 26 de noviembre y regresando el 30 de novimebre para 2 adultos${restriction}, hotel en Buzios con desayuno habitación doble hotel don quijote`
    expect(hasExplicitOrigin(message)).toBe(true)
    expect(withDefaultOrigin(message, { city: "Rosario", country: "Argentina" })).toBe(message)
  })

  it.each([
    "Quiero ir a Río desde Buenos Aires",
    "Vuelo directo a Río desde EZE para dos adultos",
    "Cotizar a Cancún desde Córdoba el 26 de noviembre",
  ])("conserva el origen después del destino: %s", (message) => {
    expect(withDefaultOrigin(message, { city: "Rosario" })).toBe(message)
  })

  it.each([
    "Cotizar a Río desde el 26 de noviembre",
    "Cotizar a Río desde noviembre",
    "Cotizar a Río desde mañana",
    "Cotizar a Río desde las 10:00",
    "Cotizar a Río desde USD 500",
  ])("no confunde fechas, horarios o precios con origen: %s", (message) => {
    expect(hasExplicitOrigin(message)).toBe(false)
    expect(withDefaultOrigin(message, { city: "Rosario" })).toBe(`${message} Saliendo desde Rosario.`)
  })

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
