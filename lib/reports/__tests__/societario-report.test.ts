/**
 * @jest-environment node
 *
 * Reporte Societario (VIB-101).
 *
 * Lo que se fija acá es la cadena de la ganancia y su reparto: es el número que
 * se lleva a una reunión de socios, así que cada resta tiene que ser
 * verificable y nada puede desaparecer en silencio.
 */

import { buildSocietarioReport, type BuildSocietarioReportParams } from "../societario-report"

const DEFAULTS = {
  operations: [],
  expenses: [],
  commissionRecords: [],
  referralCommissions: [],
  partners: [],
  currency: "USD",
  ivaRate: 0.105,
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
}

function build(over: Partial<BuildSocietarioReportParams> = {}) {
  return buildSocietarioReport({ ...DEFAULTS, ...over } as BuildSocietarioReportParams)
}

/** Operación de venta, con lo mínimo que mira el agregador. */
function venta(over: Record<string, any> = {}) {
  return {
    id: "op-1",
    file_code: "OP-1",
    destination: "Cancún",
    operation_date: "2026-07-10",
    departure_date: "2026-08-01",
    sale_amount_total: 10000,
    operator_cost: 8000,
    margin_amount: 2000,
    sale_currency: "USD",
    currency: "USD",
    status: "CONFIRMED",
    type: null,
    product_type: null,
    seller_id: "u-1",
    seller_secondary_id: null,
    agency_id: "ag-1",
    ...over,
  } as any
}

function gasto(over: Record<string, any> = {}) {
  return {
    id: "e-1",
    expense_type: "variable",
    description: "Facebook Ads",
    provider_name: null,
    category: "Marketing",
    category_color: null,
    amount: 100,
    currency: "USD",
    movement_date: "2026-07-15",
    notes: null,
    financial_accounts: null,
    users: null,
    is_paid: true,
    agency_id: "ag-1",
    ...over,
  } as any
}

function comision(over: Record<string, any> = {}) {
  return {
    id: "c-1",
    operation_id: "op-1",
    seller_id: "u-1",
    agency_id: "ag-1",
    amount: 200,
    amount_paid: 0,
    percentage: 10,
    status: "PENDING",
    date_calculated: "2026-07-11",
    date_paid: null,
    operations: {
      id: "op-1",
      file_code: "OP-1",
      destination: "Cancún",
      operation_date: "2026-07-10",
      departure_date: "2026-08-01",
      sale_amount_total: 10000,
      margin_amount: 2000,
      sale_currency: "USD",
      currency: "USD",
      status: "CONFIRMED",
      seller_id: "u-1",
      seller_secondary_id: null,
      commission_split: null,
      agency_id: "ag-1",
    },
    ...over,
  } as any
}

/** Movimiento de resultado financiero. Por defecto, ganancia por depósito. */
function financiero(over: Record<string, any> = {}) {
  return {
    id: "f-1",
    kind: "INCOME",
    concept: "Ganancia financiera por depósito - REC-1",
    amount: 300,
    currency: "USD",
    movement_date: "2026-07-20",
    accountId: "acc-1",
    receiptNumber: "REC-1",
    ...over,
  } as any
}

function referido(over: Record<string, any> = {}) {
  return {
    id: "r-1",
    operationId: "op-1",
    partnerId: "rp-1",
    amount: 100,
    currency: "USD",
    status: "PENDING",
    operationDate: "2026-07-10",
    agencyId: "ag-1",
    ...over,
  }
}

const SOCIOS = [
  { id: "p-1", name: "Yamil", percentage: 60, isActive: true },
  { id: "p-2", name: "Santi", percentage: 40, isActive: true },
]

// ─────────────────────────────── Ventas ───────────────────────────────

describe("ventas", () => {
  it("cuenta una venta por operación y suma la facturación", () => {
    const r = build({ operations: [venta(), venta({ id: "op-2", file_code: "OP-2" })] })
    expect(r.ventas.count).toBe(2)
    expect(r.ventas.total).toBe(20000)
    expect(r.ventas.cost).toBe(16000)
    expect(r.ventas.margin).toBe(4000)
    expect(r.ventas.averageTicket).toBe(10000)
  })

  it("suma los servicios adicionales a la venta, al costo y al margen", () => {
    const r = build({
      operations: [venta()],
      includeServices: true,
      serviceExtras: { "op-1": { saleExtra: 500, costExtra: 300 } },
    })
    expect(r.ventas.total).toBe(10500)
    expect(r.ventas.cost).toBe(8300)
    // El margen suma solo el NETO del servicio: 2000 + (500 − 300).
    expect(r.ventas.margin).toBe(2200)
  })

  it("recalcula el margen cuando el guardado está desactualizado", () => {
    // Se editó la venta y no se recalculó margin_amount. El motor de comisiones
    // ya usa el recalculado: el reporte tiene que usar el mismo número o la
    // relación comisión/margen queda mintiendo.
    const r = build({ operations: [venta({ margin_amount: 50 })] })
    expect(r.ventas.margin).toBe(2000)
    expect(r.ventas.marginRecalculated).toBe(1)
    expect(r.warnings.map((w) => w.code)).toContain("MARGIN_RECALCULATED")
  })

  it("respeta el margen guardado si la diferencia entra en la tolerancia", () => {
    const r = build({ operations: [venta({ margin_amount: 1999.5 })] })
    expect(r.ventas.margin).toBe(1999.5)
    expect(r.ventas.marginRecalculated).toBe(0)
  })

  it("agrupa por mes y deja los meses sin ventas en cero", () => {
    const r = build({
      dateFrom: "2026-06-01",
      dateTo: "2026-08-31",
      operations: [venta({ operation_date: "2026-06-05" }), venta({ id: "op-2", operation_date: "2026-08-20" })],
    })
    expect(r.ventas.byMonth.map((m) => m.key)).toEqual(["2026-06", "2026-07", "2026-08"])
    expect(r.ventas.byMonth.map((m) => m.count)).toEqual([1, 0, 1])
  })

  it("bucketea en hora Argentina cuando la fecha viene con hora", () => {
    // 01/08 01:00 UTC son las 22:00 del 31/07 en Argentina: es venta de julio.
    const r = build({
      dateFrom: "2026-07-01",
      dateTo: "2026-08-31",
      operations: [venta({ operation_date: "2026-08-01T01:00:00+00:00" })],
    })
    const julio = r.ventas.byMonth.find((m) => m.key === "2026-07")!
    expect(julio.count).toBe(1)
  })
})

// ─────────────────────────────── Moneda ───────────────────────────────

describe("consolidación de monedas", () => {
  const getRate = () => 1000

  it("junta ARS y USD en la moneda elegida", () => {
    const r = build({
      currency: "USD",
      getRate,
      operations: [
        venta({ id: "usd", sale_amount_total: 1000, operator_cost: 0, margin_amount: 1000 }),
        venta({
          id: "ars",
          sale_currency: "ARS",
          currency: "ARS",
          sale_amount_total: 500000,
          operator_cost: 0,
          margin_amount: 500000,
        }),
      ],
    })
    expect(r.ventas.total).toBe(1500) // 1000 USD + 500.000/1000
    expect(r.ventas.missingRate).toEqual([])
  })

  it("con TC fijo valúa todo al mismo tipo de cambio", () => {
    const r = build({
      currency: "ARS",
      getRate: () => 999,
      fixedRate: 1500,
      operations: [venta({ sale_amount_total: 100, operator_cost: 0, margin_amount: 100 })],
    })
    expect(r.ventas.total).toBe(150000)
    expect(r.conversion).toEqual({ mode: "fixed", rate: 1500 })
  })

  it("lo que no se puede convertir queda fuera del total y se informa", () => {
    // Sin TC no hay forma de expresar los pesos en dólares. El monto NO se
    // cuenta como cero: sale listado en su moneda original.
    const r = build({
      currency: "USD",
      operations: [
        venta({ id: "usd", sale_amount_total: 1000, operator_cost: 0, margin_amount: 1000 }),
        venta({
          id: "ars",
          sale_currency: "ARS",
          currency: "ARS",
          sale_amount_total: 500000,
          operator_cost: 0,
          margin_amount: 500000,
        }),
      ],
    })
    expect(r.ventas.total).toBe(1000)
    expect(r.ventas.missingRate).toEqual([{ currency: "ARS", count: 1, total: 500000 }])
    expect(r.warnings.map((w) => w.code)).toContain("MISSING_RATE")
  })
})

// ──────────────────────────────── IVA ─────────────────────────────────

describe("IVA y ganancia neta", () => {
  it("aplica la alícuota sobre el margen", () => {
    const r = build({ operations: [venta()], ivaRate: 0.105 })
    expect(r.resultado.gananciaBruta).toBe(2000)
    expect(r.resultado.ivaBase).toBe(2000)
    expect(r.resultado.iva).toBe(210)
    expect(r.resultado.margenNetoIva).toBe(1790)
  })

  it("una operación con pérdida no borra el IVA de las que ganaron", () => {
    // La base es la suma de los márgenes POSITIVOS: max(0, Σ) dejaría que una
    // pérdida grande licúe el débito fiscal de las demás.
    const r = build({
      operations: [
        venta({ id: "gana", sale_amount_total: 10000, operator_cost: 8000, margin_amount: 2000 }),
        venta({ id: "pierde", sale_amount_total: 1000, operator_cost: 3000, margin_amount: -2000 }),
      ],
      ivaRate: 0.105,
    })
    expect(r.resultado.gananciaBruta).toBe(0)
    expect(r.resultado.ivaBase).toBe(2000)
    expect(r.resultado.iva).toBe(210)
  })

  it("con alícuota 0 no descuenta IVA", () => {
    // Escape para la org que ya carga el IVA como gasto.
    const r = build({
      operations: [venta()],
      expenses: [gasto({ amount: 100 })],
      commissionRecords: [comision({ amount: 200 })],
      ivaRate: 0,
    })
    expect(r.resultado.iva).toBe(0)
    expect(r.resultado.gananciaNeta).toBe(2000 - 200 - 100)
  })

  it("mantiene la invariante neta = bruta − iva − comisiones − gastos + resultado financiero", () => {
    const r = build({
      operations: [
        venta({ sale_amount_total: 13333.33, operator_cost: 9111.11, margin_amount: 4222.22 }),
      ],
      expenses: [gasto({ amount: 777.77 })],
      commissionRecords: [comision({ amount: 333.33 })],
      referralCommissions: [referido({ amount: 111.11 })],
      financialMovements: [
        financiero({ amount: 55.55 }),
        financiero({ id: "f-2", kind: "COST", amount: 22.22 }),
      ],
      ivaRate: 0.105,
    })
    const { gananciaBruta, iva, comisiones, gastos, resultadoFinanciero, gananciaNeta } = r.resultado
    expect(gananciaNeta).toBeCloseTo(
      gananciaBruta - iva - comisiones - gastos + resultadoFinanciero,
      2
    )
  })

  it("no clampea la pérdida", () => {
    const r = build({
      operations: [venta({ sale_amount_total: 1000, operator_cost: 900, margin_amount: 100 })],
      expenses: [gasto({ amount: 5000 })],
    })
    expect(r.resultado.gananciaNeta).toBeLessThan(0)
    expect(r.warnings.map((w) => w.code)).toContain("NEGATIVE_RESULT")
  })

  it("la cascada refleja la cadena completa", () => {
    const r = build({ operations: [venta()], expenses: [gasto()], commissionRecords: [comision()] })
    expect(r.resultado.waterfall.map((s) => s.key)).toEqual([
      "ventas", "costo", "bruta", "iva", "neto-iva", "comisiones", "gastos", "neta",
    ])
    const neta = r.resultado.waterfall.find((s) => s.key === "neta")!
    expect(neta.amount).toBe(r.resultado.gananciaNeta)
  })

  it("con movimientos financieros la cascada suma su línea antes de la neta", () => {
    const r = build({
      operations: [venta()],
      expenses: [gasto()],
      commissionRecords: [comision()],
      financialMovements: [financiero()],
    })
    expect(r.resultado.waterfall.map((s) => s.key)).toEqual([
      "ventas", "costo", "bruta", "iva", "neto-iva", "comisiones", "gastos", "financiero", "neta",
    ])
  })
})

// ────────────────────────────── Comisiones ────────────────────────────

describe("comisiones", () => {
  it("suma vendedores y referidores por separado", () => {
    const r = build({
      operations: [venta()],
      commissionRecords: [comision({ amount: 200 }), comision({ id: "c-2", amount: 50 })],
      referralCommissions: [referido({ amount: 100 })],
    })
    expect(r.comisiones.sellers).toEqual({ total: 250, count: 2 })
    expect(r.comisiones.referrals).toEqual({ total: 100, count: 1 })
    expect(r.comisiones.total).toBe(350)
  })

  it("no cuenta dos veces la comisión y el referido de la misma operación", () => {
    // Son entidades distintas en tablas distintas: la del vendedor y la del
    // referidor coexisten sobre la misma venta y ambas son plata a repartir.
    const r = build({
      operations: [venta()],
      commissionRecords: [comision({ operation_id: "op-1", amount: 200 })],
      referralCommissions: [referido({ operationId: "op-1", amount: 100 })],
    })
    expect(r.comisiones.total).toBe(300)
  })

  it("declara que la base es la ganancia bruta", () => {
    const r = build({ operations: [venta()], commissionRecords: [comision({ amount: 200 })] })
    expect(r.comisiones.base).toBe("GROSS_MARGIN")
    // 200 sobre 2000 de margen bruto.
    expect(r.comisiones.effectiveRate).toBe(10)
  })

  it("valúa la comisión con la fecha de su venta, no con otra", () => {
    // Si la comisión se convirtiera con una fecha distinta a la de la venta, la
    // relación comisión/margen se movería sola por el tipo de cambio.
    const rates: Record<string, number> = { "2026-07-10": 1000, "2026-07-25": 2000 }
    const r = build({
      currency: "USD",
      getRate: (d) => rates[String(d).slice(0, 10)] ?? null,
      operations: [venta()],
      commissionRecords: [
        comision({
          amount: 200000,
          operations: { ...comision().operations, sale_currency: "ARS", currency: "ARS" },
        }),
      ],
    })
    expect(r.comisiones.sellers.total).toBe(200) // 200.000 / 1000 (TC del 10/07)
  })

  it("informa lo excluido en vez de esconderlo", () => {
    const r = build({
      operations: [venta()],
      commissionsExcluded: { settled: 3, cancelled: 2 },
    })
    expect(r.comisiones.excluded).toEqual({ settled: 3, cancelled: 2 })
  })
})

// ──────────────────────────────── Gastos ──────────────────────────────

describe("gastos", () => {
  it("separa fijos de variables y agrupa por categoría", () => {
    const r = build({
      expenses: [
        gasto({ id: "e-1", amount: 100, category: "Marketing" }),
        gasto({ id: "e-2", amount: 300, category: "Sueldos", expense_type: "recurring" }),
      ],
    })
    expect(r.gastos.total).toBe(400)
    expect(r.gastos.variable).toBe(100)
    expect(r.gastos.recurring).toBe(300)
    expect(r.gastos.byCategory.map((c) => c.category)).toEqual(["Sueldos", "Marketing"])
  })

  it("informa los turísticos excluidos para explicar la diferencia con Gastos", () => {
    const r = build({ expenses: [gasto()], excludedTouristicCount: 12 })
    expect(r.gastos.excludedTouristic).toBe(12)
  })

  it("avisa si hay comisiones cargadas como gasto (doble resta)", () => {
    const r = build({
      operations: [venta()],
      expenses: [gasto({ category: "Comisiones vendedores", amount: 500 })],
      commissionRecords: [comision({ amount: 200 })],
    })
    const w = r.warnings.find((x) => x.code === "COMMISSION_LIKE_EXPENSES")
    expect(w).toBeDefined()
    expect(w!.level).toBe("danger")
    // Nunca se auto-resta: el total sigue incluyendo el gasto tal como se cargó.
    expect(r.gastos.total).toBe(500)
  })

  it("avisa si hay impuestos como gasto y además se estima IVA", () => {
    const r = build({
      operations: [venta()],
      expenses: [gasto({ category: "Impuestos", amount: 300 })],
      ivaRate: 0.105,
    })
    expect(r.warnings.map((w) => w.code)).toContain("TAX_LIKE_EXPENSES")
  })

  it("no avisa por impuestos si la alícuota está en 0", () => {
    const r = build({
      operations: [venta()],
      expenses: [gasto({ category: "Impuestos", amount: 300 })],
      ivaRate: 0,
    })
    expect(r.warnings.map((w) => w.code)).not.toContain("TAX_LIKE_EXPENSES")
  })
})

// ─────────────────────────── Resultado financiero ─────────────────────

describe("resultado financiero", () => {
  it("netea la ganancia financiera contra el costo financiero en una sola línea", () => {
    const r = build({
      operations: [venta()],
      financialMovements: [
        financiero({ amount: 300 }),
        financiero({ id: "f-2", kind: "COST", amount: 100 }),
      ],
    })
    expect(r.financiero.ingresos).toBe(300)
    expect(r.financiero.costos).toBe(100)
    expect(r.financiero.neto).toBe(200)
    expect(r.resultado.resultadoFinanciero).toBe(200)
  })

  it("suma a la ganancia neta cuando la financiera dejó ganancia", () => {
    const sinFinanciera = build({ operations: [venta()], ivaRate: 0 })
    const conGanancia = build({
      operations: [venta()],
      ivaRate: 0,
      financialMovements: [financiero({ amount: 300 })],
    })
    expect(conGanancia.resultado.gananciaNeta).toBe(
      sinFinanciera.resultado.gananciaNeta + 300
    )
  })

  it("resta de la ganancia neta cuando la financiera dejó pérdida", () => {
    const sinFinanciera = build({ operations: [venta()], ivaRate: 0 })
    const conCosto = build({
      operations: [venta()],
      ivaRate: 0,
      financialMovements: [financiero({ kind: "COST", amount: 250 })],
    })
    expect(conCosto.resultado.resultadoFinanciero).toBe(-250)
    expect(conCosto.resultado.gananciaNeta).toBe(
      sinFinanciera.resultado.gananciaNeta - 250
    )
  })

  it("no lo cuenta como gasto operativo", () => {
    // Es todo el punto del cambio: un costo financiero cargado como gasto
    // variable ensuciaba "Gastos operativos" y bajaba lo que se reparte entre
    // socios por el renglón equivocado.
    const r = build({
      operations: [venta()],
      financialMovements: [financiero({ kind: "COST", amount: 250 })],
    })
    expect(r.gastos.total).toBe(0)
    expect(r.gastos.count).toBe(0)
  })

  it("sin movimientos financieros la cascada no muestra la línea", () => {
    const r = build({ operations: [venta()] })
    expect(r.resultado.waterfall.map((s) => s.key)).not.toContain("financiero")
    expect(r.financiero.count).toBe(0)
    expect(r.resultado.resultadoFinanciero).toBe(0)
  })

  it("el desglose muestra la ganancia y el costo por separado", () => {
    const r = build({
      operations: [venta()],
      financialMovements: [
        financiero({ amount: 300 }),
        financiero({ id: "f-2", kind: "COST", amount: 100 }),
      ],
    })
    const linea = r.resultado.waterfall.find((s) => s.key === "financiero")!
    expect(linea.kind).toBe("adjustment")
    expect(linea.breakdown?.map((b) => b.key)).toEqual(["ganancia", "costo"])
    expect(linea.breakdown?.map((b) => b.amount)).toEqual([300, -100])
    // El desglose tiene que sumar el importe de su línea, como el resto.
    const suma = linea.breakdown!.reduce((acc, b) => acc + b.amount, 0)
    expect(suma).toBeCloseTo(linea.amount, 2)
  })

  it("no arma la fila de costo si sólo hubo ganancia", () => {
    const r = build({ operations: [venta()], financialMovements: [financiero({ amount: 300 })] })
    const linea = r.resultado.waterfall.find((s) => s.key === "financiero")!
    expect(linea.breakdown?.map((b) => b.key)).toEqual(["ganancia"])
  })

  it("convierte el costo en pesos con el TC de su fecha", () => {
    const r = build({
      operations: [venta()],
      currency: "USD",
      ivaRate: 0,
      financialMovements: [
        financiero({ kind: "COST", amount: 85000, currency: "ARS", movement_date: "2026-07-20" }),
      ],
      getRate: (d: any) => (String(d).startsWith("2026-07-20") ? 1000 : null),
    })
    expect(r.resultado.resultadoFinanciero).toBe(-85)
  })

  it("lo que no se puede convertir sale en missingRate y avisa", () => {
    const r = build({
      operations: [venta()],
      currency: "USD",
      financialMovements: [financiero({ kind: "COST", amount: 85000, currency: "ARS" })],
    })
    expect(r.financiero.missingRate).toEqual([{ currency: "ARS", count: 1, total: 85000 }])
    expect(r.warnings.map((w) => w.code)).toContain("MISSING_RATE")
    // Y el faltante se atribuye al resultado financiero, no a los gastos.
    expect(r.gastos.missingRate).toEqual([])
  })

  it("avisa si hay gastos operativos con categoría financiera", () => {
    // Doble conteo real: el mismo fee cargado a mano como gasto y además por
    // el circuito nuevo.
    const r = build({
      operations: [venta()],
      expenses: [gasto({ category: "Gastos financieros", amount: 300 })],
      financialMovements: [financiero({ kind: "COST", amount: 300 })],
    })
    const warning = r.warnings.find((w) => w.code === "FINANCIAL_LIKE_EXPENSES")
    expect(warning?.level).toBe("danger")
  })

  it("no avisa si no hay gastos con categoría financiera", () => {
    const r = build({ operations: [venta()], expenses: [gasto({ category: "Marketing" })] })
    expect(r.warnings.map((w) => w.code)).not.toContain("FINANCIAL_LIKE_EXPENSES")
  })
})

// ────────────────────────────── Participación ─────────────────────────

describe("participación", () => {
  it("reparte la ganancia neta según el porcentaje de cada socio", () => {
    const r = build({ operations: [venta()], partners: SOCIOS, ivaRate: 0 })
    expect(r.resultado.gananciaNeta).toBe(2000)
    expect(r.socios.rows.map((s) => [s.name, s.amount])).toEqual([
      ["Yamil", 1200],
      ["Santi", 800],
    ])
    expect(r.socios.percentageValid).toBe(true)
    expect(r.socios.unassignedAmount).toBe(0)
  })

  it("la suma repartida es la ganancia neta", () => {
    const r = build({
      operations: [venta({ sale_amount_total: 9999.99, operator_cost: 3333.33, margin_amount: 6666.66 })],
      partners: [
        { id: "p-1", name: "A", percentage: 33.33, isActive: true },
        { id: "p-2", name: "B", percentage: 33.33, isActive: true },
        { id: "p-3", name: "C", percentage: 33.34, isActive: true },
      ],
      ivaRate: 0,
    })
    const repartido = r.socios.rows.reduce((acc, s) => acc + s.amount, 0)
    expect(repartido).toBeCloseTo(r.resultado.gananciaNeta, 1)
  })

  it("si suman menos de 100 no normaliza: muestra lo que falta asignar", () => {
    const r = build({
      operations: [venta()],
      partners: [
        { id: "p-1", name: "Yamil", percentage: 60, isActive: true },
        { id: "p-2", name: "Santi", percentage: 32, isActive: true },
      ],
      ivaRate: 0,
    })
    expect(r.socios.percentageSum).toBe(92)
    expect(r.socios.percentageValid).toBe(false)
    expect(r.socios.unassignedAmount).toBe(160) // 8% de 2000
    expect(r.warnings.map((w) => w.code)).toContain("PERCENTAGES_NOT_100")
  })

  it("si suman más de 100 avisa y tampoco normaliza", () => {
    const r = build({
      operations: [venta()],
      partners: [
        { id: "p-1", name: "Yamil", percentage: 60, isActive: true },
        { id: "p-2", name: "Santi", percentage: 45, isActive: true },
      ],
      ivaRate: 0,
    })
    expect(r.socios.percentageSum).toBe(105)
    expect(r.socios.unassignedAmount).toBe(-100)
    expect(r.warnings.map((w) => w.code)).toContain("PERCENTAGES_NOT_100")
  })

  it("ignora a los socios inactivos", () => {
    const r = build({
      operations: [venta()],
      partners: [...SOCIOS, { id: "p-3", name: "Ex socio", percentage: 50, isActive: false }],
      ivaRate: 0,
    })
    expect(r.socios.rows.map((s) => s.name)).toEqual(["Yamil", "Santi"])
    expect(r.socios.percentageSum).toBe(100)
  })

  it("con pérdida, a cada socio le toca su parte negativa", () => {
    const r = build({
      operations: [venta({ sale_amount_total: 1000, operator_cost: 900, margin_amount: 100 })],
      expenses: [gasto({ amount: 1100 })],
      partners: SOCIOS,
      ivaRate: 0,
    })
    expect(r.resultado.gananciaNeta).toBe(-1000)
    expect(r.socios.rows.map((s) => s.amount)).toEqual([-600, -400])
  })

  it("avisa si no hay socios cargados", () => {
    const r = build({ operations: [venta()], partners: [] })
    expect(r.warnings.map((w) => w.code)).toContain("NO_PARTNERS")
  })
})

// ───────────────────── Distribuciones registradas ─────────────────────

describe("distribuciones registradas", () => {
  const alloc = (over: Record<string, any> = {}) => ({
    partnerId: "p-1",
    year: 2026,
    month: 7,
    monthKey: "2026-07",
    amount: 1000,
    currency: "USD",
    exchangeRate: 1450,
    status: "ALLOCATED",
    ...over,
  })

  it("sin distribuciones no arma el bloque", () => {
    const r = build({ operations: [venta()], partners: SOCIOS })
    expect(r.allocations).toBeNull()
  })

  it("compara contra lo calculado cuando el período cubre meses completos", () => {
    const r = build({
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      operations: [venta()],
      partners: SOCIOS,
      allocations: [alloc({ partnerId: "p-1", amount: 1000 })],
      ivaRate: 0,
    })
    expect(r.allocations!.coversPeriod).toBe(true)
    const fila = r.allocations!.rows.find((x) => x.partnerId === "p-1")!
    expect(fila.allocated).toBe(1000)
    expect(fila.computed).toBe(1200)
    expect(fila.difference).toBe(200)
  })

  it("con rango parcial no publica diferencias", () => {
    // La distribución es mensual: comparar medio mes contra un mes entero daría
    // una diferencia que no significa nada.
    const r = build({
      dateFrom: "2026-07-10",
      dateTo: "2026-07-20",
      operations: [venta()],
      partners: SOCIOS,
      allocations: [alloc()],
    })
    expect(r.allocations!.coversPeriod).toBe(false)
    expect(r.allocations!.rows[0].difference).toBeNull()
    expect(r.warnings.map((w) => w.code)).toContain("ALLOCATIONS_PARTIAL")
  })

  it("cuenta cuántos meses del período tienen distribución", () => {
    const r = build({
      dateFrom: "2026-06-01",
      dateTo: "2026-08-31",
      operations: [venta()],
      partners: SOCIOS,
      allocations: [alloc({ month: 6, monthKey: "2026-06" }), alloc({ month: 7, monthKey: "2026-07" })],
    })
    expect(r.allocations!.monthsInPeriod).toBe(3)
    expect(r.allocations!.monthsWithAllocation).toBe(2)
  })

  it("convierte con el TC guardado en la distribución, no con el del reporte", () => {
    const r = build({
      currency: "ARS",
      getRate: () => 9999,
      operations: [venta()],
      partners: SOCIOS,
      allocations: [alloc({ amount: 1000, currency: "USD", exchangeRate: 1450 })],
    })
    expect(r.allocations!.rows[0].allocated).toBe(1450000)
  })

  it("nombra al socio dado de baja que tiene distribuciones viejas", () => {
    const r = build({
      operations: [venta()],
      partners: SOCIOS,
      allocations: [alloc({ partnerId: "p-9" })],
    })
    expect(r.allocations!.rows[0].name).toBe("Socio dado de baja")
  })
})

// ────────────────────────────── Desglose ──────────────────────────────

/**
 * El desglose es lo que hace auditable la cascada: cada línea tiene que abrirse
 * en componentes que sumen exactamente el importe del padre, con el mismo signo.
 */
describe("desglose de la cascada", () => {
  const AGENCIAS = new Map([
    ["ag-1", "Rosario"],
    ["ag-2", "Madero"],
  ])
  const VENDEDORES = new Map([
    ["u-1", "Ana Pérez"],
    ["u-2", "Bruno Gómez"],
  ])
  const REFERIDORES = new Map([["rp-1", "Agencia Norte"]])

  const step = (r: any, key: string) => r.resultado.waterfall.find((s: any) => s.key === key)!

  it("abre las ventas por oficina", () => {
    const r = build({
      operations: [
        venta({ id: "a", agency_id: "ag-1", sale_amount_total: 8000, operator_cost: 5000, margin_amount: 3000 }),
        venta({ id: "b", agency_id: "ag-2", sale_amount_total: 2000, operator_cost: 1000, margin_amount: 1000 }),
      ],
      agencyNames: AGENCIAS,
    })
    expect(step(r, "ventas").breakdown.map((b: any) => [b.label, b.amount])).toEqual([
      ["Rosario", 8000],
      ["Madero", 2000],
    ])
  })

  it("informa cuántas operaciones hay detrás de cada oficina", () => {
    const r = build({
      operations: [venta({ id: "a", agency_id: "ag-1" }), venta({ id: "b", agency_id: "ag-1" })],
      agencyNames: AGENCIAS,
    })
    expect(step(r, "ventas").breakdown[0].hint).toBe("2 operaciones")
  })

  it("etiqueta las operaciones sin oficina en vez de descartarlas", () => {
    const r = build({ operations: [venta({ agency_id: null })], agencyNames: AGENCIAS })
    expect(step(r, "ventas").breakdown[0].label).toBe("Sin oficina")
  })

  it("el costo por oficina va en negativo, como su línea", () => {
    const r = build({
      operations: [venta({ agency_id: "ag-1", sale_amount_total: 8000, operator_cost: 5000, margin_amount: 3000 })],
      agencyNames: AGENCIAS,
    })
    const costo = step(r, "costo")
    expect(costo.amount).toBe(-5000)
    expect(costo.breakdown).toEqual([
      expect.objectContaining({ label: "Rosario", amount: -5000 }),
    ])
  })

  it("separa comisiones de vendedores de las de referidores, con nombres", () => {
    const r = build({
      operations: [venta()],
      commissionRecords: [
        comision({ id: "c1", seller_id: "u-1", amount: 300 }),
        comision({ id: "c2", seller_id: "u-2", amount: 100 }),
      ],
      referralCommissions: [referido({ partnerId: "rp-1", amount: 150 })],
      sellerNames: VENDEDORES,
      referralPartnerNames: REFERIDORES,
    })
    const b = step(r, "comisiones").breakdown
    expect(b.map((x: any) => [x.label, x.amount])).toEqual([
      ["Vendedores", -400],
      ["Referidores", -150],
    ])
    expect(b[0].children.map((c: any) => [c.label, c.amount])).toEqual([
      ["Ana Pérez", -300],
      ["Bruno Gómez", -100],
    ])
    expect(b[1].children).toEqual([
      expect.objectContaining({ label: "Agencia Norte", amount: -150 }),
    ])
  })

  it("no arma el grupo de referidores si no hay ninguno", () => {
    const r = build({
      operations: [venta()],
      commissionRecords: [comision({ amount: 100 })],
      sellerNames: VENDEDORES,
    })
    expect(step(r, "comisiones").breakdown.map((x: any) => x.key)).toEqual(["vendedores"])
  })

  it("abre los gastos en fijos y variables, y cada uno en sus categorías", () => {
    const r = build({
      expenses: [
        gasto({ id: "1", amount: 100, category: "Marketing" }),
        gasto({ id: "2", amount: 50, category: "Marketing" }),
        gasto({ id: "3", amount: 300, category: "Sueldos", expense_type: "recurring" }),
      ],
    })
    const b = step(r, "gastos").breakdown
    expect(b.map((x: any) => [x.label, x.amount])).toEqual([
      ["Fijos / recurrentes", -300],
      ["Variables", -150],
    ])
    expect(b[1].children).toEqual([
      expect.objectContaining({ label: "Marketing", amount: -150 }),
    ])
  })

  it("explica el IVA con su base y su alícuota", () => {
    const r = build({ operations: [venta()], ivaRate: 0.105 })
    const b = step(r, "iva").breakdown
    expect(b[0].amount).toBe(2000) // la base, no el impuesto
    expect(b[0].hint).toContain("10,5%")
  })

  it("los subtotales y el resultado no llevan desglose", () => {
    const r = build({ operations: [venta()] })
    for (const key of ["bruta", "neto-iva", "neta"]) {
      expect(step(r, key).breakdown).toBeUndefined()
    }
  })

  it("cada desglose suma exactamente el importe de su línea", () => {
    // Es la propiedad que hace verificable el reporte a ojo.
    const r = build({
      operations: [
        venta({ id: "a", agency_id: "ag-1", sale_amount_total: 7777.77, operator_cost: 3333.33, margin_amount: 4444.44 }),
        venta({ id: "b", agency_id: "ag-2", sale_amount_total: 2222.22, operator_cost: 1111.11, margin_amount: 1111.11 }),
      ],
      expenses: [gasto({ amount: 123.45 }), gasto({ id: "2", amount: 67.89, expense_type: "recurring" })],
      commissionRecords: [comision({ seller_id: "u-1", amount: 99.99 })],
      referralCommissions: [referido({ partnerId: "rp-1", amount: 11.11 })],
      agencyNames: AGENCIAS,
      sellerNames: VENDEDORES,
      referralPartnerNames: REFERIDORES,
    })

    for (const s of r.resultado.waterfall) {
      if (!s.breakdown || s.key === "iva") continue
      const suma = s.breakdown.reduce((acc: number, b: any) => acc + b.amount, 0)
      expect(suma).toBeCloseTo(s.amount, 2)
      for (const child of s.breakdown) {
        if (!child.children) continue
        const sumaHijos = child.children.reduce((acc: number, c: any) => acc + c.amount, 0)
        expect(sumaHijos).toBeCloseTo(child.amount, 2)
      }
    }
  })

  it("sin nombres cargados no rompe: usa etiquetas genéricas", () => {
    const r = build({
      operations: [venta({ agency_id: "ag-desconocida" })],
      commissionRecords: [comision({ seller_id: "u-desconocido", amount: 100 })],
    })
    expect(step(r, "ventas").breakdown[0].label).toBe("Sin oficina")
    expect(step(r, "comisiones").breakdown[0].children[0].label).toBe("Sin vendedor asignado")
  })
})

// ─────────────────────────────── Truncado ─────────────────────────────

describe("truncado", () => {
  it("avisa fuerte si el dataset vino cortado", () => {
    const r = build({ operations: [venta()], salesTruncated: true })
    const w = r.warnings.find((x) => x.code === "TRUNCATED")
    expect(w?.level).toBe("danger")
  })
})

// ─────────────────────────── Venta neta de IVA ─────────────────────────
describe("venta neta de IVA", () => {
  // Venta 10.000, costo 8.000, margen 2.000, alícuota 10,5%.
  const conVenta = () => [venta()]

  it("por defecto descuenta el IVA sobre el margen", () => {
    const r = build({ operations: conVenta() })
    expect(r.ventaNeta.criterio).toBe("MARGEN")
    expect(r.ventaNeta.bruta).toBe(10000)
    expect(r.ventaNeta.iva).toBe(210) // 2000 × 10,5%
    expect(r.ventaNeta.neta).toBe(9790)
  })

  it("el criterio MARGEN usa exactamente el IVA de la cascada", () => {
    // Si divergieran, el reporte mostraría dos IVA distintos en la misma hoja.
    const r = build({ operations: conVenta(), netoIvaCriterio: "MARGEN" })
    expect(r.ventaNeta.iva).toBe(r.resultado.iva)
  })

  it("el criterio VENTA trata la venta como IVA incluido", () => {
    const r = build({ operations: conVenta(), netoIvaCriterio: "VENTA" })
    expect(r.ventaNeta.neta).toBeCloseTo(10000 / 1.105, 2) // 9049,77
    expect(r.ventaNeta.iva).toBeCloseTo(10000 - 10000 / 1.105, 2) // 950,23
  })

  it("VENTA da un IVA mucho mayor que MARGEN, y por eso no entra a la cascada", () => {
    // El orden de magnitud es el motivo de que esto sea informativo: con datos
    // reales de Lozada el IVA sobre la venta se come el margen bruto entero.
    const margen = build({ operations: conVenta(), netoIvaCriterio: "MARGEN" })
    const venta_ = build({ operations: conVenta(), netoIvaCriterio: "VENTA" })
    expect(venta_.ventaNeta.iva).toBeGreaterThan(margen.ventaNeta.iva * 4)
  })

  it("cambiar el criterio NO mueve el resultado ni el reparto entre socios", () => {
    // Es la decisión de diseño del feature: un selector de presentación no
    // puede cambiar cuánta plata le toca a cada socio.
    const args = {
      operations: conVenta(),
      expenses: [gasto({ amount: 100 })],
      commissionRecords: [comision({ amount: 200 })],
      referralCommissions: [referido({ amount: 50 })],
      financialMovements: [financiero()],
      partners: SOCIOS,
    }
    const margen = build({ ...args, netoIvaCriterio: "MARGEN" })
    const venta_ = build({ ...args, netoIvaCriterio: "VENTA" })

    expect(venta_.resultado).toEqual(margen.resultado)
    expect(venta_.socios).toEqual(margen.socios)
    expect(venta_.comisiones).toEqual(margen.comisiones)
    expect(venta_.gastos).toEqual(margen.gastos)
  })

  it("con alícuota 0 los dos criterios dan neta = bruta", () => {
    for (const criterio of ["MARGEN", "VENTA"] as const) {
      const r = build({ operations: conVenta(), ivaRate: 0, netoIvaCriterio: criterio })
      expect(r.ventaNeta.iva).toBe(0)
      expect(r.ventaNeta.neta).toBe(r.ventaNeta.bruta)
    }
  })

  it("el criterio VENTA avisa que la cascada usa otro IVA", () => {
    const r = build({ operations: conVenta(), netoIvaCriterio: "VENTA" })
    const w = r.warnings.find((x) => x.code === "NETO_IVA_CRITERIO_VENTA")
    expect(w?.level).toBe("warning")
    expect(w?.message).toMatch(/IVA sobre el margen/)
  })

  it("el criterio MARGEN no emite ese aviso", () => {
    const r = build({ operations: conVenta(), netoIvaCriterio: "MARGEN" })
    expect(r.warnings.some((x) => x.code === "NETO_IVA_CRITERIO_VENTA")).toBe(false)
  })

  it("una operación con pérdida baja el IVA sobre el margen pero no el de la venta", () => {
    // Muestra que cada criterio mira una base distinta, no una escala de la otra.
    const ops = [
      venta({ id: "gana", sale_amount_total: 10000, operator_cost: 8000, margin_amount: 2000 }),
      venta({ id: "pierde", sale_amount_total: 1000, operator_cost: 3000, margin_amount: -2000 }),
    ]
    const margen = build({ operations: ops, netoIvaCriterio: "MARGEN" })
    const venta_ = build({ operations: ops, netoIvaCriterio: "VENTA" })

    expect(margen.ventaNeta.iva).toBe(210) // solo el margen positivo
    expect(venta_.ventaNeta.bruta).toBe(11000)
    expect(venta_.ventaNeta.iva).toBeCloseTo(11000 - 11000 / 1.105, 2)
  })
})

// ────────────────────────── Cierre por oficina ─────────────────────────
describe("cierre por oficina", () => {
  const NOMBRES = new Map([
    ["ag-1", "Rosario"],
    ["ag-2", "Madero"],
  ])

  /** Dos oficinas con venta, comisión y gasto propios. */
  const dosOficinas = () => ({
    operations: [
      venta({ id: "op-1", agency_id: "ag-1" }),
      venta({
        id: "op-2",
        agency_id: "ag-2",
        sale_amount_total: 5000,
        operator_cost: 4000,
        margin_amount: 1000,
      }),
    ],
    commissionRecords: [
      comision({ id: "c-1", amount: 200 }),
      comision({
        id: "c-2",
        amount: 100,
        agency_id: "ag-2",
        operations: { ...comision().operations, id: "op-2", agency_id: "ag-2" },
      }),
    ],
    referralCommissions: [
      referido({ id: "r-1", amount: 50, agencyId: "ag-1" }),
      referido({ id: "r-2", amount: 30, agencyId: "ag-2" }),
    ],
    expenses: [
      gasto({ id: "e-1", amount: 100, agency_id: "ag-1" }),
      gasto({ id: "e-2", amount: 60, agency_id: "ag-2" }),
    ],
    agencyNames: NOMBRES,
  })

  it("abre las cuatro cifras del cierre por oficina", () => {
    const r = build(dosOficinas())
    const rosario = r.porAgencia.rows.find((x) => x.agencyId === "ag-1")!
    const madero = r.porAgencia.rows.find((x) => x.agencyId === "ag-2")!

    expect(rosario.name).toBe("Rosario")
    expect(rosario.ventaBruta).toBe(10000)
    expect(rosario.ventaNeta).toBe(10000 - 210) // IVA sobre margen 2000
    expect(rosario.comisiones).toBe(250) // 200 vendedor + 50 referidor
    expect(rosario.gastos).toBe(100)

    expect(madero.ventaBruta).toBe(5000)
    expect(madero.comisiones).toBe(130)
    expect(madero.gastos).toBe(60)
  })

  it("el total sale de sumar las filas y cuadra con el resultado", () => {
    // Es la invariante que hace auditable la tabla: si una fila se perdiera por
    // una clave mal armada, el total dejaría de cerrar contra el consolidado.
    const r = build(dosOficinas())
    const t = r.porAgencia.total

    expect(t.ventaBruta).toBeCloseTo(r.resultado.ventas, 2)
    expect(t.iva).toBeCloseTo(r.resultado.iva, 2)
    expect(t.comisiones).toBeCloseTo(r.resultado.comisiones, 2)
    expect(t.gastos).toBeCloseTo(r.resultado.gastos, 2)
    expect(t.gananciaBruta).toBeCloseTo(r.resultado.gananciaBruta, 2)
    expect(t.ventaNeta).toBeCloseTo(r.ventaNeta.neta, 2)
  })

  it("el IVA de una oficina sale de SUS márgenes, no de un prorrateo", () => {
    // Con prorrateo por venta, la oficina que perdió plata se llevaría parte
    // del débito fiscal que generó la otra.
    const r = build({
      operations: [
        venta({ id: "gana", agency_id: "ag-1" }),
        venta({
          id: "pierde",
          agency_id: "ag-2",
          sale_amount_total: 5000,
          operator_cost: 7000,
          margin_amount: -2000,
        }),
      ],
      agencyNames: NOMBRES,
    })
    const rosario = r.porAgencia.rows.find((x) => x.agencyId === "ag-1")!
    const madero = r.porAgencia.rows.find((x) => x.agencyId === "ag-2")!

    expect(rosario.iva).toBe(210)
    expect(madero.iva).toBe(0)
    expect(madero.ivaBase).toBe(0)
    expect(r.porAgencia.total.iva).toBeCloseTo(r.resultado.iva, 2)
  })

  it("los gastos sin oficina van a su propia fila y no se prorratean", () => {
    // Alquiler, sueldos y contador: repartirlos exige una clave de asignación
    // que es del contador, no del reporte.
    const base = build(dosOficinas())
    const conCompartido = build({
      ...dosOficinas(),
      expenses: [
        gasto({ id: "e-1", amount: 100, agency_id: "ag-1" }),
        gasto({ id: "e-2", amount: 60, agency_id: "ag-2" }),
        gasto({ id: "e-3", amount: 500, agency_id: null }),
      ],
    })

    const filaAg1 = (r: typeof base) => r.porAgencia.rows.find((x) => x.agencyId === "ag-1")!.gastos
    expect(filaAg1(conCompartido)).toBe(filaAg1(base))

    const sinAsignar = conCompartido.porAgencia.rows.find((x) => x.kind === "SIN_ASIGNAR")!
    expect(sinAsignar.gastos).toBe(500)
    expect(conCompartido.porAgencia.total.gastos).toBeCloseTo(conCompartido.resultado.gastos, 2)
  })

  it("separa las ventas sin oficina de los gastos sin oficina", () => {
    // Son dos problemas distintos: una venta sin oficina es un dato faltante en
    // la operación; un gasto sin oficina puede ser un costo compartido.
    const r = build({
      operations: [venta({ id: "op-x", agency_id: null })],
      expenses: [gasto({ id: "e-x", amount: 40, agency_id: null })],
      agencyNames: NOMBRES,
    })
    const kinds = r.porAgencia.rows.map((x) => x.kind)
    expect(kinds).toContain("SIN_OFICINA")
    expect(kinds).toContain("SIN_ASIGNAR")
    expect(r.porAgencia.rows.find((x) => x.kind === "SIN_OFICINA")!.ventaBruta).toBe(10000)
    expect(r.porAgencia.rows.find((x) => x.kind === "SIN_ASIGNAR")!.gastos).toBe(40)
  })

  it("imputa la comisión a la oficina de la OPERACIÓN, no a la del registro", () => {
    // `commission_records.agency_id` puede quedar viejo si la operación cambió
    // de oficina; usarlo desacoplaría la comisión de su propia venta.
    const r = build({
      operations: [venta({ id: "op-1", agency_id: "ag-2" })],
      commissionRecords: [
        comision({
          amount: 200,
          agency_id: "ag-1", // desactualizado
          operations: { ...comision().operations, agency_id: "ag-2" },
        }),
      ],
      agencyNames: NOMBRES,
    })
    const madero = r.porAgencia.rows.find((x) => x.agencyId === "ag-2")!
    expect(madero.comisionesVendedores).toBe(200)
    expect(r.porAgencia.rows.find((x) => x.agencyId === "ag-1")).toBeUndefined()
  })

  it("consolida las dos monedas por oficina con el mismo TC que el total", () => {
    const r = build({
      operations: [
        venta({ id: "usd", agency_id: "ag-1" }),
        venta({
          id: "ars",
          agency_id: "ag-2",
          sale_amount_total: 1_500_000,
          operator_cost: 1_200_000,
          margin_amount: 300_000,
          sale_currency: "ARS",
          currency: "ARS",
        }),
      ],
      currency: "USD",
      fixedRate: 1500,
      agencyNames: NOMBRES,
    })
    expect(r.porAgencia.rows.find((x) => x.agencyId === "ag-2")!.ventaBruta).toBe(1000)
    expect(r.porAgencia.total.ventaBruta).toBeCloseTo(r.resultado.ventas, 2)
  })

  it("respeta el criterio de venta neta elegido", () => {
    const r = build({ ...dosOficinas(), netoIvaCriterio: "VENTA" })
    const rosario = r.porAgencia.rows.find((x) => x.agencyId === "ag-1")!
    expect(r.porAgencia.criterio).toBe("VENTA")
    expect(rosario.ventaNeta).toBeCloseTo(10000 / 1.105, 2)
    expect(r.porAgencia.total.ventaNeta).toBeCloseTo(r.ventaNeta.neta, 2)
  })

  it("una oficina sin nombre cargado no rompe la tabla", () => {
    const r = build({ operations: [venta({ agency_id: "ag-fantasma" })] })
    expect(r.porAgencia.rows[0].name).toBe("Oficina sin nombre")
  })

  it("sin movimientos no inventa filas", () => {
    const r = build()
    expect(r.porAgencia.rows).toEqual([])
    expect(r.porAgencia.total.ventaBruta).toBe(0)
  })
})

describe("ajustes de liquidación de operador (VIB-174)", () => {
  // El costo que trae `operations` es el ESTIMADO con el que se vendió. Cuando
  // la liquidación definitiva llega por otro monto, la diferencia se imputa al
  // mes en que llegó, no al de la venta.
  const ajuste = (over: Partial<any> = {}) => ({
    deltaAmount: 50,
    currency: "USD",
    accrualDate: "2026-07-15",
    agencyId: "ag-1",
    ...over,
  })

  it("una liquidación más cara baja la ganancia neta", () => {
    // delta +50 (el operador cobró más) → resultado −50.
    const sin = build()
    const con = build({ operatorAdjustments: [ajuste()] })

    expect(con.resultado.gananciaNeta).toBeCloseTo(sin.resultado.gananciaNeta - 50, 2)
  })

  it("una liquidación más barata la sube", () => {
    const sin = build()
    const con = build({ operatorAdjustments: [ajuste({ deltaAmount: -50 })] })

    expect(con.resultado.gananciaNeta).toBeCloseTo(sin.resultado.gananciaNeta + 50, 2)
  })

  it("aparece como línea propia de signo variable, no como deducción", () => {
    const r = build({ operatorAdjustments: [ajuste({ deltaAmount: -50 })] })
    const linea = r.resultado.waterfall.find((s) => s.key === "ajustes")!

    expect(linea).toBeDefined()
    expect(linea.kind).toBe("adjustment")
    expect(linea.amount).toBe(50)
  })

  it("sin ajustes no agrega una fila en cero", () => {
    const r = build()
    expect(r.resultado.waterfall.find((s) => s.key === "ajustes")).toBeUndefined()
  })

  it("separa ganancias de pérdidas en el desglose", () => {
    const r = build({
      operatorAdjustments: [ajuste({ deltaAmount: 80 }), ajuste({ deltaAmount: -30 })],
    })
    const linea = r.resultado.waterfall.find((s) => s.key === "ajustes")!

    expect(linea.amount).toBeCloseTo(-50, 2) // −80 + 30
    expect(linea.breakdown!.find((b) => b.key === "ganancia")!.amount).toBe(30)
    expect(linea.breakdown!.find((b) => b.key === "perdida")!.amount).toBe(-80)
  })
})
