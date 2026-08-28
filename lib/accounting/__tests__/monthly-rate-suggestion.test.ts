/**
 * Cotización sugerida del mes — VIB-141.
 *
 * La sugerencia alimenta la valuación de toda la contabilidad de una agencia,
 * así que lo que importa no es solo que el número salga bien: es que NUNCA
 * devuelva un valor inventado cuando no hay datos. Un cero o un NaN pasando por
 * acá valuaría un ejercicio entero mal.
 */
import { calcularSugerencia, rangoDelMes } from "../monthly-rate-suggestion"

const r = (rate_date: string, rate: number) => ({ rate_date, rate })

describe("calcularSugerencia", () => {
  const agosto = [
    r("2026-08-01", 1500),
    r("2026-08-15", 1520),
    r("2026-08-29", 1540),
  ]

  it("CIERRE toma la última cotización del mes", () => {
    // Un balance mide un momento: el saldo al cierre se valúa al cierre.
    expect(calcularSugerencia(agosto, "CIERRE")).toMatchObject({
      rate: 1540,
      muestras: 3,
      ultima: "2026-08-29",
    })
  })

  it("PROMEDIO promedia el mes", () => {
    // Un estado de resultados mide un período.
    expect(calcularSugerencia(agosto, "PROMEDIO").rate).toBe(1520)
  })

  it("no depende del orden en que vengan las cotizaciones", () => {
    const desordenado = [agosto[2], agosto[0], agosto[1]]
    expect(calcularSugerencia(desordenado, "CIERRE").rate).toBe(1540)
    expect(calcularSugerencia(desordenado, "PROMEDIO").rate).toBe(1520)
  })

  it("devuelve null si no hay cotizaciones, no cero", () => {
    // Un cero acá valuaría todo el ejercicio a cero. Tiene que ser null para
    // que el caller sepa que no hay dato y pida uno.
    const vacio = calcularSugerencia([], "CIERRE")
    expect(vacio.rate).toBeNull()
    expect(vacio.muestras).toBe(0)
  })

  it("ignora cotizaciones en cero o negativas", () => {
    const sucio = [r("2026-08-01", 0), r("2026-08-02", -5), r("2026-08-03", 1500)]
    expect(calcularSugerencia(sucio, "CIERRE").rate).toBe(1500)
    expect(calcularSugerencia(sucio, "PROMEDIO").rate).toBe(1500)
    expect(calcularSugerencia(sucio, "CIERRE").muestras).toBe(1)
  })

  it("devuelve null si TODAS son inválidas", () => {
    expect(calcularSugerencia([r("2026-08-01", 0)], "PROMEDIO").rate).toBeNull()
  })

  it("redondea el promedio a dos decimales", () => {
    const tres = [r("2026-08-01", 1000), r("2026-08-02", 1001), r("2026-08-03", 1001)]
    expect(calcularSugerencia(tres, "PROMEDIO").rate).toBe(1000.67)
  })
})

describe("rangoDelMes", () => {
  it("cubre el mes completo", () => {
    expect(rangoDelMes(2026, 8)).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" })
  })

  it("resuelve los meses de 30 días", () => {
    expect(rangoDelMes(2026, 9).hasta).toBe("2026-09-30")
  })

  it("resuelve febrero en año común y en bisiesto", () => {
    // Sin esto, un 29 de febrero quedaría fuera del rango y su cotización no
    // se contaría.
    expect(rangoDelMes(2026, 2).hasta).toBe("2026-02-28")
    expect(rangoDelMes(2028, 2).hasta).toBe("2028-02-29")
  })

  it("pone el mes en dos dígitos", () => {
    expect(rangoDelMes(2026, 1)).toEqual({ desde: "2026-01-01", hasta: "2026-01-31" })
  })
})
