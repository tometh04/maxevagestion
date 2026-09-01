/**
 * Tests del agregador del Reporte de Comisiones (VIB-65).
 *
 * Foco en los invariantes que hacen confiable el número que se presenta:
 *  - ARS y USD nunca se suman.
 *  - Una operación compartida es UNA venta con dos comisiones.
 *  - El mes lo define la fecha de venta, no la de cálculo.
 *  - El reporte no expone la economía del paquete (VIB-94).
 */

import { buildCommissionsReport } from "@/lib/reports/commissions-report"
import type { CommissionRecordRow } from "@/lib/commissions/fetch-commission-records"

let seq = 0

function record(
  partial: Partial<Omit<CommissionRecordRow, "operations">> & {
    amount: number
    operations?: Partial<NonNullable<CommissionRecordRow["operations"]>>
  }
): CommissionRecordRow {
  const { operations, ...rest } = partial
  const id = `cr-${++seq}`
  return {
    id,
    operation_id: operations?.id ?? "op-1",
    seller_id: "seller-a",
    agency_id: "ag-1",
    amount_paid: null,
    percentage: 10,
    status: "PENDING",
    date_calculated: "2026-07-20",
    date_paid: null,
    ...rest,
    operations: {
      id: "op-1",
      file_code: "F-001",
      destination: "Madrid",
      operation_date: "2026-07-10",
      departure_date: "2026-09-01",
      sale_amount_total: 10000,
      margin_amount: 2000,
      sale_currency: "ARS",
      currency: "ARS",
      status: "CONFIRMED",
      seller_id: "seller-a",
      seller_secondary_id: null,
      commission_split: null,
      agency_id: "ag-1",
      ...operations,
    },
  }
}

const sellerNames = new Map([
  ["seller-a", "Ana"],
  ["seller-b", "Bruno"],
  ["seller-c", "Carla"],
])
const agencyNames = new Map([
  ["ag-1", "Rosario"],
  ["ag-2", "Madero"],
])

/** [operationId, partnerId, partnerName, amount] → mapa de referidos. */
function referrals(rows: Array<[string, string, string, number]>) {
  return new Map(
    rows.map(([operationId, partnerId, partnerName, amount]) => [
      operationId,
      { partnerId, partnerName, amount, status: "PENDING" },
    ])
  )
}

function build(records: CommissionRecordRow[], overrides: Partial<{ currency: string; dateFrom: string; dateTo: string }> = {}) {
  return buildCommissionsReport({
    records,
    sellerNames,
    agencyNames,
    currency: overrides.currency ?? "ARS",
    dateFrom: overrides.dateFrom ?? "2026-07-01",
    dateTo: overrides.dateTo ?? "2026-07-31",
  })
}

describe("buildCommissionsReport", () => {
  it("la comisión de un servicio cae en el mes en que se vendió, no en el de la venta original", () => {
    // El caso que motivó el cambio: el paquete se vendió en marzo y ya se
    // comisionó; en agosto otra persona le vendió una asistencia al mismo
    // pasajero. Antes el mes salía de `operations.operation_date`, así que la
    // comisión del servicio caía en marzo —un mes ya cerrado y cobrado— y no
    // aparecía en el período en que realmente se ganó.
    const report = build(
      [
        record({
          amount: 40,
          seller_id: "seller-b",
          kind: "SERVICE",
          accrual_date: "2026-08-14",
          operations: { id: "op-marzo", operation_date: "2026-03-11" },
        }),
      ],
      { dateFrom: "2026-08-01", dateTo: "2026-08-31" }
    )

    expect(report.summary.total).toBe(40)
    expect(report.byMonth.find((m) => m.key === "2026-08")?.total).toBe(40)
    expect(report.byMonth.find((m) => m.key === "2026-03")).toBeUndefined()
  })

  it("sin accrual_date cae a la fecha de la operación: el histórico no se mueve", () => {
    // Backfill mediante, toda fila vieja tiene accrual_date = operation_date.
    // El fallback cubre las lecturas que se hagan antes de eso y deja los
    // períodos ya cerrados dando exactamente lo mismo que antes.
    const report = build([
      record({ amount: 1000, accrual_date: null, operations: { operation_date: "2026-07-10" } }),
    ])

    expect(report.byMonth.find((m) => m.key === "2026-07")?.total).toBe(1000)
  })

  it("no mezcla monedas: agrega la pedida e informa la otra", () => {
    const report = build([
      record({ amount: 1000 }),
      record({ amount: 500 }),
      record({
        amount: 80,
        operations: { id: "op-usd", sale_currency: "USD", currency: "USD" },
      }),
    ])

    expect(report.summary.total).toBe(1500)
    expect(report.summary.count).toBe(2)
    expect(report.summary.otherCurrency).toEqual({ currency: "USD", total: 80, count: 1 })
  })

  it("operación compartida: una sola venta en el conteo, dos comisiones", () => {
    const shared = {
      id: "op-shared",
      sale_amount_total: 20000,
      seller_id: "seller-a",
      seller_secondary_id: "seller-b",
      commission_split: 50,
    }
    const report = build([
      record({ amount: 1000, seller_id: "seller-a", operations: shared }),
      record({ amount: 1000, seller_id: "seller-b", operations: shared }),
    ])

    // El período vendió una operación, no dos.
    expect(report.summary.operationsCount).toBe(1)
    expect(report.summary.sharedOperations).toBe(1)
    expect(report.summary.total).toBe(2000)
    expect(report.summary.count).toBe(2)
  })

  it("no expone la economía del paquete: ni venta base ni % efectivo (VIB-94)", () => {
    const report = build([record({ amount: 1000 })])

    // El % de la comisión se calcula sobre el MARGEN, no sobre la venta: publicar
    // un "% efectivo" sobre la venta mostraba tres números que no cerraban.
    expect(report.summary).not.toHaveProperty("baseSale")
    expect(report.summary).not.toHaveProperty("effectiveRate")
    expect(report.bySeller[0]).not.toHaveProperty("baseSale")
    expect(report.bySeller[0]).not.toHaveProperty("effectiveRate")
  })

  it("nombra al socio de una venta compartida desde las dos filas", () => {
    const shared = {
      id: "op-shared",
      seller_id: "seller-a",
      seller_secondary_id: "seller-b",
    }
    const report = build([
      record({ amount: 700, seller_id: "seller-a", operations: shared }),
      record({ amount: 300, seller_id: "seller-b", operations: shared }),
    ])

    const ana = report.detail.find((d) => d.sellerId === "seller-a")!
    const bruno = report.detail.find((d) => d.sellerId === "seller-b")!
    expect(ana.counterpartName).toBe("Bruno")
    expect(bruno.counterpartName).toBe("Ana")
  })

  it("no inventa socio en una venta propia ni en una comisión huérfana", () => {
    const report = build([
      record({ amount: 500, seller_id: "seller-a" }),
      record({
        amount: 400,
        seller_id: "seller-c",
        operations: { id: "op-2", seller_id: "seller-a", seller_secondary_id: "seller-b" },
      }),
    ])

    const propia = report.detail.find((d) => d.sellerId === "seller-a")!
    expect(propia.shared).toBe(false)
    expect(propia.counterpartName).toBeNull()

    // Carla ya no figura en la operación: no es socia de nadie.
    const huerfana = report.detail.find((d) => d.sellerId === "seller-c")!
    expect(huerfana.role).toBe("unknown")
    expect(huerfana.counterpartName).toBeNull()
  })

  it("identifica cada fila por el pasajero principal", () => {
    // Pedido de Lozada: el vendedor reconoce su comisión por el pasajero, no por
    // el código de operación.
    const report = buildCommissionsReport({
      records: [
        record({ amount: 1000, operations: { id: "op-con-pax", file_code: "F-010" } }),
        record({ amount: 500, operations: { id: "op-sin-pax", file_code: "F-011" } }),
      ],
      sellerNames,
      agencyNames,
      mainPassengers: new Map([["op-con-pax", "Lucía González"]]),
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    expect(report.detail.find((d) => d.operationId === "op-con-pax")!.passengerName).toBe(
      "Lucía González"
    )
    // Sin pasajero cargado queda vacío y la vista cae al código, que sigue viajando.
    const sinPax = report.detail.find((d) => d.operationId === "op-sin-pax")!
    expect(sinPax.passengerName).toBe("")
    expect(sinPax.fileCode).toBe("F-011")
  })

  it("sin mapa de pasajeros el detalle no se rompe", () => {
    const report = build([record({ amount: 1000 })])
    expect(report.detail[0].passengerName).toBe("")
  })

  it("marca las ventas que vinieron por un socio referidor", () => {
    const report = buildCommissionsReport({
      records: [
        record({ amount: 1000, operations: { id: "op-ref" } }),
        record({ amount: 500, operations: { id: "op-directa" } }),
      ],
      sellerNames,
      agencyNames,
      referralPartners: referrals([["op-ref", "p-1", "Estudio Contable Díaz", 300]]),
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    expect(report.summary.referredOperations).toBe(1)
    expect(
      report.detail.find((d) => d.operationId === "op-ref")!.referralPartnerName
    ).toBe("Estudio Contable Díaz")
    expect(
      report.detail.find((d) => d.operationId === "op-directa")!.referralPartnerName
    ).toBeNull()
    // La comisión del referidor se liquida aparte: no entra en el total.
    expect(report.summary.total).toBe(1500)
    // Y la sección con montos es opt-in: sin pedirla, no viaja.
    expect(report.byReferralPartner).toEqual([])
  })

  it("la sección de referidos no duplica una venta compartida", () => {
    // La operación compartida tiene DOS comisiones de vendedor pero UN referido:
    // contarlo dos veces inflaría al doble lo que la agencia le debe al socio.
    const shared = {
      id: "op-shared",
      seller_id: "seller-a",
      seller_secondary_id: "seller-b",
    }
    const report = buildCommissionsReport({
      records: [
        record({ amount: 700, seller_id: "seller-a", operations: shared }),
        record({ amount: 300, seller_id: "seller-b", operations: shared }),
      ],
      sellerNames,
      agencyNames,
      referralPartners: referrals([["op-shared", "p-1", "Marcela Suárez", 250]]),
      include: { referrals: true },
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    expect(report.byReferralPartner).toEqual([
      {
        partnerId: "p-1",
        partnerName: "Marcela Suárez",
        operationsCount: 1,
        total: 250,
        pending: 250,
        paid: 0,
      },
    ])
    // Sigue sin sumar al total del vendedor.
    expect(report.summary.total).toBe(1000)
  })

  it("venta y ganancia del paquete solo viajan si se piden", () => {
    const records = [record({ amount: 1000 })]
    const base = {
      records,
      sellerNames,
      agencyNames,
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    }

    const sinPedir = buildCommissionsReport(base)
    expect(sinPedir.detail[0].saleAmount).toBeNull()
    expect(sinPedir.detail[0].marginAmount).toBeNull()

    const pedido = buildCommissionsReport({ ...base, include: { sale: true, margin: true } })
    expect(pedido.detail[0].saleAmount).toBe(10000)
    expect(pedido.detail[0].marginAmount).toBe(2000)
  })

  it("distingue vendedor primario de secundario", () => {
    const shared = {
      id: "op-shared",
      seller_id: "seller-a",
      seller_secondary_id: "seller-b",
    }
    const report = build([
      record({ amount: 700, seller_id: "seller-a", operations: shared }),
      record({ amount: 300, seller_id: "seller-b", operations: shared }),
    ])

    const ana = report.bySeller.find((s) => s.sellerId === "seller-a")!
    const bruno = report.bySeller.find((s) => s.sellerId === "seller-b")!
    expect(ana.primaryTotal).toBe(700)
    expect(ana.secondaryTotal).toBe(0)
    expect(bruno.secondaryTotal).toBe(300)
    expect(bruno.primaryTotal).toBe(0)

    expect(report.detail.find((d) => d.sellerId === "seller-a")!.role).toBe("primary")
    expect(report.detail.find((d) => d.sellerId === "seller-b")!.role).toBe("secondary")
    expect(report.detail.every((d) => d.shared)).toBe(true)
  })

  it("marca como 'unknown' la comisión de un vendedor que ya no figura en la operación", () => {
    const report = build([
      record({
        amount: 400,
        seller_id: "seller-c",
        operations: { seller_id: "seller-a", seller_secondary_id: null },
      }),
    ])

    expect(report.detail[0].role).toBe("unknown")
    // No se pierde: sigue sumando al total.
    expect(report.summary.total).toBe(400)
  })

  it("la comisión del administrador no se lee como huérfana (VIB-102)", () => {
    // Sin `kind`, el administrador caería en 'unknown', que es la marca que el
    // reporte usa para señalar comisiones de vendedores reasignados.
    const report = build([
      record({ amount: 700, seller_id: "seller-a" }),
      record({
        amount: 100,
        seller_id: "seller-c",
        kind: "ADVISOR_MANAGER",
        source_seller_id: "seller-a",
      }),
    ])

    const fila = report.detail.find((d) => d.sellerId === "seller-c")!
    expect(fila.role).toBe("advisor_manager")
    expect(fila.managedSellerName).toBe("Ana")

    // Su plata no se mezcla con lo que cobró por vender.
    const carla = report.bySeller.find((s) => s.sellerId === "seller-c")!
    expect(carla.advisorManagerTotal).toBe(100)
    expect(carla.primaryTotal).toBe(0)

    // Y sigue siendo comisión de la agencia: suma al total del período.
    expect(report.summary.total).toBe(800)
  })

  it("el mes lo define la fecha de venta, no la de cálculo", () => {
    const report = build(
      [
        record({
          amount: 100,
          date_calculated: "2026-09-30", // recálculo posterior
          operations: { id: "op-jul", operation_date: "2026-07-15" },
        }),
      ],
      { dateFrom: "2026-07-01", dateTo: "2026-09-30" }
    )

    expect(report.byMonth.find((m) => m.key === "2026-07")!.total).toBe(100)
    expect(report.byMonth.find((m) => m.key === "2026-09")!.total).toBe(0)
    expect(report.detail[0].month).toBe("2026-07")
  })

  it("rellena los meses sin comisiones en cero", () => {
    const report = build(
      [
        record({ amount: 100, operations: { id: "a", operation_date: "2026-01-10" } }),
        record({ amount: 300, operations: { id: "b", operation_date: "2026-03-10" } }),
      ],
      { dateFrom: "2026-01-01", dateTo: "2026-03-31" }
    )

    expect(report.byMonth.map((m) => m.key)).toEqual(["2026-01", "2026-02", "2026-03"])
    expect(report.byMonth.map((m) => m.total)).toEqual([100, 0, 300])
  })

  it("pendiente + pagado === total, y los pagos parciales no cambian el estado", () => {
    const report = build([
      record({ amount: 1000, status: "PAID", amount_paid: 1000, date_paid: "2026-07-25" }),
      record({ amount: 600, status: "PENDING", amount_paid: 200, operations: { id: "op-2" } }),
    ])

    expect(report.summary.paid).toBe(1000)
    expect(report.summary.pending).toBe(600)
    expect(report.summary.paid + report.summary.pending).toBe(report.summary.total)
    expect(report.summary.amountPaid).toBe(1200)
    expect(report.byStatus.find((s) => s.status === "PAID")!.share).toBe(62.5)
  })

  it("agrupa por agencia de la operación", () => {
    const report = build([
      record({ amount: 100, operations: { id: "a", agency_id: "ag-1" } }),
      record({ amount: 900, operations: { id: "b", agency_id: "ag-2" } }),
    ])

    expect(report.byAgency.map((a) => [a.agencyName, a.total])).toEqual([
      ["Madero", 900],
      ["Rosario", 100],
    ])
    expect(report.byAgency[0].share).toBe(90)
  })

  it("arma la matriz vendedor × mes con todos los meses del rango", () => {
    const report = build(
      [
        record({
          amount: 100,
          seller_id: "seller-a",
          operations: { id: "a", operation_date: "2026-01-10" },
        }),
        record({
          amount: 250,
          seller_id: "seller-a",
          operations: { id: "b", operation_date: "2026-02-10" },
        }),
        record({
          amount: 400,
          seller_id: "seller-b",
          operations: { id: "c", operation_date: "2026-02-20" },
        }),
      ],
      { dateFrom: "2026-01-01", dateTo: "2026-02-28" }
    )

    const ana = report.bySellerMonth.find((s) => s.sellerId === "seller-a")!
    expect(ana.cells).toEqual({ "2026-01": 100, "2026-02": 250 })
    expect(ana.total).toBe(350)

    const bruno = report.bySellerMonth.find((s) => s.sellerId === "seller-b")!
    expect(bruno.cells).toEqual({ "2026-01": 0, "2026-02": 400 })
  })

  it("período sin comisiones: cero en todo, sin división por cero", () => {
    const report = build([
      record({ amount: 90, operations: { sale_currency: "USD", currency: "USD" } }),
    ])

    expect(report.summary.total).toBe(0)
    expect(report.summary.averagePerSeller).toBe(0)
    expect(report.bySeller).toEqual([])
    expect(report.byStatus.every((s) => s.share === 0)).toBe(true)
  })

  it("el % de participación se calcula sobre el total completo, no sobre el top", () => {
    const report = build([
      record({ amount: 500, seller_id: "seller-a" }),
      record({ amount: 300, seller_id: "seller-b", operations: { id: "op-2" } }),
      record({ amount: 200, seller_id: "seller-c", operations: { id: "op-3" } }),
    ])

    expect(report.bySeller.map((s) => s.share)).toEqual([50, 30, 20])
    expect(report.bySeller.reduce((acc, s) => acc + s.share, 0)).toBe(100)
  })

  it("propaga el conteo de comisiones descartadas por operación cancelada", () => {
    const report = buildCommissionsReport({
      records: [record({ amount: 100 })],
      sellerNames,
      agencyNames,
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      cancelledRecords: 4,
      truncated: true,
    })

    expect(report.summary.cancelledRecords).toBe(4)
    expect(report.summary.truncated).toBe(true)
  })
})

describe("buildCommissionsReport — oficina en el detalle", () => {
  /**
   * El agregado por oficina (`byAgency`) existía desde el principio, pero cada
   * fila del detalle no decía de dónde venía. En una org con dos oficinas y
   * vendedores que trabajan para las dos, el PDF que se le manda al vendedor
   * mezclaba Rosario y Madero sin ninguna marca.
   */
  it("cada fila del detalle dice de qué oficina es la venta", () => {
    const report = build([
      record({ id: "c-ros", amount: 1000, operations: { id: "op-ros", agency_id: "ag-1" } }),
      record({ id: "c-mad", amount: 2000, operations: { id: "op-mad", agency_id: "ag-2" } }),
    ])

    const byId = new Map(report.detail.map((r) => [r.id, r]))
    expect(byId.get("c-ros")!.agencyId).toBe("ag-1")
    expect(byId.get("c-ros")!.agencyName).toBe("Rosario")
    expect(byId.get("c-mad")!.agencyName).toBe("Madero")
  })

  it("una operación sin oficina no rompe la fila", () => {
    const report = build([record({ amount: 1000, operations: { agency_id: null } })])

    expect(report.detail[0].agencyId).toBeNull()
    expect(report.detail[0].agencyName).toBe("Sin agencia")
  })

  it("una oficina desconocida cae al mismo cartel, no a un UUID en pantalla", () => {
    const report = build([record({ amount: 1000, operations: { agency_id: "ag-borrada" } })])

    expect(report.detail[0].agencyName).toBe("Sin agencia")
  })

  /**
   * Candado: el desglose por oficina y el total tienen que cerrar. Si dejaran
   * de cerrar, la pantalla de pago y el reporte dirían números distintos para
   * el mismo período, que es exactamente lo que se vino a evitar.
   */
  it("la suma de las oficinas es el total del reporte", () => {
    const report = build([
      record({ id: "c-1", amount: 1000, operations: { id: "op-1", agency_id: "ag-1" } }),
      record({ id: "c-2", amount: 2500, operations: { id: "op-2", agency_id: "ag-2" } }),
      record({ id: "c-3", amount: 500, operations: { id: "op-3", agency_id: null } }),
    ])

    const suma = report.byAgency.reduce((acc, a) => acc + a.total, 0)
    expect(suma).toBeCloseTo(report.summary.total, 2)
    expect(report.byAgency).toHaveLength(3)
  })

  it("cada fila del detalle coincide con la oficina que la agrupó", () => {
    const report = build([
      record({ id: "c-1", amount: 1000, operations: { id: "op-1", agency_id: "ag-1" } }),
      record({ id: "c-2", amount: 2500, operations: { id: "op-2", agency_id: "ag-2" } }),
    ])

    for (const agency of report.byAgency) {
      const filas = report.detail.filter((r) => r.agencyId === agency.agencyId)
      const suma = filas.reduce((acc, r) => acc + r.amount, 0)
      expect(suma).toBeCloseTo(agency.total, 2)
    }
  })
})
