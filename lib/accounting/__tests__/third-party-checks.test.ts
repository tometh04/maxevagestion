import {
  puedeTransicionar,
  validarCheque,
  totalesPorMoneda,
  clasificarVencimiento,
  arquearCartera,
  TOLERANCIA_ARQUEO,
} from "../third-party-checks"

describe("ciclo de vida del cheque", () => {
  it("deja depositar, rechazar o endosar un cheque que está en cartera", () => {
    expect(puedeTransicionar("EN_CARTERA", "DEPOSITADO").ok).toBe(true)
    expect(puedeTransicionar("EN_CARTERA", "RECHAZADO").ok).toBe(true)
    expect(puedeTransicionar("EN_CARTERA", "ENDOSADO").ok).toBe(true)
  })

  // El caso que se olvida siempre: lo normal no es que el cheque rebote en la
  // mano sino que lo devuelvan DESPUÉS de depositarlo. Si esto no se permite,
  // la agencia no tiene forma de registrar lo que realmente pasó.
  it("deja rechazar un cheque ya depositado, que es como rebotan de verdad", () => {
    expect(puedeTransicionar("DEPOSITADO", "RECHAZADO").ok).toBe(true)
  })

  it("no deja depositar dos veces el mismo cheque", () => {
    const r = puedeTransicionar("DEPOSITADO", "DEPOSITADO")
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain("ya figura")
  })

  it("trata el rechazo como definitivo y dice qué hacer en su lugar", () => {
    const r = puedeTransicionar("RECHAZADO", "DEPOSITADO")
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain("cheque nuevo")
  })

  it("bloquea revertir un endoso y explica por qué, en vez de fallar seco", () => {
    const r = puedeTransicionar("ENDOSADO", "RECHAZADO")
    expect(r.ok).toBe(false)
    expect(r.motivo).toContain("operador")
  })
})

describe("validación del alta", () => {
  const valido = {
    numero: "00012345",
    banco: "Galicia",
    importe: 150000,
    moneda: "ARS",
    fecha_cobro: "2026-10-15",
  }

  it("acepta un cheque completo", () => {
    expect(validarCheque(valido)).toEqual([])
  })

  it("exige lo que hace falta para reclamarle a alguien", () => {
    const errores = validarCheque({ ...valido, numero: "  ", banco: "" })
    expect(errores).toHaveLength(2)
    expect(errores.join(" ")).toContain("número")
    expect(errores.join(" ")).toContain("banco")
  })

  it("exige la fecha de cobro, que es lo que distingue un cheque de un billete", () => {
    expect(validarCheque({ ...valido, fecha_cobro: null }).join(" ")).toContain("fecha de cobro")
  })

  it("rechaza importes que no son plata", () => {
    expect(validarCheque({ ...valido, importe: 0 }).join(" ")).toContain("mayor a cero")
    expect(validarCheque({ ...valido, importe: -5 }).join(" ")).toContain("mayor a cero")
    expect(validarCheque({ ...valido, importe: null }).join(" ")).toContain("mayor a cero")
  })

  it("no acepta un cheque cobrable antes de emitido", () => {
    const errores = validarCheque({ ...valido, fecha_emision: "2026-11-01", fecha_cobro: "2026-10-15" })
    expect(errores.join(" ")).toContain("anterior a la de emisión")
  })

  it("acepta un cheque de pago diferido: emisión hoy, cobro en 90 días", () => {
    expect(validarCheque({ ...valido, fecha_emision: "2026-09-01", fecha_cobro: "2026-11-30" })).toEqual([])
  })
})

describe("cartera", () => {
  const cheques = [
    { id: "1", importe: 100000, moneda: "ARS", fecha_cobro: "2026-09-10", estado: "EN_CARTERA" as const },
    { id: "2", importe: 50000, moneda: "ARS", fecha_cobro: "2026-09-20", estado: "EN_CARTERA" as const },
    { id: "3", importe: 800, moneda: "USD", fecha_cobro: "2026-09-15", estado: "EN_CARTERA" as const },
  ]

  it("nunca mezcla monedas en un total", () => {
    const totales = totalesPorMoneda(cheques)
    expect(totales).toEqual([
      { moneda: "ARS", cantidad: 2, importe: 150000 },
      { moneda: "USD", cantidad: 1, importe: 800 },
    ])
  })

  it("devuelve vacío sin cheques", () => {
    expect(totalesPorMoneda([])).toEqual([])
  })

  it("marca vencido el cheque cuya fecha de cobro ya pasó", () => {
    expect(clasificarVencimiento("2026-09-01", "2026-09-15")).toBe("VENCIDO")
    expect(clasificarVencimiento("2026-09-15", "2026-09-15")).toBe("AL_DIA")
    expect(clasificarVencimiento("2026-09-30", "2026-09-15")).toBe("A_VENCER")
  })
})

describe("arqueo de cartera", () => {
  const cheques = [
    { id: "1", importe: 100000, moneda: "ARS", fecha_cobro: "2026-09-10", estado: "EN_CARTERA" as const },
    { id: "2", importe: 50000, moneda: "ARS", fecha_cobro: "2026-09-20", estado: "EN_CARTERA" as const },
  ]

  it("cuadra cuando el saldo contable es la suma de los cheques", () => {
    const a = arquearCartera(150000, cheques)
    expect(a.cuadra).toBe(true)
    expect(a.diferencia).toBe(0)
  })

  it("tolera el redondeo de un peso pero no más", () => {
    expect(arquearCartera(150000 + TOLERANCIA_ARQUEO, cheques).cuadra).toBe(true)
    expect(arquearCartera(150000 + TOLERANCIA_ARQUEO + 0.01, cheques).cuadra).toBe(false)
  })

  // El caso real: se borró el pago que originó un cheque. El movimiento
  // desapareció del ledger y el cheque quedó en la tabla.
  it("detecta un cheque sin su movimiento contable", () => {
    const a = arquearCartera(100000, cheques)
    expect(a.cuadra).toBe(false)
    expect(a.diferencia).toBe(-50000)
  })

  it("detecta plata en la cartera sin cheque que la explique", () => {
    const a = arquearCartera(200000, cheques)
    expect(a.cuadra).toBe(false)
    expect(a.diferencia).toBe(50000)
  })

  it("con la cartera vacía el saldo tiene que ser cero", () => {
    expect(arquearCartera(0, []).cuadra).toBe(true)
    expect(arquearCartera(7000, []).cuadra).toBe(false)
  })
})
