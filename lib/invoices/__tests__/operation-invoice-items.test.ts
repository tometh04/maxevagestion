/**
 * VIB-121 — facturar varios servicios de una operación en un mismo comprobante.
 *
 * Milla Cero necesita unificar en una factura varios servicios del mismo
 * operador. Antes solo se podía elegir UNA pata (VIB-112 fase 1) o la venta
 * completa, así que un paquete con vuelo + hotel + transfer del mismo proveedor
 * obligaba a emitir tres comprobantes o a facturar todo junto sin desglose.
 *
 * Lo que estos tests protegen no es la pantalla, es la plata: que el costo del
 * operador siga viajando como NO GRAVADO (pass-through) y solo la ganancia vaya
 * GRAVADA al 10,5%, y que sumar servicios nunca supere la venta total —el tope
 * que valida el servidor (VIB-151 / VIB-157).
 */

import {
  buildFullSaleItems,
  buildLegInvoiceItems,
  getLegLabel,
} from "@/lib/invoices/operation-invoice-items"
import type { InvoiceableOperation } from "@/lib/invoices/operation-invoice-items"

const CBTE_FACTURA_B = 6

/** Operación en ARS con tres patas y desglose de venta cargado (VIB-112). */
function balancedOperation(): Required<Pick<InvoiceableOperation, "operation_operators">> &
  InvoiceableOperation {
  return {
    file_code: "OP-20260101-ABCD1234",
    destination: "Cancún",
    sale_currency: "ARS" as const,
    sale_amount_total: 1_000_000,
    operator_cost: 700_000,
    operation_operators: [
      {
        product_type: "FLIGHT",
        cost: 400_000,
        cost_currency: "ARS" as const,
        sale_amount: 500_000,
        operators: { name: "Aerolíneas" },
      },
      {
        product_type: "HOTEL",
        cost: 250_000,
        cost_currency: "ARS" as const,
        sale_amount: 400_000,
        operators: { name: "Meliá" },
      },
      {
        product_type: "TRANSFER",
        cost: 50_000,
        cost_currency: "ARS" as const,
        sale_amount: 100_000,
        operators: { name: "Traslados SA" },
      },
    ],
  }
}

/** Misma operación pero sin `sale_amount`: hay que repartir por costo. */
function unbalancedOperation() {
  const op = balancedOperation()
  return {
    ...op,
    operation_operators: op.operation_operators.map((leg) => ({
      ...leg,
      sale_amount: null,
    })),
  }
}

const sumPrices = (items: Array<{ precio_unitario: number }>) =>
  Math.round(items.reduce((acc, it) => acc + it.precio_unitario, 0) * 100) / 100

describe("buildLegInvoiceItems — varios servicios en una factura", () => {
  it("emite un par de ítems por cada servicio seleccionado", () => {
    const items = buildLegInvoiceItems({
      operation: balancedOperation(),
      legIndexes: [0, 1],
      cbteTipo: CBTE_FACTURA_B,
    })

    // Vuelo: 500.000 de venta, 400.000 de costo → 400.000 no gravado + 100.000 gravado.
    // Hotel: 400.000 de venta, 250.000 de costo → 250.000 no gravado + 150.000 gravado.
    expect(items).toHaveLength(4)
    expect(items[0]).toMatchObject({
      precio_unitario: 400_000,
      tax_treatment: "NO_GRAVADO",
      iva_porcentaje: 0,
    })
    expect(items[1]).toMatchObject({
      precio_unitario: 100_000,
      tax_treatment: "GRAVADO",
      iva_porcentaje: 10.5,
    })
    expect(items[2]).toMatchObject({ precio_unitario: 250_000, tax_treatment: "NO_GRAVADO" })
    expect(items[3]).toMatchObject({ precio_unitario: 150_000, tax_treatment: "GRAVADO" })
  })

  it("nombra cada ítem con su servicio, para que la factura sea legible", () => {
    const items = buildLegInvoiceItems({
      operation: balancedOperation(),
      legIndexes: [0, 1],
      cbteTipo: CBTE_FACTURA_B,
    })

    expect(items[0].descripcion).toContain("Aéreo - Aerolíneas")
    expect(items[2].descripcion).toContain("Hotel - Meliá")
    // El file code va en todos, que es lo que se concilia después.
    expect(items.every((it) => it.descripcion.includes("OP-20260101-ABCD1234"))).toBe(true)
  })

  it("seleccionar TODOS los servicios no supera la venta total", () => {
    const items = buildLegInvoiceItems({
      operation: balancedOperation(),
      legIndexes: [0, 1, 2],
      cbteTipo: CBTE_FACTURA_B,
    })

    expect(sumPrices(items)).toBe(1_000_000)
  })

  it("con reparto por costo, todos los servicios también cierran en la venta total", () => {
    const items = buildLegInvoiceItems({
      operation: unbalancedOperation(),
      legIndexes: [0, 1, 2],
      cbteTipo: CBTE_FACTURA_B,
    })

    expect(sumPrices(items)).toBe(1_000_000)
  })

  it("un subconjunto nunca supera la venta total", () => {
    const items = buildLegInvoiceItems({
      operation: balancedOperation(),
      legIndexes: [0, 2],
      cbteTipo: CBTE_FACTURA_B,
    })

    expect(sumPrices(items)).toBe(600_000)
    expect(sumPrices(items)).toBeLessThan(1_000_000)
  })

  it("el orden lo fija la operación, no el orden en que se tildó", () => {
    const enOrden = buildLegInvoiceItems({
      operation: balancedOperation(),
      legIndexes: [0, 2],
      cbteTipo: CBTE_FACTURA_B,
    })
    const alReves = buildLegInvoiceItems({
      operation: balancedOperation(),
      legIndexes: [2, 0],
      cbteTipo: CBTE_FACTURA_B,
    })

    expect(alReves).toEqual(enOrden)
  })

  it("un índice repetido no duplica el ítem ni el importe", () => {
    const items = buildLegInvoiceItems({
      operation: balancedOperation(),
      legIndexes: [1, 1],
      cbteTipo: CBTE_FACTURA_B,
    })

    expect(items).toHaveLength(2)
    expect(sumPrices(items)).toBe(400_000)
  })

  it("ignora índices que no existen y factura solo los válidos", () => {
    const items = buildLegInvoiceItems({
      operation: balancedOperation(),
      legIndexes: [1, 99, -3],
      cbteTipo: CBTE_FACTURA_B,
    })

    expect(sumPrices(items)).toBe(400_000)
  })

  it("sin servicios seleccionados cae a la venta completa", () => {
    const operation = balancedOperation()

    expect(
      buildLegInvoiceItems({ operation, legIndexes: [], cbteTipo: CBTE_FACTURA_B })
    ).toEqual(buildFullSaleItems(operation, CBTE_FACTURA_B))
  })

  it("un servicio sin ganancia emite solo el ítem no gravado", () => {
    const operation = balancedOperation()
    operation.operation_operators[2] = {
      ...operation.operation_operators[2],
      cost: 100_000,
      sale_amount: 100_000,
    }

    const items = buildLegInvoiceItems({
      operation,
      legIndexes: [2],
      cbteTipo: CBTE_FACTURA_B,
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ precio_unitario: 100_000, tax_treatment: "NO_GRAVADO" })
  })

  it("un costo mayor que la venta no genera un gravado negativo", () => {
    const operation = balancedOperation()
    operation.operation_operators[2] = {
      ...operation.operation_operators[2],
      cost: 300_000,
      sale_amount: 100_000,
    }

    const items = buildLegInvoiceItems({
      operation,
      legIndexes: [2],
      cbteTipo: CBTE_FACTURA_B,
    })

    expect(items.every((it) => it.precio_unitario >= 0)).toBe(true)
    // El pass-through se topea en la venta de la pata: no se factura más de lo vendido.
    expect(sumPrices(items)).toBe(100_000)
  })
})

describe("buildLegInvoiceItems — monedas mezcladas", () => {
  it("convierte el costo en USD de una pata a la moneda de venta en ARS", () => {
    const operation = {
      ...balancedOperation(),
      sale_currency: "ARS" as const,
    }
    operation.operation_operators[0] = {
      ...operation.operation_operators[0],
      cost: 400,
      cost_currency: "USD" as const,
      sale_amount: 500_000,
    }

    const items = buildLegInvoiceItems({
      operation,
      legIndexes: [0],
      cbteTipo: CBTE_FACTURA_B,
      exchangeRate: 1000,
    })

    // USD 400 × 1000 = 400.000 no gravado; el resto de los 500.000, gravado.
    expect(items[0]).toMatchObject({ precio_unitario: 400_000, tax_treatment: "NO_GRAVADO" })
    expect(items[1]).toMatchObject({ precio_unitario: 100_000, tax_treatment: "GRAVADO" })
  })
})

describe("getLegLabel", () => {
  it("combina tipo de producto y operador", () => {
    expect(getLegLabel({ product_type: "HOTEL", operators: { name: "Meliá" } }, 0)).toBe(
      "Hotel - Meliá"
    )
  })

  it("traduce los tipos propios de la agencia en vez de mostrar el valor crudo", () => {
    expect(getLegLabel({ product_type: "ALOJAMIENTO_Y_TRASLADOS" }, 0)).toBe(
      "Alojamiento y traslados"
    )
  })

  it("cae a un nombre posicional cuando no hay ni tipo ni operador", () => {
    expect(getLegLabel({}, 2)).toBe("Servicio 3")
  })
})
