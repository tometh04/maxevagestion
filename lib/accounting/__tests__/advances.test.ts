/**
 * Anticipos de clientes y a proveedores — VIB-140 (C1).
 *
 * El caso que motiva esto: hoy la fórmula de la deuda hace max(0, ...), así que
 * cuando un cliente paga de más el excedente se recorta y desaparece. No queda
 * registrado en ninguna parte, cuando en realidad es un pasivo con ese cliente.
 */
import {
  calcularAnticipoAProveedor,
  calcularAnticipoDeCliente,
  lineasDeReclasificacion,
  RECLASIFICACION,
} from "../advances"

describe("calcularAnticipoDeCliente", () => {
  it("detecta lo que pagó por encima de la deuda", () => {
    expect(calcularAnticipoDeCliente({ venta: 1000, pagadoEnMonedaDeLaDeuda: 1200 })).toEqual({
      monto: 200,
      tipo: "CLIENTE",
    })
  })

  it("no hay anticipo si todavía debe", () => {
    expect(calcularAnticipoDeCliente({ venta: 1000, pagadoEnMonedaDeLaDeuda: 400 }).tipo).toBeNull()
  })

  it("no hay anticipo si pagó exacto", () => {
    expect(calcularAnticipoDeCliente({ venta: 1000, pagadoEnMonedaDeLaDeuda: 1000 }).tipo).toBeNull()
  })

  it("una diferencia menor a un centavo es redondeo", () => {
    expect(
      calcularAnticipoDeCliente({ venta: 1000, pagadoEnMonedaDeLaDeuda: 1000.005 }).tipo
    ).toBeNull()
  })

  it("una venta en cero con un cobro es todo anticipo", () => {
    // Cobrar antes de cargar la venta: la plata entró y no hay nada devengado.
    expect(calcularAnticipoDeCliente({ venta: 0, pagadoEnMonedaDeLaDeuda: 500 })).toEqual({
      monto: 500,
      tipo: "CLIENTE",
    })
  })
})

describe("calcularAnticipoAProveedor", () => {
  it("detecta lo que se le pagó por encima de lo que se le debe", () => {
    expect(calcularAnticipoAProveedor({ costo: 700, pagadoEnMonedaDeLaDeuda: 900 })).toEqual({
      monto: 200,
      tipo: "PROVEEDOR",
    })
  })

  it("no hay anticipo si todavía se le debe", () => {
    expect(calcularAnticipoAProveedor({ costo: 700, pagadoEnMonedaDeLaDeuda: 300 }).tipo).toBeNull()
  })
})

describe("lineasDeReclasificacion", () => {
  const cuentas = {
    "1.1.03": "id-cxc",
    "2.1.07": "id-anticipos-clientes",
    "2.1.01": "id-cxp",
    "1.1.06": "id-anticipos-proveedores",
  }

  it("un anticipo de cliente restituye Cuentas por Cobrar contra el pasivo", () => {
    // El cobro dejó a Cuentas por Cobrar con saldo acreedor. Se debita para
    // restituirla y el excedente pasa a ser una deuda con el cliente.
    const lineas = lineasDeReclasificacion("CLIENTE", 200, cuentas, "Anticipo")!
    expect(lineas[0]).toMatchObject({ chart_account_id: "id-cxc", debit_amount: 200 })
    expect(lineas[1]).toMatchObject({
      chart_account_id: "id-anticipos-clientes",
      credit_amount: 200,
    })
  })

  it("un anticipo a proveedor crea el activo contra Cuentas por Pagar", () => {
    // Se le pagó de más: eso es un derecho contra el operador, no un gasto.
    const lineas = lineasDeReclasificacion("PROVEEDOR", 200, cuentas, "Anticipo")!
    expect(lineas[0]).toMatchObject({
      chart_account_id: "id-anticipos-proveedores",
      debit_amount: 200,
    })
    expect(lineas[1]).toMatchObject({ chart_account_id: "id-cxp", credit_amount: 200 })
  })

  it("las dos líneas siempre balancean", () => {
    for (const tipo of ["CLIENTE", "PROVEEDOR"] as const) {
      const lineas = lineasDeReclasificacion(tipo, 350.75, cuentas, "Anticipo")!
      const debe = lineas.reduce((s, l: any) => s + (l.debit_amount ?? 0), 0)
      const haber = lineas.reduce((s, l: any) => s + (l.credit_amount ?? 0), 0)
      expect(debe).toBe(haber)
    }
  })

  it("devuelve null si falta una cuenta del plan, en vez de armar medio asiento", () => {
    expect(lineasDeReclasificacion("CLIENTE", 200, { "1.1.03": "id-cxc" }, "Anticipo")).toBeNull()
  })

  it("usa las cuentas que estaban huérfanas en el plan", () => {
    expect(RECLASIFICACION.CLIENTE.hacia).toBe("2.1.07")
    expect(RECLASIFICACION.PROVEEDOR.hacia).toBe("1.1.06")
  })
})
