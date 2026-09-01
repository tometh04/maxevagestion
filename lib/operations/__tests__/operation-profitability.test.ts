/**
 * @jest-environment node
 *
 * Rentabilidad de una operación.
 *
 * El número que sale de acá se muestra rotulado "Ganancia Neta" en el detalle
 * de la operación, así que lo que hay que fijar no es solo la aritmética: es
 * que NUNCA muestre como ganancia plata que ya está comprometida con alguien.
 */
import { calcularRentabilidad } from "../operation-profitability"

const base = {
  saleAmount: 10000,
  operatorCost: 8000,
  currency: "USD",
  commissionPercent: 15,
}

const referido = (over: Record<string, any> = {}) => ({
  amount: 224.11,
  currency: "USD",
  status: "PENDING",
  partnerName: "Nico Trip",
  ...over,
})

describe("calcularRentabilidad", () => {
  it("resta la comisión del vendedor y la del referidor", () => {
    // El caso que reportó Lozada: antes solo restaba al vendedor.
    const r = calcularRentabilidad({ ...base, referralCommission: referido() })
    expect(r.margen).toBe(2000)
    expect(r.comisionVendedor).toBe(300)
    expect(r.comisionReferidor).toBe(224.11)
    expect(r.ganancia).toBeCloseTo(2000 - 300 - 224.11, 2)
  })

  it("sin referidor da la misma ganancia que antes del fix", () => {
    // No-regresión: las operaciones sin referido no cambian de número.
    const r = calcularRentabilidad(base)
    expect(r.comisionReferidor).toBe(0)
    expect(r.ganancia).toBe(1700)
  })

  it("sin comisión calculada no inventa un porcentaje", () => {
    // Antes caía a 10% y descontaba una comisión inexistente: la pantalla
    // mostraba 1.800 de "ganancia neta" donde no había ninguna comisión.
    const r = calcularRentabilidad({ ...base, commissionPercent: null })
    expect(r.comisionVendedor).toBe(0)
    expect(r.ganancia).toBe(2000)
  })

  it("no descuenta una comisión de referidor anulada", () => {
    const r = calcularRentabilidad({
      ...base,
      referralCommission: referido({ status: "CANCELLED" }),
    })
    expect(r.comisionReferidor).toBe(0)
    expect(r.ganancia).toBe(1700)
  })

  it("descuenta la del referidor aunque todavía no esté pagada", () => {
    // Pendiente es plata comprometida: mostrarla como ganancia es el bug.
    const pendiente = calcularRentabilidad({ ...base, referralCommission: referido() })
    const pagada = calcularRentabilidad({
      ...base,
      referralCommission: referido({ status: "PAID" }),
    })
    expect(pendiente.ganancia).toBeCloseTo(pagada.ganancia, 2)
  })

  it("avisa en vez de restar cuando el referidor está en otra moneda", () => {
    // Convertir acá exigiría un TC que esta pantalla no tiene. Un número mal
    // convertido es peor que un aviso.
    const r = calcularRentabilidad({
      ...base,
      referralCommission: referido({ currency: "ARS", amount: 300000 }),
    })
    expect(r.comisionReferidor).toBe(0)
    expect(r.referidorEnOtraMoneda).toBe(true)
    expect(r.referidorNombre).toBe("Nico Trip")
  })

  it("no marca aviso de moneda si no hay referidor", () => {
    expect(calcularRentabilidad(base).referidorEnOtraMoneda).toBe(false)
  })

  it("suma los servicios de la misma moneda y deja afuera los de otra", () => {
    const r = calcularRentabilidad({
      ...base,
      commissionPercent: 0,
      servicios: [
        {
          sale_amount: 500,
          cost_amount: 300,
          sale_currency: "USD",
          cost_currency: "USD",
          generates_commission: false,
        },
        {
          sale_amount: 900000,
          cost_amount: 700000,
          sale_currency: "ARS",
          cost_currency: "ARS",
          generates_commission: false,
        },
      ],
    })
    expect(r.venta).toBe(10500)
    expect(r.margen).toBe(2200)
  })

  it("los servicios que generan comisión la suman a la del vendedor", () => {
    const r = calcularRentabilidad({
      ...base,
      servicios: [
        {
          sale_amount: 500,
          cost_amount: 300,
          sale_currency: "USD",
          cost_currency: "USD",
          generates_commission: true,
        },
      ],
    })
    expect(r.comisionVendedor).toBeCloseTo(300 + 200 * 0.15, 2)
  })

  it("una operación sin venta no divide por cero", () => {
    const r = calcularRentabilidad({
      saleAmount: 0,
      operatorCost: 0,
      currency: "USD",
      commissionPercent: null,
    })
    expect(r.margenPct).toBe(0)
    expect(r.gananciaPct).toBe(0)
  })

  it("la ganancia puede ser negativa y no se clampea", () => {
    // Un mes con pérdida es información; mostrarlo en cero lo haría parecer
    // un empate.
    const r = calcularRentabilidad({
      saleAmount: 1000,
      operatorCost: 950,
      currency: "USD",
      commissionPercent: 15,
      referralCommission: referido({ amount: 100 }),
    })
    expect(r.ganancia).toBeLessThan(0)
  })

  it("reproduce la operación real de Lozada que motivó el fix", () => {
    // OP-20260804-BC5FB23C: venta 10.555, costo 9.337,12, margen 1.217,88.
    // Vendedor 168,08 y Nico Trip 224,11 → quedan 825,69.
    const r = calcularRentabilidad({
      saleAmount: 10555,
      operatorCost: 9337.12,
      currency: "USD",
      // 168,08 sobre un margen de 1.217,88 es 13,8% (la base va neta de IVA).
      commissionPercent: 13.8,
      referralCommission: referido({ amount: 224.11, status: "PAID" }),
    })
    expect(r.margen).toBeCloseTo(1217.88, 2)
    expect(r.comisionVendedor).toBeCloseTo(168.07, 1)
    expect(r.ganancia).toBeCloseTo(825.7, 1)
  })
})
