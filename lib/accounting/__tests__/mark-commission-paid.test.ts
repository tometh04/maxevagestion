/**
 * Tests del marcado automático de comisiones al crear un ledger COMMISSION.
 *
 * El invariante que cuidan: una operación puede tener MÁS de una comisión del
 * mismo vendedor —la de la venta y una por cada servicio que esa persona vendió
 * después, cada una con su propio mes—, así que "marcar todas las PENDING del
 * par (operación, vendedor)" dejaría por cobrada plata que nadie pagó.
 */

import { markCommissionsAsPaidIfLedgerExists } from "@/lib/accounting/mark-commission-paid"

interface UpdateCall {
  filters: Record<string, any>
  notFilters: Record<string, any>
  inFilters: Record<string, any>
}

/**
 * Fake de Supabase que registra CÓMO se acotó el update. No simula la tabla: lo
 * que importa acá no es el resultado sino contra qué filas se disparó.
 */
function createSupabase(ledgerRows: Array<{ id: string; seller_id: string | null }>) {
  const updateCalls: UpdateCall[] = []

  const from = (table: string) => {
    const state: any = {
      op: "select",
      filters: {},
      notFilters: {},
      inFilters: {},
    }

    const builder: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: any) => {
              if (table === "ledger_movements") {
                resolve({ data: ledgerRows, error: null })
                return
              }
              updateCalls.push({
                filters: state.filters,
                notFilters: state.notFilters,
                inFilters: state.inFilters,
              })
              resolve({ data: [{ id: "cr-1" }], error: null })
            }
          }
          return (...args: any[]) => {
            const name = String(prop)
            if (name === "update") state.op = "update"
            if (name === "eq") state.filters[args[0]] = args[1]
            if (name === "neq") state.notFilters[args[0]] = args[1]
            if (name === "in") state.inFilters[args[0]] = args[1]
            return builder
          }
        },
      }
    )
    return builder
  }

  return { client: { from } as any, updateCalls }
}

describe("markCommissionsAsPaidIfLedgerExists", () => {
  it("con la fila concreta, marca sólo esa y no barre por vendedor", async () => {
    // Es el caso del pago real: `/api/commissions/pay` sabe exactamente qué
    // comisión está saldando. Si en vez de eso barriera por (operación,
    // vendedor), cobrar la comisión del paquete daría por pagada también la del
    // servicio que esa misma persona vendió meses después.
    const { client, updateCalls } = createSupabase([{ id: "lm-1", seller_id: "jose" }])

    await markCommissionsAsPaidIfLedgerExists(client, "op-1", {
      commissionRecordId: "cr-venta",
    })

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].filters.id).toBe("cr-venta")
    expect(updateCalls[0].inFilters.seller_id).toBeUndefined()
  })

  it("sin fila concreta conserva el barrido por vendedor, pero nunca toca las de servicio", async () => {
    // Camino heredado: sin saber qué fila corresponde al movimiento, se sigue
    // marcando por vendedor —comportamiento histórico— pero se excluyen las
    // comisiones de servicio, que se cobran por su propio circuito y no deben
    // saldarse como efecto colateral del pago de otra.
    const { client, updateCalls } = createSupabase([{ id: "lm-1", seller_id: "jose" }])

    await markCommissionsAsPaidIfLedgerExists(client, "op-1")

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].inFilters.seller_id).toEqual(["jose"])
    expect(updateCalls[0].notFilters.kind).toBe("SERVICE")
  })

  it("sin movimientos COMMISSION no marca nada", async () => {
    const { client, updateCalls } = createSupabase([])

    const result = await markCommissionsAsPaidIfLedgerExists(client, "op-1")

    expect(result).toEqual({ marked: 0 })
    expect(updateCalls).toEqual([])
  })
})
