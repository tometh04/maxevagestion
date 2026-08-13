/**
 * Tests del cap de overpayment en buildOperatorPaymentUpdate.
 *
 * Fix aplicado en Sprint anterior: nextPaidAmount está topeado en
 * [0, totalAmount] para evitar que paid_amount supere amount (lo que
 * generaba saldo negativo en operator_payments, haciendo creer al
 * sistema que la agencia le debe plata al operador cuando no es así).
 */

import {
  buildOperatorPaymentUpdate,
  pickExactPendingMatch,
  findMatchingOperatorPayment,
  AmbiguousOperatorPaymentError,
  resyncFullyRevertedOperatorPayment,
} from "../operator-payment-settlement"

describe("buildOperatorPaymentUpdate — overpayment cap", () => {
  const baseRow = {
    amount: 1000,
    paid_amount: 0,
    due_date: "2026-12-31",
  }

  it("normal partial payment: paid_amount avanza correctamente", () => {
    const update = buildOperatorPaymentUpdate(baseRow, 300, "ledger-1")
    expect(update.paid_amount).toBe(300)
    expect(update.status).not.toBe("PAID")
    expect(update.ledger_movement_id).toBeNull()
  })

  it("payment exacto al total: queda PAID", () => {
    const update = buildOperatorPaymentUpdate(baseRow, 1000, "ledger-1")
    expect(update.paid_amount).toBe(1000)
    expect(update.status).toBe("PAID")
    expect(update.ledger_movement_id).toBe("ledger-1")
  })

  it("overpayment: paid_amount queda topeado en amount (no lo excede)", () => {
    // Sin el cap, este caso daba paid_amount=1500 > amount=1000, simulando
    // que la agencia le "debía" 500 al operador.
    const update = buildOperatorPaymentUpdate(baseRow, 1500, "ledger-1")
    expect(update.paid_amount).toBe(1000)
    expect(update.status).toBe("PAID")
  })

  it("overpayment acumulado: suma actual + nuevo no supera total", () => {
    // Estado previo: ya se pagaron 800 de 1000. Ahora meten otro pago de 500.
    // Sin cap daría paid_amount=1300. Con cap queda en 1000.
    const update = buildOperatorPaymentUpdate(
      { ...baseRow, paid_amount: 800 },
      500,
      "ledger-2"
    )
    expect(update.paid_amount).toBe(1000)
    expect(update.status).toBe("PAID")
  })

  it("reverso mayor al pagado: paid_amount se tope en 0 (no queda negativo)", () => {
    // Estado: ya pagados 200 de 1000. Alguien reversea -500 por error.
    // Sin cap daría paid_amount=-300. Con cap queda en 0.
    const update = buildOperatorPaymentUpdate(
      { ...baseRow, paid_amount: 200 },
      -500,
      null
    )
    expect(update.paid_amount).toBe(0)
    expect(update.status).not.toBe("PAID")
  })

  it("pago parcial no setea ledger_movement_id", () => {
    const update = buildOperatorPaymentUpdate(baseRow, 500, "ledger-1")
    expect(update.paid_amount).toBe(500)
    expect(update.ledger_movement_id).toBeNull() // sólo se setea al cerrar
  })

  it("redondeo a 2 decimales en caso de centavos", () => {
    const update = buildOperatorPaymentUpdate(
      { ...baseRow, paid_amount: 333.333 },
      166.667,
      "ledger-x"
    )
    // 333.333 + 166.667 = 500.00
    expect(update.paid_amount).toBeCloseTo(500, 2)
  })
})

describe("pickExactPendingMatch — desambiguación de patas por monto", () => {
  // Reproduce OP b62d751c: mismo operador en 2 patas (Hotel 332,64 / Vuelo 399,44).
  const hotel = { id: "hotel", amount: 332.64, paid_amount: 0 }
  const flight = { id: "flight", amount: 399.44, paid_amount: 0 }

  it("elige la pata cuyo pending coincide exacto con el monto (no la más vieja)", () => {
    const match = pickExactPendingMatch([hotel, flight], 399.44)
    expect(match?.id).toBe("flight")
  })

  it("matchea contra el saldo pendiente, no contra el amount total", () => {
    // Vuelo ya tiene 100 pagados → pending 299,44. El pago de 299,44 va al vuelo.
    const flightPartial = { id: "flight", amount: 399.44, paid_amount: 100 }
    const match = pickExactPendingMatch([hotel, flightPartial], 299.44)
    expect(match?.id).toBe("flight")
  })

  it("tolera diferencias de centavos dentro del epsilon", () => {
    const match = pickExactPendingMatch([hotel, flight], 399.444)
    expect(match?.id).toBe("flight")
  })

  it("devuelve null si ninguna pata matchea (caller cae a FIFO)", () => {
    expect(pickExactPendingMatch([hotel, flight], 500)).toBeNull()
  })

  it("devuelve null si el match es ambiguo (dos patas con el mismo pending)", () => {
    const a = { id: "a", amount: 200, paid_amount: 0 }
    const b = { id: "b", amount: 200, paid_amount: 0 }
    expect(pickExactPendingMatch([a, b], 200)).toBeNull()
  })

  it("devuelve null si no se pasa monto (preserva comportamiento previo)", () => {
    expect(pickExactPendingMatch([hotel, flight], null)).toBeNull()
    expect(pickExactPendingMatch([hotel, flight], undefined)).toBeNull()
  })

  it("ignora montos no positivos o no numéricos", () => {
    expect(pickExactPendingMatch([hotel, flight], 0)).toBeNull()
    expect(pickExactPendingMatch([hotel, flight], -399.44)).toBeNull()
    expect(pickExactPendingMatch([hotel, flight], NaN)).toBeNull()
  })

  it("acepta amount como string (viene del body/DB)", () => {
    const match = pickExactPendingMatch([hotel, flight], "399.44")
    expect(match?.id).toBe("flight")
  })
})

describe("findMatchingOperatorPayment — no adivinar por FIFO cuando es ambiguo", () => {
  // Mock mínimo del client: la query encadenada resuelve a { data: rows }.
  const mockSupabase = (rows: any[]) => {
    const chain: any = {
      from: () => chain,
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
    }
    return chain
  }

  // Caso real op #3bafdfff: FTA con 2 patas pendientes (1451.44 y 8).
  const twoPending = [
    { id: "grande", operation_id: "op1", operator_id: "fta", amount: 1451.44, paid_amount: 0, due_date: "2026-12-11", status: "PENDING" },
    { id: "chica", operation_id: "op1", operator_id: "fta", amount: 8, paid_amount: 0, due_date: "2026-12-11", status: "PENDING" },
  ]

  it("con match exacto por monto imputa a esa pata (no es ambiguo)", async () => {
    const sb = mockSupabase(twoPending)
    const r = await findMatchingOperatorPayment(sb, { operationId: "op1", operatorId: "fta", amount: 8, rejectAmbiguous: true })
    expect(r?.id).toBe("chica")
  })

  it("sin match exacto y rejectAmbiguous=true → lanza AmbiguousOperatorPaymentError (no FIFO)", async () => {
    const sb = mockSupabase(twoPending)
    await expect(
      findMatchingOperatorPayment(sb, { operationId: "op1", operatorId: "fta", amount: 500, rejectAmbiguous: true })
    ).rejects.toBeInstanceOf(AmbiguousOperatorPaymentError)
  })

  it("el error expone las patas candidatas para que el usuario elija", async () => {
    const sb = mockSupabase(twoPending)
    try {
      await findMatchingOperatorPayment(sb, { operationId: "op1", operatorId: "fta", amount: 500, rejectAmbiguous: true })
      throw new Error("no lanzó")
    } catch (e) {
      expect(e).toBeInstanceOf(AmbiguousOperatorPaymentError)
      expect((e as AmbiguousOperatorPaymentError).candidates.map((c) => c.id).sort()).toEqual(["chica", "grande"])
    }
  })

  it("sin match exacto y rejectAmbiguous=false → mantiene FIFO (comportamiento previo)", async () => {
    const sb = mockSupabase(twoPending)
    const r = await findMatchingOperatorPayment(sb, { operationId: "op1", operatorId: "fta", amount: 500 })
    expect(r?.id).toBe("grande")
  })

  it("una sola pata pendiente → la devuelve aunque rejectAmbiguous=true", async () => {
    const sb = mockSupabase([twoPending[1]])
    const r = await findMatchingOperatorPayment(sb, { operationId: "op1", operatorId: "fta", amount: 500, rejectAmbiguous: true })
    expect(r?.id).toBe("chica")
  })
})

describe("findMatchingOperatorPayment — operator_payment_id viejo NO crea duplicado", () => {
  // Bug real op #68f9b7aa (Lozada VG / AMICHI): el diálogo mandó un
  // operator_payment_id que ya no resolvía a una deuda pendiente. La función
  // devolvía null y el route creaba una deuda DUPLICADA con el costo completo,
  // doblando el "Pendiente a Operador". Ahora cae a la deuda pendiente real.
  const mockByIdThenList = (byIdRow: any | null, listRows: any[]) => {
    let byIdQuery = false
    const chain: any = {
      from: () => chain,
      select: () => chain,
      eq: (col: string) => {
        if (col === "id") byIdQuery = true
        return chain
      },
      order: () => chain,
      maybeSingle: async () => ({ data: byIdQuery ? byIdRow : (listRows[0] ?? null), error: null }),
      then: (resolve: any) => resolve({ data: listRows, error: null }),
    }
    return chain
  }

  const realDebt = {
    id: "real-pending",
    operation_id: "op1",
    operator_id: "amichi",
    amount: 3336173.31,
    paid_amount: 0,
    due_date: "2026-10-07",
    status: "PENDING",
  }

  it("id explícito borrado (no existe) → cae a la deuda pendiente real (no null)", async () => {
    const sb = mockByIdThenList(null, [realDebt])
    const r = await findMatchingOperatorPayment(sb, {
      operationId: "op1",
      operatorId: "amichi",
      operatorPaymentId: "stale-deleted-id",
      amount: 2120000,
    })
    expect(r?.id).toBe("real-pending")
  })

  it("id explícito ya saldado → cae a otra deuda pendiente del operador", async () => {
    const paidOff = { ...realDebt, id: "old-paid", amount: 1000, paid_amount: 1000, status: "PAID" }
    const sb = mockByIdThenList(paidOff, [realDebt])
    const r = await findMatchingOperatorPayment(sb, {
      operationId: "op1",
      operatorId: "amichi",
      operatorPaymentId: "old-paid",
      amount: 2120000,
    })
    expect(r?.id).toBe("real-pending")
  })

  it("id explícito viejo SIN operatorId → mantiene null (comportamiento previo, sin a qué caer)", async () => {
    const sb = mockByIdThenList(null, [realDebt])
    const r = await findMatchingOperatorPayment(sb, {
      operationId: "op1",
      operatorPaymentId: "stale-deleted-id",
      amount: 2120000,
    })
    expect(r).toBeNull()
  })

  it("id explícito válido y pendiente → lo devuelve directo (sin caer a la búsqueda)", async () => {
    const sb = mockByIdThenList(realDebt, [])
    const r = await findMatchingOperatorPayment(sb, {
      operationId: "op1",
      operatorId: "amichi",
      operatorPaymentId: "real-pending",
      amount: 2120000,
    })
    expect(r?.id).toBe("real-pending")
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe("resyncFullyRevertedOperatorPayment — el pendiente que quedaba viejo", () => {
  /**
   * Cliente fake que devuelve un dataset por tabla y registra los updates.
   * `operator_payments` responde distinto según se busque por id o por
   * (operation_id, operator_id), que es lo que hace la función.
   */
  function makeClient(opts: {
    debt: any
    siblings?: any[]
    costRows?: any[]
    serviceLink?: any[]
    serviceError?: any
  }) {
    const updates: any[] = []

    const from = (table: string) => {
      const filters: Record<string, any> = {}
      let op: "select" | "update" = "select"
      let values: any = null

      const resolve = () => {
        if (op === "update") {
          updates.push({ table, filters: { ...filters }, values })
          return { data: null, error: null }
        }
        if (table === "operation_services") {
          if (opts.serviceError) return { data: null, error: opts.serviceError }
          return { data: opts.serviceLink ?? [], error: null }
        }
        if (table === "operation_operators") {
          return { data: opts.costRows ?? [], error: null }
        }
        // operator_payments
        if (filters.id) return { data: opts.debt, error: null }
        return { data: opts.siblings ?? [], error: null }
      }

      const builder: any = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (res: any) => Promise.resolve(resolve()).then(res)
            }
            return (...args: any[]) => {
              const name = String(prop)
              if (name === "update") {
                op = "update"
                values = args[0]
              }
              if (name === "eq") filters[args[0]] = args[1]
              if (name === "maybeSingle" || name === "single") {
                return Promise.resolve(resolve())
              }
              return builder
            }
          },
        }
      )
      return builder
    }

    return { client: { from } as any, updates }
  }

  const deudaVico = {
    id: "op-pay-1",
    operation_id: "op-46ca",
    operator_id: "free-way",
    amount: 1296,
    currency: "USD",
    paid_amount: 0,
  }

  it("realinea el monto al costo real cuando la deuda quedó sin pagos", async () => {
    // El caso exacto de VICO: deuda de 1296 pagada en mayo, costo corregido a
    // 1126,32 en julio, pago borrado hoy. El pendiente quedaba en 1296.
    const { client, updates } = makeClient({
      debt: deudaVico,
      siblings: [{ id: "op-pay-1" }],
      costRows: [{ cost: 1126.32, cost_currency: "USD" }],
    })

    const r = await resyncFullyRevertedOperatorPayment(client, "op-pay-1")

    expect(r).toEqual({ resynced: true, from: 1296, to: 1126.32 })
    expect(updates).toHaveLength(1)
    expect(updates[0].values.amount).toBe(1126.32)
    // CAS: no pisar si entre la lectura y la escritura alguien imputó un pago.
    expect(updates[0].filters.paid_amount).toBe(0)
  })

  it("no toca una deuda que todavía tiene algo pagado", async () => {
    const { client, updates } = makeClient({
      debt: { ...deudaVico, paid_amount: 500 },
      siblings: [{ id: "op-pay-1" }],
      costRows: [{ cost: 1126.32, cost_currency: "USD" }],
    })

    const r = await resyncFullyRevertedOperatorPayment(client, "op-pay-1")

    expect(r.resynced).toBe(false)
    expect(updates).toEqual([])
  })

  it("no adivina cuando el operador tiene varias patas en la operación", async () => {
    // FREE WAY con dos tramos: no se puede saber qué costo corresponde a qué
    // deuda sin adivinar, y adivinar mueve plata.
    const { client, updates } = makeClient({
      debt: deudaVico,
      siblings: [{ id: "op-pay-1" }, { id: "op-pay-2" }],
      costRows: [{ cost: 600 }, { cost: 526.32 }],
    })

    const r = await resyncFullyRevertedOperatorPayment(client, "op-pay-1")

    expect(r.resynced).toBe(false)
    expect(r.reason).toContain("más de una pata")
    expect(updates).toEqual([])
  })

  it("no toca una deuda que nació de un servicio", async () => {
    const { client, updates } = makeClient({
      debt: deudaVico,
      siblings: [{ id: "op-pay-1" }],
      costRows: [{ cost: 1126.32, cost_currency: "USD" }],
      serviceLink: [{ id: "svc-1" }],
    })

    const r = await resyncFullyRevertedOperatorPayment(client, "op-pay-1")

    expect(r.resynced).toBe(false)
    expect(updates).toEqual([])
  })

  it("ante un error leyendo servicios no escribe nada", async () => {
    const { client, updates } = makeClient({
      debt: deudaVico,
      siblings: [{ id: "op-pay-1" }],
      costRows: [{ cost: 1126.32, cost_currency: "USD" }],
      serviceError: { message: "boom" },
    })

    const r = await resyncFullyRevertedOperatorPayment(client, "op-pay-1")

    expect(r.resynced).toBe(false)
    expect(updates).toEqual([])
  })

  it("si ya estaba alineada no escribe", async () => {
    const { client, updates } = makeClient({
      debt: { ...deudaVico, amount: 1126.32 },
      siblings: [{ id: "op-pay-1" }],
      costRows: [{ cost: 1126.32, cost_currency: "USD" }],
    })

    const r = await resyncFullyRevertedOperatorPayment(client, "op-pay-1")

    expect(r.resynced).toBe(false)
    expect(updates).toEqual([])
  })

  it("no realinea una deuda en otra moneda que el costo", async () => {
    // Caso real en Lozada: deuda de 220.000 ARS contra un costo cargado de
    // 145 USD. Copiar el número habría dejado la deuda en 145 pesos.
    const { client, updates } = makeClient({
      debt: { ...deudaVico, amount: 220000, currency: "ARS" },
      siblings: [{ id: "op-pay-1" }],
      costRows: [{ cost: 145, cost_currency: "USD" }],
    })

    const r = await resyncFullyRevertedOperatorPayment(client, "op-pay-1")

    expect(r.resynced).toBe(false)
    expect(r.reason).toContain("ARS")
    expect(updates).toEqual([])
  })

  it("no pone la deuda en cero si el costo cargado es cero", async () => {
    const { client, updates } = makeClient({
      debt: deudaVico,
      siblings: [{ id: "op-pay-1" }],
      costRows: [{ cost: 0 }],
    })

    const r = await resyncFullyRevertedOperatorPayment(client, "op-pay-1")

    expect(r.resynced).toBe(false)
    expect(updates).toEqual([])
  })
})
