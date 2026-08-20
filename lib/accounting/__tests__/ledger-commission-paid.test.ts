/**
 * Una comisión se marca PAGADA solo cuando movió plata (VIB-134).
 *
 * `createLedgerMovement` marca las comisiones de la operación como PAID cuando
 * el movimiento es de tipo COMMISSION. Desde VIB-134/B0 los asientos contables
 * también generan líneas type=COMMISSION —con seller_id incluido— pero esas son
 * un DEVENGAMIENTO: se crean al confirmar la operación, mucho antes de que se
 * le pague nada al vendedor.
 *
 * Sin el guard, confirmar una operación marcaría las comisiones como pagadas
 * sin que nadie las haya pagado. El discriminador es la cuenta financiera: un
 * pago real siempre tiene una, una línea de asiento nunca.
 */

import { createLedgerMovement } from "../ledger"
import * as markCommissionPaid from "../mark-commission-paid"

jest.mock("../mark-commission-paid", () => ({
  markCommissionsAsPaidIfLedgerExists: jest.fn().mockResolvedValue({ marked: 0 }),
}))

function createMockSupabase() {
  const chain: any = {}
  for (const m of ["select", "eq", "limit", "maybeSingle"]) {
    chain[m] = jest.fn(() => chain)
  }
  chain.insert = jest.fn(() => chain)
  chain.single = jest.fn(async () => ({ data: { id: "mov-1" }, error: null }))
  chain.maybeSingle = jest.fn(async () => ({ data: null }))
  return { from: jest.fn(() => chain) } as any
}

const baseParams = {
  operation_id: "op-1",
  org_id: "org-1", // corta la resolución de org, que no es lo que se prueba acá
  lead_id: null,
  type: "COMMISSION" as const,
  concept: "Comisión vendedor",
  currency: "ARS" as const,
  amount_original: 1000,
  exchange_rate: null,
  amount_ars_equivalent: 1000,
  method: "CASH" as const,
  seller_id: "seller-1",
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("createLedgerMovement — marcado de comisiones como pagadas", () => {
  it("marca la comisión cuando el movimiento tiene cuenta financiera (pago real)", async () => {
    await createLedgerMovement(
      { ...baseParams, account_id: "cuenta-caja-1" },
      createMockSupabase()
    )

    expect(markCommissionPaid.markCommissionsAsPaidIfLedgerExists).toHaveBeenCalledTimes(1)
  })

  it("NO marca la comisión si el movimiento no tiene cuenta financiera (línea de asiento)", async () => {
    // Este es el caso del asiento de comisión: devengamiento al confirmar la
    // operación, no un pago. Marcarlo daría comisiones pagadas sin que nadie
    // haya pagado nada.
    await createLedgerMovement(
      { ...baseParams, account_id: null },
      createMockSupabase()
    )

    expect(markCommissionPaid.markCommissionsAsPaidIfLedgerExists).not.toHaveBeenCalled()
  })

  it("no marca nada si el movimiento no es de comisión", async () => {
    await createLedgerMovement(
      { ...baseParams, type: "INCOME", account_id: "cuenta-caja-1" },
      createMockSupabase()
    )

    expect(markCommissionPaid.markCommissionsAsPaidIfLedgerExists).not.toHaveBeenCalled()
  })

  it("no marca nada si la comisión no está asociada a una operación", async () => {
    await createLedgerMovement(
      { ...baseParams, operation_id: null, account_id: "cuenta-caja-1" },
      createMockSupabase()
    )

    expect(markCommissionPaid.markCommissionsAsPaidIfLedgerExists).not.toHaveBeenCalled()
  })
})
