/**
 * @jest-environment node
 *
 * VIB-152 — "una vez que filtramos, descarga un excel pero general, no lo que filtré".
 *
 * El listado y el export tenían cada uno su propia búsqueda y divergieron:
 * `/api/operations` resolvía **nombre de pasajero** además del texto libre,
 * `/api/operations/export-csv` solo miraba file_code/destination/origin. Buscar
 * un apellido en pantalla y exportar daba dos resultados distintos.
 *
 * Estos tests fijan el contrato del helper compartido. El caso que más importa
 * es `no-match`: si devolviera `[]` y el caller hiciera `.or("")`, PostgREST
 * traería TODAS las operaciones — que es exactamente el síntoma reportado.
 */

import {
  buildOperationSearchConditions,
  CUSTOMER_SEARCH_CAP,
  MIN_SEARCH_LENGTH,
} from "../search-conditions"

const ORG_ID = "org-1"

interface MockOptions {
  customers?: Array<{ id: string }>
  operationCustomers?: Array<{ operation_id: string }>
  failCustomers?: boolean
}

/** Registra las tablas consultadas y los `.eq()` aplicados, para poder afirmar sobre el scoping. */
let queried: Array<{ table: string; filters: Array<[string, unknown]> }> = []

function buildSupabase({ customers = [], operationCustomers = [], failCustomers = false }: MockOptions) {
  return {
    from(table: string) {
      const entry = { table, filters: [] as Array<[string, unknown]> }
      queried.push(entry)

      const builder: any = {
        select: () => builder,
        or: () => builder,
        in: () => builder,
        eq: (col: string, val: unknown) => {
          entry.filters.push([col, val])
          return builder
        },
        limit: async () => {
          if (failCustomers) throw new Error("boom")
          return { data: customers, error: null }
        },
        then: (resolve: any) => resolve({ data: operationCustomers, error: null }),
      }
      return builder
    },
  }
}

beforeEach(() => {
  queried = []
})

describe("buildOperationSearchConditions", () => {
  it("no filtra nada si el término es más corto que el mínimo", async () => {
    const result = await buildOperationSearchConditions(buildSupabase({}), "a", ORG_ID)

    expect(result.kind).toBe("skip")
    expect(MIN_SEARCH_LENGTH).toBe(2)
  })

  it("no filtra nada si no hay término", async () => {
    expect((await buildOperationSearchConditions(buildSupabase({}), null, ORG_ID)).kind).toBe("skip")
    expect((await buildOperationSearchConditions(buildSupabase({}), "   ", ORG_ID)).kind).toBe("skip")
  })

  it("busca en los mismos campos de texto que el listado", async () => {
    const result = await buildOperationSearchConditions(buildSupabase({}), "cancun", ORG_ID)

    expect(result.kind).toBe("match")
    if (result.kind !== "match") return
    const joined = result.conditions.join(",")
    expect(joined).toContain("file_code.ilike.%cancun%")
    expect(joined).toContain("destination.ilike.%cancun%")
    expect(joined).toContain("airline_name.ilike.%cancun%")
    expect(joined).toContain("hotel_name.ilike.%cancun%")
  })

  it("suma las operaciones que matchean por nombre de pasajero", async () => {
    const supabase = buildSupabase({
      customers: [{ id: "c1" }, { id: "c2" }],
      operationCustomers: [{ operation_id: "op1" }, { operation_id: "op2" }],
    })

    const result = await buildOperationSearchConditions(supabase, "perez", ORG_ID)

    expect(result.kind).toBe("match")
    if (result.kind !== "match") return
    expect(result.conditions.join(",")).toContain("id.in.(op1,op2)")
  })

  it("deduplica operaciones con varios pasajeros que matchean", async () => {
    const supabase = buildSupabase({
      customers: [{ id: "c1" }, { id: "c2" }],
      // Marido y mujer en la misma operación: el id venía repetido y engordaba la URL.
      operationCustomers: [{ operation_id: "op1" }, { operation_id: "op1" }],
    })

    const result = await buildOperationSearchConditions(supabase, "perez", ORG_ID)

    if (result.kind !== "match") throw new Error("esperaba match")
    expect(result.conditions.join(",")).toContain("id.in.(op1)")
  })

  it("scopea la búsqueda de clientes por org", async () => {
    await buildOperationSearchConditions(buildSupabase({ customers: [{ id: "c1" }] }), "perez", ORG_ID)

    const customersCall = queried.find((q) => q.table === "customers")
    expect(customersCall?.filters).toContainEqual(["org_id", ORG_ID])
  })

  it("devuelve no-match cuando el término sanitizado queda vacío y no hay pasajeros", async () => {
    // ",,," se sanitiza a vacío: sin este caso el caller haría `.or("")` y
    // PostgREST devolvería TODO, que es el bug original.
    const result = await buildOperationSearchConditions(buildSupabase({}), ",,,", ORG_ID)

    expect(result.kind).toBe("no-match")
  })

  it("nunca devuelve un array de condiciones vacío", async () => {
    for (const term of ["cancun", ",,,", "perez"]) {
      const result = await buildOperationSearchConditions(buildSupabase({}), term, ORG_ID)
      if (result.kind === "match") {
        expect(result.conditions.length).toBeGreaterThan(0)
      }
    }
  })

  it("si falla la búsqueda de pasajeros, degrada a texto libre en vez de romper", async () => {
    const result = await buildOperationSearchConditions(
      buildSupabase({ failCustomers: true }),
      "perez",
      ORG_ID
    )

    expect(result.kind).toBe("match")
    if (result.kind !== "match") return
    expect(result.conditions.join(",")).toContain("file_code.ilike.%perez%")
    expect(result.conditions.join(",")).not.toContain("id.in.")
  })

  it("recorta si la búsqueda de clientes toca el tope", async () => {
    const customers = Array.from({ length: CUSTOMER_SEARCH_CAP }, (_, i) => ({ id: `c${i}` }))
    const operationCustomers = Array.from({ length: 600 }, (_, i) => ({ operation_id: `op${i}` }))

    const result = await buildOperationSearchConditions(
      buildSupabase({ customers, operationCustomers }),
      "perez",
      ORG_ID
    )

    if (result.kind !== "match") throw new Error("esperaba match")
    const idsCondition = result.conditions.find((c) => c.startsWith("id.in."))
    expect(idsCondition).toBeDefined()
    // 500 ids, no 600: el tope evita una URL impracticable.
    expect(idsCondition!.split(",").length).toBe(500)
  })
})
