/**
 * VIB-142 — Asientos de los movimientos de plata.
 *
 * Lo que fijan estos tests es sobre todo lo que NO tiene que pasar: que asentar
 * un cobro o un pago no toque el movimiento original ni el saldo de ninguna
 * cuenta. Esa es la condición que hace que esto se pueda correr sobre datos de
 * clientes en producción.
 */
import {
  createTransferJournalEntry,
  createMovementJournalEntry,
  COUNTERPART_CODES,
} from "../movement-journal"
import { ACCOUNT_CODES } from "../account-codes"
import * as journal from "../journal-entries"

jest.mock("../journal-entries", () => ({
  createJournalEntry: jest.fn(),
  resolveAccountIds: jest.fn(),
}))

interface MockConfig {
  /** Fila de ledger_movements devuelta (null = no existe) */
  movement?: any
  /** Fila de financial_accounts devuelta */
  financialAccount?: any
  /** Códigos resueltos del plan */
  accountIds?: Record<string, string>
}

const MOVIMIENTO_BASE = {
  id: "mov-1",
  org_id: "org-1",
  operation_id: "op-1",
  account_id: "fa-banco",
  concept: "Cobro cliente",
  currency: "USD",
  amount_original: 500,
  exchange_rate: 1400,
  movement_date: "2026-08-24T00:00:00.000Z",
  created_by: "user-1",
  journal_entry_id: null,
}

function createMockSupabase(cfg: MockConfig = {}) {
  const updates: any[] = []

  const from = jest.fn((table: string) => {
    const chain: any = {}
    for (const m of ["select", "eq"]) chain[m] = jest.fn(() => chain)
    chain.update = jest.fn((payload: any) => {
      updates.push({ table, payload })
      return chain
    })
    chain.insert = jest.fn(() => chain)
    chain.maybeSingle = jest.fn(async () => {
      if (table === "ledger_movements") {
        return { data: cfg.movement === undefined ? MOVIMIENTO_BASE : cfg.movement }
      }
      if (table === "financial_accounts") {
        return {
          data:
            cfg.financialAccount === undefined
              ? { chart_account_id: "chart-banco" }
              : cfg.financialAccount,
        }
      }
      return { data: null }
    })
    chain.then = (ok: any, err: any) => Promise.resolve({ data: null, error: null }).then(ok, err)
    return chain
  })

  return { client: { from } as any, updates }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(journal.createJournalEntry as jest.Mock).mockResolvedValue({ id: "je-1" })
  ;(journal.resolveAccountIds as jest.Mock).mockImplementation(async (codes: string[]) =>
    Object.fromEntries(codes.map((c) => [c, `chart-${c}`]))
  )
})

describe("createMovementJournalEntry — no toca la plata", () => {
  it("NO escribe sobre el movimiento original", async () => {
    // Es el punto entero del diseño: getAccountBalancesBatch calcula el saldo
    // por una rama distinta según si el movimiento tiene debit/credit seteados,
    // así que escribirle encima puede mover el saldo de una cuenta real.
    const { client, updates } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(updates).toHaveLength(0)
  })

  it("las líneas del asiento no llevan cuenta financiera ni afectan saldo", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    const params = (journal.createJournalEntry as jest.Mock).mock.calls[0][0]
    for (const linea of params.lines) {
      expect(linea.financial_account_id).toBeUndefined()
      expect(linea.affects_balance).toBeUndefined()
    }
  })
})

describe("createMovementJournalEntry — sentido del asiento", () => {
  it("un cobro deja Debe en la cuenta financiera y Haber en Cuentas por Cobrar", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    const [debe, haber] = (journal.createJournalEntry as jest.Mock).mock.calls[0][0].lines
    expect(debe).toMatchObject({ chart_account_id: "chart-banco", debit_amount: 500 })
    expect(haber).toMatchObject({
      chart_account_id: `chart-${ACCOUNT_CODES.CUENTAS_POR_COBRAR}`,
      credit_amount: 500,
    })
  })

  it("un pago a operador deja Debe en Cuentas por Pagar y Haber en la cuenta financiera", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.OPERATOR_PAYMENT, direction: "OUT" },
      client
    )

    const [debe, haber] = (journal.createJournalEntry as jest.Mock).mock.calls[0][0].lines
    expect(debe).toMatchObject({
      chart_account_id: `chart-${ACCOUNT_CODES.CUENTAS_POR_PAGAR}`,
      debit_amount: 500,
    })
    expect(haber).toMatchObject({ chart_account_id: "chart-banco", credit_amount: 500 })
  })

  it("todos los gastos van por ahora a Gastos Administrativos", () => {
    expect(COUNTERPART_CODES.EXPENSE).toBe(ACCOUNT_CODES.GASTOS_ADMIN)
  })

  it("pagar una comisión cancela la deuda, no vuelve a registrar el gasto", () => {
    // El gasto ya se devengó al confirmar la operación (Debe 4.3.03 / Haber
    // 2.1.01). Si el pago debitara 4.3.03 otra vez, la comisión aparecería dos
    // veces en el Estado de Resultados.
    expect(COUNTERPART_CODES.COMMISSION_PAYMENT).toBe(ACCOUNT_CODES.CUENTAS_POR_PAGAR)
    expect(COUNTERPART_CODES.COMMISSION_PAYMENT).not.toBe(ACCOUNT_CODES.COMISIONES_VENDEDORES)
  })
})

describe("createMovementJournalEntry — idempotencia y contexto", () => {
  it("no asienta dos veces el mismo movimiento", async () => {
    const { client } = createMockSupabase({
      movement: { ...MOVIMIENTO_BASE, journal_entry_id: "je-previo" },
    })

    const r = await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(r).toBeNull()
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
  })

  it("se traga la carrera perdida contra otro request (unique violation)", async () => {
    const { client } = createMockSupabase()
    ;(journal.createJournalEntry as jest.Mock).mockRejectedValue({
      code: "23505",
      message: 'duplicate key value violates unique constraint "journal_entries_source_movement_unique"',
    })

    const r = await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(r).toBeNull()
  })

  it("manda el org y el movimiento de origen, y respeta el TC real del movimiento", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect((journal.createJournalEntry as jest.Mock).mock.calls[0][0]).toMatchObject({
      org_id: "org-1",
      source_movement_id: "mov-1",
      exchange_rate: 1400,
      currency: "USD",
      entry_date: "2026-08-24",
    })
  })

  it("resuelve la cuenta del plan SCOPEADA por organización", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN", orgId: "org-9" },
      client
    )

    expect(journal.resolveAccountIds).toHaveBeenCalledWith(
      [ACCOUNT_CODES.CUENTAS_POR_COBRAR],
      client,
      "org-9"
    )
  })
})

describe("createMovementJournalEntry — casos que se saltean sin romper", () => {
  const casos: [string, MockConfig][] = [
    ["el movimiento no existe", { movement: null }],
    ["el movimiento no tiene cuenta financiera", { movement: { ...MOVIMIENTO_BASE, account_id: null } }],
    ["el importe es cero", { movement: { ...MOVIMIENTO_BASE, amount_original: 0 } }],
    ["la cuenta financiera no está mapeada al plan", { financialAccount: { chart_account_id: null } }],
  ]

  it.each(casos)("devuelve null si %s", async (_caso, cfg) => {
    const { client, updates } = createMockSupabase(cfg)

    const r = await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(r).toBeNull()
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it("devuelve null si falta la cuenta del plan, sin lanzar", async () => {
    const { client } = createMockSupabase()
    ;(journal.resolveAccountIds as jest.Mock).mockResolvedValue({})

    const r = await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(r).toBeNull()
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
  })
})

/**
 * Diferencia de cambio — VIB-141 / D1.
 *
 * Lo que se fija acá es el contrato contable del espejo, que es donde estaba el
 * riesgo de doble conteo: el movimiento de plata sigue existiendo y afectando
 * el saldo igual que antes, y el asiento se suma aparte contra las cuentas de
 * resultado que hasta ahora estaban huérfanas.
 */
describe("contrapartidas de la diferencia de cambio", () => {
  it("la ganancia va contra Diferencia de Cambio Positiva", () => {
    expect(COUNTERPART_CODES.FX_GAIN).toBe(ACCOUNT_CODES.DIF_CAMBIO_POSITIVA)
  })

  it("la pérdida va contra Diferencia de Cambio Negativa", () => {
    expect(COUNTERPART_CODES.FX_LOSS).toBe(ACCOUNT_CODES.DIF_CAMBIO_NEGATIVA)
  })

  it("las dos son cuentas de resultado, y de signo opuesto", () => {
    // La ganancia es un ingreso (4.1) y la pérdida un gasto (4.3). Si las dos
    // cayeran en la misma familia, el resultado del período saldría con el
    // signo equivocado en uno de los dos casos.
    expect(COUNTERPART_CODES.FX_GAIN.startsWith("4.1")).toBe(true)
    expect(COUNTERPART_CODES.FX_LOSS.startsWith("4.3")).toBe(true)
  })

  it("no comparten cuenta con ningún otro flujo", () => {
    // Reutilizar una cuenta de otro flujo mezclaría la diferencia de cambio con
    // ventas o gastos administrativos, y el contador no podría separarlas.
    const otras = [
      COUNTERPART_CODES.CUSTOMER_COLLECTION,
      COUNTERPART_CODES.OPERATOR_PAYMENT,
      COUNTERPART_CODES.COMMISSION_PAYMENT,
      COUNTERPART_CODES.EXPENSE,
    ]
    expect(otras).not.toContain(COUNTERPART_CODES.FX_GAIN)
    expect(otras).not.toContain(COUNTERPART_CODES.FX_LOSS)
  })
})

/**
 * Transferencias y compra de dólares — VIB-141.
 *
 * Lo que se fija acá:
 *
 *   1. **Una transferencia es UN asiento, no dos.** Espejar los dos movimientos
 *      por separado contaría la misma transferencia dos veces.
 *   2. **Comprar dólares no genera resultado.** Los dólares entran valuados a lo
 *      que costaron. La ganancia aparece recién al revaluarlos al cierre, y si
 *      el asiento de la compra tocara una cuenta de resultado, esa ganancia se
 *      contaría dos veces.
 */
function mockTransferencia(salida: any, entrada: any, cuentas: any[]) {
  const from = jest.fn((table: string) => {
    const chain: any = {}
    chain.select = jest.fn(() => chain)
    chain.eq = jest.fn(() => chain)
    chain.in = jest.fn(() =>
      Promise.resolve({
        data: table === "ledger_movements" ? [salida, entrada] : cuentas,
        error: null,
      })
    )
    return chain
  })
  return { from } as any
}

describe("createTransferJournalEntry", () => {
  const salidaBase = {
    id: "mov-out",
    org_id: "org-1",
    account_id: "fa-pesos",
    concept: "Compra de dólares - Caja Pesos → Caja USD",
    currency: "ARS",
    amount_original: 1_500_000,
    amount_ars_equivalent: 1_500_000,
    exchange_rate: 1500,
    movement_date: "2026-08-15T10:00:00Z",
    created_by: "user-1",
    journal_entry_id: null,
    affects_balance: true,
  }
  const entradaBase = {
    ...salidaBase,
    id: "mov-in",
    account_id: "fa-usd",
    currency: "USD",
    amount_original: 1000,
    amount_ars_equivalent: 1_500_000,
  }
  const cuentas = [
    { id: "fa-pesos", chart_account_id: "chart-caja-ars", agency_id: "ag-1" },
    { id: "fa-usd", chart_account_id: "chart-caja-usd", agency_id: "ag-1" },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(journal.createJournalEntry as jest.Mock).mockResolvedValue({ id: "je-1" })
  })

  it("arma un solo asiento: Debe en la que recibe, Haber en la que entrega", async () => {
    await createTransferJournalEntry(
      { fromMovementId: "mov-out", toMovementId: "mov-in" },
      mockTransferencia(salidaBase, entradaBase, cuentas)
    )

    expect(journal.createJournalEntry).toHaveBeenCalledTimes(1)
    const args = (journal.createJournalEntry as jest.Mock).mock.calls[0][0]

    expect(args.lines).toHaveLength(2)
    expect(args.lines[0]).toMatchObject({
      chart_account_id: "chart-caja-usd",
      debit_amount: 1_500_000,
    })
    expect(args.lines[1]).toMatchObject({
      chart_account_id: "chart-caja-ars",
      credit_amount: 1_500_000,
    })
  })

  it("comprar dólares no toca ninguna cuenta de resultado", async () => {
    // Si tocara una, la ganancia por tener dólares se contaría dos veces: acá y
    // otra vez al revaluar al cierre.
    await createTransferJournalEntry(
      { fromMovementId: "mov-out", toMovementId: "mov-in" },
      mockTransferencia(salidaBase, entradaBase, cuentas)
    )
    const args = (journal.createJournalEntry as jest.Mock).mock.calls[0][0]
    for (const l of args.lines) {
      expect(String(l.chart_account_id)).not.toMatch(/^4\./)
    }
  })

  it("con monedas distintas usa el equivalente en pesos, donde los dos lados coinciden", async () => {
    await createTransferJournalEntry(
      { fromMovementId: "mov-out", toMovementId: "mov-in" },
      mockTransferencia(salidaBase, entradaBase, cuentas)
    )
    const args = (journal.createJournalEntry as jest.Mock).mock.calls[0][0]
    expect(args.currency).toBe("ARS")
    // 1000 dólares habría sido el importe equivocado: los dos lados solo
    // coinciden en pesos.
    expect(args.lines[0].debit_amount).toBe(1_500_000)
  })

  it("con la misma moneda usa el importe original", async () => {
    const salida = { ...salidaBase, concept: "Transferencia", amount_original: 50_000, amount_ars_equivalent: 50_000 }
    const entrada = { ...entradaBase, currency: "ARS", amount_original: 50_000, amount_ars_equivalent: 50_000 }

    await createTransferJournalEntry(
      { fromMovementId: "mov-out", toMovementId: "mov-in" },
      mockTransferencia(salida, entrada, cuentas)
    )
    const args = (journal.createJournalEntry as jest.Mock).mock.calls[0][0]
    expect(args.currency).toBe("ARS")
    expect(args.lines[0].debit_amount).toBe(50_000)
  })

  it("la clave de idempotencia es el movimiento de salida", async () => {
    // Una transferencia, un asiento. Sin esto, dos corridas la duplicarían.
    await createTransferJournalEntry(
      { fromMovementId: "mov-out", toMovementId: "mov-in" },
      mockTransferencia(salidaBase, entradaBase, cuentas)
    )
    const args = (journal.createJournalEntry as jest.Mock).mock.calls[0][0]
    expect(args.source_movement_id).toBe("mov-out")
  })

  it("no asienta si alguno de los dos ya tiene asiento", async () => {
    await createTransferJournalEntry(
      { fromMovementId: "mov-out", toMovementId: "mov-in" },
      mockTransferencia(salidaBase, { ...entradaBase, journal_entry_id: "je-viejo" }, cuentas)
    )
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
  })

  it("no asienta si una cuenta no está mapeada al plan", async () => {
    // Configuración faltante, no un error del flujo: se saltea entero en vez de
    // armar medio asiento.
    await createTransferJournalEntry(
      { fromMovementId: "mov-out", toMovementId: "mov-in" },
      mockTransferencia(salidaBase, entradaBase, [
        { id: "fa-pesos", chart_account_id: null, agency_id: "ag-1" },
        cuentas[1],
      ])
    )
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
  })
})
