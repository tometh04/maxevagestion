import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_VALUES,
  paymentMethodLabel,
  paymentMethodOptionsFor,
} from "../payment-methods"

describe("catálogo de formas de pago", () => {
  it("conserva TODOS los valores que existían en las 5 listas previas", () => {
    // Union de las listas que había antes: ninguna forma de pago puede
    // desaparecer al unificar, o los cobros históricos quedan sin representar.
    const previos = [
      "Transferencia",
      "Efectivo",
      "Tarjeta Crédito",
      "Tarjeta Débito",
      "Cheque",
      "MercadoPago",
      "PayPal",
      "Otro",
    ]
    for (const v of previos) {
      expect(PAYMENT_METHOD_VALUES).toContain(v)
    }
  })

  it("incluye Depósito Bancario, que es lo que pidió el cliente", () => {
    expect(PAYMENT_METHOD_VALUES).toContain("Depósito Bancario")
  })

  it("no tiene valores duplicados", () => {
    expect(new Set(PAYMENT_METHOD_VALUES).size).toBe(PAYMENT_METHOD_VALUES.length)
  })
})

describe("paymentMethodLabel", () => {
  it("traduce el valor guardado a etiqueta", () => {
    expect(paymentMethodLabel("Tarjeta Crédito")).toBe("Tarjeta de Crédito")
    expect(paymentMethodLabel("Transferencia")).toBe("Transferencia Bancaria")
  })

  it("devuelve tal cual un valor histórico desconocido", () => {
    expect(paymentMethodLabel("Trueque")).toBe("Trueque")
  })

  it("tolera null/vacío", () => {
    expect(paymentMethodLabel(null)).toBe("")
    expect(paymentMethodLabel("  ")).toBe("")
  })
})

describe("paymentMethodOptionsFor", () => {
  it("devuelve el catálogo cuando el método actual ya está", () => {
    expect(paymentMethodOptionsFor("Cheque")).toBe(PAYMENT_METHODS)
  })

  it("devuelve el catálogo cuando no hay método todavía (alta)", () => {
    expect(paymentMethodOptionsFor(null)).toBe(PAYMENT_METHODS)
  })

  // El caso que causaba la pérdida silenciosa.
  it("agrega el método histórico para que el Select pueda representarlo", () => {
    const options = paymentMethodOptionsFor("Tarjeta de Crédito") // el que escribe cc-settle
    expect(options.map((o) => o.value)).toContain("Tarjeta de Crédito")
    expect(options.length).toBe(PAYMENT_METHODS.length + 1)
  })

  it("no duplica cuando el valor histórico coincide con uno del catálogo", () => {
    const options = paymentMethodOptionsFor("PayPal")
    expect(options.filter((o) => o.value === "PayPal")).toHaveLength(1)
  })
})
