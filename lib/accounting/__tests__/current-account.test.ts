/**
 * Cuenta corriente.
 *
 * Lo que se fija acá es que el extracto **explique** el saldo, no que lo
 * repita. Un extracto cuyo último renglón no coincide con la deuda que muestra
 * la ficha del cliente es peor que no tener extracto: le da al contador un
 * número para discutir que no es el que el sistema usa.
 */
import {
  armarCuentaCorriente,
  armarCuentasPorMoneda,
  type MovimientoDeCuenta,
} from "../current-account"

const venta = (monto: number, fecha = "2026-08-01"): MovimientoDeCuenta => ({
  fecha,
  tipo: "VENTA",
  detalle: "Venta de viaje",
  debe: monto,
  haber: 0,
})

const cobro = (monto: number, fecha = "2026-08-10"): MovimientoDeCuenta => ({
  fecha,
  tipo: "COBRO",
  detalle: "Cobro",
  debe: 0,
  haber: monto,
})

describe("el saldo corrido explica el saldo final", () => {
  it("una venta cobrada a medias deja el resto como saldo", () => {
    const c = armarCuentaCorriente([venta(1000), cobro(400)], "USD", "CLIENTE")

    expect(c.renglones.map((r) => r.saldo)).toEqual([1000, 600])
    expect(c.saldoFinal).toBe(600)
  })

  it("el último saldo es siempre Debe menos Haber", () => {
    // Es la propiedad que hace que el extracto sea verificable: cualquiera puede
    // sumar las dos columnas y comprobar el saldo.
    const casos: MovimientoDeCuenta[][] = [
      [venta(1000), cobro(400), cobro(600)],
      [venta(500), venta(300), cobro(100)],
      [cobro(200)],
      [venta(0.01), cobro(0.02)],
    ]
    for (const movs of casos) {
      const c = armarCuentaCorriente(movs, "USD", "CLIENTE")
      expect(c.saldoFinal).toBeCloseTo(c.totalDebe - c.totalHaber, 2)
    }
  })

  it("un cliente que pagó de más queda con saldo negativo", () => {
    // No se clampea en cero: el extracto tiene que mostrar que le debemos.
    const c = armarCuentaCorriente([venta(1000), cobro(1300)], "USD", "CLIENTE")
    expect(c.saldoFinal).toBe(-300)
  })

  it("sin movimientos, el saldo es cero y no rompe", () => {
    const c = armarCuentaCorriente([], "USD", "CLIENTE")
    expect(c.saldoFinal).toBe(0)
    expect(c.renglones).toEqual([])
  })
})

describe("orden de los renglones", () => {
  it("es cronológico", () => {
    const c = armarCuentaCorriente(
      [cobro(400, "2026-08-20"), venta(1000, "2026-08-05")],
      "USD",
      "CLIENTE"
    )
    expect(c.renglones.map((r) => r.fecha)).toEqual(["2026-08-05", "2026-08-20"])
  })

  it("el mismo día, la venta va antes que el cobro", () => {
    // Al revés el saldo pasaría por −400, un negativo que nunca existió y que el
    // cliente vería como que le debíamos plata.
    const c = armarCuentaCorriente(
      [cobro(400, "2026-08-05"), venta(1000, "2026-08-05")],
      "USD",
      "CLIENTE"
    )
    expect(c.renglones.map((r) => r.tipo)).toEqual(["VENTA", "COBRO"])
    expect(c.renglones.map((r) => r.saldo)).toEqual([1000, 600])
  })

  it("dos corridas del mismo extracto dan el mismo orden", () => {
    const movs = [venta(100, "2026-08-05"), venta(200, "2026-08-05")]
    const a = armarCuentaCorriente(movs, "USD", "CLIENTE")
    const b = armarCuentaCorriente([...movs].reverse(), "USD", "CLIENTE")
    expect(a.renglones.map((r) => r.detalle)).toEqual(b.renglones.map((r) => r.detalle))
  })
})

describe("una devolución vuelve a poner al cliente en deuda", () => {
  it("suma al Debe, como la venta", () => {
    // Le devolvimos plata que ya había pagado, así que vuelve a deber.
    const c = armarCuentaCorriente(
      [
        venta(1000),
        cobro(1000, "2026-08-10"),
        {
          fecha: "2026-08-15",
          tipo: "DEVOLUCION",
          detalle: "Devolución por cancelación",
          debe: 300,
          haber: 0,
        },
      ],
      "USD",
      "CLIENTE"
    )
    expect(c.saldoFinal).toBe(300)
  })
})

describe("el operador es el espejo del cliente", () => {
  it("el costo nos pone en deuda y el pago la cancela", () => {
    const c = armarCuentaCorriente(
      [
        { fecha: "2026-08-01", tipo: "COSTO", detalle: "Costo de operador", debe: 0, haber: 700 },
        { fecha: "2026-08-12", tipo: "PAGO", detalle: "Pago a operador", debe: 500, haber: 0 },
      ],
      "USD",
      "OPERADOR"
    )

    // Negativo = le debemos. Es la misma convención que para el cliente, para
    // que un número negativo signifique siempre lo mismo.
    expect(c.renglones.map((r) => r.saldo)).toEqual([-700, -200])
    expect(c.saldoFinal).toBe(-200)
  })
})

describe("una moneda no contamina a la otra", () => {
  it("arma un extracto por moneda", () => {
    const c = armarCuentasPorMoneda(
      [
        { ...venta(1000), currency: "USD" },
        { ...cobro(400), currency: "USD" },
        { ...venta(500_000), currency: "ARS" },
      ],
      "CLIENTE"
    )

    expect(c.map((x) => x.currency)).toEqual(["ARS", "USD"])
    expect(c.find((x) => x.currency === "USD")!.saldoFinal).toBe(600)
    expect(c.find((x) => x.currency === "ARS")!.saldoFinal).toBe(500_000)
  })

  it("sin movimientos devuelve una lista vacía, no un extracto en cero", () => {
    // Un extracto vacío por cada moneda del sistema sería ruido: si no hubo
    // movimientos en pesos, no hay cuenta corriente en pesos que mostrar.
    expect(armarCuentasPorMoneda([], "CLIENTE")).toEqual([])
  })
})
