/**
 * Tests del reporte de cuentas a pagar por operador × oficina.
 *
 * Lo que se protege acá:
 *  - El filtro por tipo de servicio (aéreos, hoteles, ...) no puede colarse
 *    deudas de otro tipo ni perder las deudas manuales.
 *  - El resumen no puede mezclar ARS con USD en un mismo total (bug del Excel
 *    anterior: tomaba la moneda del primer pago del operador y sumaba todo ahí).
 */

import {
  DEBT_TYPE_FILTER_ALL,
  DEBT_TYPE_UNSPECIFIED,
  buildOperatorAgencySummary,
  debtTypeFileSuffix,
  debtTypeLabel,
  matchesDebtTypeFilter,
  resolveDebtType,
} from "../operator-payment-reports"

describe("resolveDebtType", () => {
  it("usa el servicio vinculado cuando existe", () => {
    expect(resolveDebtType({ serviceTypes: ["FLIGHT"] })).toBe("FLIGHT")
    expect(resolveDebtType({ serviceTypes: ["EXCURSION"] })).toBe("ACTIVITY")
    expect(resolveDebtType({ serviceTypes: ["SEAT"] })).toBe("SEAT")
  })

  it("el servicio le gana al tipo cargado en la operación", () => {
    expect(
      resolveDebtType({ serviceTypes: ["HOTEL"], operatorProductType: "FLIGHT" })
    ).toBe("HOTEL")
  })

  it("una deuda que cubre servicios distintos es MIXED, no aérea", () => {
    expect(resolveDebtType({ serviceTypes: ["FLIGHT", "HOTEL"] })).toBe("MIXED")
    expect(resolveDebtType({ serviceTypes: ["FLIGHT", "FLIGHT"] })).toBe("FLIGHT")
  })

  it("sin servicio usa el tipo de producto del operador en la operación", () => {
    // Camino más común: el costo se carga por operador al crear la operación.
    expect(resolveDebtType({ operatorProductType: "FLIGHT" })).toBe("FLIGHT")
    expect(resolveDebtType({ operatorProductType: "Vuelo" })).toBe("FLIGHT")
    expect(resolveDebtType({ operatorProductType: "AEREO" })).toBe("FLIGHT")
  })

  it("respeta los tipos custom de la organización", () => {
    expect(resolveDebtType({ operatorProductType: "cupo grupal" })).toBe("CUPO GRUPAL")
  })

  it("cae al tipo de la operación (vocabulario español) como última red", () => {
    expect(resolveDebtType({ operationProductType: "AEREO" })).toBe("FLIGHT")
    expect(resolveDebtType({ operationProductType: "PAQUETE" })).toBe("PACKAGE")
    // OTRO no clasifica: no debe hacer pasar una deuda por aérea.
    expect(resolveDebtType({ operationProductType: "OTRO" })).toBe(DEBT_TYPE_UNSPECIFIED)
  })

  it("sin ninguna fuente queda sin clasificar", () => {
    expect(resolveDebtType({})).toBe(DEBT_TYPE_UNSPECIFIED)
    expect(
      resolveDebtType({ serviceTypes: [], operatorProductType: null, operationProductType: "" })
    ).toBe(DEBT_TYPE_UNSPECIFIED)
  })
})

describe("matchesDebtTypeFilter", () => {
  it("ALL (o filtro vacío) deja pasar todo", () => {
    expect(matchesDebtTypeFilter("FLIGHT", DEBT_TYPE_FILTER_ALL)).toBe(true)
    expect(matchesDebtTypeFilter(null, DEBT_TYPE_FILTER_ALL)).toBe(true)
    expect(matchesDebtTypeFilter("HOTEL", undefined)).toBe(true)
  })

  it("filtra por tipo exacto", () => {
    expect(matchesDebtTypeFilter("FLIGHT", "FLIGHT")).toBe(true)
    expect(matchesDebtTypeFilter("HOTEL", "FLIGHT")).toBe(false)
    expect(matchesDebtTypeFilter("MIXED", "FLIGHT")).toBe(false)
  })

  it("las deudas sin tipo quedan fuera de un filtro por tipo", () => {
    expect(matchesDebtTypeFilter(DEBT_TYPE_UNSPECIFIED, "FLIGHT")).toBe(false)
    expect(matchesDebtTypeFilter(null, "FLIGHT")).toBe(false)
  })

  it("el filtro 'sin clasificar' agarra también las que vienen en null", () => {
    expect(matchesDebtTypeFilter(null, DEBT_TYPE_UNSPECIFIED)).toBe(true)
    expect(matchesDebtTypeFilter(DEBT_TYPE_UNSPECIFIED, DEBT_TYPE_UNSPECIFIED)).toBe(true)
    expect(matchesDebtTypeFilter("FLIGHT", DEBT_TYPE_UNSPECIFIED)).toBe(false)
  })
})

describe("debtTypeLabel", () => {
  it("traduce al vocabulario del producto", () => {
    expect(debtTypeLabel("FLIGHT")).toBe("Vuelo")
    expect(debtTypeLabel("SEAT")).toBe("Asiento")
    expect(debtTypeLabel(DEBT_TYPE_UNSPECIFIED)).toBe("Sin clasificar")
    expect(debtTypeLabel(null)).toBe("Sin clasificar")
  })
})

describe("debtTypeFileSuffix", () => {
  it("sin filtro no agrega sufijo", () => {
    expect(debtTypeFileSuffix(DEBT_TYPE_FILTER_ALL)).toBe("")
    expect(debtTypeFileSuffix(null)).toBe("")
  })

  it("usa slug sin acentos", () => {
    expect(debtTypeFileSuffix("FLIGHT")).toBe("-aereos")
    expect(debtTypeFileSuffix(DEBT_TYPE_UNSPECIFIED)).toBe("-sin-clasificar")
  })
})

describe("buildOperatorAgencySummary", () => {
  const agencyNames = { "ag-rosario": "Rosario", "ag-madero": "Madero" }
  const now = new Date(2026, 7, 4) // 2026-08-04 local

  const payment = (over: Record<string, any> = {}) => ({
    amount: 1000,
    paid_amount: 0,
    currency: "ARS",
    due_date: "2026-12-31",
    operators: { name: "Operador A" },
    operations: { agency_id: "ag-rosario" },
    ...over,
  })

  it("agrupa por operador × oficina", () => {
    const rows = buildOperatorAgencySummary(
      [
        payment(),
        payment({ amount: 500 }),
        payment({ amount: 300, operations: { agency_id: "ag-madero" } }),
        payment({ amount: 200, operators: { name: "Operador B" } }),
      ],
      { agencyNames, now }
    )

    expect(rows).toHaveLength(3)
    expect(rows.map((r) => [r.operator, r.agency, r.totalAmount, r.count])).toEqual([
      ["Operador A", "Madero", 300, 1],
      ["Operador A", "Rosario", 1500, 2],
      ["Operador B", "Rosario", 200, 1],
    ])
  })

  it("no mezcla monedas: ARS y USD del mismo operador y oficina van en filas separadas", () => {
    const rows = buildOperatorAgencySummary(
      [payment({ amount: 1000, currency: "ARS" }), payment({ amount: 40, currency: "USD" })],
      { agencyNames, now }
    )

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.currency === "ARS")?.totalAmount).toBe(1000)
    expect(rows.find((r) => r.currency === "USD")?.totalAmount).toBe(40)
  })

  it("pendiente = total - pagado, sin negativos por sobrepago", () => {
    const rows = buildOperatorAgencySummary(
      [
        payment({ amount: 1000, paid_amount: 400 }),
        payment({ amount: 100, paid_amount: 150 }),
      ],
      { agencyNames, now }
    )

    expect(rows[0].totalPaid).toBe(550)
    expect(rows[0].totalPending).toBe(600)
  })

  it("cuenta vencidos solo si tienen saldo pendiente", () => {
    const rows = buildOperatorAgencySummary(
      [
        payment({ due_date: "2026-01-31" }), // vencida, sin pagar
        payment({ due_date: "2026-01-31", paid_amount: 1000 }), // vencida pero saldada
        payment({ due_date: "2026-12-31" }), // futura
      ],
      { agencyNames, now }
    )

    expect(rows[0].count).toBe(3)
    expect(rows[0].overdueCount).toBe(1)
  })

  it("deudas sin operación quedan como 'Sin oficina'", () => {
    const rows = buildOperatorAgencySummary(
      [payment({ operations: null }), payment({ operations: { agency_id: null } })],
      { agencyNames, now }
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].agency).toBe("Sin oficina")
    expect(rows[0].count).toBe(2)
  })

  it("una agencia fuera del alcance del usuario no rompe el agrupamiento", () => {
    const rows = buildOperatorAgencySummary([payment({ operations: { agency_id: "ag-desconocida" } })], {
      agencyNames,
      now,
    })

    expect(rows[0].agency).toBe("Sin oficina")
  })

  it("montos string (numeric de Postgres) se suman como números", () => {
    const rows = buildOperatorAgencySummary(
      [payment({ amount: "1000.50", paid_amount: "0.25" })],
      { agencyNames, now }
    )

    expect(rows[0].totalAmount).toBe(1000.5)
    expect(rows[0].totalPending).toBe(1000.25)
  })
})
