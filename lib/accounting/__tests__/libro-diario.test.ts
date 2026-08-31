/**
 * Libro Diario.
 *
 * Un Libro Diario tiene requisitos formales, no estéticos: orden cronológico
 * estricto, numeración correlativa sin huecos, y sin alteraciones. Los tests
 * fijan justamente eso, porque son las condiciones que lo hacen válido como
 * libro y no como listado.
 */
import { armarLibroDiario, tamañoDelLibro, type AsientoCrudo } from "../libro-diario"

const asiento = (over: Partial<AsientoCrudo> = {}): AsientoCrudo => ({
  id: "e1",
  entry_date: "2026-08-10",
  description: "Venta",
  currency: "USD",
  entry_number: 100,
  lineas: [
    {
      account_code: "1.1.03",
      account_name: "Cuentas por Cobrar",
      debit_amount: 1000,
      credit_amount: null,
      concept: null,
    },
    {
      account_code: "4.1.01",
      account_name: "Ventas",
      debit_amount: null,
      credit_amount: 1000,
      concept: null,
    },
  ],
  ...over,
})

describe("orden cronológico estricto", () => {
  it("ordena por fecha aunque vengan al revés", () => {
    const libro = armarLibroDiario(
      [
        asiento({ id: "b", entry_date: "2026-08-20" }),
        asiento({ id: "a", entry_date: "2026-08-05" }),
      ],
      "2026-08-01",
      "2026-08-31"
    )
    expect(libro.asientos.map((a) => a.fecha)).toEqual(["2026-08-05", "2026-08-20"])
  })

  it("dentro del mismo día, por el correlativo de la base", () => {
    const libro = armarLibroDiario(
      [
        asiento({ id: "b", entry_number: 200 }),
        asiento({ id: "a", entry_number: 100 }),
      ],
      "2026-08-01",
      "2026-08-31"
    )
    expect(libro.asientos.map((a) => a.numero)).toEqual([1, 2])
    expect(libro.asientos[0].descripcion).toBe("Venta")
  })

  it("dos corridas del mismo libro dan el mismo orden", () => {
    // Un libro que cambia entre impresiones no es un libro. Con fecha y
    // correlativo iguales, desempata el id.
    const crudos = [
      asiento({ id: "zzz", entry_number: 100 }),
      asiento({ id: "aaa", entry_number: 100 }),
    ]
    const a = armarLibroDiario(crudos, "2026-08-01", "2026-08-31")
    const b = armarLibroDiario([...crudos].reverse(), "2026-08-01", "2026-08-31")
    expect(a.asientos.map((x) => x.numero)).toEqual(b.asientos.map((x) => x.numero))
  })
})

describe("numeración del libro", () => {
  it("arranca en 1 y no tiene huecos", () => {
    // El correlativo de la base es global de la organización: un libro de un mes
    // empezaría en 8.431 y saltearía los asientos de otra agencia. El libro se
    // numera desde 1 dentro de sí mismo.
    const libro = armarLibroDiario(
      [
        asiento({ id: "a", entry_number: 8431 }),
        asiento({ id: "b", entry_number: 9002 }),
        asiento({ id: "c", entry_number: 9500 }),
      ],
      "2026-08-01",
      "2026-08-31"
    )
    expect(libro.asientos.map((a) => a.numero)).toEqual([1, 2, 3])
  })
})

describe("las líneas se leen como un asiento", () => {
  it("el Debe va antes que el Haber", () => {
    const libro = armarLibroDiario(
      [
        asiento({
          lineas: [
            { account_code: "4.1.01", account_name: "Ventas", debit_amount: null, credit_amount: 1000, concept: null },
            { account_code: "1.1.03", account_name: "CxC", debit_amount: 1000, credit_amount: null, concept: null },
          ],
        }),
      ],
      "2026-08-01",
      "2026-08-31"
    )
    expect(libro.asientos[0].lineas.map((l) => l.account_code)).toEqual(["1.1.03", "4.1.01"])
  })

  it("una línea sin concepto propio hereda el del asiento", () => {
    const libro = armarLibroDiario([asiento({ description: "Cobro cliente" })], "2026-08-01", "2026-08-31")
    expect(libro.asientos[0].lineas[0].concepto).toBe("Cobro cliente")
  })
})

describe("totales", () => {
  it("por asiento, Debe y Haber coinciden", () => {
    const libro = armarLibroDiario([asiento()], "2026-08-01", "2026-08-31")
    expect(libro.asientos[0].totalDebe).toBe(1000)
    expect(libro.asientos[0].totalHaber).toBe(1000)
    expect(libro.asientos[0].descuadrado).toBe(false)
  })

  it("los totales del libro van por moneda, nunca sumadas", () => {
    // Sumar pesos con dólares daría un número que parece un total y no lo es.
    const libro = armarLibroDiario(
      [asiento({ id: "a", currency: "USD" }), asiento({ id: "b", currency: "ARS" })],
      "2026-08-01",
      "2026-08-31"
    )
    expect(libro.totalesPorMoneda).toEqual({
      USD: { debe: 1000, haber: 1000 },
      ARS: { debe: 1000, haber: 1000 },
    })
  })

  it("un asiento descuadrado se marca y se cuenta, no se corrige", () => {
    // Hay 926 asientos de una sola línea en producción. El libro los muestra
    // como están: alterar un asiento para que cuadre es exactamente lo que un
    // libro contable no puede hacer.
    const libro = armarLibroDiario(
      [
        asiento({
          lineas: [
            { account_code: "1.1.01", account_name: "Caja", debit_amount: 500, credit_amount: null, concept: null },
          ],
        }),
      ],
      "2026-08-01",
      "2026-08-31"
    )
    expect(libro.asientos[0].descuadrado).toBe(true)
    expect(libro.descuadrados).toBe(1)
    expect(libro.asientos[0].totalDebe).toBe(500)
    expect(libro.asientos[0].totalHaber).toBe(0)
  })
})

describe("tamañoDelLibro", () => {
  it("cuenta asientos y líneas", () => {
    // Sirve para decidir si el PDF se genera en el request: un mes ronda los
    // 1.600 asientos y un ejercicio entero llega a 19.000.
    const libro = armarLibroDiario([asiento({ id: "a" }), asiento({ id: "b" })], "2026-08-01", "2026-08-31")
    expect(tamañoDelLibro(libro)).toEqual({ asientos: 2, lineas: 4 })
  })

  it("un libro vacío no rompe", () => {
    const libro = armarLibroDiario([], "2026-08-01", "2026-08-31")
    expect(tamañoDelLibro(libro)).toEqual({ asientos: 0, lineas: 0 })
    expect(libro.totalesPorMoneda).toEqual({})
  })
})

describe("encabezados sin líneas", () => {
  // El caso real: 158 asientos vacíos en producción, resto de pagos borrados.
  // En Compañía de Viajes uno de ellos hacía que el libro saltara del 41 al 43.
  it("no los numera, así la correlatividad no queda con huecos", () => {
    const libro = armarLibroDiario(
      [
        asiento({ id: "a", entry_date: "2026-08-10" }),
        asiento({ id: "b", entry_date: "2026-08-11", lineas: [] }),
        asiento({ id: "c", entry_date: "2026-08-12" }),
      ],
      "2026-08-01",
      "2026-08-31"
    )

    expect(libro.asientos.map((a) => a.numero)).toEqual([1, 2])
    expect(libro.asientos.map((a) => a.fecha)).toEqual(["2026-08-10", "2026-08-12"])
  })

  it("los cuenta en vez de esconderlos: un encabezado huérfano hay que ir a mirarlo", () => {
    const libro = armarLibroDiario(
      [asiento({ id: "a" }), asiento({ id: "b", lineas: [] }), asiento({ id: "c", lineas: [] })],
      "2026-08-01",
      "2026-08-31"
    )
    expect(libro.vacios).toBe(2)
  })

  it("no los toma como descuadrados: no tienen Debe ni Haber que comparar", () => {
    const libro = armarLibroDiario(
      [asiento({ id: "a", lineas: [] })],
      "2026-08-01",
      "2026-08-31"
    )
    expect(libro.descuadrados).toBe(0)
    expect(libro.asientos).toHaveLength(0)
  })

  it("no ensucia los totales por moneda", () => {
    const libro = armarLibroDiario(
      [asiento({ id: "a" }), asiento({ id: "b", lineas: [] })],
      "2026-08-01",
      "2026-08-31"
    )
    expect(libro.totalesPorMoneda.USD).toEqual({ debe: 1000, haber: 1000 })
  })
})
