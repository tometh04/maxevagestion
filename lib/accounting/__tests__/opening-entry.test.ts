/**
 * Asiento de apertura — VIB-141.
 *
 * El invariante que manda: **el asiento SIEMPRE balancea**. No por casualidad,
 * sino porque Resultados Acumulados absorbe la diferencia por construcción. Si
 * alguna vez no balanceara, el balance de la agencia arrancaría torcido desde el
 * primer día y todo lo que viniera después heredaría el error.
 *
 * El segundo: la diferencia se llama por su nombre. Esconderla en "otros"
 * dejaría al contador sin saber de dónde salió el patrimonio inicial.
 */
import {
  armarAsientoDeApertura,
  saldosDesdeOperativo,
  type SaldoDeApertura,
} from "../opening-entry"

const RESULTADOS = "3.1.03"

const saldo = (codigo: string, monto: number): SaldoDeApertura => ({
  codigo,
  monto,
  detalle: `Saldo ${codigo}`,
})

describe("el asiento de apertura siempre balancea", () => {
  it("con activos solos, la contrapartida es el patrimonio inicial", () => {
    // Una agencia que arranca con plata en caja y nada de deuda: todo eso es
    // resultado que ganó antes de llevar contabilidad.
    const a = armarAsientoDeApertura([saldo("1.1.01", 100_000)], "ARS")!

    expect(a.totalDebe).toBe(a.totalHaber)
    expect(a.resultadosAcumulados).toBe(100_000)

    const contrapartida = a.lineas.find((l) => l.codigo === RESULTADOS)!
    expect(contrapartida.haber).toBe(100_000)
  })

  it("si debe más de lo que tiene, arranca con pérdidas acumuladas", () => {
    // Resultados Acumulados va al Debe. Es una situación real y el asiento no
    // la puede maquillar.
    const a = armarAsientoDeApertura(
      [saldo("1.1.01", 30_000), saldo("2.1.01", -80_000)],
      "ARS"
    )!

    expect(a.totalDebe).toBe(a.totalHaber)
    expect(a.resultadosAcumulados).toBe(-50_000)
    expect(a.lineas.find((l) => l.codigo === RESULTADOS)!.debe).toBe(50_000)
  })

  it("balancea con cualquier combinación de saldos", () => {
    // La propiedad, no un caso: sea cual sea la mezcla, Debe y Haber empatan.
    const combinaciones = [
      [500, -200, 130.55],
      [-1, -1, -1],
      [0.02, -0.03],
      [1_000_000, -999_999.99],
      [7],
    ]
    for (const montos of combinaciones) {
      const a = armarAsientoDeApertura(
        montos.map((m, i) => saldo(`1.1.0${i + 1}`, m)),
        "USD"
      )!
      expect(a.totalDebe).toBeCloseTo(a.totalHaber, 2)
    }
  })

  it("si ya está balanceado, no agrega la contrapartida", () => {
    // Sin diferencia no hay resultado acumulado que declarar, y una línea en
    // cero solo ensuciaría el asiento.
    const a = armarAsientoDeApertura(
      [saldo("1.1.01", 50_000), saldo("2.1.01", -50_000)],
      "ARS"
    )!

    expect(a.resultadosAcumulados).toBe(0)
    expect(a.lineas.find((l) => l.codigo === RESULTADOS)).toBeUndefined()
    expect(a.totalDebe).toBe(50_000)
  })
})

describe("qué se registra y qué no", () => {
  it("una agencia que arranca de cero no necesita apertura", () => {
    // Devolver un asiento vacío ensuciaría el libro con un registro que no
    // dice nada.
    expect(armarAsientoDeApertura([], "ARS")).toBeNull()
    expect(armarAsientoDeApertura([saldo("1.1.01", 0)], "ARS")).toBeNull()
  })

  it("los saldos en cero no generan renglón", () => {
    const a = armarAsientoDeApertura(
      [saldo("1.1.01", 5000), saldo("1.1.02", 0), saldo("1.1.04", 0)],
      "ARS"
    )!
    expect(a.lineas.filter((l) => l.codigo.startsWith("1."))).toHaveLength(1)
  })

  it("hasta un centavo de diferencia se absorbe, para que el asiento cierre", () => {
    // Podría tentar descartarlo por insignificante, pero un asiento de apertura
    // desbalanceado por un centavo deja el balance torcido desde el primer día
    // y todo lo que venga después hereda el error. La materialidad se aplica a
    // los ajustes del cierre, no acá.
    const a = armarAsientoDeApertura(
      [saldo("1.1.01", 1000), saldo("2.1.01", -999.99)],
      "ARS"
    )!
    expect(a.lineas.find((l) => l.codigo === RESULTADOS)!.haber).toBe(0.01)
    expect(a.totalDebe).toBe(a.totalHaber)
  })

  it("una cuenta en descubierto queda del lado acreedor", () => {
    // Es información real: el asiento tiene que decirlo, no esconderlo.
    const a = armarAsientoDeApertura([saldo("1.1.02", -12_000)], "ARS")!
    const banco = a.lineas.find((l) => l.codigo === "1.1.02")!
    expect(banco.haber).toBe(12_000)
    expect(banco.debe).toBe(0)
  })

  it("cada renglón dice qué representa", () => {
    // Un asiento de apertura sin detalle obliga a adivinar de dónde salió cada
    // número.
    const a = armarAsientoDeApertura([saldo("1.1.01", 100)], "ARS")!
    for (const l of a.lineas) expect(l.detalle.length).toBeGreaterThan(0)
  })
})

describe("saldosDesdeOperativo", () => {
  const base = {
    cuentasFinancieras: [{ codigo: "1.1.01", nombre: "Caja ARS", saldo: 250_000 }],
    cuentasPorCobrar: 80_000,
    anticiposDeClientes: 15_000,
    cuentasPorPagar: 120_000,
    anticiposAProveedores: 9_000,
  }

  it("pone cada saldo del lado que le corresponde", () => {
    const s = saldosDesdeOperativo(base)
    const por = (c: string) => s.find((x) => x.codigo === c)!.monto

    // Activos al Debe.
    expect(por("1.1.03")).toBe(80_000)
    expect(por("1.1.06")).toBe(9_000)
    // Pasivos al Haber.
    expect(por("2.1.01")).toBe(-120_000)
    expect(por("2.1.07")).toBe(-15_000)
  })

  it("un signo invertido en el origen no da vuelta el asiento", () => {
    // Las deudas son deudas aunque vengan con signo negativo desde el
    // recolector. Sin esto, una convención de signos distinta convertiría un
    // pasivo en activo.
    const s = saldosDesdeOperativo({ ...base, cuentasPorPagar: -120_000 })
    expect(s.find((x) => x.codigo === "2.1.01")!.monto).toBe(-120_000)
  })

  it("el asiento completo balancea y declara el patrimonio inicial", () => {
    const a = armarAsientoDeApertura(saldosDesdeOperativo(base), "ARS")!
    // 250.000 + 80.000 + 9.000 − 120.000 − 15.000 = 204.000
    expect(a.resultadosAcumulados).toBe(204_000)
    expect(a.totalDebe).toBe(a.totalHaber)
  })

  it("respeta el saldo firmado de las cuentas financieras", () => {
    const s = saldosDesdeOperativo({
      ...base,
      cuentasFinancieras: [{ codigo: "1.1.02", nombre: "Banco", saldo: -5000 }],
    })
    expect(s.find((x) => x.codigo === "1.1.02")!.monto).toBe(-5000)
  })
})
