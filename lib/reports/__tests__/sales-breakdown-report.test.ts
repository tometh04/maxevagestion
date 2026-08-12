/**
 * Tests del agregador del Reporte de Ventas por producto (VIB-66).
 *
 * El test que manda es el invariante de suma: si el desglose por producto no da
 * exactamente la venta del período, el reporte no sirve para presentar. Todo lo
 * demás (cascada de pesos, normalización de tipos, monedas) existe para que ese
 * invariante se sostenga sin inventar números.
 */

import {
  buildSalesBreakdownReport,
  prorateOperation,
} from "@/lib/reports/sales-breakdown-report"
import { normalizeProductType, productTypeLabel } from "@/lib/operations/product-types"
import type {
  SalesOperationItemRow,
  SalesOperationRow,
} from "@/lib/operations/fetch-sales-operations"

let seq = 0

function operation(partial: Partial<SalesOperationRow> = {}): SalesOperationRow {
  return {
    id: `op-${++seq}`,
    file_code: "F-001",
    destination: "Madrid",
    operation_date: "2026-07-10",
    departure_date: "2026-09-01",
    sale_amount_total: 1000,
    operator_cost: 600,
    margin_amount: 400,
    sale_currency: "ARS",
    currency: "ARS",
    status: "CONFIRMED",
    type: "PACKAGE",
    product_type: "PAQUETE",
    seller_id: "seller-a",
    seller_secondary_id: null,
    agency_id: "ag-1",
    ...partial,
  }
}

function item(partial: Partial<SalesOperationItemRow> = {}): SalesOperationItemRow {
  return {
    id: `it-${++seq}`,
    operation_id: "op-1",
    product_type: "FLIGHT",
    cost: 0,
    cost_currency: "ARS",
    sale_amount: null,
    ...partial,
  }
}

function build(
  operations: SalesOperationRow[],
  items: SalesOperationItemRow[] = [],
  overrides: Partial<{
    currency: string
    dateFrom: string
    dateTo: string
    serviceExtras: Record<string, { saleExtra: number; costExtra: number }>
    includeServices: boolean
  }> = {}
) {
  const itemsByOperation = new Map<string, SalesOperationItemRow[]>()
  for (const it of items) {
    const list = itemsByOperation.get(it.operation_id) ?? []
    list.push(it)
    itemsByOperation.set(it.operation_id, list)
  }

  return buildSalesBreakdownReport({
    operations,
    itemsByOperation,
    serviceExtras: overrides.serviceExtras ?? {},
    includeServices: overrides.includeServices ?? false,
    sellerNames: new Map([
      ["seller-a", "Ana"],
      ["seller-b", "Bruno"],
    ]),
    agencyNames: new Map([
      ["ag-1", "Rosario"],
      ["ag-2", "Madero"],
    ]),
    currency: overrides.currency ?? "ARS",
    dateFrom: overrides.dateFrom ?? "2026-07-01",
    dateTo: overrides.dateTo ?? "2026-07-31",
  })
}

describe("prorateOperation — invariante de suma", () => {
  it("reparte 100 entre 3 ítems iguales sin perder un centavo", () => {
    const op = operation({ id: "op-x", sale_amount_total: 100 })
    const items = [
      item({ operation_id: "op-x", product_type: "FLIGHT", sale_amount: 1 }),
      item({ operation_id: "op-x", product_type: "HOTEL", sale_amount: 1 }),
      item({ operation_id: "op-x", product_type: "TRANSFER", sale_amount: 1 }),
    ]

    const { slices } = prorateOperation(op, items, undefined)
    const total = slices.reduce((acc, s) => acc + s.sale, 0)

    expect(Math.round(total * 100) / 100).toBe(100)
    expect(slices.map((s) => s.sale).sort()).toEqual([33.33, 33.33, 33.34])
  })

  it("mantiene el invariante con montos e importes arbitrarios", () => {
    const cases = [
      { base: 1234567.89, weights: [3, 7, 11, 13] },
      { base: 0.03, weights: [1, 1, 1] },
      { base: 999.99, weights: [1, 2] },
      { base: 10, weights: [1, 1, 1, 1, 1, 1, 7] },
    ]

    for (const { base, weights } of cases) {
      const op = operation({ id: "op-inv", sale_amount_total: base })
      const items = weights.map((w, i) =>
        item({ operation_id: "op-inv", id: `i-${i}`, sale_amount: w })
      )
      const { slices } = prorateOperation(op, items, undefined)
      const total = slices.reduce((acc, s) => acc + s.sale, 0)
      expect(Math.round(total * 100) / 100).toBe(Math.round(base * 100) / 100)
    }
  })

  it("usa el importe del ítem como peso cuando está cargado", () => {
    const op = operation({ id: "op-w", sale_amount_total: 1000 })
    const items = [
      item({ operation_id: "op-w", id: "a", product_type: "FLIGHT", sale_amount: 800 }),
      item({ operation_id: "op-w", id: "b", product_type: "HOTEL", sale_amount: 200 }),
    ]

    const { slices, source } = prorateOperation(op, items, undefined)
    expect(source).toBe("item_sale")
    expect(slices.find((s) => s.key === "FLIGHT")!.sale).toBe(800)
    expect(slices.find((s) => s.key === "HOTEL")!.sale).toBe(200)
  })

  it("cae al costo del ítem cuando ninguno tiene importe de venta", () => {
    const op = operation({ id: "op-c", sale_amount_total: 1000 })
    const items = [
      item({ operation_id: "op-c", id: "a", product_type: "FLIGHT", cost: 300 }),
      item({ operation_id: "op-c", id: "b", product_type: "HOTEL", cost: 100 }),
    ]

    const { slices, source } = prorateOperation(op, items, undefined)
    expect(source).toBe("item_cost")
    expect(slices.find((s) => s.key === "FLIGHT")!.sale).toBe(750)
    expect(slices.find((s) => s.key === "HOTEL")!.sale).toBe(250)
  })

  it("VIB-112: con desglose PARCIAL que no cuadra, NO usa item_sale (cae a costo)", () => {
    // Una pata con venta cargada y otra en 0: la suma (400) no cuadra con el
    // total (1000). Antes atribuía el 100% a la cargada; ahora se cae al costo.
    const op = operation({ id: "op-p", sale_amount_total: 1000 })
    const items = [
      item({ operation_id: "op-p", id: "a", product_type: "FLIGHT", sale_amount: 400, cost: 300 }),
      item({ operation_id: "op-p", id: "b", product_type: "HOTEL", sale_amount: 0, cost: 100 }),
    ]

    const { slices, source } = prorateOperation(op, items, undefined)
    expect(source).toBe("item_cost")
    expect(slices.find((s) => s.key === "FLIGHT")!.sale).toBe(750)
    expect(slices.find((s) => s.key === "HOTEL")!.sale).toBe(250)
  })

  it("VIB-112: con desglose COMPLETO que cuadra, usa item_sale", () => {
    const op = operation({ id: "op-b", sale_amount_total: 1000 })
    const items = [
      item({ operation_id: "op-b", id: "a", product_type: "FLIGHT", sale_amount: 700, cost: 300 }),
      item({ operation_id: "op-b", id: "b", product_type: "HOTEL", sale_amount: 300, cost: 100 }),
    ]

    const { slices, source } = prorateOperation(op, items, undefined)
    expect(source).toBe("item_sale")
    expect(slices.find((s) => s.key === "FLIGHT")!.sale).toBe(700)
    expect(slices.find((s) => s.key === "HOTEL")!.sale).toBe(300)
  })

  it("reparte en partes iguales si los costos están en monedas distintas", () => {
    const op = operation({ id: "op-m", sale_amount_total: 1000 })
    const items = [
      item({
        operation_id: "op-m",
        id: "a",
        product_type: "FLIGHT",
        cost: 300,
        cost_currency: "USD",
      }),
      item({
        operation_id: "op-m",
        id: "b",
        product_type: "HOTEL",
        cost: 100,
        cost_currency: "ARS",
      }),
    ]

    const { slices, source } = prorateOperation(op, items, undefined)
    expect(source).toBe("even")
    expect(slices.every((s) => s.sale === 500)).toBe(true)
  })

  it("una operación sin ítems atribuye el 100% a su propio tipo", () => {
    const op = operation({ id: "op-n", sale_amount_total: 750, product_type: "AEREO" })
    const { slices, source } = prorateOperation(op, [], undefined)

    expect(source).toBe("operation")
    expect(slices).toHaveLength(1)
    expect(slices[0].key).toBe("FLIGHT")
    expect(slices[0].sale).toBe(750)
  })

  it("es determinístico: el orden de los ítems no cambia el reparto", () => {
    const op = operation({ id: "op-d", sale_amount_total: 100 })
    const a = item({ operation_id: "op-d", id: "b", product_type: "HOTEL", sale_amount: 1 })
    const bItem = item({ operation_id: "op-d", id: "a", product_type: "FLIGHT", sale_amount: 1 })
    const c = item({ operation_id: "op-d", id: "c", product_type: "TRANSFER", sale_amount: 1 })

    const first = prorateOperation(op, [a, bItem, c], undefined)
    const second = prorateOperation(op, [c, a, bItem], undefined)

    const key = (r: typeof first) =>
      r.slices.map((s) => `${s.key}:${s.sale}`).sort().join("|")
    expect(key(first)).toBe(key(second))
  })
})

describe("buildSalesBreakdownReport", () => {
  it("la suma de los productos es exactamente la venta del período", () => {
    const ops = [
      operation({ id: "o1", sale_amount_total: 1000 }),
      operation({ id: "o2", sale_amount_total: 333.33 }),
      operation({ id: "o3", sale_amount_total: 0.07 }),
    ]
    const items = [
      item({ operation_id: "o1", product_type: "FLIGHT", sale_amount: 2 }),
      item({ operation_id: "o1", product_type: "HOTEL", sale_amount: 1 }),
      item({ operation_id: "o2", product_type: "FLIGHT", cost: 1 }),
      item({ operation_id: "o2", product_type: "TRANSFER", cost: 1 }),
      item({ operation_id: "o2", product_type: "ASSISTANCE", cost: 1 }),
      item({ operation_id: "o3", product_type: "FLIGHT", sale_amount: 1 }),
      item({ operation_id: "o3", product_type: "HOTEL", sale_amount: 1 }),
    ]

    const report = build(ops, items)
    const sumBuckets = report.byProduct.reduce((acc, b) => acc + b.sale, 0)

    expect(Math.round(sumBuckets * 100) / 100).toBe(report.summary.sale)
    expect(report.summary.sale).toBe(1333.4)
  })

  it("la suma por vendedor y por agencia también cierra exacto", () => {
    const ops = [
      operation({ id: "o1", sale_amount_total: 1000, seller_id: "seller-a", agency_id: "ag-1" }),
      operation({
        id: "o2",
        sale_amount_total: 500,
        seller_id: "seller-b",
        seller_secondary_id: "seller-a",
        agency_id: "ag-2",
      }),
    ]
    const report = build(ops)

    expect(report.bySeller.reduce((acc, s) => acc + s.sale, 0)).toBe(report.summary.sale)
    expect(report.byAgency.reduce((acc, a) => acc + a.sale, 0)).toBe(report.summary.sale)

    // El secundario no infla el total: su participación se informa aparte.
    const ana = report.bySeller.find((s) => s.sellerId === "seller-a")!
    expect(ana.sale).toBe(1000)
    expect(ana.secondarySale).toBe(500)
    expect(ana.secondaryOperations).toBe(1)
  })

  it("unifica AEREO y FLIGHT en el mismo bucket", () => {
    const ops = [
      operation({ id: "o1", sale_amount_total: 100, product_type: "AEREO" }),
      operation({ id: "o2", sale_amount_total: 200, product_type: null, type: "FLIGHT" }),
    ]
    const report = build(ops)

    expect(report.byProduct).toHaveLength(1)
    expect(report.byProduct[0].key).toBe("FLIGHT")
    expect(report.byProduct[0].label).toBe("Vuelo")
    expect(report.byProduct[0].sale).toBe(300)
  })

  it("conserva los tipos de producto propios de la organización", () => {
    const ops = [operation({ id: "o1", sale_amount_total: 100 })]
    const items = [item({ operation_id: "o1", product_type: "Bodas destino" })]
    const report = build(ops, items)

    expect(report.byProduct[0].key).toBe("BODAS DESTINO")
    expect(report.byProduct[0].label).toBe("Bodas destino")
  })

  it("excluye las operaciones canceladas vía el filtro de la lectura", () => {
    // El agregador recibe solo lo no cancelado; se verifica que no lo re-agregue.
    const report = build([operation({ id: "o1", sale_amount_total: 100 })])
    expect(report.summary.operations).toBe(1)
  })

  it("los servicios adicionales van a su propio bucket sin romper el invariante", () => {
    const ops = [operation({ id: "o1", sale_amount_total: 1000 })]
    const items = [
      item({ operation_id: "o1", product_type: "FLIGHT", sale_amount: 1 }),
      item({ operation_id: "o1", product_type: "HOTEL", sale_amount: 1 }),
    ]
    const report = build(ops, items, {
      includeServices: true,
      serviceExtras: { o1: { saleExtra: 150, costExtra: 90 } },
    })

    const services = report.byProduct.find((b) => b.key === "SERVICES")!
    expect(services.sale).toBe(150)
    expect(services.label).toBe("Servicios adicionales")
    expect(report.summary.sale).toBe(1150)
    expect(report.byProduct.reduce((acc, b) => acc + b.sale, 0)).toBe(1150)
  })

  it("sin la flag de servicios, no aparece el bucket", () => {
    const report = build([operation({ id: "o1", sale_amount_total: 1000 })], [], {
      includeServices: false,
      serviceExtras: {},
    })
    expect(report.byProduct.find((b) => b.key === "SERVICES")).toBeUndefined()
    expect(report.summary.sale).toBe(1000)
  })

  it("no mezcla monedas e informa la venta de la otra", () => {
    const ops = [
      operation({ id: "o1", sale_amount_total: 1000, sale_currency: "ARS" }),
      operation({
        id: "o2",
        sale_amount_total: 400,
        sale_currency: "USD",
        currency: "USD",
        seller_id: "seller-a",
        agency_id: "ag-1",
      }),
    ]
    const report = build(ops)

    expect(report.summary.sale).toBe(1000)
    expect(report.summary.operations).toBe(1)
    expect(report.summary.otherCurrency).toEqual({ currency: "USD", sale: 400, operations: 1 })
    expect(report.bySeller.find((s) => s.sellerId === "seller-a")!.otherCurrencySale).toBe(400)
  })

  it("no calcula margen del bucket cuando el costo está en otra moneda", () => {
    const ops = [operation({ id: "o1", sale_amount_total: 1000, sale_currency: "ARS" })]
    const items = [
      item({
        operation_id: "o1",
        product_type: "FLIGHT",
        sale_amount: 1,
        cost: 500,
        cost_currency: "USD",
      }),
    ]
    const report = build(ops, items)

    const flight = report.byProduct.find((b) => b.key === "FLIGHT")!
    expect(flight.margin).toBeNull()
    expect(flight.marginPct).toBeNull()
    expect(flight.costOtherCurrency).toBe(500)
  })

  it("informa cómo se atribuyó cada operación", () => {
    const ops = [
      operation({ id: "o1", sale_amount_total: 100 }),
      operation({ id: "o2", sale_amount_total: 100 }),
      operation({ id: "o3", sale_amount_total: 100 }),
    ]
    const items = [
      // o1: el desglose por venta CUADRA con el total (50+50=100) → item_sale.
      item({ operation_id: "o1", product_type: "FLIGHT", sale_amount: 50 }),
      item({ operation_id: "o1", product_type: "HOTEL", sale_amount: 50 }),
      item({ operation_id: "o2", product_type: "FLIGHT", cost: 5 }),
      item({ operation_id: "o2", product_type: "HOTEL", cost: 5 }),
    ]
    const report = build(ops, items)

    expect(report.summary.attribution.operationsByItemSale).toBe(1)
    expect(report.summary.attribution.operationsByItemCost).toBe(1)
    expect(report.summary.attribution.operationsWithoutItems).toBe(1)
    expect(report.summary.attribution.itemsTotal).toBe(4)
  })

  it("rellena los meses sin ventas en cero", () => {
    const ops = [
      operation({ id: "o1", sale_amount_total: 100, operation_date: "2026-01-10" }),
      operation({ id: "o2", sale_amount_total: 300, operation_date: "2026-03-10" }),
    ]
    const report = build(ops, [], { dateFrom: "2026-01-01", dateTo: "2026-03-31" })

    expect(report.byMonth.map((m) => m.key)).toEqual(["2026-01", "2026-02", "2026-03"])
    expect(report.byMonth.map((m) => m.sale)).toEqual([100, 0, 300])
  })

  it("período sin ventas: cero en todo, sin división por cero", () => {
    const report = build([
      operation({ id: "o1", sale_amount_total: 500, sale_currency: "USD", currency: "USD" }),
    ])

    expect(report.summary.sale).toBe(0)
    expect(report.summary.marginPct).toBe(0)
    expect(report.summary.averageTicket).toBe(0)
    expect(report.byProduct).toEqual([])
  })
})

describe("normalizeProductType", () => {
  it("mapea el vocabulario español al canónico", () => {
    expect(normalizeProductType("AEREO")).toBe("FLIGHT")
    expect(normalizeProductType("AÉREO")).toBe("FLIGHT")
    expect(normalizeProductType("Paquete")).toBe("PACKAGE")
    expect(normalizeProductType("CRUCERO")).toBe("CRUISE")
    expect(normalizeProductType("Seguro")).toBe("ASSISTANCE")
    expect(normalizeProductType("OTRO")).toBe("UNSPECIFIED")
  })

  it("respeta el vocabulario inglés y los tipos custom", () => {
    expect(normalizeProductType("FLIGHT")).toBe("FLIGHT")
    expect(normalizeProductType("assistance")).toBe("ASSISTANCE")
    expect(normalizeProductType("  Luna de miel ")).toBe("LUNA DE MIEL")
  })

  it("vacío o nulo cae en Sin clasificar", () => {
    expect(normalizeProductType(null)).toBe("UNSPECIFIED")
    expect(normalizeProductType("   ")).toBe("UNSPECIFIED")
    expect(productTypeLabel("UNSPECIFIED")).toBe("Sin clasificar")
  })
})
