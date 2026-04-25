import {
  padNumber,
  padString,
  formatDate,
  formatMoney,
  formatExchangeRate,
  formatRate,
  cuitClean,
  CBTE_TIPO,
  DOC_TIPO,
  MONEDA_CODE,
} from "../format"

describe("padNumber", () => {
  it("zero-pad a la izquierda con largo fijo", () => {
    expect(padNumber(45, 8)).toBe("00000045")
    expect(padNumber(0, 5)).toBe("00000")
  })
  it("trunca si excede el largo (toma últimos N dígitos)", () => {
    expect(padNumber(123456789, 5)).toBe("56789")
  })
})

describe("padString", () => {
  it("space-pad a la derecha con largo fijo", () => {
    expect(padString("AB", 5)).toBe("AB   ")
  })
  it("trunca si excede el largo (toma primeros N chars)", () => {
    expect(padString("ABCDEFGH", 4)).toBe("ABCD")
  })
  it("convierte null/undefined en string vacío padded", () => {
    expect(padString(null, 3)).toBe("   ")
    expect(padString(undefined, 3)).toBe("   ")
  })
})

describe("formatDate", () => {
  it("ISO date YYYY-MM-DD → AAAAMMDD", () => {
    expect(formatDate("2026-04-25")).toBe("20260425")
  })
  it("ISO datetime con T → AAAAMMDD", () => {
    expect(formatDate("2026-04-25T15:30:00Z")).toBe("20260425")
  })
  it("vacío/null → 00000000", () => {
    expect(formatDate(null)).toBe("00000000")
    expect(formatDate("")).toBe("00000000")
  })
})

describe("formatMoney", () => {
  it("12345.67 con largo 15 → '000000001234567' (sin punto, 2 decimales)", () => {
    expect(formatMoney(12345.67, 15)).toBe("000000001234567")
  })
  it("0 → '000000000000000'", () => {
    expect(formatMoney(0, 15)).toBe("000000000000000")
  })
  it("monto negativo (NC) preserva signo y reduce padding", () => {
    expect(formatMoney(-100, 15)).toBe("-00000000010000")
  })
  it("redondea a 2 decimales", () => {
    expect(formatMoney(0.555, 15)).toBe("000000000000056")
  })
})

describe("formatExchangeRate", () => {
  it("1.0 con largo 10 → '0000010000' (4 decimales sin punto, zero-pad izq)", () => {
    expect(formatExchangeRate(1)).toBe("0000010000")
  })
  it("1234.5 → '0012345000'", () => {
    expect(formatExchangeRate(1234.5)).toBe("0012345000")
  })
  it("0.5 → '0000005000'", () => {
    expect(formatExchangeRate(0.5)).toBe("0000005000")
  })
})

describe("formatRate", () => {
  it("21% → '2100' (4 chars, alícuota AFIP code)", () => {
    expect(formatRate(21)).toBe("2100")
  })
  it("10.5% → '1050'", () => {
    expect(formatRate(10.5)).toBe("1050")
  })
  it("27% → '2700'", () => {
    expect(formatRate(27)).toBe("2700")
  })
  it("5% → '0500'", () => {
    expect(formatRate(5)).toBe("0500")
  })
  it("2.5% → '0250'", () => {
    expect(formatRate(2.5)).toBe("0250")
  })
})

describe("cuitClean", () => {
  it("quita guiones y espacios", () => {
    expect(cuitClean("20-36201494-9")).toBe("20362014949")
    expect(cuitClean("20 36201494 9")).toBe("20362014949")
  })
  it("ya limpio queda igual", () => {
    expect(cuitClean("20362014949")).toBe("20362014949")
  })
  it("null/empty → ''", () => {
    expect(cuitClean(null)).toBe("")
    expect(cuitClean("")).toBe("")
  })
})

describe("CBTE_TIPO map", () => {
  it("FACTURA_A → 001", () => expect(CBTE_TIPO("FACTURA_A")).toBe("001"))
  it("FACTURA_B → 006", () => expect(CBTE_TIPO("FACTURA_B")).toBe("006"))
  it("FACTURA_C → 011", () => expect(CBTE_TIPO("FACTURA_C")).toBe("011"))
  it("NOTA_CREDITO_A → 003", () => expect(CBTE_TIPO("NOTA_CREDITO_A")).toBe("003"))
  it("NOTA_DEBITO_A → 002", () => expect(CBTE_TIPO("NOTA_DEBITO_A")).toBe("002"))
  it("número directo (ej 1) → '001'", () => expect(CBTE_TIPO(1)).toBe("001"))
  it("desconocido → '000'", () => expect(CBTE_TIPO("FOO")).toBe("000"))
})

describe("DOC_TIPO map", () => {
  it("CUIT (80) → '80'", () => expect(DOC_TIPO(80)).toBe("80"))
  it("DNI (96) → '96'", () => expect(DOC_TIPO(96)).toBe("96"))
  it("default consumidor final (99) → '99'", () => expect(DOC_TIPO(99)).toBe("99"))
  it("null/0 → '99' (consumidor final)", () => {
    expect(DOC_TIPO(null)).toBe("99")
    expect(DOC_TIPO(0)).toBe("99")
  })
})

describe("MONEDA_CODE map", () => {
  it("ARS → PES", () => expect(MONEDA_CODE("ARS")).toBe("PES"))
  it("USD → DOL", () => expect(MONEDA_CODE("USD")).toBe("DOL"))
  it("default → PES", () => expect(MONEDA_CODE(null)).toBe("PES"))
})
