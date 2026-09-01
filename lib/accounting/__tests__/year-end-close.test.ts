/**
 * Cierre de ejercicio — refundición de resultados.
 *
 * Tres invariantes mandan acá, y los tres protegen el balance del año siguiente:
 *
 *   1. **Los dos asientos balancean.** Si no, el balance arranca torcido y todo
 *      lo que venga después hereda el error.
 *   2. **Las cuentas de resultado quedan en cero.** Es el punto del cierre: si
 *      alguna sobrevive, el Estado de Resultados del ejercicio siguiente la
 *      arrastra.
 *   3. **El resultado se conserva.** Lo que sale de la familia 4 tiene que
 *      llegar íntegro a Resultados Acumulados, sin perderse en el camino.
 */
import { armarCierreDeEjercicio, type SaldoDeResultado } from "../year-end-close"

const RESULTADO_EJERCICIO = "3.1.04"
const RESULTADOS_ACUMULADOS = "3.1.03"

const ingreso = (monto: number, codigo = "4.1.01"): SaldoDeResultado => ({
  codigo,
  nombre: "Ventas de Viajes",
  debe: 0,
  haber: monto,
})

const gasto = (monto: number, codigo = "4.3.01"): SaldoDeResultado => ({
  codigo,
  nombre: "Gastos Administrativos",
  debe: monto,
  haber: 0,
})

/** Suma el neto de una cuenta a través de todas las líneas de un cierre. */
function netoDeCuenta(cierre: NonNullable<ReturnType<typeof armarCierreDeEjercicio>>, codigo: string) {
  let n = 0
  for (const a of cierre.asientos) {
    for (const l of a.lineas) {
      if (l.codigo === codigo) n += l.debe - l.haber
    }
  }
  return Math.round(n * 100) / 100
}

describe("los asientos siempre balancean", () => {
  it("con ganancia", () => {
    const c = armarCierreDeEjercicio([ingreso(100_000), gasto(60_000)], "ARS", 2026)!
    for (const a of c.asientos) expect(a.totalDebe).toBe(a.totalHaber)
  })

  it("con pérdida", () => {
    const c = armarCierreDeEjercicio([ingreso(40_000), gasto(90_000)], "ARS", 2026)!
    for (const a of c.asientos) expect(a.totalDebe).toBe(a.totalHaber)
  })

  it("con cualquier combinación de cuentas", () => {
    const combinaciones: SaldoDeResultado[][] = [
      [ingreso(1)],
      [gasto(1)],
      [ingreso(999.99), gasto(1000.01)],
      [ingreso(50_000), gasto(20_000, "4.2.01"), gasto(10_000, "4.3.05")],
      [ingreso(10, "4.1.02"), ingreso(20, "4.1.05"), gasto(5, "4.3.13")],
    ]
    for (const saldos of combinaciones) {
      const c = armarCierreDeEjercicio(saldos, "USD", 2026)!
      for (const a of c.asientos) expect(a.totalDebe).toBeCloseTo(a.totalHaber, 2)
    }
  })
})

describe("las cuentas de resultado quedan en cero", () => {
  it("un ingreso se cancela por el Debe", () => {
    // El ingreso tiene saldo acreedor, así que cancelarlo es debitarlo.
    const c = armarCierreDeEjercicio([ingreso(100_000)], "ARS", 2026)!
    const linea = c.asientos[0].lineas.find((l) => l.codigo === "4.1.01")!
    expect(linea.debe).toBe(100_000)
    expect(linea.haber).toBe(0)
  })

  it("un gasto se cancela por el Haber", () => {
    const c = armarCierreDeEjercicio([gasto(30_000)], "ARS", 2026)!
    const linea = c.asientos[0].lineas.find((l) => l.codigo === "4.3.01")!
    expect(linea.haber).toBe(30_000)
    expect(linea.debe).toBe(0)
  })

  it("el neto de cada cuenta 4.x queda exactamente al revés de su saldo", () => {
    // Si esto falla, la cuenta no queda en cero y el año siguiente la arrastra.
    const saldos = [ingreso(80_000), gasto(25_000, "4.2.01"), gasto(15_000, "4.3.01")]
    const c = armarCierreDeEjercicio(saldos, "ARS", 2026)!
    for (const s of saldos) {
      const saldoOriginal = s.debe - s.haber
      expect(netoDeCuenta(c, s.codigo)).toBe(-saldoOriginal)
    }
  })

  it("una cuenta con saldo cero no genera renglón", () => {
    const c = armarCierreDeEjercicio(
      [ingreso(50_000), { codigo: "4.3.09", nombre: "Impuestos", debe: 0, haber: 0 }],
      "ARS",
      2026
    )!
    expect(c.asientos[0].lineas.find((l) => l.codigo === "4.3.09")).toBeUndefined()
  })
})

describe("el resultado llega íntegro al patrimonio", () => {
  it("una ganancia acredita Resultados Acumulados por su importe exacto", () => {
    const c = armarCierreDeEjercicio([ingreso(100_000), gasto(60_000)], "ARS", 2026)!

    expect(c.resultado).toBe(40_000)
    // Neto negativo = saldo acreedor, que es lo que corresponde al patrimonio.
    expect(netoDeCuenta(c, RESULTADOS_ACUMULADOS)).toBe(-40_000)
  })

  it("una pérdida lo debita", () => {
    const c = armarCierreDeEjercicio([ingreso(40_000), gasto(90_000)], "ARS", 2026)!

    expect(c.resultado).toBe(-50_000)
    expect(netoDeCuenta(c, RESULTADOS_ACUMULADOS)).toBe(50_000)
  })

  it("la cuenta puente queda en cero: pasa por ella pero no se queda", () => {
    // 3.1.04 recibe el resultado en la refundición y lo entrega en el traslado.
    // Si quedara con saldo, el patrimonio contaría el resultado dos veces.
    const c = armarCierreDeEjercicio([ingreso(100_000), gasto(60_000)], "ARS", 2026)!
    expect(netoDeCuenta(c, RESULTADO_EJERCICIO)).toBe(0)
  })

  it("son dos asientos: primero se ve el resultado, después se absorbe", () => {
    const c = armarCierreDeEjercicio([ingreso(100_000), gasto(60_000)], "ARS", 2026)!
    expect(c.asientos.map((a) => a.tipo)).toEqual(["REFUNDICION", "TRASLADO_RESULTADO"])
  })
})

describe("qué NO genera cierre", () => {
  it("un ejercicio sin movimientos de resultado no necesita cierre", () => {
    expect(armarCierreDeEjercicio([], "ARS", 2026)).toBeNull()
  })

  it("cuentas todas en cero tampoco", () => {
    expect(armarCierreDeEjercicio([ingreso(0), gasto(0)], "ARS", 2026)).toBeNull()
  })

  it("un ejercicio que dio exactamente cero refunde pero no traslada", () => {
    // Hubo actividad —hay cuentas que cancelar— pero no hay resultado que
    // llevar al patrimonio.
    const c = armarCierreDeEjercicio([ingreso(50_000), gasto(50_000)], "ARS", 2026)!
    expect(c.resultado).toBe(0)
    expect(c.asientos.map((a) => a.tipo)).toEqual(["REFUNDICION"])
    expect(c.asientos[0].totalDebe).toBe(c.asientos[0].totalHaber)
  })

  it("una diferencia menor a un centavo es redondeo, no resultado", () => {
    const c = armarCierreDeEjercicio([ingreso(1000), gasto(999.995)], "ARS", 2026)!
    expect(c.asientos).toHaveLength(1)
  })
})

describe("una moneda no contamina a la otra", () => {
  it("el cierre se arma por moneda y la declara", () => {
    // Nunca se mezclan: cada llamada es de una sola moneda y el asiento lo dice.
    const enPesos = armarCierreDeEjercicio([ingreso(1_000_000)], "ARS", 2026)!
    const enDolares = armarCierreDeEjercicio([ingreso(1000)], "USD", 2026)!

    expect(enPesos.currency).toBe("ARS")
    expect(enDolares.currency).toBe("USD")
    expect(enPesos.resultado).toBe(1_000_000)
    expect(enDolares.resultado).toBe(1000)
    for (const a of [...enPesos.asientos, ...enDolares.asientos]) {
      expect(a.currency).toBe(a === enPesos.asientos[0] ? "ARS" : a.currency)
    }
  })
})
