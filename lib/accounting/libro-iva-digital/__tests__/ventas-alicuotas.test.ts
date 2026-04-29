import { generateVentasAlicuotasRows, type VentaAlicuotaInput } from "../ventas-alicuotas"

describe("generateVentasAlicuotasRows", () => {
  const baseInput: VentaAlicuotaInput = {
    cbte_tipo: "FACTURA_A",
    pto_vta: 1,
    cbte_nro: 45,
    iva_breakdown: { 21: { neto: 100, iva: 21 } },
  }

  it("una alícuota → 1 row de 62 chars", () => {
    const rows = generateVentasAlicuotasRows(baseInput)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(62)
  })

  it("estructura: tipo(3) + ptovta(5) + nro(20) + neto(15) + alic(4) + iva(15)", () => {
    const rows = generateVentasAlicuotasRows(baseInput)
    const row = rows[0]
    expect(row.slice(0, 3)).toBe("001") // FACTURA_A
    expect(row.slice(3, 8)).toBe("00001")
    expect(row.slice(8, 28)).toBe("00000000000000000045")
    expect(row.slice(28, 43)).toBe("000000000010000") // neto 100.00
    expect(row.slice(43, 47)).toBe("2100")            // alícuota 21%
    expect(row.slice(47, 62)).toBe("000000000002100") // iva 21.00
  })

  it("multi-alícuota: 21 + 10.5 → 2 rows", () => {
    const rows = generateVentasAlicuotasRows({
      ...baseInput,
      iva_breakdown: {
        21: { neto: 100, iva: 21 },
        10.5: { neto: 50, iva: 5.25 },
      },
    })
    expect(rows).toHaveLength(2)
  })

  it("alícuotas con monto 0 NO se incluyen (no inflar archivo)", () => {
    const rows = generateVentasAlicuotasRows({
      ...baseInput,
      iva_breakdown: {
        21: { neto: 100, iva: 21 },
        10.5: { neto: 0, iva: 0 },
        27: { neto: 0, iva: 0 },
      },
    })
    expect(rows).toHaveLength(1)
  })

  it("operación sin breakdown (vacío) → 0 rows", () => {
    const rows = generateVentasAlicuotasRows({
      ...baseInput,
      iva_breakdown: {},
    })
    expect(rows).toHaveLength(0)
  })

  it("alícuota 10.5% codificada como 1050", () => {
    const rows = generateVentasAlicuotasRows({
      ...baseInput,
      iva_breakdown: { 10.5: { neto: 100, iva: 10.5 } },
    })
    expect(rows[0].slice(43, 47)).toBe("1050")
  })
})
