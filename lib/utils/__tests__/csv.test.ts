import { buildCsv, escapeCsvValue, numEs } from "../csv"

describe("escapeCsvValue", () => {
  it("devuelve string vacío para null/undefined", () => {
    expect(escapeCsvValue(null)).toBe("")
    expect(escapeCsvValue(undefined)).toBe("")
  })

  it("NO escapa por coma (los decimales usan coma en Excel-ES)", () => {
    expect(escapeCsvValue("1234,56")).toBe("1234,56")
  })

  it("escapa cuando hay separador, comillas o saltos de línea", () => {
    expect(escapeCsvValue("Pago; seña")).toBe('"Pago; seña"')
    expect(escapeCsvValue('dijo "hola"')).toBe('"dijo ""hola"""')
    expect(escapeCsvValue("linea1\nlinea2")).toBe('"linea1\nlinea2"')
  })
})

describe("numEs", () => {
  it("usa coma decimal sin separador de miles", () => {
    expect(numEs(1234.56)).toBe("1234,56")
    expect(numEs(0)).toBe("0")
    expect(numEs("101.48")).toBe("101,48")
  })

  it("devuelve vacío para null/undefined/vacío", () => {
    expect(numEs(null)).toBe("")
    expect(numEs(undefined)).toBe("")
    expect(numEs("")).toBe("")
  })
})

describe("buildCsv", () => {
  it("incluye BOM, directiva sep=; y CRLF", () => {
    const csv = buildCsv(["Fecha", "Monto"], [["01/07/2026", "1234,56"]])

    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain("sep=;\r\n")
    expect(csv).toContain("Fecha;Monto\r\n01/07/2026;1234,56")
  })

  it("soporta cero filas", () => {
    const csv = buildCsv(["Fecha"], [])
    expect(csv.endsWith("Fecha")).toBe(true)
  })
})
