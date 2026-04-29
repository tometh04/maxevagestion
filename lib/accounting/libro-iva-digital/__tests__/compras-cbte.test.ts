import { generateComprasCbteRow, type CompraInput } from "../compras-cbte"

describe("generateComprasCbteRow", () => {
  const baseInput: CompraInput = {
    issue_date: "2026-04-25",
    cbte_tipo: "FACTURA_A",
    pto_vta: 1,
    cbte_nro: 99,
    despacho_importacion: null,
    emitter_doc_tipo: 80, // CUIT
    emitter_cuit: "20362014949",
    emitter_name: "360 REGIONAL SA",
    imp_total: 121000,
    imp_tot_conc: 0,
    imp_op_ex: 0,
    perc_iva: 0,
    perc_no_categorizados: 0,
    perc_iibb: 0,
    perc_municipales: 0,
    imp_internos: 0,
    moneda: "ARS",
    cotizacion: 1,
    cantidad_alicuotas: 1,
    codigo_operacion: " ",
    credito_fiscal_computable: 21000,
    otros_tributos: 0,
    cuit_corredor: null,
    denominacion_corredor: null,
    iva_comision: 0,
  }

  it("largo total = 325 chars", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row).toHaveLength(325)
  })

  it("primeros 8 = fecha YYYYMMDD", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(0, 8)).toBe("20260425")
  })

  it("cbte_tipo + pto_vta + cbte_nro en posiciones correctas", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(8, 11)).toBe("001")
    expect(row.slice(11, 16)).toBe("00001")
    expect(row.slice(16, 36)).toBe("00000000000000000099")
  })

  it("despacho importación vacío = 16 espacios", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(36, 52)).toBe("                ")
  })

  it("doc_tipo + cuit del emisor", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(52, 54)).toBe("80")
    expect(row.slice(54, 74)).toBe("000000000020362014949".slice(-20))
  })

  it("nombre del emisor padded a 30", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(74, 104)).toBe("360 REGIONAL SA               ")
  })

  it("imp_total: 121000 → '000000000012100000'", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(104, 119)).toBe("000000012100000")
  })

  it("crédito fiscal computable presente (chars 224-239)", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(224, 239)).toBe("000000002100000")
  })

  it("CUIT corredor vacío → 11 ceros", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(254, 265)).toBe("00000000000")
  })

  it("denominación corredor vacía → 30 espacios", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(265, 295)).toBe(" ".repeat(30))
  })

  it("iva_comision al final (chars 295-310)", () => {
    const row = generateComprasCbteRow(baseInput)
    expect(row.slice(295, 310)).toBe("000000000000000")
  })

  it("USD con cotización 1234.5", () => {
    const row = generateComprasCbteRow({ ...baseInput, moneda: "USD", cotizacion: 1234.5 })
    expect(row.slice(209, 212)).toBe("DOL")
    expect(row.slice(212, 222)).toBe("0012345000")
  })
})
