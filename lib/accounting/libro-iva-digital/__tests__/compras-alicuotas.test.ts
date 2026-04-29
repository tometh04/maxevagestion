import {
  generateComprasAlicuotasRows,
  type CompraAlicuotaInput,
} from "../compras-alicuotas"

describe("generateComprasAlicuotasRows", () => {
  const baseInput: CompraAlicuotaInput = {
    cbte_tipo: "FACTURA_A",
    pto_vta: 1,
    cbte_nro: 99,
    emitter_cuit: "20362014949",
    iva_breakdown: { 21: { neto: 100000, iva: 21000 } },
  }

  it("una alícuota → 1 row de 73 chars", () => {
    const rows = generateComprasAlicuotasRows(baseInput)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(73)
  })

  it("estructura: tipo(3) + ptovta(5) + nro(20) + cuit(11) + neto(15) + alic(4) + iva(15)", () => {
    const rows = generateComprasAlicuotasRows(baseInput)
    const row = rows[0]
    expect(row.slice(0, 3)).toBe("001")
    expect(row.slice(3, 8)).toBe("00001")
    expect(row.slice(8, 28)).toBe("00000000000000000099")
    expect(row.slice(28, 39)).toBe("20362014949")
    expect(row.slice(39, 54)).toBe("000000010000000") // 100000.00
    expect(row.slice(54, 58)).toBe("2100")
    expect(row.slice(58, 73)).toBe("000000002100000") // 21000.00
  })

  it("multi-alícuota: 21 + 10.5 → 2 rows", () => {
    const rows = generateComprasAlicuotasRows({
      ...baseInput,
      iva_breakdown: {
        21: { neto: 100, iva: 21 },
        10.5: { neto: 50, iva: 5.25 },
      },
    })
    expect(rows).toHaveLength(2)
  })

  it("alícuotas con monto 0 NO se incluyen", () => {
    const rows = generateComprasAlicuotasRows({
      ...baseInput,
      iva_breakdown: {
        21: { neto: 100, iva: 21 },
        10.5: { neto: 0, iva: 0 },
      },
    })
    expect(rows).toHaveLength(1)
  })

  it("CUIT con guiones se limpia", () => {
    const rows = generateComprasAlicuotasRows({
      ...baseInput,
      emitter_cuit: "20-36201494-9",
    })
    expect(rows[0].slice(28, 39)).toBe("20362014949")
  })

  it("CUIT vacío → 11 ceros", () => {
    const rows = generateComprasAlicuotasRows({
      ...baseInput,
      emitter_cuit: null,
    })
    expect(rows[0].slice(28, 39)).toBe("00000000000")
  })
})
