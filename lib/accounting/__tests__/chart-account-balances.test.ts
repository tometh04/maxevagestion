/**
 * Saldos por cuenta del plan.
 *
 * Dos cosas se fijan acá y las dos ya nos mordieron antes en este repo:
 *
 *   1. **Se pagina de verdad.** PostgREST corta en 1.000 filas sin avisar. Un
 *      total incompleto que igual parece correcto es la peor forma de estar mal.
 *   2. **No se mezclan monedas.** La clave de agregación incluye la moneda; sin
 *      eso, pesos y dólares se suman en un número que parece un total.
 *
 * Y una tercera que es nueva: el filtro por tipo de cierre, que es lo que
 * impide que el asiento de refundición se coma su propio Estado de Resultados.
 */
import {
  agruparResultadosPorMoneda,
  calcularSaldosPorCuenta,
  type CuentaDelPlan,
  type SaldoPorCuenta,
} from "../chart-account-balances"

const PLAN: Array<[string, CuentaDelPlan]> = [
  ["c-ventas", { id: "c-ventas", account_code: "4.1.01", account_name: "Ventas", category: "RESULTADO" }],
  ["c-gastos", { id: "c-gastos", account_code: "4.3.01", account_name: "Gastos", category: "RESULTADO" }],
  ["c-caja", { id: "c-caja", account_code: "1.1.01", account_name: "Caja", category: "ACTIVO" }],
]
const plan = new Map(PLAN)

/**
 * Mock que devuelve los movimientos en páginas de 1000, para poder verificar
 * que el helper realmente pagina en vez de conformarse con la primera tanda.
 */
function mockSupabase(movimientos: any[]) {
  const llamadas: Array<{ from: number; to: number }> = []

  const from = jest.fn(() => {
    const chain: any = {}
    chain.select = jest.fn(() => chain)
    chain.eq = jest.fn(() => chain)
    chain.gte = jest.fn(() => chain)
    chain.lte = jest.fn(() => chain)
    chain.order = jest.fn(() => chain)
    chain.range = jest.fn((desde: number, hasta: number) => {
      llamadas.push({ from: desde, to: hasta })
      return Promise.resolve({ data: movimientos.slice(desde, hasta + 1), error: null })
    })
    return chain
  })

  return { supabase: { from } as any, llamadas }
}

const mov = (over: Partial<any> = {}) => ({
  chart_account_id: "c-ventas",
  currency: "USD",
  debit_amount: 0,
  credit_amount: 100,
  ...over,
})

describe("acumula Debe y Haber por cuenta", () => {
  it("suma los movimientos de la misma cuenta y moneda", async () => {
    const { supabase } = mockSupabase([mov(), mov(), mov({ debit_amount: 30, credit_amount: 0 })])
    const r = await calcularSaldosPorCuenta(supabase, { orgId: "org-1" }, plan)

    expect(r.filas).toHaveLength(1)
    expect(r.filas[0]).toMatchObject({
      account_code: "4.1.01",
      currency: "USD",
      debit: 30,
      credit: 200,
      movements: 3,
    })
  })

  it("no mezcla monedas: la misma cuenta en dos monedas son dos filas", async () => {
    const { supabase } = mockSupabase([mov({ currency: "USD" }), mov({ currency: "ARS" })])
    const r = await calcularSaldosPorCuenta(supabase, { orgId: "org-1" }, plan)

    expect(r.filas).toHaveLength(2)
    expect(r.filas.map((f) => f.currency).sort()).toEqual(["ARS", "USD"])
  })

  it("devuelve Debe y Haber crudos, sin aplicar signo", async () => {
    // Es la razón de ser del módulo: el Mayor por Cuenta trata la familia 4 como
    // deudora y el Estado de Resultados al revés. Si acá se impusiera un signo,
    // uno de los dos tendría que darlo vuelta.
    const { supabase } = mockSupabase([mov({ credit_amount: 500 })])
    const r = await calcularSaldosPorCuenta(supabase, { orgId: "org-1" }, plan)

    expect(r.filas[0].credit).toBe(500)
    expect(r.filas[0].debit).toBe(0)
    expect(r.filas[0]).not.toHaveProperty("balance")
  })
})

describe("qué NO se cuenta", () => {
  it("un movimiento sin cuenta contable", async () => {
    const { supabase } = mockSupabase([mov({ chart_account_id: null })])
    const r = await calcularSaldosPorCuenta(supabase, { orgId: "org-1" }, plan)

    expect(r.filas).toHaveLength(0)
    expect(r.sinClasificar).toBe(1)
  })

  it("un movimiento sin Debe ni Haber", async () => {
    // Tiene cuenta pero no es línea de asiento. Contarlo infla la cobertura y
    // agrega una fila en cero que no significa nada.
    const { supabase } = mockSupabase([mov({ debit_amount: 0, credit_amount: 0 })])
    const r = await calcularSaldosPorCuenta(supabase, { orgId: "org-1" }, plan)

    expect(r.filas).toHaveLength(0)
    expect(r.sinClasificar).toBe(1)
  })

  it("una cuenta que no está en el plan de la organización", async () => {
    // No debería pasar nunca, pero si pasa se cuenta como sin clasificar en vez
    // de romper.
    const { supabase } = mockSupabase([mov({ chart_account_id: "c-de-otra-org" })])
    const r = await calcularSaldosPorCuenta(supabase, { orgId: "org-1" }, plan)

    expect(r.filas).toHaveLength(0)
    expect(r.sinClasificar).toBe(1)
  })
})

describe("el filtro por tipo de cierre", () => {
  it("descarta los asientos excluidos", async () => {
    // Es lo que impide que la refundición se coma su propio Estado de
    // Resultados: el asiento que cancela las cuentas 4.x está fechado dentro
    // del ejercicio, así que sin filtrar se suma a las cuentas que anula.
    const { supabase } = mockSupabase([
      mov({ credit_amount: 1000, journal_entries: { close_kind: null } }),
      mov({ debit_amount: 1000, credit_amount: 0, journal_entries: { close_kind: "REFUNDICION" } }),
    ])

    const r = await calcularSaldosPorCuenta(
      supabase,
      { orgId: "org-1", excluirCloseKinds: ["REFUNDICION"] },
      plan
    )

    expect(r.filas).toHaveLength(1)
    expect(r.filas[0].credit).toBe(1000)
    expect(r.filas[0].debit).toBe(0)
  })

  it("sin filtro, los incluye", async () => {
    const { supabase } = mockSupabase([
      mov({ credit_amount: 1000 }),
      mov({ debit_amount: 1000, credit_amount: 0, journal_entries: { close_kind: "REFUNDICION" } }),
    ])
    const r = await calcularSaldosPorCuenta(supabase, { orgId: "org-1" }, plan)

    // La cuenta queda en cero, que es justamente lo que hace la refundición.
    expect(r.filas[0].debit).toBe(1000)
    expect(r.filas[0].credit).toBe(1000)
  })

  it("no descarta los asientos normales, que no tienen tipo de cierre", async () => {
    const { supabase } = mockSupabase([mov({ journal_entries: { close_kind: null } })])
    const r = await calcularSaldosPorCuenta(
      supabase,
      { orgId: "org-1", excluirCloseKinds: ["REFUNDICION"] },
      plan
    )
    expect(r.filas).toHaveLength(1)
  })
})

describe("paginación", () => {
  it("sigue pidiendo páginas hasta que una viene incompleta", async () => {
    // 1.500 movimientos: si se conformara con la primera tanda, el total saldría
    // en 1.000 y parecería correcto.
    const muchos = Array.from({ length: 1500 }, () => mov({ credit_amount: 1 }))
    const { supabase, llamadas } = mockSupabase(muchos)

    const r = await calcularSaldosPorCuenta(supabase, { orgId: "org-1" }, plan)

    expect(r.filas[0].credit).toBe(1500)
    expect(r.filas[0].movements).toBe(1500)
    expect(llamadas.length).toBeGreaterThanOrEqual(2)
    expect(llamadas[0]).toEqual({ from: 0, to: 999 })
  })

  it("con exactamente una página llena, pide la siguiente y corta", async () => {
    // El caso de borde: 1.000 justos. Si cortara por longitud igual a la página
    // sin pedir más, perdería los movimientos 1.001 en adelante cuando existan.
    const exactos = Array.from({ length: 1000 }, () => mov({ credit_amount: 1 }))
    const { supabase, llamadas } = mockSupabase(exactos)

    const r = await calcularSaldosPorCuenta(supabase, { orgId: "org-1" }, plan)

    expect(r.filas[0].credit).toBe(1000)
    expect(llamadas.length).toBe(2)
  })
})

describe("agruparResultadosPorMoneda", () => {
  const fila = (codigo: string, currency: string): SaldoPorCuenta => ({
    chart_account_id: `c-${codigo}`,
    account_code: codigo,
    account_name: codigo,
    category: "RESULTADO",
    currency,
    debit: 0,
    credit: 100,
    movements: 1,
  })

  it("solo toma la familia 4 y separa por moneda", () => {
    const r = agruparResultadosPorMoneda([
      fila("4.1.01", "USD"),
      fila("4.3.01", "USD"),
      fila("4.1.01", "ARS"),
      // El activo no entra: el cierre de ejercicio no lo toca.
      { ...fila("1.1.01", "USD"), category: "ACTIVO" },
    ])

    expect(Array.from(r.keys()).sort()).toEqual(["ARS", "USD"])
    expect(r.get("USD")).toHaveLength(2)
    expect(r.get("ARS")).toHaveLength(1)
  })

  it("sin cuentas de resultado devuelve un mapa vacío", () => {
    const r = agruparResultadosPorMoneda([{ ...fila("1.1.01", "USD"), category: "ACTIVO" }])
    expect(r.size).toBe(0)
  })
})
