/**
 * Cuentas de orden — VIB-140 (C2 y C3).
 *
 * Lo que más importa fijar acá es que una cuenta de orden NO puede tocar el
 * Activo, el Pasivo ni el Resultado: si lo hiciera, estaría duplicando algo que
 * ya está registrado. El pasivo con el operador ya vive en Cuentas por Pagar y
 * el ingreso ya está en Ventas: la cuenta de orden informa que falta el
 * comprobante, no vuelve a registrar el hecho.
 */
import {
  calcularFacturaARecibir,
  calcularVentaSinFacturar,
  CUENTAS_DE_ORDEN,
  lineasDeOrden,
} from "../order-accounts"

describe("calcularVentaSinFacturar (C2)", () => {
  it("detecta lo vendido que todavía no se facturó", () => {
    expect(calcularVentaSinFacturar({ ventaDevengada: 1000, facturado: 400 })).toEqual({
      monto: 600,
      tipo: "VENTA_SIN_FACTURAR",
    })
  })

  it("no hay pendiente si ya se facturó todo", () => {
    expect(calcularVentaSinFacturar({ ventaDevengada: 1000, facturado: 1000 }).tipo).toBeNull()
  })

  it("no hay pendiente si se facturó de más", () => {
    // Puede pasar con notas de débito. No es una cuenta de orden negativa.
    expect(calcularVentaSinFacturar({ ventaDevengada: 1000, facturado: 1200 }).tipo).toBeNull()
  })

  it("una venta sin ninguna factura está pendiente por completo", () => {
    expect(calcularVentaSinFacturar({ ventaDevengada: 1000, facturado: 0 }).monto).toBe(1000)
  })

  it("una diferencia menor a un centavo es redondeo", () => {
    expect(
      calcularVentaSinFacturar({ ventaDevengada: 1000.005, facturado: 1000 }).tipo
    ).toBeNull()
  })
})

describe("calcularFacturaARecibir (C3)", () => {
  it("detecta el costo comprometido sin factura del operador", () => {
    expect(calcularFacturaARecibir({ costoComprometido: 700, facturasRecibidas: 0 })).toEqual({
      monto: 700,
      tipo: "FACTURA_A_RECIBIR",
    })
  })

  it("no queda pendiente si la factura llegó completa", () => {
    expect(
      calcularFacturaARecibir({ costoComprometido: 700, facturasRecibidas: 700 }).tipo
    ).toBeNull()
  })

  it("una factura parcial deja pendiente el resto", () => {
    expect(calcularFacturaARecibir({ costoComprometido: 700, facturasRecibidas: 300 }).monto).toBe(
      400
    )
  })
})

describe("lineasDeOrden", () => {
  const cuentas = {
    "5.1.01": "id-ventas-sin-facturar",
    "5.2.01": "id-ventas-sin-facturar-contra",
    "5.1.02": "id-facturas-a-recibir",
    "5.2.02": "id-facturas-a-recibir-contra",
  }

  it("arma la deudora contra su contrapartida acreedora", () => {
    const lineas = lineasDeOrden("VENTA_SIN_FACTURAR", 600, cuentas, "Pendiente")!
    expect(lineas[0]).toMatchObject({
      chart_account_id: "id-ventas-sin-facturar",
      debit_amount: 600,
    })
    expect(lineas[1]).toMatchObject({
      chart_account_id: "id-ventas-sin-facturar-contra",
      credit_amount: 600,
    })
  })

  it("las dos líneas quedan dentro de la familia 5", () => {
    // Es lo que garantiza que no tocan Activo, Pasivo ni Resultado: el balance
    // agrupa por categoría y el estado de resultados filtra por códigos 4.x.
    for (const tipo of ["VENTA_SIN_FACTURAR", "FACTURA_A_RECIBIR"] as const) {
      const mapa = CUENTAS_DE_ORDEN[tipo]
      expect(mapa.deudora.startsWith("5.1")).toBe(true)
      expect(mapa.acreedora.startsWith("5.2")).toBe(true)
    }
  })

  it("siempre balancean", () => {
    const lineas = lineasDeOrden("FACTURA_A_RECIBIR", 1234.56, cuentas, "Pendiente")!
    const debe = lineas.reduce((s, l: any) => s + (l.debit_amount ?? 0), 0)
    const haber = lineas.reduce((s, l: any) => s + (l.credit_amount ?? 0), 0)
    expect(debe).toBe(haber)
  })

  it("devuelve null si falta una cuenta, en vez de armar medio asiento", () => {
    expect(lineasDeOrden("VENTA_SIN_FACTURAR", 600, { "5.1.01": "x" }, "Pendiente")).toBeNull()
  })
})
