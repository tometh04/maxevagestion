/**
 * @jest-environment node
 *
 * Totalización de comisiones a referidores.
 *
 * Alimenta dos números que nadie recalcula a mano: la base del impuesto a las
 * ganancias y la "Ganancia Real" del cierre. Un error acá no rompe nada, solo
 * da otro número.
 */
import { cuentaComoCosto, sumarReferidosPorMoneda } from "../referral-totals"

const fila = (over: Record<string, any> = {}) => ({
  operation_id: "op-usd",
  amount: 100,
  status: "PENDING",
  ...over,
})

/** Moneda por operación, como la arman las rutas. */
const monedas: Record<string, "ARS" | "USD"> = { "op-usd": "USD", "op-ars": "ARS" }
const monedaDe = (r: { operation_id?: string }) => monedas[r.operation_id ?? ""]

describe("cuentaComoCosto", () => {
  it("una comisión anulada no es costo", () => {
    expect(cuentaComoCosto("CANCELLED")).toBe(false)
  })

  it("pendiente y pagada sí lo son", () => {
    // Pendiente es plata devengada: no mostrarla es lo que inflaba la ganancia.
    expect(cuentaComoCosto("PENDING")).toBe(true)
    expect(cuentaComoCosto("PAID")).toBe(true)
  })

  it("sin estado se cuenta, no se descarta en silencio", () => {
    expect(cuentaComoCosto(null)).toBe(true)
    expect(cuentaComoCosto(undefined)).toBe(true)
  })
})

describe("sumarReferidosPorMoneda", () => {
  it("separa por la moneda de la operación", () => {
    const t = sumarReferidosPorMoneda(
      [
        fila({ operation_id: "op-usd", amount: 224.11 }),
        fila({ operation_id: "op-ars", amount: 50000 }),
      ],
      monedaDe
    )
    expect(t).toEqual({ usd: 224.11, ars: 50000 })
  })

  it("NO usa la moneda de la propia fila", () => {
    // El invariante: el ingreso y su comisión tienen que caer del mismo lado.
    // Una fila marcada ARS sobre una operación en USD va al balde USD, junto
    // con el margen del que se descuenta.
    const t = sumarReferidosPorMoneda(
      [fila({ operation_id: "op-usd", amount: 100, currency: "ARS" })],
      monedaDe
    )
    expect(t).toEqual({ usd: 100, ars: 0 })
  })

  it("descarta las anuladas", () => {
    const t = sumarReferidosPorMoneda(
      [fila({ amount: 100 }), fila({ amount: 999, status: "CANCELLED" })],
      monedaDe
    )
    expect(t.usd).toBe(100)
  })

  it("una operación sin moneda conocida cae a ARS", () => {
    const t = sumarReferidosPorMoneda([fila({ operation_id: "op-fantasma" })], monedaDe)
    expect(t).toEqual({ ars: 100, usd: 0 })
  })

  it("acumula varias comisiones de la misma moneda", () => {
    const t = sumarReferidosPorMoneda(
      [fila({ amount: 68.59 }), fila({ amount: 68.38 }), fila({ amount: 56.92 })],
      monedaDe
    )
    expect(t.usd).toBeCloseTo(193.89, 2)
  })

  it("sin filas devuelve ceros, no null", () => {
    // Las rutas le pasan directo lo que devuelve PostgREST, que puede ser null.
    const sinMoneda = () => "USD" as const
    expect(sumarReferidosPorMoneda([], monedaDe)).toEqual({ ars: 0, usd: 0 })
    expect(sumarReferidosPorMoneda(null, sinMoneda)).toEqual({ ars: 0, usd: 0 })
    expect(sumarReferidosPorMoneda(undefined, sinMoneda)).toEqual({ ars: 0, usd: 0 })
  })

  it("tolera importes como string o nulos", () => {
    // PostgREST devuelve numeric como string.
    const t = sumarReferidosPorMoneda(
      [fila({ amount: "224.11" }), fila({ amount: null }), fila({ amount: 0 })],
      monedaDe
    )
    expect(t.usd).toBeCloseTo(224.11, 2)
  })

  it("suma un lote realista sin arrastrar error de redondeo", () => {
    // Importes reales de comisiones a Nico Trip (Q3 2026, todas en USD), del
    // orden de magnitud que no se estaba restando de la base imponible. El set
    // es un fixture, no una foto de producción: allá siguen cargándose.
    const importes = [
      68.59, 68.38, 56.92, 28.28, 224.11, 75.9, 106.51, 41.35, 135.86, 133.0, 76.79, 95.94,
      104.72, 54.06, 58.35,
    ]
    const t = sumarReferidosPorMoneda(
      importes.map((amount) => fila({ amount })),
      monedaDe
    )
    expect(t.usd).toBeCloseTo(1328.76, 2)
    expect(t.ars).toBe(0)
  })
})
