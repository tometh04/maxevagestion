/**
 * Conversión de pagos a la moneda de la operación.
 *
 * Estos tests fijan el comportamiento que YA tenía el listado de operaciones
 * antes de extraer la función. No es una regla nueva: es la que el cliente ve
 * hoy, y el cierre contable va a usar la misma para no contradecirla.
 *
 * El caso que más importa es el último: un pago que no se puede convertir vale
 * 0, no su importe crudo. Tomarlo crudo sumaría pesos como dólares.
 */
import { convertPaymentAmount } from "../payment-conversion"

describe("convertPaymentAmount", () => {
  it("no toca el importe si el pago ya está en la moneda de la operación", () => {
    expect(convertPaymentAmount({ amount: 1000, currency: "USD" }, "USD")).toBe(1000)
    expect(convertPaymentAmount({ amount: 1000, currency: "ARS" }, "ARS")).toBe(1000)
  })

  it("prefiere amount_usd sobre recalcular", () => {
    // amount_usd se calculó con el tipo de cambio del día del cobro. Recalcular
    // hoy daría un número distinto al que el cliente ya vio en pantalla.
    const pago = { amount: 1_520_000, currency: "ARS", amount_usd: 1000, exchange_rate: 1400 }
    expect(convertPaymentAmount(pago, "USD")).toBe(1000)
  })

  it("cae al tipo de cambio del pago si no hay amount_usd", () => {
    expect(
      convertPaymentAmount({ amount: 152_000, currency: "ARS", exchange_rate: 1520 }, "USD")
    ).toBe(100)
  })

  it("convierte de dólares a pesos multiplicando", () => {
    expect(
      convertPaymentAmount({ amount: 100, currency: "USD", exchange_rate: 1520 }, "ARS")
    ).toBe(152_000)
  })

  it("un amount_usd en cero no se toma como válido", () => {
    // Cero acá significa "no se calculó", no "vale cero dólares".
    const pago = { amount: 152_000, currency: "ARS", amount_usd: 0, exchange_rate: 1520 }
    expect(convertPaymentAmount(pago, "USD")).toBe(100)
  })

  it("sin ninguna forma de convertir devuelve 0, no el importe crudo", () => {
    // Devolver 152.000 al pedir dólares inflaría lo cobrado por mil. El 0
    // subestima, que es el error barato: la operación parece menos cobrada,
    // nunca más.
    expect(convertPaymentAmount({ amount: 152_000, currency: "ARS" }, "USD")).toBe(0)
    expect(convertPaymentAmount({ amount: 100, currency: "USD" }, "ARS")).toBe(0)
  })

  it("un tipo de cambio en cero o negativo no se usa", () => {
    expect(
      convertPaymentAmount({ amount: 152_000, currency: "ARS", exchange_rate: 0 }, "USD")
    ).toBe(0)
    expect(
      convertPaymentAmount({ amount: 152_000, currency: "ARS", exchange_rate: -5 }, "USD")
    ).toBe(0)
  })

  it("tolera importes en texto y moneda nula", () => {
    // PostgREST devuelve numeric como string. Sin esto, un pago válido valdría 0.
    expect(convertPaymentAmount({ amount: "1000", currency: "USD" }, "USD")).toBe(1000)
    expect(convertPaymentAmount({ amount: 500, currency: null }, "ARS")).toBe(500)
  })
})
