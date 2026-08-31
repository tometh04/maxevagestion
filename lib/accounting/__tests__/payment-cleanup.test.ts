/**
 * @jest-environment node
 *
 * Residuos del borrado de un pago.
 *
 * Lo que se fija acá es que no quede nada colgado y que la limpieza no se pase
 * de rosca: borrar un asiento que todavía tiene líneas sería peor que dejar uno
 * vacío, porque se llevaría puesto el respaldo de otro pago.
 */
import {
  debeBorrarseElAsiento,
  limpiarAsientosVaciosDeOperacion,
  limpiarMovimientosSinPagoVivo,
  limpiarPercepcionesDePago,
  limpiarResiduosDePago,
} from "../payment-cleanup"

/**
 * Supabase de mentira. `lineasPorAsiento` decide cuántas líneas le quedan a
 * cada cabecera; `borrados` registra qué se elimino, que es lo que se verifica.
 */
function fakeSupabase(opts: {
  withholdings?: Array<{ id: string }>
  entries?: Array<{ id: string }>
  lineasPorAsiento?: Record<string, number>
  failWithholdings?: boolean
  failCount?: boolean
  pagosVivos?: number
  percepciones?: Array<{ id: string }>
  fx?: Array<{ id: string }>
} = {}) {
  const borrados = { withholdings: [] as any[], journalEntries: [] as string[], ledger: [] as string[] }
  const filtros: Record<string, any> = {}

  const client = {
    from: (table: string) => {
      const b: any = {
        _eq: {} as Record<string, any>,
        _isDelete: false,
        _isCount: false,
        select: (_cols?: string, o?: any) => {
          if (o?.head && o?.count === "exact") b._isCount = true
          return b
        },
        delete: () => {
          b._isDelete = true
          return b
        },
        in: (col: string, vals: any) => { b._eq[col] = vals; return b },
        ilike: (col: string, val: any) => { b._eq[`ilike:${col}`] = val; return b },
        eq: (col: string, val: any) => {
          b._eq[col] = val
          filtros[`${table}.${col}`] = val
          return b
        },
        // La resolución ocurre recién al await, con todos los filtros ya
        // acumulados: así el mock se comporta como el builder real.
        then(resolve: any) {
          return Promise.resolve(b._resolve()).then(resolve)
        },
        _resolve() {
          if (b._isCount && table === "payments") {
            return { count: opts.pagosVivos ?? 0, error: null }
          }
          if (b._isDelete && table === "ledger_movements") {
            const rows = b._eq["ilike:concept"] ? (opts.percepciones ?? []) : (opts.fx ?? [])
            borrados.ledger.push(...rows.map((r: any) => r.id))
            return { data: rows, error: null }
          }
          if (b._isCount) {
            if (opts.failCount) return { count: null, error: { message: "boom" } }
            const id = b._eq["journal_entry_id"]
            return { count: opts.lineasPorAsiento?.[id] ?? 0, error: null }
          }
          if (b._isDelete && table === "tax_withholdings") {
            if (opts.failWithholdings) return { data: null, error: { message: "no anda" } }
            const rows = opts.withholdings ?? []
            borrados.withholdings.push(...rows)
            return { data: rows, error: null }
          }
          if (b._isDelete && table === "journal_entries") {
            borrados.journalEntries.push(b._eq["id"])
            return { data: [], error: null }
          }
          if (table === "journal_entries") return { data: opts.entries ?? [], error: null }
          return { data: [], error: null }
        },
      }
      return b
    },
  }

  return { client, borrados, filtros }
}

describe("debeBorrarseElAsiento", () => {
  it("una cabecera sin líneas no es un asiento", () => {
    expect(debeBorrarseElAsiento(0)).toBe(true)
  })

  it("si le queda aunque sea una línea, no se toca", () => {
    // Es el guard que evita llevarse puesto el respaldo de otro pago de la
    // misma operación.
    expect(debeBorrarseElAsiento(1)).toBe(false)
    expect(debeBorrarseElAsiento(2)).toBe(false)
  })
})

describe("limpiarPercepcionesDePago", () => {
  it("borra las percepciones que practicó ese pago", async () => {
    const { client, borrados, filtros } = fakeSupabase({
      withholdings: [{ id: "tw-1" }, { id: "tw-2" }],
    })
    const res = await limpiarPercepcionesDePago(client, { paymentId: "pay-1", orgId: "org-1" })

    expect(res).toEqual({ deleted: 2, error: null })
    expect(borrados.withholdings).toHaveLength(2)
    // Acotado al pago y al tenant: nunca a la operación entera.
    expect(filtros["tax_withholdings.source_id"]).toBe("pay-1")
    expect(filtros["tax_withholdings.source_type"]).toBe("PAYMENT")
    expect(filtros["tax_withholdings.org_id"]).toBe("org-1")
  })

  it("un fallo no corta el borrado del pago, lo devuelve para loguear", async () => {
    const { client } = fakeSupabase({ failWithholdings: true })
    const res = await limpiarPercepcionesDePago(client, { paymentId: "pay-1", orgId: "org-1" })
    expect(res.deleted).toBe(0)
    expect(res.error).toMatch(/no anda/)
  })
})

describe("limpiarAsientosVaciosDeOperacion", () => {
  it("borra solo las cabeceras que quedaron sin líneas", async () => {
    const { client, borrados } = fakeSupabase({
      entries: [{ id: "je-vacio" }, { id: "je-con-lineas" }],
      lineasPorAsiento: { "je-vacio": 0, "je-con-lineas": 2 },
    })
    const res = await limpiarAsientosVaciosDeOperacion(client, {
      operationId: "op-1",
      orgId: "org-1",
    })

    expect(res.deleted).toBe(1)
    expect(borrados.journalEntries).toEqual(["je-vacio"])
  })

  it("no borra nada si todas conservan líneas", async () => {
    const { client, borrados } = fakeSupabase({
      entries: [{ id: "je-1" }, { id: "je-2" }],
      lineasPorAsiento: { "je-1": 2, "je-2": 2 },
    })
    const res = await limpiarAsientosVaciosDeOperacion(client, {
      operationId: "op-1",
      orgId: "org-1",
    })
    expect(res.deleted).toBe(0)
    expect(borrados.journalEntries).toEqual([])
  })

  it("si no puede contar las líneas, NO borra: ante la duda no se toca", async () => {
    const { client, borrados } = fakeSupabase({
      entries: [{ id: "je-1" }],
      failCount: true,
    })
    const res = await limpiarAsientosVaciosDeOperacion(client, {
      operationId: "op-1",
      orgId: "org-1",
    })
    expect(res.deleted).toBe(0)
    expect(borrados.journalEntries).toEqual([])
    expect(res.errors).toHaveLength(1)
  })

  it("sin asientos en la operación no hace nada", async () => {
    const { client } = fakeSupabase({ entries: [] })
    const res = await limpiarAsientosVaciosDeOperacion(client, {
      operationId: "op-1",
      orgId: "org-1",
    })
    expect(res).toEqual({ deleted: 0, errors: [] })
  })
})

describe("limpiarResiduosDePago", () => {
  it("limpia percepciones y asientos vacíos en una sola pasada", async () => {
    const { client } = fakeSupabase({
      withholdings: [{ id: "tw-1" }],
      entries: [{ id: "je-vacio" }],
      lineasPorAsiento: { "je-vacio": 0 },
    })
    const res = await limpiarResiduosDePago(client, {
      paymentId: "pay-1",
      operationId: "op-1",
      orgId: "org-1",
    })
    expect(res).toEqual({
      withholdings: 1,
      ledgerSinPago: 0,
      emptyJournalEntries: 1,
      errors: [],
    })
  })

  it("un pago sin operación solo limpia percepciones", async () => {
    // Un pago suelto no tiene asientos de operación que revisar.
    const { client, borrados } = fakeSupabase({ withholdings: [{ id: "tw-1" }] })
    const res = await limpiarResiduosDePago(client, {
      paymentId: "pay-1",
      operationId: null,
      orgId: "org-1",
    })
    expect(res.withholdings).toBe(1)
    expect(res.emptyJournalEntries).toBe(0)
    expect(borrados.journalEntries).toEqual([])
  })

  it("junta los errores en vez de tirarlos", async () => {
    const { client } = fakeSupabase({ failWithholdings: true, entries: [] })
    const res = await limpiarResiduosDePago(client, {
      paymentId: "pay-1",
      operationId: "op-1",
      orgId: "org-1",
    })
    expect(res.errors).toHaveLength(1)
  })
})

// ==================================================================
// Percepciones y diferencia de cambio en el MAYOR.
//
// A diferencia de las `tax_withholdings`, estas líneas no guardan a qué pago
// pertenecen: el único vínculo es la operación. Por eso solo se limpian cuando
// no quedó ningún cobro vivo — borrar el movimiento de otro pago sería peor que
// dejar el propio.
// ==================================================================
describe("limpiarMovimientosSinPagoVivo", () => {
  it("borra percepciones y FX si la operación se quedó sin cobros", async () => {
    const { client, borrados } = fakeSupabase({
      pagosVivos: 0,
      percepciones: [{ id: "lm-perc-1" }, { id: "lm-perc-2" }],
      fx: [{ id: "lm-fx-1" }],
    })
    const res = await limpiarMovimientosSinPagoVivo(client, {
      operationId: "op-1",
      orgId: "org-1",
    })
    expect(res.deleted).toBe(3)
    expect(borrados.ledger).toEqual(["lm-perc-1", "lm-perc-2", "lm-fx-1"])
  })

  it("NO toca nada si todavía queda un cobro vivo", async () => {
    // El caso peligroso: dos cuotas, se borra una. Los movimientos que quedan
    // pueden ser de la otra y no hay forma de distinguirlos.
    const { client, borrados } = fakeSupabase({
      pagosVivos: 1,
      percepciones: [{ id: "lm-perc-1" }],
      fx: [{ id: "lm-fx-1" }],
    })
    const res = await limpiarMovimientosSinPagoVivo(client, {
      operationId: "op-1",
      orgId: "org-1",
    })
    expect(res.deleted).toBe(0)
    expect(borrados.ledger).toEqual([])
  })

  it("sin percepciones ni FX no rompe", async () => {
    const { client } = fakeSupabase({ pagosVivos: 0 })
    const res = await limpiarMovimientosSinPagoVivo(client, {
      operationId: "op-1",
      orgId: "org-1",
    })
    expect(res).toEqual({ deleted: 0, errors: [] })
  })

  it("limpia el mayor ANTES que los asientos, para no dejar uno desbalanceado", async () => {
    // Si el asiento se barriera primero, la cabecera sobreviviría con solo las
    // patas de la percepción: Debe distinto de Haber.
    const { client } = fakeSupabase({
      pagosVivos: 0,
      percepciones: [{ id: "lm-perc-1" }],
      entries: [{ id: "je-1" }],
      lineasPorAsiento: { "je-1": 0 },
    })
    const res = await limpiarResiduosDePago(client, {
      paymentId: "pay-1",
      operationId: "op-1",
      orgId: "org-1",
    })
    expect(res.ledgerSinPago).toBe(1)
    expect(res.emptyJournalEntries).toBe(1)
  })
})
