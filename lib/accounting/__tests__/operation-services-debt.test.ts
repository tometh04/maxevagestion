import {
  getServiceExtrasByOperation,
  computeCustomerDebtInSaleCurrency,
} from "../operation-services-debt"

/**
 * Mock del query builder de supabase para operation_services:
 *   supabase.from("operation_services").select(...).in("operation_id", chunk)
 * Cada llamada a .in() resuelve con las filas cuyo operation_id está en el chunk.
 */
function createMockSupabase(rows: any[]) {
  const inMock = jest.fn((_col: string, ids: string[]) =>
    Promise.resolve({
      data: rows.filter((r) => ids.includes(r.operation_id)),
      error: null,
    })
  )
  const selectMock = jest.fn(() => ({ in: inMock }))
  const fromMock = jest.fn(() => ({ select: selectMock }))
  return { supabase: { from: fromMock } as any, inMock, fromMock }
}

describe("getServiceExtrasByOperation", () => {
  it("suma servicios en la misma moneda de venta/costo de la op", async () => {
    const rows = [
      { operation_id: "op1", sale_amount: 100, sale_currency: "USD", cost_amount: 60, cost_currency: "USD" },
      { operation_id: "op1", sale_amount: 50, sale_currency: "USD", cost_amount: 30, cost_currency: "USD" },
    ]
    const { supabase } = createMockSupabase(rows)
    const res = await getServiceExtrasByOperation(
      supabase,
      [{ id: "op1", sale_currency: "USD", operator_cost_currency: "USD" }],
      "org1"
    )
    expect(res["op1"]).toEqual({ saleExtra: 150, costExtra: 90 })
  })

  it("excluye servicios en otra moneda que la de la op", async () => {
    const rows = [
      { operation_id: "op1", sale_amount: 100, sale_currency: "USD", cost_amount: 60, cost_currency: "USD" },
      { operation_id: "op1", sale_amount: 9999, sale_currency: "ARS", cost_amount: 8888, cost_currency: "ARS" },
    ]
    const { supabase } = createMockSupabase(rows)
    const res = await getServiceExtrasByOperation(
      supabase,
      [{ id: "op1", sale_currency: "USD", operator_cost_currency: "USD" }],
      "org1"
    )
    expect(res["op1"]).toEqual({ saleExtra: 100, costExtra: 60 })
  })

  it("respeta monedas de venta y costo distintas de la op", async () => {
    // venta en USD, costo en ARS: sale_amount cuenta, cost_amount cuenta solo si cost_currency=ARS
    const rows = [
      { operation_id: "op1", sale_amount: 100, sale_currency: "USD", cost_amount: 5000, cost_currency: "ARS" },
    ]
    const { supabase } = createMockSupabase(rows)
    const res = await getServiceExtrasByOperation(
      supabase,
      [{ id: "op1", sale_currency: "USD", operator_cost_currency: "ARS" }],
      "org1"
    )
    expect(res["op1"]).toEqual({ saleExtra: 100, costExtra: 5000 })
  })

  it("usa `currency` como fallback de sale/cost currency", async () => {
    const rows = [
      { operation_id: "op1", sale_amount: 100, sale_currency: "ARS", cost_amount: 60, cost_currency: "ARS" },
    ]
    const { supabase } = createMockSupabase(rows)
    const res = await getServiceExtrasByOperation(supabase, [{ id: "op1", currency: "ARS" }], "org1")
    expect(res["op1"]).toEqual({ saleExtra: 100, costExtra: 60 })
  })

  it("deja ausentes las ops sin servicios (caller trata como 0)", async () => {
    const { supabase } = createMockSupabase([])
    const res = await getServiceExtrasByOperation(supabase, [{ id: "op1", sale_currency: "USD" }], "org1")
    expect(res["op1"]).toBeUndefined()
  })

  it("tolera sale_amount string/null", async () => {
    const rows = [
      { operation_id: "op1", sale_amount: "100", sale_currency: "USD", cost_amount: null, cost_currency: "USD" },
    ]
    const { supabase } = createMockSupabase(rows)
    const res = await getServiceExtrasByOperation(
      supabase,
      [{ id: "op1", sale_currency: "USD", operator_cost_currency: "USD" }],
      "org1"
    )
    expect(res["op1"]).toEqual({ saleExtra: 100, costExtra: 0 })
  })

  it("chunkea las operaciones de a 200 (N+1-safe)", async () => {
    const ops = Array.from({ length: 450 }, (_, i) => ({ id: `op${i}`, sale_currency: "USD" }))
    const { supabase, inMock } = createMockSupabase([])
    await getServiceExtrasByOperation(supabase, ops, "org1")
    // 450 ids => 3 chunks (200 + 200 + 50)
    expect(inMock).toHaveBeenCalledTimes(3)
  })

  it("retorna vacío si no hay operaciones", async () => {
    const { supabase, fromMock } = createMockSupabase([])
    const res = await getServiceExtrasByOperation(supabase, [], "org1")
    expect(res).toEqual({})
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe("computeCustomerDebtInSaleCurrency (matriz de daño)", () => {
  // deuda ON = max(0, S + Σsvc − P)
  it("(a) sin servicios: idéntico con flag ON u OFF", () => {
    const base = { saleBase: 8000, serviceExtra: 0, paidNet: 6000 }
    expect(computeCustomerDebtInSaleCurrency({ ...base, includeServices: false })).toBe(2000)
    expect(computeCustomerDebtInSaleCurrency({ ...base, includeServices: true })).toBe(2000)
  })

  it("(b) mixta con servicio impago: ON suma el servicio", () => {
    const base = { saleBase: 8000, serviceExtra: 500, paidNet: 6000 }
    expect(computeCustomerDebtInSaleCurrency({ ...base, includeServices: false })).toBe(2000)
    expect(computeCustomerDebtInSaleCurrency({ ...base, includeServices: true })).toBe(2500)
  })

  it("(b') mixta con servicio pagado: el pago ya está en paidNet, no doble-cuenta", () => {
    const base = { saleBase: 8000, serviceExtra: 500, paidNet: 6500 }
    // OFF sub-reporta (1500); ON corrige a 2000
    expect(computeCustomerDebtInSaleCurrency({ ...base, includeServices: false })).toBe(1500)
    expect(computeCustomerDebtInSaleCurrency({ ...base, includeServices: true })).toBe(2000)
  })

  it("(e) base=0 solo-servicios impago: ON muestra el servicio", () => {
    const base = { saleBase: 0, serviceExtra: 500, paidNet: 0 }
    expect(computeCustomerDebtInSaleCurrency({ ...base, includeServices: false })).toBe(0)
    expect(computeCustomerDebtInSaleCurrency({ ...base, includeServices: true })).toBe(500)
  })

  it("nunca devuelve deuda negativa (clamp en 0)", () => {
    expect(
      computeCustomerDebtInSaleCurrency({ saleBase: 100, serviceExtra: 0, paidNet: 500, includeServices: true })
    ).toBe(0)
  })

  it("tolera valores string/undefined", () => {
    expect(
      computeCustomerDebtInSaleCurrency({
        saleBase: 8000 as any,
        serviceExtra: undefined as any,
        paidNet: 6000,
        includeServices: true,
      })
    ).toBe(2000)
  })
})
