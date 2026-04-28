import { normalizeHeader, mapHeaders } from "../header-mapper"

describe("normalizeHeader", () => {
  it("normaliza a lowercase, sin acentos, sin espacios", () => {
    expect(normalizeHeader("Código")).toBe("codigo")
    expect(normalizeHeader("Nombre del Cliente")).toBe("nombre_del_cliente")
    expect(normalizeHeader("  Fecha  Salida  ")).toBe("fecha_salida")
    expect(normalizeHeader("Niños")).toBe("ninos")
  })

  it("preserva guión bajo y dígitos", () => {
    expect(normalizeHeader("Operador 1")).toBe("operador_1")
    expect(normalizeHeader("Costo Operador 2")).toBe("costo_operador_2")
  })

  it("remueve caracteres especiales", () => {
    expect(normalizeHeader("¿Pendiente?")).toBe("pendiente")
    expect(normalizeHeader("Monto $")).toBe("monto")
  })
})

describe("mapHeaders", () => {
  const schema = {
    file_code: ["codigo", "codigo_operacion", "file_code"],
    customer_name: ["nombre_cliente", "nombre_del_cliente", "cliente"],
    sale_amount: ["monto_venta", "venta", "sale_amount"],
  }

  it("mapea headers a field names usando sinónimos", () => {
    const headers = ["Código", "Nombre del Cliente", "Monto Venta"]
    expect(mapHeaders(headers, schema)).toEqual(
      new Map([
        [0, "file_code"],
        [1, "customer_name"],
        [2, "sale_amount"],
      ])
    )
  })

  it("ignora columnas no mapeadas", () => {
    const headers = ["Código", "Columna Random", "Monto Venta"]
    const result = mapHeaders(headers, schema)
    expect(result.get(0)).toBe("file_code")
    expect(result.get(1)).toBeUndefined()
    expect(result.get(2)).toBe("sale_amount")
  })

  it("retorna Map vacío si ningún header matchea", () => {
    const headers = ["foo", "bar"]
    expect(mapHeaders(headers, schema).size).toBe(0)
  })
})
