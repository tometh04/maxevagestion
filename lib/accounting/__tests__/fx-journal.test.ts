/**
 * Registro contable de la diferencia de cambio — VIB-141 (D1/D3).
 *
 * Lo que fijan estos tests, por orden de importancia:
 *
 *   1. Que el asiento NO mueva ningún saldo. Una diferencia de cambio no saca
 *      ni pone un peso en la caja: cambia el valor contable de lo que ya está.
 *      La implementación anterior lo registraba contra Caja con account_id
 *      seteado, que habría movido una caja real.
 *   2. Que el sentido del asiento sea el correcto. Una ganancia aumenta el valor
 *      de la cuenta corregida; una pérdida lo baja.
 *   3. Que no registre nada cuando no hay diferencia, que es el caso más común.
 */
import { registrarDiferenciaPorCobro, registrarRevaluacion } from "../fx-journal"
import { ACCOUNT_CODES } from "../account-codes"
import * as journal from "../journal-entries"

jest.mock("../journal-entries", () => ({
  createJournalEntry: jest.fn(),
  resolveAccountIds: jest.fn(),
}))

const client = {} as any

beforeEach(() => {
  jest.clearAllMocks()
  ;(journal.createJournalEntry as jest.Mock).mockResolvedValue({ id: "je-fx" })
  ;(journal.resolveAccountIds as jest.Mock).mockImplementation(async (codes: string[]) =>
    Object.fromEntries(codes.map((c) => [c, `chart-${c}`]))
  )
})

/** Los params de un cobro con ganancia: libros en pesos, deuda en dólares. */
const cobroConGanancia = {
  movementId: "mov-1",
  orgId: "org-1",
  agencyId: "ag-1",
  operationId: "op-12345678",
  fecha: "2026-09-15",
  montoCobrado: 800_000,
  monedaCobro: "ARS" as const,
  cotizacionCobro: 1600,
  monedaDeuda: "USD" as const,
  cotizacionReconocimiento: 1500,
  monedaFuncional: "ARS" as const,
}

function paramsDelAsiento() {
  return (journal.createJournalEntry as jest.Mock).mock.calls[0][0]
}

describe("registrarDiferenciaPorCobro", () => {
  it("no mueve ningún saldo", async () => {
    await registrarDiferenciaPorCobro(cobroConGanancia, client)

    for (const linea of paramsDelAsiento().lines) {
      // Sin cuenta financiera y sin afectar saldo: es contabilidad, no plata.
      expect(linea.financial_account_id).toBeUndefined()
      expect(linea.affects_balance).toBeUndefined()
    }
  })

  it("una ganancia aumenta la cuenta por cobrar contra el resultado positivo", async () => {
    // El cobro ya se asentó por su valor recibido (800.000), pero la deuda solo
    // valía 750.000 en libros: la diferencia restituye la cuenta por cobrar.
    await registrarDiferenciaPorCobro(cobroConGanancia, client)

    const [debe, haber] = paramsDelAsiento().lines
    expect(debe).toMatchObject({
      chart_account_id: `chart-${ACCOUNT_CODES.CUENTAS_POR_COBRAR}`,
      debit_amount: 50_000,
    })
    expect(haber).toMatchObject({ chart_account_id: "chart-4.1.05", credit_amount: 50_000 })
  })

  it("una pérdida va al revés", async () => {
    await registrarDiferenciaPorCobro(
      { ...cobroConGanancia, montoCobrado: 700_000, cotizacionCobro: 1400 },
      client
    )

    const [debe, haber] = paramsDelAsiento().lines
    expect(debe).toMatchObject({ chart_account_id: "chart-4.3.13", debit_amount: 50_000 })
    expect(haber).toMatchObject({
      chart_account_id: `chart-${ACCOUNT_CODES.CUENTAS_POR_COBRAR}`,
      credit_amount: 50_000,
    })
  })

  it("el asiento se expresa en la moneda de los libros", async () => {
    await registrarDiferenciaPorCobro(cobroConGanancia, client)
    expect(paramsDelAsiento()).toMatchObject({
      currency: "ARS",
      org_id: "org-1",
      agency_id: "ag-1",
      source_movement_id: "mov-1",
    })
  })

  it("no registra nada si no hay diferencia", async () => {
    // Libros en dólares: cobrar una deuda en dólares no genera diferencia.
    const r = await registrarDiferenciaPorCobro(
      { ...cobroConGanancia, monedaFuncional: "USD" },
      client
    )
    expect(r).toBeNull()
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
  })

  it("no registra si falta una cuenta del plan, y no rompe", async () => {
    ;(journal.resolveAccountIds as jest.Mock).mockResolvedValue({})
    const r = await registrarDiferenciaPorCobro(cobroConGanancia, client)
    expect(r).toBeNull()
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
  })

  it("se traga la carrera perdida contra otro request", async () => {
    ;(journal.createJournalEntry as jest.Mock).mockRejectedValue({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    })
    await expect(registrarDiferenciaPorCobro(cobroConGanancia, client)).resolves.toBeNull()
  })
})

describe("registrarRevaluacion", () => {
  // El caso de Lozada: libros en dólares, pesos en la caja.
  const revaluacion = {
    orgId: "org-1",
    agencyId: "ag-1",
    fecha: "2026-09-30",
    chartAccountId: "chart-caja-pesos",
    saldo: 1_520_000,
    monedaSaldo: "ARS" as const,
    monedaFuncional: "USD" as const,
    cotizacionAnterior: 1600,
    cotizacionCierre: 1520,
    claveMovimiento: "reval-caja-2026-09",
  }

  it("una ganancia aumenta el valor de la cuenta revaluada", async () => {
    await registrarRevaluacion(revaluacion, client)

    const [debe, haber] = paramsDelAsiento().lines
    expect(debe).toMatchObject({ chart_account_id: "chart-caja-pesos", debit_amount: 50 })
    expect(haber).toMatchObject({ chart_account_id: "chart-4.1.05", credit_amount: 50 })
  })

  it("no mueve el saldo real de la cuenta", async () => {
    // Los pesos que hay en la caja siguen siendo los mismos: lo que cambia es
    // su valor expresado en la moneda de los libros.
    await registrarRevaluacion(revaluacion, client)
    for (const linea of paramsDelAsiento().lines) {
      expect(linea.financial_account_id).toBeUndefined()
      expect(linea.affects_balance).toBeUndefined()
    }
  })

  it("no revalúa un saldo que ya está en la moneda de los libros", async () => {
    const r = await registrarRevaluacion(
      { ...revaluacion, monedaSaldo: "USD" },
      client
    )
    expect(r).toBeNull()
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
  })

  it("usa una clave de idempotencia por cuenta y cierre", async () => {
    await registrarRevaluacion(revaluacion, client)
    expect(paramsDelAsiento().source_movement_id).toBe("reval-caja-2026-09")
  })
})
