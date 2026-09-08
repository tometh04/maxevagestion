import {
  buildPackageOperationDraft,
  mergeOperatorRowsWithPackage,
  type ApplicablePackage,
} from "../apply-package-draft"

/**
 * Aplicar un paquete precarga el formulario del alta; no crea nada en el
 * servidor. Lo que se fija acá es qué toca y qué NO toca ese borrador, y la
 * regla de convivencia entre las patas del paquete y los operadores que el
 * vendedor suma a mano.
 */

const paquete = (over: Partial<ApplicablePackage> = {}): ApplicablePackage => ({
  id: "pkg-1",
  name: "Cancún julio",
  destination: "Cancún",
  departure_date: "2026-07-12",
  return_date: "2026-07-20",
  sale_amount_total: 1800,
  sale_currency: "USD",
  items: [
    {
      id: "item-hotel",
      operator_id: "op-hotel",
      product_type: "HOTEL",
      cost: 900,
      cost_currency: "USD",
      sale_amount: 1100,
      notes: "All inclusive",
    },
    {
      id: "item-aereo",
      operator_id: "op-aereo",
      product_type: "FLIGHT",
      cost: 500,
      cost_currency: "USD",
      sale_amount: 700,
      notes: null,
    },
  ],
  availability: { total_quota: 20, consumed: 6, remaining: 14 },
  ...over,
})

describe("buildPackageOperationDraft", () => {
  it("mapea cada pata del paquete a una ficha de operador, en orden", () => {
    const { operatorRows, hasOperators } = buildPackageOperationDraft(paquete())

    expect(hasOperators).toBe(true)
    expect(operatorRows).toHaveLength(2)
    // El orden importa: la primera pata define el operador principal.
    expect(operatorRows[0].operator_id).toBe("op-hotel")
    expect(operatorRows[0].cost).toBe(900)
    expect(operatorRows[0].product_type).toBe("HOTEL")
    expect(operatorRows[0].source_package_item_id).toBe("item-hotel")
  })

  it("NO copia file_code ni payment_due_date: son de la reserva, no de la plantilla", () => {
    const { operatorRows } = buildPackageOperationDraft(paquete())

    for (const row of operatorRows) {
      expect(row).not.toHaveProperty("file_code")
      expect(row).not.toHaveProperty("payment_due_date")
    }
  })

  it("aporta destino, fechas y precio, y NADA de lo que es del vendedor", () => {
    const { formValues } = buildPackageOperationDraft(paquete())

    expect(formValues).toEqual({
      destination: "Cancún",
      departure_date: "2026-07-12",
      return_date: "2026-07-20",
      sale_amount_total: 1800,
      sale_currency: "USD",
    })
    // Un paquete no decide quién vende, para qué agencia ni a qué cliente.
    expect(formValues).not.toHaveProperty("agency_id")
    expect(formValues).not.toHaveProperty("seller_id")
    expect(formValues).not.toHaveProperty("customer_id")
    expect(formValues).not.toHaveProperty("adults")
  })

  it("un paquete sin precio no pisa el total que el vendedor ya escribió", () => {
    const { formValues } = buildPackageOperationDraft(paquete({ sale_amount_total: null }))

    expect(formValues).not.toHaveProperty("sale_amount_total")
    expect(formValues).not.toHaveProperty("sale_currency")
  })

  it("un paquete sin patas no rompe", () => {
    const { operatorRows, hasOperators } = buildPackageOperationDraft(paquete({ items: [] }))

    expect(operatorRows).toEqual([])
    expect(hasOperators).toBe(false)
  })
})

describe("mergeOperatorRowsWithPackage", () => {
  const delPaquete = { operator_id: "op-hotel", source_package_item_id: "item-hotel" }
  const extra = { operator_id: "op-traslado" }
  const fichaVacia = { operator_id: "" }

  it("cambiar de paquete quita las patas del anterior y conserva los extras", () => {
    const nuevas = buildPackageOperationDraft(
      paquete({ id: "pkg-2", items: [paquete().items[1]] })
    ).operatorRows

    const { rows, removedCount } = mergeOperatorRowsWithPackage(
      [delPaquete, extra],
      nuevas
    )

    expect(removedCount).toBe(1)
    expect(rows.map((r: any) => r.operator_id)).toEqual(["op-aereo", "op-traslado"])
  })

  it("las patas del paquete van adelante: la primera es el operador principal", () => {
    const { rows } = mergeOperatorRowsWithPackage(
      [extra],
      buildPackageOperationDraft(paquete()).operatorRows
    )

    expect(rows[0]).toMatchObject({ operator_id: "op-hotel" })
  })

  it('elegir "sin paquete" deja solo los operadores cargados a mano', () => {
    const { rows, removedCount } = mergeOperatorRowsWithPackage([delPaquete, extra], [])

    expect(removedCount).toBe(1)
    expect(rows).toEqual([extra])
  })

  it("no arrastra fichas vacías", () => {
    const { rows } = mergeOperatorRowsWithPackage(
      [fichaVacia],
      buildPackageOperationDraft(paquete()).operatorRows
    )

    expect(rows).toHaveLength(2)
    expect(rows.every((r: any) => r.operator_id)).toBe(true)
  })

  it("quitar el paquete cuando no había extras deja la lista vacía para que el form reponga una ficha", () => {
    const { rows } = mergeOperatorRowsWithPackage([delPaquete], [])

    expect(rows).toEqual([])
  })
})
