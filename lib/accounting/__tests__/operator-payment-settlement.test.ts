/**
 * Tests del cap de overpayment en buildOperatorPaymentUpdate.
 *
 * Fix aplicado en Sprint anterior: nextPaidAmount está topeado en
 * [0, totalAmount] para evitar que paid_amount supere amount (lo que
 * generaba saldo negativo en operator_payments, haciendo creer al
 * sistema que la agencia le debe plata al operador cuando no es así).
 */

import { buildOperatorPaymentUpdate, pickExactPendingMatch } from "../operator-payment-settlement"

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
