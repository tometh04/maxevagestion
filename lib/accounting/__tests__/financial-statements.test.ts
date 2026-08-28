/**
 * Estado de Resultados y Balance — VIB-143 (E2).
 *
 * Lo que más importa acá no es que las sumas den bien: es que el estado NUNCA
 * muestre un número inventado. Si falta la cotización de un mes, esas líneas
 * tienen que quedar afuera y avisarse, no valuarse con la cotización de otro
 * mes ni con cero. Un balance con un mes mal valuado es peor que uno que dice
 * que le falta un dato.
 */
import {
  armarBalance,
  armarEstadoDeResultados,
  convertir,
  mesDe,
  type LineaContable,
} from "../financial-statements"

const linea = (over: Partial<LineaContable> = {}): LineaContable => ({
  account_code: "4.1.01",
  account_name: "Ventas de Viajes",
  category: "RESULTADO",
  currency: "USD",
  debit: 0,
  credit: 0,
  movement_date: "2026-09-15",
  ...over,
})

const COTIZ = { "2026-09": 1520 }

describe("convertir", () => {
  it("no toca el importe si ya está en la moneda de presentación", () => {
    expect(convertir(100, "USD", "USD", undefined)).toBe(100)
  })

  it("pasa de pesos a dólares dividiendo por la cotización", () => {
    expect(convertir(152000, "ARS", "USD", 1520)).toBe(100)
  })

  it("pasa de dólares a pesos multiplicando", () => {
    expect(convertir(100, "USD", "ARS", 1520)).toBe(152000)
  })

  it("devuelve null si falta la cotización, no cero", () => {
    // Un cero acá haría desaparecer plata del estado sin que nadie se entere.
    expect(convertir(100, "ARS", "USD", undefined)).toBeNull()
    expect(convertir(100, "ARS", "USD", 0)).toBeNull()
  })

  it("un importe cero no necesita cotización", () => {
    expect(convertir(0, "ARS", "USD", undefined)).toBe(0)
  })

  it("mesDe recorta la fecha al mes", () => {
    expect(mesDe("2026-09-15")).toBe("2026-09")
  })
})

describe("armarEstadoDeResultados", () => {
  const lineas: LineaContable[] = [
    linea({ account_code: "4.1.01", credit: 1000 }),
    linea({ account_code: "4.2.01", account_name: "Costo de Operadores", debit: 700 }),
    linea({
      account_code: "4.3.01",
      account_name: "Gastos Administrativos",
      currency: "ARS",
      debit: 152000,
    }),
  ]

  it("calcula el resultado convirtiendo todo a una moneda", () => {
    const r = armarEstadoDeResultados(lineas, COTIZ, "USD")

    expect(r.totalIngresos).toBe(1000)
    expect(r.totalCostos).toBe(700)
    // 152.000 pesos a 1520 = 100 dólares
    expect(r.totalGastos).toBe(100)
    expect(r.resultado).toBe(200)
    expect(r.currency).toBe("USD")
  })

  it("funciona igual con una agencia que lleva todo en pesos", () => {
    // No es otra implementación: es la misma con el signo dado vuelta.
    const r = armarEstadoDeResultados(lineas, COTIZ, "ARS")

    expect(r.totalIngresos).toBe(1_520_000)
    expect(r.totalCostos).toBe(1_064_000)
    expect(r.totalGastos).toBe(152_000)
    expect(r.resultado).toBe(304_000)
  })

  it("los ingresos restan el Debe (una nota de crédito baja la venta)", () => {
    const conNota = [...lineas, linea({ account_code: "4.1.01", debit: 200 })]
    expect(armarEstadoDeResultados(conNota, COTIZ, "USD").totalIngresos).toBe(800)
  })

  it("agrupa por cuenta en vez de repetir renglones", () => {
    const dos = [linea({ credit: 600 }), linea({ credit: 400 })]
    const r = armarEstadoDeResultados(dos, COTIZ, "USD")
    expect(r.ingresos).toHaveLength(1)
    expect(r.ingresos[0].amount).toBe(1000)
  })

  it("deja afuera lo que no puede valuar y lo reporta", () => {
    const conMesSinCotizacion = [
      ...lineas,
      linea({
        account_code: "4.3.01",
        currency: "ARS",
        debit: 999_999,
        movement_date: "2026-10-05",
      }),
    ]

    const r = armarEstadoDeResultados(conMesSinCotizacion, COTIZ, "USD")

    // El gasto de octubre NO entra al total...
    expect(r.totalGastos).toBe(100)
    // ...pero se avisa, con el mes y cuántas líneas.
    expect(r.sinCotizacion).toEqual([{ mes: "2026-10", lineas: 1 }])
  })

  it("no necesita cotización para líneas que ya están en la moneda destino", () => {
    const soloUsd = [linea({ credit: 1000, movement_date: "2027-01-01" })]
    const r = armarEstadoDeResultados(soloUsd, {}, "USD")
    expect(r.totalIngresos).toBe(1000)
    expect(r.sinCotizacion).toHaveLength(0)
  })
})

describe("armarBalance", () => {
  const lineas: LineaContable[] = [
    linea({ account_code: "1.1.02", account_name: "Bancos", category: "ACTIVO", debit: 5000 }),
    linea({
      account_code: "1.1.03",
      account_name: "Cuentas por Cobrar",
      category: "ACTIVO",
      debit: 3000,
    }),
    linea({
      account_code: "2.1.01",
      account_name: "Cuentas por Pagar",
      category: "PASIVO",
      credit: 2000,
    }),
    linea({
      account_code: "3.1.01",
      account_name: "Capital Social",
      category: "PATRIMONIO_NETO",
      credit: 6000,
    }),
  ]

  it("arma los tres grupos con su naturaleza", () => {
    const b = armarBalance(lineas, COTIZ, "USD")
    expect(b.totalActivo).toBe(8000)
    expect(b.totalPasivo).toBe(2000)
    expect(b.totalPatrimonio).toBe(6000)
  })

  it("expone el descuadre en vez de esconderlo", () => {
    // Mientras la cobertura contable no sea total el balance NO cierra, y
    // taparlo sería mentir. Acá cierra porque el ejemplo está completo.
    expect(armarBalance(lineas, COTIZ, "USD").descuadre).toBe(0)

    const incompleto = lineas.slice(0, 3)
    expect(armarBalance(incompleto, COTIZ, "USD").descuadre).toBe(6000)
  })

  it("el activo resta el Haber (un cobro baja la cuenta por cobrar)", () => {
    const conCobro = [
      ...lineas,
      linea({ account_code: "1.1.03", category: "ACTIVO", credit: 1000 }),
    ]
    const b = armarBalance(conCobro, COTIZ, "USD")
    expect(b.activo.find((r) => r.account_code === "1.1.03")?.amount).toBe(2000)
  })

  it("no muestra renglones en cero", () => {
    const seCancela = [
      linea({ account_code: "1.1.02", category: "ACTIVO", debit: 500 }),
      linea({ account_code: "1.1.02", category: "ACTIVO", credit: 500 }),
    ]
    expect(armarBalance(seCancela, COTIZ, "USD").activo).toHaveLength(0)
  })
})
