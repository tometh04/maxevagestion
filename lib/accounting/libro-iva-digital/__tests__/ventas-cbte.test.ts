import { generateVentasCbteRow, type VentaInput } from "../ventas-cbte"

describe("generateVentasCbteRow", () => {
  const baseInput: VentaInput = {
    issue_date: "2026-04-25",
    cbte_tipo: 1, // Factura A
    pto_vta: 1,
    cbte_nro: 45,
    receptor_doc_tipo: 80, // CUIT
    receptor_doc_nro: "20362014949",
    receptor_nombre: "MAXI VIAJES SRL",
    imp_total: 121,
    imp_tot_conc: 0,
    imp_op_ex: 0,
    imp_iva: 21,
    perc_iva: 0,
    perc_iibb: 0,
    perc_municipales: 0,
    imp_internos: 0,
    moneda: "ARS",
    cotizacion: 1,
    cantidad_alicuotas: 1,
    codigo_operacion: " ",
    otros_tributos: 0,
    fecha_vto_pago: null,
  }

  it("largo total = 266 chars", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row).toHaveLength(266)
  })

  it("primeros 8 chars = fecha YYYYMMDD", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(0, 8)).toBe("20260425")
  })

  it("chars 8-11 = cbte_tipo zero-padded a 3", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(8, 11)).toBe("001")
  })

  it("chars 11-16 = pto_vta zero-padded a 5", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(11, 16)).toBe("00001")
  })

  it("chars 16-36 = cbte_nro zero-padded a 20", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(16, 36)).toBe("00000000000000000045")
  })

  it("chars 36-56 = cbte_nro_hasta (igual a desde para facturas electrónicas)", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(36, 56)).toBe("00000000000000000045")
  })

  it("chars 56-58 = doc_tipo (80 = CUIT)", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(56, 58)).toBe("80")
  })

  it("chars 58-78 = doc_nro padded a 20", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(58, 78)).toBe("000000000020362014949".slice(-20))
  })

  it("chars 78-108 = nombre padded a 30 (right-pad space)", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(78, 108)).toBe("MAXI VIAJES SRL               ")
  })

  it("imp_total a 15 chars sin punto: 121 → '000000000012100'", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(108, 123)).toBe("000000000012100")
  })

  it("nota de crédito (negativo) preserva signo", () => {
    const row = generateVentasCbteRow({ ...baseInput, imp_total: -121 })
    expect(row.slice(108, 123)).toBe("-00000000012100")
  })

  it("moneda y cotización en posiciones correctas (chars 213-216 PES + 216-226 cotización)", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(213, 216)).toBe("PES")
    expect(row.slice(216, 226)).toBe("0000010000") // 1.0 * 10000
  })

  it("USD con cotización 1234.5 → DOL + 0012345000", () => {
    const row = generateVentasCbteRow({ ...baseInput, moneda: "USD", cotizacion: 1234.5 })
    expect(row.slice(213, 216)).toBe("DOL")
    expect(row.slice(216, 226)).toBe("0012345000")
  })

  it("cantidad_alicuotas (1 char) y codigo_operacion (1 char)", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(226, 227)).toBe("1")
    expect(row.slice(227, 228)).toBe(" ")
  })

  it("fecha_vto_pago null → 00000000", () => {
    const row = generateVentasCbteRow(baseInput)
    expect(row.slice(258, 266)).toBe("00000000")
  })

  it("fecha_vto_pago presente → AAAAMMDD", () => {
    const row = generateVentasCbteRow({ ...baseInput, fecha_vto_pago: "2026-05-15" })
    expect(row.slice(258, 266)).toBe("20260515")
  })

  it("nombre con acentos truncado a 30 chars sin romper UTF-8", () => {
    const row = generateVentasCbteRow({
      ...baseInput,
      receptor_nombre: "JUAN PÉREZ DE LA CONSTRUCCIÓN SOCIEDAD",
    })
    // Solo verificamos que el row tenga el largo correcto
    expect(row).toHaveLength(266)
    expect(row.slice(78, 108).length).toBe(30)
  })
})
