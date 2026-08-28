/**
 * Plan de cierre mensual — VIB-140 / VIB-141.
 *
 * Hay dos invariantes que valen más que el resto y por eso están primero:
 *
 *   1. **Un cierre no cambia el resultado del mes.** Si un ajuste tocara una
 *      cuenta 4.x estaría inventando un ingreso o un gasto que nadie generó.
 *   2. **Un cierre no mezcla monedas.** La venta puede estar en dólares y el
 *      costo en pesos: restar uno del otro siempre da un número, y ese número
 *      siempre está mal.
 *
 * El resto de los tests son los casos que un contador mira uno por uno.
 */
import {
  CIERRE_POR_DEFECTO,
  esAnticipoCreible,
  FACTOR_IMPLAUSIBLE,
  CUENTAS_DEL_AJUSTE,
  planificarCierre,
  planificarOperacion,
  type ConfiguracionDeCierre,
  type OperacionAlCierre,
} from "../monthly-close-plan"

const TODO: ConfiguracionDeCierre = {
  anticipos_clientes: true,
  anticipos_proveedores: true,
  ventas_sin_facturar: true,
  facturas_a_recibir: true,
}

const op = (over: Partial<OperacionAlCierre> = {}): OperacionAlCierre => ({
  id: "op-1",
  numero: "OP-0001",
  currency: "USD",
  ventaDevengada: 1000,
  cobrado: 1000,
  facturado: 1000,
  costCurrency: "USD",
  costoComprometido: 700,
  pagadoAOperadores: 700,
  facturasRecibidas: 700,
  ...over,
})

describe("un cierre no puede cambiar el resultado del mes", () => {
  it("ningún ajuste toca una cuenta de resultado", () => {
    // La familia 4 es Ingresos, Costos y Gastos. Un asiento de cierre que la
    // tocara estaría creando plata que nadie ganó ni gastó.
    for (const cuentas of Object.values(CUENTAS_DEL_AJUSTE)) {
      expect(cuentas.debe.startsWith("4.")).toBe(false)
      expect(cuentas.haber.startsWith("4.")).toBe(false)
    }
  })

  it("los anticipos solo mueven cuentas patrimoniales", () => {
    // Familias 1 y 2: Activo y Pasivo. Es una reclasificación, no un hecho nuevo.
    for (const tipo of ["ANTICIPO_CLIENTE", "ANTICIPO_PROVEEDOR"] as const) {
      const c = CUENTAS_DEL_AJUSTE[tipo]
      expect(c.debe[0]).toMatch(/[12]/)
      expect(c.haber[0]).toMatch(/[12]/)
    }
  })

  it("las cuentas de orden se quedan dentro de la familia 5", () => {
    for (const tipo of ["VENTA_SIN_FACTURAR", "FACTURA_A_RECIBIR"] as const) {
      const c = CUENTAS_DEL_AJUSTE[tipo]
      expect(c.debe.startsWith("5.1")).toBe(true)
      expect(c.haber.startsWith("5.2")).toBe(true)
    }
  })
})

describe("un cierre no mezcla monedas", () => {
  it("el ajuste del cliente usa la moneda de la venta y el del operador la del costo", () => {
    // El caso real: se vende en dólares y se le paga al operador en pesos.
    const ajustes = planificarOperacion(
      op({
        currency: "USD",
        ventaDevengada: 1000,
        cobrado: 1200,
        costCurrency: "ARS",
        costoComprometido: 500_000,
        pagadoAOperadores: 700_000,
      }),
      TODO
    )

    const cliente = ajustes.find((a) => a.tipo === "ANTICIPO_CLIENTE")!
    const proveedor = ajustes.find((a) => a.tipo === "ANTICIPO_PROVEEDOR")!

    expect(cliente).toMatchObject({ monto: 200, currency: "USD" })
    expect(proveedor).toMatchObject({ monto: 200_000, currency: "ARS" })
  })

  it("el resumen totaliza por moneda y no en un solo número", () => {
    const plan = planificarCierre(
      [
        op({ id: "a", currency: "USD", ventaDevengada: 100, cobrado: 150 }),
        // La venta es 2000 y no 1000 para que el sobrepago quede dentro de lo
        // creíble: cobrar 4 veces la venta ya lo trata como dato mal cargado.
        op({ id: "b", currency: "ARS", ventaDevengada: 2000, cobrado: 5000 }),
        op({ id: "c", currency: "USD", ventaDevengada: 100, cobrado: 180 }),
      ],
      { ...CIERRE_POR_DEFECTO, anticipos_proveedores: false }
    )

    expect(plan.resumen.ANTICIPO_CLIENTE).toEqual({
      cantidad: 3,
      porMoneda: { USD: 130, ARS: 3000 },
    })
  })
})

describe("anticipos", () => {
  it("un cliente que pagó de más genera el ajuste", () => {
    const a = planificarOperacion(op({ ventaDevengada: 1000, cobrado: 1300 }), TODO)
    expect(a.find((x) => x.tipo === "ANTICIPO_CLIENTE")?.monto).toBe(300)
  })

  it("un cliente que debe plata no genera nada", () => {
    const a = planificarOperacion(op({ ventaDevengada: 1000, cobrado: 400 }), TODO)
    expect(a.find((x) => x.tipo === "ANTICIPO_CLIENTE")).toBeUndefined()
  })

  it("una operación saldada exacta no genera ningún ajuste", () => {
    // El caso más común. Si generara algo, el cierre ensuciaría el balance de
    // todas las operaciones sanas de la agencia.
    expect(planificarOperacion(op(), TODO)).toEqual([])
  })

  it("el excedente pagado a un operador es un activo, no una deuda negativa", () => {
    const a = planificarOperacion(
      op({ costoComprometido: 700, pagadoAOperadores: 900 }),
      TODO
    )
    const p = a.find((x) => x.tipo === "ANTICIPO_PROVEEDOR")!
    expect(p.monto).toBe(200)
    // Debe en el activo (Anticipos a Proveedores), Haber en Cuentas por Pagar.
    expect(p.debe.startsWith("1.")).toBe(true)
    expect(p.haber.startsWith("2.")).toBe(true)
  })

  it("el del cliente va al revés: Debe en el activo, Haber en el pasivo", () => {
    const a = planificarOperacion(op({ ventaDevengada: 1000, cobrado: 1300 }), TODO)
    const c = a.find((x) => x.tipo === "ANTICIPO_CLIENTE")!
    expect(c.debe.startsWith("1.")).toBe(true)
    expect(c.haber.startsWith("2.")).toBe(true)
  })
})

describe("cuentas de orden", () => {
  it("detecta la venta devengada sin facturar", () => {
    const a = planificarOperacion(op({ ventaDevengada: 1000, facturado: 400 }), TODO)
    expect(a.find((x) => x.tipo === "VENTA_SIN_FACTURAR")?.monto).toBe(600)
  })

  it("detecta el costo sin factura del operador", () => {
    const a = planificarOperacion(op({ costoComprometido: 700, facturasRecibidas: 0 }), TODO)
    expect(a.find((x) => x.tipo === "FACTURA_A_RECIBIR")?.monto).toBe(700)
  })
})

describe("configuración por agencia", () => {
  it("por defecto solo salen los anticipos", () => {
    // Las cuentas de orden son informativas: se prenden si el contador las usa.
    const a = planificarOperacion(
      op({ ventaDevengada: 1000, cobrado: 1300, facturado: 0, facturasRecibidas: 0 }),
      CIERRE_POR_DEFECTO
    )
    expect(a.map((x) => x.tipo).sort()).toEqual(["ANTICIPO_CLIENTE"])
  })

  it("una agencia que apaga todo no genera ningún asiento", () => {
    // Importa que sea posible: es lo que garantiza que prender la contabilidad
    // no le cambie nada a quien no la quiera usar todavía.
    const nada: ConfiguracionDeCierre = {
      anticipos_clientes: false,
      anticipos_proveedores: false,
      ventas_sin_facturar: false,
      facturas_a_recibir: false,
    }
    const extremo = op({ ventaDevengada: 1000, cobrado: 5000, facturado: 0, facturasRecibidas: 0 })
    expect(planificarOperacion(extremo, nada)).toEqual([])
  })

  it("una operación puede generar los cuatro ajustes a la vez", () => {
    const a = planificarOperacion(
      op({
        ventaDevengada: 1000,
        cobrado: 1300,
        facturado: 0,
        costoComprometido: 700,
        pagadoAOperadores: 900,
        facturasRecibidas: 0,
      }),
      TODO
    )
    expect(a.map((x) => x.tipo).sort()).toEqual([
      "ANTICIPO_CLIENTE",
      "ANTICIPO_PROVEEDOR",
      "FACTURA_A_RECIBIR",
      "VENTA_SIN_FACTURAR",
    ])
  })
})

describe("planificarCierre", () => {
  it("sin operaciones el plan queda vacío pero con el resumen armado", () => {
    const plan = planificarCierre([], TODO)
    expect(plan.ajustes).toEqual([])
    expect(plan.resumen.ANTICIPO_CLIENTE.cantidad).toBe(0)
  })

  it("cada ajuste queda atado a su operación y con su número en el concepto", () => {
    // Sin el número, el contador ve un asiento de ajuste y no sabe de dónde
    // salió.
    const plan = planificarCierre(
      [op({ id: "abc", numero: "OP-20260901-XYZ", ventaDevengada: 100, cobrado: 160 })],
      TODO
    )
    expect(plan.ajustes[0].operationId).toBe("abc")
    expect(plan.ajustes[0].concepto).toContain("OP-20260901-XYZ")
  })
})

describe("un excedente implausible no es un anticipo", () => {
  it("un sobrepago chico sí lo es", () => {
    // Anticipar el 20% de un viaje es lo más normal del mundo.
    expect(esAnticipoCreible(1000, 1200)).toBe(true)
  })

  it("cobrar 58 veces la venta no lo es", () => {
    // Caso real de Lozada Rosario: venta importada USD 100, cobros USD 5.850,
    // y el operador cobró 5.208. La venta verdadera rondaba los 5.850.
    expect(esAnticipoCreible(100, 5850)).toBe(false)
  })

  it("una operación sin venta cargada nunca genera anticipo", () => {
    // Es la forma que toma el dato faltante, y con venta 0 no hay proporción
    // que juzgar. Asentarlo crearía un pasivo del total cobrado.
    expect(esAnticipoCreible(0, 5000)).toBe(false)
    expect(esAnticipoCreible(1, 323108)).toBe(false)
  })

  it("el umbral está justo donde dice estar", () => {
    expect(esAnticipoCreible(100, 100 * FACTOR_IMPLAUSIBLE)).toBe(true)
    expect(esAnticipoCreible(100, 100 * FACTOR_IMPLAUSIBLE + 0.01)).toBe(false)
  })

  it("el plan no lo asienta, pero lo informa", () => {
    // Lo que importa: no desaparece. Alguien lo tiene que mirar.
    const plan = planificarCierre(
      [
        op({ id: "sana", numero: "OP-1", ventaDevengada: 1000, cobrado: 1200 }),
        op({ id: "rota", numero: "OP-2", ventaDevengada: 100, cobrado: 5850 }),
      ],
      { ...CIERRE_POR_DEFECTO, anticipos_proveedores: false }
    )

    expect(plan.ajustes).toHaveLength(1)
    expect(plan.ajustes[0].operationId).toBe("sana")

    expect(plan.anomalias).toHaveLength(1)
    expect(plan.anomalias[0]).toMatchObject({ operationId: "rota", numero: "OP-2" })
  })

  it("una operación saldada no aparece como anomalía", () => {
    const plan = planificarCierre([op()], CIERRE_POR_DEFECTO)
    expect(plan.anomalias).toEqual([])
  })
})
