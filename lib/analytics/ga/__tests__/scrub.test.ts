import { bucketCount, scrubParams } from "../scrub"

describe("scrubParams — denylist de claves", () => {
  const forbidden: Array<[string, unknown]> = [
    ["customer_email", "juan@mail.com"],
    ["customer_name", "Juan Perez"],
    ["nombre_cliente", "Juan"],
    ["operator_name", "Despegar"],
    ["phone", "1155667788"],
    ["telefono", "1155667788"],
    ["cuit", "20304050607"],
    ["dni", "30123456"],
    ["amount", 1200],
    ["monto", 1200],
    ["sale_amount", 1200],
    ["operator_cost", 800],
    ["total_usd", 500],
    ["precio", 100],
    ["saldo", 50],
    ["cbu", "0170099220000067797151"],
    ["passenger_count_name", "x"],
    ["note", "algo"],
    ["comentario", "algo"],
    ["observaciones", "algo"],
    ["search", "Juan"],
    ["q", "Juan"],
    ["token", "abc"],
    ["api_key", "abc"],
    ["password", "abc"],
  ]

  it.each(forbidden)("descarta %s", (key, value) => {
    expect(scrubParams({ [key]: value })).toEqual({})
  })

  it("descarta solo las claves prohibidas y conserva el resto", () => {
    expect(
      scrubParams({ surface: "payments", customer_email: "juan@mail.com", currency: "ARS" })
    ).toEqual({ surface: "payments", currency: "ARS" })
  })

  it("deja pasar los buckets aunque la clave matchee el denylist", () => {
    // `passengers_bucket` contiene "passenger" (prohibido, bloquea nombres de
    // pasajeros) pero el valor es un enum cerrado, no puede llevar informacion.
    expect(scrubParams({ passengers_bucket: "2-5" })).toEqual({ passengers_bucket: "2-5" })
  })

  it("no deja pasar un *_bucket con contenido libre", () => {
    expect(scrubParams({ customer_bucket: "Juan Perez" })).toEqual({})
    expect(scrubParams({ passengers_bucket: "3 pasajeros" })).toEqual({})
  })

  it("no confunde 'hotel' con 'tel'", () => {
    // Regresion: un denylist con el fragmento "tel" romperia cualquier param de
    // hoteleria, que en una agencia de viajes es dominio legitimo.
    expect(scrubParams({ hotel_kind: "resort" })).toEqual({ hotel_kind: "resort" })
  })
})

describe("scrubParams — valores", () => {
  it("descarta montos aunque la clave sea inocente", () => {
    expect(scrubParams({ value: 1250.5 })).toEqual({})
    expect(scrubParams({ ref: 125000 })).toEqual({})
  })

  it("descarta texto libre por nombre de clave", () => {
    expect(scrubParams({ note: "Juan Perez debe 500 USD" })).toEqual({})
    expect(scrubParams({ comment: "hablar con la clienta" })).toEqual({})
  })

  it("descarta emails y corridas largas de digitos bajo claves inocentes", () => {
    // Segunda linea de defensa: el nombre de la clave no delata nada pero el
    // valor es un email / CUIT / DNI / telefono / CBU.
    expect(scrubParams({ detail: "escribir a juan@mail.com" })).toEqual({})
    expect(scrubParams({ ref: "20304050607" })).toEqual({})
    expect(scrubParams({ code: "1155667788" })).toEqual({})
  })

  it("conserva enteros chicos y los de la allowlist numerica", () => {
    expect(scrubParams({ count: 3 })).toEqual({ count: 3 })
    expect(scrubParams({ step: 250000 })).toEqual({ step: 250000 })
  })

  it("conserva booleanos incluido false", () => {
    expect(scrubParams({ from_lead: false, had_warnings: true })).toEqual({
      from_lead: false,
      had_warnings: true,
    })
  })

  it("descarta vacios, nulos y estructuras", () => {
    expect(
      scrubParams({ a: null, b: undefined, c: "", d: {}, e: [1, 2], f: () => null })
    ).toEqual({})
  })
})

describe("scrubParams — limites de GA4", () => {
  it("trunca valores a 100 chars", () => {
    const out = scrubParams({ surface: "x".repeat(200) })
    expect((out.surface as string).length).toBe(100)
  })

  it("descarta claves de mas de 40 chars", () => {
    expect(scrubParams({ ["a".repeat(41)]: "x" })).toEqual({})
    expect(scrubParams({ ["a".repeat(40)]: "x" })).toEqual({ ["a".repeat(40)]: "x" })
  })

  it("corta en 25 params", () => {
    const raw: Record<string, unknown> = {}
    for (let i = 0; i < 40; i++) raw[`p${i}`] = "v"
    expect(Object.keys(scrubParams(raw))).toHaveLength(25)
  })

  it("tolera entrada nula", () => {
    expect(scrubParams(null)).toEqual({})
    expect(scrubParams(undefined)).toEqual({})
  })
})

describe("bucketCount", () => {
  it.each([
    [0, "0"],
    [-3, "0"],
    [1, "1"],
    [2, "2-5"],
    [5, "2-5"],
    [6, "6-10"],
    [10, "6-10"],
    [11, "11-25"],
    [25, "11-25"],
    [26, "25+"],
    [1000, "25+"],
  ])("bucketCount(%s) === %s", (input, expected) => {
    expect(bucketCount(input)).toBe(expected)
  })

  it("tolera NaN", () => {
    expect(bucketCount(Number.NaN)).toBe("0")
  })
})
